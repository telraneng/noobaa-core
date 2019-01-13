/* Copyright (C) 2016 NooBaa */
'use strict';

const _ = require('lodash');
const util = require('util');

const P = require('../../util/promise');
const dbg = require('../../util/debug_module')(__filename);
// const config = require('../../../config.js');
const mapper = require('./mapper');
const MDStore = require('./md_store').MDStore;
const js_utils = require('../../util/js_utils');
const KeysLock = require('../../util/keys_lock');
const server_rpc = require('../server_rpc');
const map_client = require('../../sdk/map_client');
const map_deleter = require('./map_deleter');
const mongo_utils = require('../../util/mongo_utils');
const auth_server = require('../common_services/auth_server');
const system_store = require('../system_services/system_store').get_instance();
const node_allocator = require('../node_services/node_allocator');
const system_utils = require('../utils/system_utils');

const builder_lock = new KeysLock();

// dbg.set_level(5);

/**
 *
 * MapBuilder
 *
 * process list of chunk in a batch, and for each one make sure they are well built,
 * meaning that their blocks are available, by creating new blocks and replicating
 * them from accessible blocks, and removing unneeded blocks.
 *
 */
class MapBuilder {

    async run(chunk_ids, move_to_tier) {
        this.move_to_tier = move_to_tier;
        dbg.log0('MapBuilder.run:', 'batch start', chunk_ids, 'move_to_tier', move_to_tier && move_to_tier.name);
        if (!chunk_ids.length) return;

        await builder_lock.surround_keys(_.map(chunk_ids, String), async () => {

            // we run the build twice. first time to perform all allocation, second time to perform deletions
            await this.run_build(chunk_ids);

            // run build a second time on the allocated chunks
            await this.run_build(this.allocated_chunk_ids);

            // return error from the promise if any replication failed,
            // so that caller will know the build isn't really complete,
            // although it might partially succeeded
            if (this.had_errors) {
                throw new Error('MapBuilder had errors');
            }

        });
    }



    async run_build(chunk_ids) {
        if (!chunk_ids.length) return;

        // this.had_errors is intentially not reset to keep errors between calls to run_build
        this.chunks = [];
        this.objects_to_delete = [];
        this.chunks_to_delete = [];
        this.allocated_chunk_ids = [];
        this.delete_blocks = [];
        // this.new_blocks = [];

        await this.reload_chunks(chunk_ids);
        await system_store.refresh();
        const [parts_objects_res, ] = await P.all([
            MDStore.instance().load_parts_objects_for_chunks(this.chunks),
            MDStore.instance().load_blocks_for_chunks(this.chunks)
        ]);
        await this.prepare_and_fix_chunks(parts_objects_res);
        await this.build_chunks();
        await this.update_db();
    }

    // In order to get the most relevant data regarding the chunks
    // Note that there is always a possibility that the chunks will cease to exist
    // TODO: We can release the unrelevant chunks from the surround_keys
    // This will allow other batches to run if they wait on non existing chunks
    async reload_chunks(chunk_ids) {
        this.chunks = await MDStore.instance().find_chunks_by_ids(chunk_ids);
        dbg.log1('MapBuilder.reload_chunks:', this.chunks);
    }

    async prepare_and_fix_chunks({ parts, objects }) {
        // first look for deleted chunks, and set it's blocks for deletion
        const [deleted_chunks, live_chunks] = _.partition(this.chunks, chunk => chunk.deleted);
        // set this.chunks to only hold live chunks
        this.chunks = live_chunks;

        // mark all live blocks of deleted chunks for deletion
        _.each(deleted_chunks, chunk => {
            const live_blocks = chunk.blocks.filter(block => !block.deleted);
            if (live_blocks.length) {
                dbg.log0('identified undeleted blocks of a deleted chunk. chunk =', chunk._id, 'blocks =', live_blocks);
                this.delete_blocks = this.delete_blocks || [];
                js_utils.array_push_all(this.delete_blocks, live_blocks);
            }
        });

        const parts_by_chunk = _.groupBy(parts, 'chunk');
        const objects_by_id = _.keyBy(objects, '_id');
        await P.map(this.chunks, async chunk => {
            // if other actions should be done to prepare a chunk for build, those actions should be added here
            chunk.parts = parts_by_chunk[chunk._id];
            chunk.objects = _.uniq(_.compact(_.map(chunk.parts, part => objects_by_id[part.obj])));
            system_utils.prepare_chunk_for_mapping(chunk);

            try {
                if (!chunk.parts || !chunk.parts.length) throw new Error('No valid parts are pointing to chunk', chunk._id);
                if (!chunk.objects || !chunk.objects.length) throw new Error('No valid objects are pointing to chunk', chunk._id);

                await this.populate_chunk_bucket(chunk);
                if (!chunk.tier._id) { // tier was deleted?
                    await node_allocator.refresh_tiering_alloc(chunk.bucket.tiering);
                    const tiering_status = node_allocator.get_tiering_status(chunk.bucket.tiering);
                    chunk.tier = mapper.select_tier_for_write(chunk.bucket.tiering, tiering_status);
                }
            } catch (err) {
                dbg.error(`failed to prepare chunk ${chunk._id} for builder`, err);
                chunk.had_errors = true;
                this.had_errors = true;
            }
        });

        // do not build chunk that all of its parts are deleted. mark them for deletion
        const [chunks_to_delete, chunks_to_build] = _.partition(this.chunks,
            chunk => _.every(chunk.parts, part => Boolean(part.deleted)));
        this.chunks = chunks_to_build;
        this.chunks_to_delete = chunks_to_delete;
        if (this.chunks_to_delete.length) {
            dbg.warn(`Chunks marked for deletion:`, this.chunks_to_delete);

            // TODO push the blocks of chunks_to_delete to this.delete_blocks

        }
    }

