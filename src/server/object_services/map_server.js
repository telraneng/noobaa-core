/* Copyright (C) 2016 NooBaa */
'use strict';

const _ = require('lodash');
const util = require('util');
const assert = require('assert');

const P = require('../../util/promise');
const dbg = require('../../util/debug_module')(__filename);
const config = require('../../../config');
const mapper = require('./mapper');
const MDStore = require('./md_store').MDStore;
const time_utils = require('../../util/time_utils');
const size_utils = require('../../util/size_utils');
const server_rpc = require('../server_rpc');
const auth_server = require('../common_services/auth_server');
const mongo_utils = require('../../util/mongo_utils');
const map_deleter = require('./map_deleter');
const system_utils = require('../utils/system_utils');
const system_store = require('../system_services/system_store').get_instance();
const node_allocator = require('../node_services/node_allocator');
const PeriodicReporter = require('../../util/periodic_reporter');
const Barrier = require('../../util/barrier');
const KeysSemaphore = require('../../util/keys_semaphore');

const map_reporter = new PeriodicReporter('map_reporter');
const make_room_semaphore = new KeysSemaphore(1);
const ensure_room_barrier = new Barrier({
    max_length: 10,
    expiry_ms: 100,
    process: ensure_room_barrier_process,
});

/**
 * 
 * GetMapping
 * 
 * TODO:
 * - location_info
 * - alloc.sources?
 * 
 */
class GetMapping {

    constructor({
        chunks,
        location_info,
        move_to_tier,
        check_dups,
    }) {
        this.chunks = chunks;
        this.location_info = location_info;
        this.move_to_tier = move_to_tier && system_store.data.get_by_id(move_to_tier);
        this.check_dups = check_dups;

        dbg.warn('GGG GetMapping: ctor1', util.inspect(this));
        for (const chunk of chunks) {
            system_utils.prepare_chunk_for_mapping(chunk);
        }
        this.chunks_per_bucket = _.groupBy(chunks, chunk => chunk.bucket._id);

        // assert move_to_tier is only used for chunks on the same bucket
        if (this.move_to_tier) assert.strictEqual(Object.keys(this.chunks_per_bucket).length, 1);
        dbg.warn('GGG GetMapping: ctor2', util.inspect(this));
    }

    async run() {
        const millistamp = time_utils.millistamp();
        dbg.warn('GGG GetMapping: start');
        try {
            await this.find_dups();
            await this.do_allocations();
            dbg.log0('GetMapping: DONE. chunks', this.chunks.length,
                'took', time_utils.millitook(millistamp));
            return this.chunks;
        } catch (err) {
            dbg.error('GetMapping: ERROR', err.stack || err);
            throw err;
        }
    }

    async find_dups() {
        if (!this.check_dups) return;
        if (!config.DEDUP_ENABLED) return;
        await P.map(this.chunks_per_bucket, async (chunks, bucket_id) => {
            const dedup_keys = _.compact(_.map(chunks,
                chunk => chunk.digest_b64 && Buffer.from(chunk.digest_b64, 'base64')));
            dbg.log3('GetMapping.find_dups', dedup_keys.length);
            if (!dedup_keys.length) return;
            const dup_chunks = await MDStore.instance().find_chunks_by_dedup_key(bucket_id, dedup_keys);
            for (const dup_chunk of dup_chunks) {
                system_utils.prepare_chunk_for_mapping(dup_chunk);
            }
            await this.prepare_chunks_group(dup_chunks);
            for (const dup_chunk of dup_chunks) {
                if (mapper.is_chunk_good_for_dedup(dup_chunk)) {
                    for (const chunk of chunks) {
                        if (chunk.size === dup_chunk.size &&
                            chunk.digest_b64 === dup_chunk.digest.toString('base64')) {
                            chunk.dup_chunk = dup_chunk._id;
                        }
                    }
                }
            }
        });
    }

