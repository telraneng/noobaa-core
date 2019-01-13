/* Copyright (C) 2016 NooBaa */
'use strict';

/// <reference path="../nb.d.ts" />

const _ = require('lodash');
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
const map_deleter = require('./map_deleter');
const nodes_client = require('../node_services/nodes_client');
const system_store = require('../system_services/system_store').get_instance();
const node_allocator = require('../node_services/node_allocator');
const PeriodicReporter = require('../../util/periodic_reporter');
const Barrier = require('../../util/barrier');
const KeysSemaphore = require('../../util/keys_semaphore');
const { ChunkDB } = require('./map_db_types');
// const { ChunkAPI } = require('../../sdk/map_api_types');

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

    /**
     * @param {Object} props
     * @param {nb.Chunk[]} props.chunks
     * @param {boolean} props.check_dups
     * @param {nb.Tier} [props.move_to_tier]
     * @param {nb.LocationInfo} [props.location_info]
     */
    constructor(props) {
        this.chunks = props.chunks;
        this.move_to_tier = props.move_to_tier;
        this.check_dups = props.check_dups;
        this.location_info = props.location_info;

        this.chunks_per_bucket = _.groupBy(this.chunks, 'bucket_id');
        // assert move_to_tier is only used for chunks on the same bucket
        if (this.move_to_tier) assert.strictEqual(Object.keys(this.chunks_per_bucket).length, 1);
        Object.seal(this);
    }

    /**
     * @returns {Promise<nb.Chunk[]>}
     */
    async run() {
        const millistamp = time_utils.millistamp();
        dbg.log1('GetMapping: start');
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
        await Promise.all(Object.values(this.chunks_per_bucket).map(async chunks => {
            const bucket = chunks[0].bucket;
            const dedup_keys = _.compact(_.map(chunks,
                chunk => chunk.digest_b64 && Buffer.from(chunk.digest_b64, 'base64')));
            dbg.log0('GetMapping.find_dups', dedup_keys.length);
            if (!dedup_keys.length) return;
            const dup_chunks_db = await MDStore.instance().find_chunks_by_dedup_key(bucket, dedup_keys);
            const dup_chunks = dup_chunks_db.map(chunk_db => new ChunkDB(chunk_db));
            dbg.log0('GetMapping.dup_chunks', dup_chunks);
            await this.prepare_chunks_group(dup_chunks);
            for (const dup_chunk of dup_chunks) {
                if (mapper.is_chunk_good_for_dedup(dup_chunk)) {
                    for (const chunk of chunks) {
                        if (chunk.size === dup_chunk.size &&
                            chunk.digest_b64 === dup_chunk.digest_b64) {
                            chunk.dup_chunk_id = dup_chunk._id;
                        }
                    }
                }
            }
        }));
    }

    async do_allocations() {
        await Promise.all(Object.values(this.chunks_per_bucket).map(async chunks => {
            const bucket = chunks[0].bucket;
            const total_size = _.sumBy(chunks, 'size');
            await this.prepare_chunks_group(chunks, this.move_to_tier);
            let done = false;
            while (!done) {
                const start_alloc_time = Date.now();
                done = await this.allocate_chunks(chunks);
                map_reporter.add_event(`allocate_chunks(${bucket.name})`, total_size, Date.now() - start_alloc_time);
                if (!done) {
                    const uniq_tiers = _.uniq(_.map(chunks, 'tier'));
                    await P.map(uniq_tiers, tier => ensure_room_in_tier(tier, bucket));
                    // TODO Decide if we want to update the chunks mappings when looping
                    // await this.prepare_chunks_group(chunks, bucket);
                }
            }
        }));
    }

    /**
     * @param {nb.Chunk[]} chunks
     * @param {nb.Tier} [move_to_tier]
     */
    async prepare_chunks_group(chunks, move_to_tier) {
        if (!chunks.length) return;
        const bucket = chunks[0].bucket;
        await node_allocator.refresh_tiering_alloc(bucket.tiering);
        const tiering_status = node_allocator.get_tiering_status(bucket.tiering);
        await this.populate_chunks(chunks);
        for (const chunk of chunks) {
            let selected_tier;
            if (move_to_tier) {
                selected_tier = move_to_tier;
            } else if (chunk.tier) {
                const tier_and_order = bucket.tiering.tiers.find(t => String(t.tier._id) === String(chunk.tier._id));
                selected_tier = mapper.select_tier_for_write(bucket.tiering, tiering_status, tier_and_order.order);
            } else {
                selected_tier = mapper.select_tier_for_write(bucket.tiering, tiering_status);
            }
            // remove from the list blocks that their node is not found
            // and consider these blocks just like deleted blocks
            mapper.map_chunk(chunk, selected_tier, bucket.tiering, tiering_status, this.location_info);
        }
    }

    /**
     * @param {nb.Chunk[]} chunks
     */
    async populate_chunks(chunks) {
        const blocks = /** @type {nb.Block[]} */ (
            /** @type {unknown} */
            (_.flatMapDeep(chunks, chunk => chunk.frags.map(frag => frag.blocks)))
        );
        await nodes_client.instance().populate_nodes_for_map(chunks[0].bucket.system, blocks, 'node_id', 'node');
        const orphan_blocks = _.remove(blocks, block => !block.node || !block.node._id);
        if (orphan_blocks.length) console.log('ORPHAN BLOCKS (ignoring)', orphan_blocks);
    }

    /**
     * @param {nb.Chunk[]} chunks
     */
    async allocate_chunks(chunks) {
        for (const chunk of chunks) {
            if (chunk.dup_chunk_id) continue;
            const done = await this.allocate_chunk(chunk);
            if (!done) return false;
        }
        return true;
    }

    /**
     * @param {nb.Chunk} chunk
     */
    async allocate_chunk(chunk) {
        const avoid_blocks = _.flatMap(chunk.frags, frag => frag.blocks.filter(block => block.node.node_type === 'BLOCK_STORE_FS'));
        const avoid_nodes = avoid_blocks.map(block => String(block.node._id));
        const allocated_hosts = avoid_blocks.map(block => block.node.host_id);
        const preallocate_list = [];

        const has_room = enough_room_in_tier(chunk.tier, chunk.bucket);
        for (const frag of chunk.frags) {
            for (const block of frag.blocks) {
                if (!block.is_allocation) continue;
                // const { frag, pools, /* sources */ } = alloc;
                const node = node_allocator.allocate_node(pools, avoid_nodes, allocated_hosts);
                if (!node) {
                    dbg.warn(`GetMapping allocate_blocks: no nodes for allocation ` +
                        `avoid_nodes ${avoid_nodes.join(',')} ` +
                        `pools ${pools.join(',')} `
                    );
                    // chunk.frags = saved_frags;
                    return false;
                }
                block.node_id = node._id;
                block.pool_id = node.pool._id;
                if (node.node_type === 'BLOCK_STORE_FS') {
                    avoid_nodes.push(String(node._id));
                    allocated_hosts.push(node.host_id);
                }
                if (!has_room) preallocate_list.push(block);
            }
        }

        if (preallocate_list.length) {
            let ok = true;
            await P.map(preallocate_list, async block => {
                try {
                    await server_rpc.client.block_store.preallocate_block({
                        block_md: block.to_block_md(),
                    }, {
                        address: block.address,
                        timeout: config.IO_REPLICATE_BLOCK_TIMEOUT,
                        auth_token: auth_server.make_auth_token({
                            system_id: chunk.bucket.system._id,
                            role: 'admin',
                        })
                    });
                    block.is_preallocated = true;
                } catch (err) {
                    dbg.warn('GetMapping: preallocate_block failed, will retry', block);
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

        return true;
    }



}


/**
 * 
 * PUT_MAPPING
 * 
 */
class PutMapping {

    /**
     * @param {Object} props
     * @param {nb.Chunk[]} props.chunks
     * @param {nb.Tier} props.move_to_tier
     */
    constructor(props) {
        this.chunks = props.chunks;
        this.move_to_tier = props.move_to_tier;

        /** @type {nb.BlockSchemaDB[]} */
        this.new_blocks = [];
        /** @type {nb.ChunkSchemaDB[]} */
        this.new_chunks = [];
        /** @type {nb.Part[]} */
        this.new_parts = [];
        /** @type {nb.Block[]} */
        this.delete_blocks = [];
        /** @type {nb.ID[]} */
        this.update_chunk_ids = [];
        Object.seal(this);
    }

    async run() {
        const millistamp = time_utils.millistamp();
        dbg.log0('PutMapping: start');
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
            // populate_chunk(chunk);
            if (chunk.dup_chunk_id) { // duplicated chunk
                this.add_new_parts(chunk.parts, chunk, chunk.dup_chunk_id);
            } else if (chunk._id) {
                this.add_existing_chunk(chunk);
            } else {
                this.add_new_chunk(chunk);
            }
        }
    }

    /**
     * @param {nb.Chunk} chunk 
     */
    add_new_chunk(chunk) {
        this.add_new_parts(chunk.parts, chunk, chunk._id);
        for (const frag of chunk.frags) {
            for (const block of frag.blocks) {
                assert.strictEqual(block.is_allocation, true);
                assert.strictEqual(block.is_deletion, false);
                assert.strictEqual(block.is_future_deletion, false);
                this.add_new_block(block, chunk.frag_size, frag._id, chunk._id, chunk.bucket);
            }
        }
        this.new_chunks.push(chunk.to_db());
    }

    /**
     * @param {nb.Chunk} chunk 
     */
    add_existing_chunk(chunk) {
        this.update_chunk_ids.push(chunk._id);
        for (const frag of chunk.frags) {
            for (const block of frag.blocks) {
                if (block.is_allocation) {
                    this.add_new_block(block, chunk.frag_size, frag._id, chunk._id, chunk.bucket);
                } else if (block.is_deletion) {
                    this.delete_blocks.push(block);
                }
            }
        }
    }

    /**
     * @param {nb.Part[]} parts
     * @param {nb.Chunk} chunk
     * @param {nb.ID} chunk_id
     */
    add_new_parts(parts, chunk, chunk_id) {
        // let upload_size = obj.upload_size || 0;
        for (const part of parts) {
            // if (upload_size < part.end) {
            //     upload_size = part.end;
            // }
            const new_part = {
                _id: MDStore.instance().make_md_id(),
                system: chunk.bucket.system._id,
                bucket: chunk.bucket_id,
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

    /**
     * @param {nb.Block} block
     * @param {number} frag_size
     * @param {nb.ID} frag_id
     * @param {nb.ID} chunk_id
     * @param {nb.Bucket} bucket
     */
    add_new_block(block, frag_size, frag_id, chunk_id, bucket) {
        const now = Date.now();
        const block_id_time = block._id.getTimestamp().getTime();
        if (block_id_time < now - (config.MD_GRACE_IN_MILLISECONDS - config.MD_AGGREGATOR_INTERVAL)) {
            dbg.error('PutMapping: A big gap was found between id creation and addition to DB:',
                block, bucket.name, block_id_time, now);
        }
        if (block_id_time < bucket.storage_stats.last_update + config.MD_AGGREGATOR_INTERVAL) {
            dbg.error('PutMapping: A big gap was found between id creation and bucket last update:',
                block, bucket.name, block_id_time, bucket.storage_stats.last_update);
        }
        if (!block.node_id || !block.pool_id) {
            dbg.error('PutMapping: Missing node/pool for block', block);
            throw new Error('PutMapping: Missing node/pool for block');
        }
        this.new_blocks.push(block.to_db());
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

/**
 * @param {nb.Bucket} bucket
 */
async function select_tier_for_write(bucket) {
    const tiering = bucket.tiering;
    await node_allocator.refresh_tiering_alloc(tiering);
    const tiering_status = node_allocator.get_tiering_status(tiering);
    return mapper.select_tier_for_write(tiering, tiering_status);
}


/**
 * @param {nb.ID} tier_id
 * @param {nb.ID} bucket_id
 */
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
/**
 * @param {Array<{ tier: nb.Tier, bucket: nb.Bucket }>} tiers_and_buckets 
 */
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

/**
 * @param {nb.Tier} tier
 * @param {nb.Bucket} bucket
 */
async function ensure_room_in_tier(tier, bucket) {
    await node_allocator.refresh_tiering_alloc(bucket.tiering);
    if (enough_room_in_tier(tier, bucket)) return;
    const start_time = Date.now();
    await ensure_room_barrier.call({ tier, bucket });
    map_reporter.add_event(`ensure_room_in_tier(${tier.name})`, 0, Date.now() - start_time);
}

/**
 * @param {nb.Tier} tier
 * @param {nb.Bucket} bucket
 */
function enough_room_in_tier(tier, bucket) {
    const tiering = bucket.tiering;
    const tier_id_str = tier._id.toHexString();
    const tiering_status = node_allocator.get_tiering_status(tiering);
    const tier_status = tiering_status[tier_id_str];
    const tier_in_tiering = _.find(tiering.tiers, t => String(t.tier._id) === tier_id_str);
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
// exports.populate_chunk = populate_chunk;