    populate_chunk_bucket(chunk) {
        let bucket = system_store.data.get_by_id(chunk.bucket);
        const object_bucket_ids = mongo_utils.uniq_ids(chunk.objects, 'bucket');
        const valid_buckets = _.compact(object_bucket_ids.map(bucket_id => system_store.data.get_by_id(bucket_id)));
        if (!valid_buckets.length) {
            return system_store.data.get_by_id_include_deleted(chunk.bucket, 'buckets')
                .then(deleted_bucket => {
                    if (deleted_bucket) {
                        dbg.warn(`Chunk ${chunk._id} is held by a deleted bucket ${deleted_bucket.name} marking for deletion`);
                        chunk.bucket = deleted_bucket.record;
                        this.objects_to_delete.push(_.filter(chunk.objects, obj => _.isEqual(obj.bucket, deleted_bucket.record._id)));
                        return;
                    }
                    //We prefer to leave the option for manual fix if we'll need it
                    dbg.error(`Chunk ${chunk._id} is held by ${chunk.objects.length} invalid objects. The following objects have no valid bucket`, chunk.objects);
                    throw new Error('Chunk held by invalid objects');
                });
        }
        if (valid_buckets.length > 1) {
            dbg.error(`Chunk ${chunk._id} is held by objects from ${object_bucket_ids.length} different buckets`);
        }
        if (!bucket || !object_bucket_ids.find(id => String(id) === String(bucket._id))) {
            dbg.error('chunk', chunk._id, 'is holding an invalid bucket', chunk.bucket, 'fixing to', valid_buckets[0]);
            bucket = valid_buckets[0]; // This is arbitrary, but there shouldn't be more than one in a healthy system
            if (bucket) {
                chunk.bucket = bucket;
                return MDStore.instance().update_chunk_by_id(chunk._id, { bucket: bucket._id });
            }
            throw new Error('Could not fix chunk bucket. No suitable bucket found');
        }
        chunk.bucket = bucket;
    }

    async build_chunks() {
        try {
            const chunks_info = this.chunks.map(chunk => mapper.get_chunk_info(chunk));
            const m = new map_client.MapClient({
                chunks: chunks_info,
                move_to_tier: this.move_to_tier,
                rpc_client: server_rpc.rpc.new_client({
                    auth_token: auth_server.make_auth_token({
                        system_id: system_store.data.systems[0]._id,
                        role: 'admin',
                    })
                }),
            });
            await m.run();

            // TODO mark errors on chunks!

        } catch (err) {
            // we make sure to catch and continue here since we process a batch
            // of chunks concurrently, and if any one of these chunks fails
            // we still need to call update_db() for all the blocks that succeeded
            // to be inserted in the DB, otherwise we will leak these blocks on the nodes.
            dbg.error('MapBuilder.build_chunks: FAILED', err.stack || err);
            this.had_errors = true;
            for (const chunk of this.chunks) {
                chunk.had_errors = true;
            }
        }
    }

    update_db() {
        const success_chunk_ids = mongo_utils.uniq_ids(
            _.reject(this.chunks, chunk => chunk.had_errors || chunk.bucket.deleted), '_id');
        const failed_chunk_ids = mongo_utils.uniq_ids(
            _.filter(this.chunks, chunk => chunk.had_errors && !chunk.bucket.deleted), '_id');
        const objs_to_be_deleted = _.uniqBy(_.flatten(this.objects_to_delete), '_id');
        const chunks_to_be_deleted = _.uniqBy(_.flatten(this.chunks_to_delete), '_id');

        dbg.log1('MapBuilder.update_db:',
            'chunks', this.chunks.length,
            'success_chunk_ids', success_chunk_ids.length,
            'failed_chunk_ids', failed_chunk_ids.length,
            'objs_to_be_deleted', objs_to_be_deleted.length,
            'chunks_to_be_deleted', chunks_to_be_deleted.length,
            'new_blocks', _.get(this, 'new_blocks.length', 0),
            'delete_blocks', _.get(this, 'delete_blocks.length', 0));

        return P.join(
            map_deleter.builder_delete_blocks(this.delete_blocks),
            map_deleter.delete_chunks(_.map(chunks_to_be_deleted, '_id')),
            // We do not care about the latest flags for objects that do not have a bucket
            P.map(objs_to_be_deleted, obj => MDStore.instance().remove_object_and_unset_latest(obj)
                .then(() => map_deleter.delete_object_mappings(obj))
                .catch(err => dbg.error('Failed to delete object', obj, 'with error', err))
            ),
        );
    }

}

/**
 * avoid printing rpc_client to logs, it's ugly
 * also avoid infinite recursion and omit inspect function
 * @this chunk
 */
function custom_inspect_chunk() {
    return {
        ..._.omit(this, 'rpc_client', util.inspect.custom),
        bucket: this.bucket._id,
        tier: this.move_to_tier._id,
    };
}
_.noop(custom_inspect_chunk);

exports.MapBuilder = MapBuilder;