    async do_allocations() {
        await P.map(this.chunks_per_bucket, async chunks => {
            const bucket = chunks[0].bucket;
            const total_size = _.sumBy(chunks, 'size');
            await this.prepare_chunks_group(chunks, this.move_to_tier);
            let done = false;
            while (!done) {
                const start_alloc_time = Date.now();
                done = await this.allocate_chunks(chunks);
                map_reporter.add_event(`allocate_chunks(${bucket.name})`, total_size, Date.now() - start_alloc_time);
                if (!done) {
                    await P.map(_.uniqBy(chunks, 'tier'), tier => ensure_room_in_tier(tier, bucket));
                    // TODO Decide if we want to update the chunks mappings when looping
                    // await this.prepare_chunks_group(chunks, bucket);
                }
            }
        });
    }

    async prepare_chunks_group(chunks, move_to_tier) {
        const bucket = chunks[0].bucket;
        await node_allocator.refresh_tiering_alloc(bucket.tiering);
        const tiering_status = node_allocator.get_tiering_status(bucket.tiering);
        for (const chunk of chunks) {
            let selected_tier;
            if (move_to_tier) {
                selected_tier = move_to_tier._id;
            } else if (chunk.tier) {
                const tier_and_order = bucket.tiering.tiers.find(t => String(t.tier._id) === String(chunk.tier._id));
                selected_tier = mapper.select_tier_for_write(bucket.tiering, tiering_status, tier_and_order.order);
            } else {
                selected_tier = mapper.select_tier_for_write(bucket.tiering, tiering_status);
            }
            chunk.tier = selected_tier;
            chunk.mapping = mapper.map_chunk(chunk, selected_tier, bucket.tiering, tiering_status, this.location_info);
        }
    }

    async allocate_chunks(chunks) {
        for (const chunk of chunks) {
            if (chunk.dup_chunk) continue;
            const done = await this.allocate_chunk(chunk);
            if (!done) return false;
        }
        return true;
    }

    async allocate_chunk(chunk) {
        const mapping = chunk.mapping;
        const avoid_blocks = chunk.blocks.filter(block => block.node.node_type === 'BLOCK_STORE_FS');
        const avoid_nodes = avoid_blocks.map(block => String(block.node._id));
        const allocated_hosts = avoid_blocks.map(block => block.node.host_id);
        const preallocate_list = [];

        for (const frag of chunk.frags) {
            frag.blocks = [];
        }

        for (const alloc of mapping.allocations) {
            const { frag, pools, /* sources */ } = alloc;
            // let source_block_info;
            // if (sources) {
            //     const source_block = sources.accessible_blocks[sources.next_source];
            //     sources.next_source = (sources.next_source + 1) % sources.accessible_blocks.length;
            //     source_block_info = mapper.get_block_md(chunk, frag, source_block);
            // }
            const node = node_allocator.allocate_node(pools, avoid_nodes, allocated_hosts);
            if (!node) {
                dbg.warn(`GetMapping allocate_blocks: no nodes for allocation ` +
                    `avoid_nodes ${avoid_nodes.join(',')} ` +
                    `pools ${pools.join(',')} ` +
                    `tier_for_write ${this.tier_for_write.name} ` +
                    `tiering_status ${util.inspect(this.tiering_status, { depth: null })} `);
                // chunk.frags = saved_frags;
                return false;
            }
            const block = {
                _id: MDStore.instance().make_md_id(),
            };
            mapper.assign_node_to_block(block, node, chunk.system._id);
            const block_info = mapper.get_block_info(chunk, frag, block);
            alloc.block = block_info;
            if (node.node_type === 'BLOCK_STORE_FS') {
                avoid_nodes.push(String(node._id));
                allocated_hosts.push(node.host_id);
            }
            const has_room = enough_room_in_tier(chunk.tier, chunk.bucket);
            if (!has_room) preallocate_list.push(alloc);
        }

        if (preallocate_list.length) {
            let ok = true;
            await P.map(preallocate_list, async alloc => {
                try {
                    const block_info = alloc.block;
                    const prealloc_md = { ...block_info.block_md, digest_type: undefined, digest_b64: undefined, size: chunk.frag_size };
                    await server_rpc.client.block_store.preallocate_block({
                        block_md: prealloc_md,
                    }, {
                        address: prealloc_md.address,
                        timeout: config.IO_REPLICATE_BLOCK_TIMEOUT,
                        auth_token: auth_server.make_auth_token({
                            system_id: chunk.system,
                            role: 'admin',
                        })
                    });
                    block_info.block_md.preallocated = true;
                } catch (err) {
                    dbg.warn('GetMapping: preallocate_blocks failed, will retry',
                        `avoid_nodes ${avoid_nodes.join(',')} ` +
                        `pools ${alloc.pools.join(',')} ` +
                        `tier_for_write ${this.tier_for_write.name} ` +
                        `tiering_status ${util.inspect(this.tiering_status, { depth: null })} `);
                    ok = false;
                }
            });
            if (!ok) return false;
        }

        // TODO sort allocations by location_info
        // frag.blocks = frag.blocks || [];
        // if (location_info && // optimizing local nodes/hosts - so it will be used for write rather than for replication 
        //     (location_info.host_id === node.host_id || location_info.node_id === String(node._id))) {
        //     frag.blocks.unshift(block_info);
        // } else {
        //     frag.blocks.push(block_info);
        // }
    }



}


/**
 * 
 * PUT_MAPPING
 * 
 */
class PutMapping {

    constructor({ chunks, move_to_tier }) {
        this.chunks = chunks;
        this.move_to_tier = move_to_tier && system_store.data.get_by_id(move_to_tier);

        this.new_blocks = [];
        this.new_chunks = [];
        this.new_parts = [];
        this.delete_blocks = [];
        this.update_chunk_ids = [];
    }

    async run() {
        const millistamp = time_utils.millistamp();
        dbg.log1('PutMapping: start');
        try {
            this.add_chunks();
            await this.update_db();
            dbg.log0('PutMapping: DONE. chunks', this.chunks.length,
                'took', time_utils.millitook(millistamp));
            return this.chunks;
        } catch (err) {
            dbg.error('PutMapping: ERROR', err.stack || err);
            throw err;
        }
    }

    add_chunks() {
        for (const chunk of this.chunks) {
            system_utils.prepare_chunk_for_mapping(chunk);
            if (chunk.dup_chunk) {
                this.add_new_parts(chunk.parts, chunk, chunk.dup_chunk);
            } else if (chunk._id) {
                this.add_existing_chunk(chunk);
            } else {
                this.add_new_chunk(chunk);
            }
        }
    }

    add_new_chunk(chunk) {
        const chunk_id = MDStore.instance().make_md_id();
        const bucket = system_store.data.get_by_id(chunk.bucket);
        const digest = chunk.digest_b64 && Buffer.from(chunk.digest_b64, 'base64');
        const tier = this.move_to_tier || system_store.data.get_by_id(chunk.tier);
        const chunk_config = _.find(bucket.system.chunk_configs_by_id,
            c => _.isEqual(c.chunk_coder_config, chunk.chunk_coder_config))._id;
        this.add_new_parts(chunk.parts, chunk, chunk_id);
        this.new_chunks.push(_.omitBy({
            _id: chunk_id,
            system: bucket.system._id,
            bucket: bucket._id,
            tier: tier._id,
            tier_lru: new Date(),
            chunk_config,
            size: chunk.size,
            compress_size: chunk.compress_size,
            frag_size: chunk.frag_size,
            dedup_key: digest,
            digest,
            cipher_key: chunk.cipher_key_b64 && Buffer.from(chunk.cipher_key_b64, 'base64'),
            cipher_iv: chunk.cipher_iv_b64 && Buffer.from(chunk.cipher_iv_b64, 'base64'),
            cipher_auth_tag: chunk.cipher_auth_tag_b64 && Buffer.from(chunk.cipher_auth_tag_b64, 'base64'),
            frags: _.map(chunk.frags, frag => {
                const frag_id = MDStore.instance().make_md_id();
                for (const { block } of frag.allocations) {
                    this.add_new_block(block, chunk.frag_size, frag_id, chunk_id, bucket);
                }
                assert.strictEqual(frag.blocks, undefined);
                assert.strictEqual(frag.deletions, undefined);
                assert.strictEqual(frag.future_deletions, undefined);
                return _.omitBy({
                    _id: frag_id,
                    data_index: frag.data_index,
                    parity_index: frag.parity_index,
                    lrc_index: frag.lrc_index,
                    digest: frag.digest_b64 && Buffer.from(frag.digest_b64, 'base64')
                }, _.isUndefined);
            })
        }, _.isUndefined));
    }

    add_existing_chunk(chunk) {
        const bucket = system_store.data.get_by_id(chunk.bucket);
        this.update_chunk_ids.push(MDStore.instance().make_md_id(chunk._id));
        for (const frag of chunk.frags) {
            for (const { block } of frag.allocations) {
                this.add_new_block(block, chunk.frag_size, frag._id, chunk._id, bucket);
            }
            const blocks_by_id = _.groupBy(frag.blocks, '_id');
            for (const { block_id } of frag.deletions) {
                const block = blocks_by_id[block_id];
                assert(block);
                this.delete_blocks.push(block);
            }
        }
    }

    add_new_parts(parts, chunk, chunk_id) {
        // let upload_size = obj.upload_size || 0;
        for (const part of parts) {
            // if (upload_size < part.end) {
            //     upload_size = part.end;
            // }
            const new_part = {
                _id: MDStore.instance().make_md_id(),
                system: chunk.bucket.system._id,
                bucket: chunk.bucket._id,
                obj: MDStore.instance().make_md_id(part.obj_id),
                start: part.start,
                end: part.end,
                seq: part.seq,
                chunk: MDStore.instance().make_md_id(chunk_id),
                uncommitted: true,
            };
            if (part.multipart_id) {
                new_part.multipart = MDStore.instance().make_md_id(part.multipart_id);
            }
            this.new_parts.push(new_part);
        }
    }

    add_new_block(block, frag_size, frag_id, chunk_id, bucket) {
        const now = Date.now();
        const block_id = MDStore.instance().make_md_id(block.block_md.id);
        const block_id_time = block_id.getTimestamp().getTime();
        if (block_id_time < now.getTime() - (config.MD_GRACE_IN_MILLISECONDS - config.MD_AGGREGATOR_INTERVAL)) {
            dbg.error('PutMapping: A big gap was found between id creation and addition to DB:',
                block, bucket.name, block_id_time, now.getTime());
        }
        if (block_id_time < bucket.storage_stats.last_update + config.MD_AGGREGATOR_INTERVAL) {
            dbg.error('PutMapping: A big gap was found between id creation and bucket last update:',
                block, bucket.name, block_id_time, bucket.storage_stats.last_update);
        }
        if (!block.block_md.node || !block.block_md.pool) {
            dbg.error('PutMapping: Missing node/pool for block', block);
            throw new Error('PutMapping: Missing node/pool for block');
        }
        this.new_blocks.push({
            _id: block_id,
            system: bucket.system._id,
            bucket: bucket._id,
            chunk: chunk_id,
            frag: frag_id,
            node: mongo_utils.make_object_id(block.block_md.node),
            pool: mongo_utils.make_object_id(block.block_md.pool),
            size: frag_size,
        });
    }

    async update_db() {
        await Promise.all([
            MDStore.instance().insert_blocks(this.new_blocks),
            MDStore.instance().insert_chunks(this.new_chunks),
            MDStore.instance().insert_parts(this.new_parts),
            map_deleter.builder_delete_blocks(this.delete_blocks),
            this.move_to_tier && MDStore.instance().update_chunks_by_ids(this.update_chunk_ids, { tier: this.move_to_tier._id }),

            // TODO
            // (upload_size > obj.upload_size) && MDStore.instance().update_object_by_id(obj._id, { upload_size: upload_size })

        ]);
    }

}

async function select_tier_for_write(bucket, obj) {
    const tiering = bucket.tiering;
    await node_allocator.refresh_tiering_alloc(tiering);
    const tiering_status = node_allocator.get_tiering_status(tiering);
    return mapper.select_tier_for_write(tiering, tiering_status);
}


async function make_room_in_tier(tier_id, bucket_id) {
    return make_room_semaphore.surround_key(String(tier_id), async () => {
        const tier = tier_id && system_store.data.get_by_id(tier_id);
        const bucket = bucket_id && system_store.data.get_by_id(bucket_id);
        const tiering = bucket.tiering;
        const tier_and_order = tiering.tiers.find(t => String(t.tier._id) === String(tier_id));

        await node_allocator.refresh_tiering_alloc(tiering);
        if (enough_room_in_tier(tier, bucket)) return;

        const tiering_status = node_allocator.get_tiering_status(tiering);
        const next_tier = mapper.select_tier_for_write(tiering, tiering_status, tier_and_order.order + 1);
        if (!next_tier) {
            dbg.warn(`make_room_in_tier: No next tier to move data to`, tier.name);
            return;
        }

        const chunk_ids = await MDStore.instance().find_oldest_tier_chunk_ids(tier._id, config.CHUNK_MOVE_LIMIT, 1);
        const start_alloc_time = Date.now();
        await server_rpc.client.scrubber.build_chunks({
            chunk_ids,
            tier: next_tier._id,
        }, {
            auth_token: auth_server.make_auth_token({
                system_id: bucket.system._id,
                role: 'admin'
            })
        });
        map_reporter.add_event(`scrubber.build_chunks(${tier.name})`, chunk_ids.length, Date.now() - start_alloc_time);
        dbg.log0(`make_room_in_tier: moved ${chunk_ids.length} to next tier`);

        // TODO avoid multiple calls, maybe plan how much to move before and refresh after moving enough
        await node_allocator.refresh_tiering_alloc(tiering, 'force');
    });
}

async function ensure_room_barrier_process(tiers_and_buckets) {
    const uniq_tiers_and_buckets = _.uniqBy(tiers_and_buckets, 'tier');
    await P.map(uniq_tiers_and_buckets, async ({ tier, bucket }) => {
        await server_rpc.client.scrubber.make_room_in_tier({
            tier: tier._id,
            bucket: bucket._id,
        }, {
            auth_token: auth_server.make_auth_token({
                system_id: bucket.system._id,
                role: 'admin'
            })
        });
        await node_allocator.refresh_tiering_alloc(bucket.tiering, 'force');
        enough_room_in_tier(tier, bucket); // calling just to do the log prints
    });
}

async function ensure_room_in_tier(tier, bucket) {
    await node_allocator.refresh_tiering_alloc(bucket.tiering);
    if (enough_room_in_tier(tier, bucket)) return;
    const start_time = Date.now();
    await ensure_room_barrier.call({ tier, bucket });
    map_reporter.add_event(`ensure_room_in_tier(${tier.name})`, 0, Date.now() - start_time);
}

function enough_room_in_tier(tier, bucket) {
    const tiering = bucket.tiering;
    const tiering_status = node_allocator.get_tiering_status(tiering);
    const tier_status = tiering_status[tier._id];
    const tier_in_tiering = _.find(tiering.tiers, t => String(t.tier._id) === String(tier._id));
    if (!tier_in_tiering || !tier_status) throw new Error(`Can't find current tier in bucket`);
    const available_to_upload = size_utils.json_to_bigint(size_utils.reduce_maximum(
        'free', tier_status.mirrors_storage.map(storage => (storage.free || 0))
    ));
    if (available_to_upload && available_to_upload.greater(config.ENOUGH_ROOM_IN_TIER_THRESHOLD)) {
        dbg.log0('make_room_in_tier: has enough room', tier.name, available_to_upload.toJSNumber(), '>', config.ENOUGH_ROOM_IN_TIER_THRESHOLD);
        map_reporter.add_event(`has_enough_room(${tier.name})`, available_to_upload.toJSNumber(), 0);
        return true;
    } else {
        dbg.log0(`make_room_in_tier: not enough room ${tier.name}:`,
            `${available_to_upload.toJSNumber()} < ${config.ENOUGH_ROOM_IN_TIER_THRESHOLD} should move chunks to next tier`);
        map_reporter.add_event(`not_enough_room(${tier.name})`, available_to_upload.toJSNumber(), 0);
        return false;
    }
}

exports.GetMapping = GetMapping;
exports.PutMapping = PutMapping;
exports.select_tier_for_write = select_tier_for_write;
exports.make_room_in_tier = make_room_in_tier;
