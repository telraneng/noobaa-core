/* Copyright (C) 2016 NooBaa */
'use strict';

/// <reference path="../../sdk/nb.d.ts" />

const _ = require('lodash');
const util = require('util');

const dbg = require('../../util/debug_module')(__filename);
const config = require('../../../config');
const size_utils = require('../../util/size_utils');
const system_store = require('../system_services/system_store').get_instance();

/**
 *
 *
 * MirrorMapper
 *
 *
 */
class MirrorMapper {

    /**
     * @param {nb.TierMirror} mirror 
     * @param {nb.ChunkCoderConfig} chunk_coder_config 
     * @param {number} mirror_index 
     */
    constructor(mirror, chunk_coder_config, mirror_index) {
        const { _id: mirror_id, spread_pools } = mirror;
        this.mirror_group = String(mirror_id);
        this.spread_pools = spread_pools;
        this.chunk_coder_config = chunk_coder_config;
        this.pools_by_id = _.keyBy(spread_pools, '_id');
        if (!spread_pools.length) dbg.log1('MirrorMapper: no pools in current mirror', mirror);
        const pools_partitions = _.partition(spread_pools, _pool_has_redundancy);
        this.redundant_pools = pools_partitions[0];
        this.regular_pools = pools_partitions[1];
        this.mirror_index = mirror_index;
        this.weight = -1;
    }

    /**
     * @param {nb.TierStatus} tier_status
     * @param {nb.LocationInfo} [location_info]
     */
    update_status(tier_status, location_info) {
        const { redundant_pools, spread_pools } = this;
        this.regular_pools_valid = false;
        this.redundant_pools_valid = false;

        this.has_online_pool = _.some(spread_pools, pool => tier_status.pools[pool._id].valid_for_allocation);
        // to decide which mirror to use for the first writing mirror
        // we set a weight for each mirror_mapper based on the pool types
        // when all are regular pools we
        const { regular_free, redundant_free } = _.get(tier_status, `mirrors_storage.${this.mirror_index}`, {});
        this.regular_pools_valid = size_utils.json_to_bigint(regular_free).greater(config.MIN_TIER_FREE_THRESHOLD);
        this.redundant_pools_valid = size_utils.json_to_bigint(redundant_free).greater(config.MIN_TIER_FREE_THRESHOLD);
        const regular_weight = this.regular_pools_valid ? 3 : 0;
        this.is_local_mirror = Boolean(find_local_pool(spread_pools, location_info));
        const local_weight = this.is_local_mirror && (this.regular_pools_valid || this.redundant_pools_valid) ? 4 : 0;
        let redundant_weight = 0;
        if (this.redundant_pools_valid) {
            const redundant_has_mongo = redundant_pools.some(pool => Boolean(pool.mongo_pool_info));
            if (redundant_has_mongo) {
                redundant_weight = 1;
            } else {
                redundant_weight = 2;
            }
        }
        this.weight = local_weight || redundant_weight || regular_weight;
    }

    /**
     * @param {MirrorMapper} mapper1
     * @param {MirrorMapper} mapper2
     * @returns {number} >0 if mapper1 is best for write, <0 if mapper2 is best for write.
     */
    static compare_mapper_for_write(mapper1, mapper2) {
        // when equal weight, pick at random to spread the writes load
        // we should add more data to this decision such as pools available space and load factor.
        return (mapper1.weight - mapper2.weight) || (Math.random() - 0.5);
    }

    /**
     * @param {nb.Chunk} chunk
     */
    map_mirror(chunk) {

        const {
            replicas = 1,
                data_frags = 1,
                parity_frags = 0,
        } = this.chunk_coder_config;

        const {
            replicas: chunk_replicas = 1,
            data_frags: chunk_data_frags = 1,
            parity_frags: chunk_parity_frags = 0,
        } = chunk.chunk_coder_config;

        // TODO GUY GAP handle change of data_frags between tier vs. chunk
        let desired_data_frags = data_frags;
        let desired_parity_frags = parity_frags;
        let desired_replicas = replicas;
        if (data_frags !== chunk_data_frags) {
            dbg.log0(`MirrorMapper: tier frags ${data_frags}+${parity_frags}`,
                `requires recoding chunk ${chunk_data_frags}+${chunk_parity_frags}`,
                '(not yet implemented)');
            desired_data_frags = chunk_data_frags;
            desired_parity_frags = chunk_parity_frags;
            desired_replicas = chunk_replicas;
        }

        for (let data_index = 0; data_index < desired_data_frags; ++data_index) {
            const frag_index = `D${data_index}`;
            this._map_frag(
                chunk,
                chunk.frag_by_index[frag_index],
                desired_replicas);
        }
        for (let parity_index = 0; parity_index < desired_parity_frags; ++parity_index) {
            const frag_index = `P${parity_index}`;
            this._map_frag(
                chunk,
                chunk.frag_by_index[frag_index],
                desired_replicas);
        }
    }

    /**
     * 
     * @param {nb.Chunk} chunk 
     * @param {nb.Frag} frag 
     * @param {number} replicas
     * @returns {void}
     */
    _map_frag(chunk, frag, replicas) {
        const {
            pools_by_id,
            regular_pools,
            regular_pools_valid,
        } = this;

        const accessible_blocks = _.filter(frag.blocks, block => block.is_accessible);
        const is_accessible_frag = accessible_blocks.length > 0;
        const used_blocks = [];

        // if this frag is not accessible in existing chunk we
        // should attempt to rebuild from other frags
        if (!is_accessible_frag && chunk._id) {
            chunk.is_building_frags = true;
        }

        let used_replicas = 0;
        let used_redundant_blocks = false;
        for (let i = 0; i < accessible_blocks.length; ++i) {
            const block = accessible_blocks[i];
            // block on pools that do not belong to the current mirror anymore
            // can be accessible but will eventually be deallocated
            const pool = pools_by_id[block.pool_id];
            if (!block.is_misplaced && pool) {
                block.is_local_mirror = this.is_local_mirror;
                used_blocks.push(block);
                // Also we calculate the weight of the current block allocations
                // Notice that we do not calculate bad blocks into the weight
                // We consider one replica in cloud/mongo valid for any policy
                if (_pool_has_redundancy(pool)) {
                    used_redundant_blocks = true;
                    used_replicas += replicas;
                } else {
                    used_replicas += 1;
                }
            }
        }

        if (used_replicas === replicas) {

            for (let i = 0; i < used_blocks.length; ++i) {
                blocks_in_use.push(used_blocks[i]);
            }

        } else if (used_replicas < replicas) {

            for (let i = 0; i < used_blocks.length; ++i) {
                blocks_in_use.push(used_blocks[i]);
            }

            const sources = is_accessible_frag ? {
                accessible_blocks,
                // We assume that even if we fail we will take a different source in the next cycle
                // Other option is to try different sources on replication at error
                next_source: Math.floor(Math.random() * accessible_blocks.length)
            } : undefined;

            // We prefer to keep regular pools if possible, otherwise pick at random
            const pools = used_replicas && !used_redundant_blocks && regular_pools_valid ?
                regular_pools : this._pick_pools();

            // num_missing of required replicas, which are a must to have for the chunk
            // In case of redundant pool allocation we consider one block as a fulfilment of all policy
            // Notice that in case of redundant pools we expect to be here only on the first allocation
            // Since the weight calculation above which adds max_replicas for every replica on redundant pool
            // Will block us from performing the current context and statement.
            const is_redundant = pools.length > 0 && _.every(pools, _pool_has_redundancy);
            const num_missing = is_redundant ? 1 : Math.max(0, replicas - used_replicas);

            // Notice that we push the minimum required replicas in higher priority
            // This is done in order to insure that we will allocate them before the additional replicas
            if (num_missing > 0) {
                frag.allocations = frag.allocations || [];
                for (let i = 0; i < num_missing; ++i) {
                    frag.allocations.push({ frag, pools, sources, mirror_group: this.mirror_group });
                }
            }


        } else {

            // To pick blocks to keep we sort by their creation timestamp in mongodb
            // and will keep newest blocks before older blocks
            // this approach helps to get rid of our "old" mapping decisions in favor of new decisions
            used_blocks.sort(_block_newer_first_sort);
            let keep_replicas = 0;
            for (let i = 0; i < used_blocks.length; ++i) {
                if (keep_replicas >= replicas) break;
                const block = used_blocks[i];
                keep_replicas += _pool_has_redundancy(pools_by_id[block.pool_id]) ? replicas : 1;
                blocks_in_use.push(block);
            }
        }
    }

    /**
     * Pick random pool which sets the allocation type between redundant/regular pools
     * @returns {nb.Pool[]}
     */
    _pick_pools() {
        // handle the corner cases of redundant pools not valid and regular are valid (or vice versa).
        // in that case, return regular pools (or redundant pools in the opposite case).
        if (this.regular_pools_valid && !this.redundant_pools_valid) return this.regular_pools;
        if (!this.regular_pools_valid && this.redundant_pools_valid) return this.redundant_pools;

        // otherwise, pick a random pool to select which type to use.
        const { spread_pools } = this;
        const picked_pool = spread_pools[Math.max(_.random(spread_pools.length - 1), 0)];
        if (picked_pool && _pool_has_redundancy(picked_pool)) {
            return this.redundant_pools;
        } else {
            return this.regular_pools;
        }
    }
}


/**
 *
 *
 * TierMapper
 *
 *
 */
class TierMapper {

    /**
     * @param {Object} props
     * @param {nb.Tier} props.tier
     * @param {number} props.order
     * @param {boolean} [props.spillover]
     * @param {boolean} [props.disabled]
     */
    constructor({ tier, order, spillover }) {
        this.tier = tier;
        this.order = order;
        this.spillover = spillover;
        const { chunk_coder_config } = tier.chunk_config;
        this.mirror_mappers = tier.mirrors
            .map((mirror, mirror_index) => new MirrorMapper(mirror, chunk_coder_config, mirror_index));
        this.write_mapper = this.mirror_mappers[0];
    }

    /**
     * @param {nb.TierStatus} tier_status
     * @param {nb.LocationInfo} [location_info]
     */
    update_status(tier_status, location_info) {
        const { mirror_mappers } = this;
        this.write_mapper = undefined;
        this.online = true;

        for (let i = 0; i < mirror_mappers.length; ++i) {
            const mirror_mapper = mirror_mappers[i];
            mirror_mapper.update_status(tier_status, location_info);
            if (!this.write_mapper || MirrorMapper.compare_mapper_for_write(mirror_mapper, this.write_mapper) > 0) {
                this.write_mapper = mirror_mapper;
            }
            if (!mirror_mapper.has_online_pool) {
                this.online = false;
            }
        }

        // TODO GUY GAP maximum between mirrors? not minimum?

        // We allow to upload to one mirror even if other mirrors don't have any space left
        // That is why we are picking the maximum value of free from the mirrors of the tier
        const available_to_upload = size_utils.json_to_bigint(size_utils.reduce_maximum(
            'free', tier_status.mirrors_storage.map(storage => (storage.free || 0))
        ));
        this.valid_for_allocation = available_to_upload &&
            available_to_upload.greater(config.MIN_TIER_FREE_THRESHOLD) &&
            available_to_upload.greater(config.MAX_TIER_FREE_THRESHOLD);
    }

    /**
     * @param {nb.Chunk} chunk
     */
    map_tier(chunk) {
        const { mirror_mappers, write_mapper } = this;
        const accessible = chunk.is_accessible;

        if (chunk._id) {
            // existing chunk
            for (let i = 0; i < mirror_mappers.length; ++i) {
                const mirror_mapper = mirror_mappers[i];
                mirror_mapper.map_mirror(chunk);
            }
        } else {
            // new chunk
            write_mapper.map_mirror(chunk);
        }

        const blocks = _.flatMap(chunk.frags, frag => frag.blocks);
        const [used_blocks, unused_block] = _.partition(blocks, block => block.);
        if (unused_blocks.length) {
            if (accessible && !tier_mapping.allocations) {
                // Protect from too many deletions by checking:
                // - the number of unused blocks to delete does not include all blocks
                // - the number of unused blocks to delete does not exceed number blocks that should exist
                // - the number of used blocks against the the expected number of blocks
                const min_num_blocks = this.tier.chunk_config.chunk_coder_config.data_frags || 1;
                if (unused_blocks.length >= blocks.length ||
                    unused_blocks.length > blocks.length - min_num_blocks ||
                    used_blocks.length < min_num_blocks) {
                    dbg.error('TierMapper.map_tier: ASSERT protect from too many deletions!',
                        'min_num_blocks', min_num_blocks,
                        'blocks.length', blocks.length,
                        'used_blocks.length', used_blocks.length,
                        'unused_blocks.length', unused_blocks.length,
                        'tier', this.tier,
                        'tier_mapping', tier_mapping,
                        'chunk', chunk,
                        'used_blocks', used_blocks,
                        'unused_blocks', unused_blocks);
                } else {
                    tier_mapping.deletions = unused_blocks;
                }
            } else {
                tier_mapping.future_deletions = unused_blocks;
            }
        }
    }
}


/**
 *
 *
 * TieringMapper
 *
 *
 */
class TieringMapper {

    /**
     * @param {nb.Tiering} tiering
     */
    constructor(tiering) {
        this.tier_mappers = tiering.tiers
            .filter(t => !t.disabled)
            .sort((t, s) => t.order - s.order)
            .map(t => new TierMapper(t));
    }

    /**
     * @param {nb.TieringStatus} tiering_status
     * @param {nb.LocationInfo} [location_info]
     */
    update_status(tiering_status, location_info) {
        const { tier_mappers } = this;

        for (let i = 0; i < tier_mappers.length; ++i) {
            const tier_mapper = tier_mappers[i];
            const tier_status = tiering_status[tier_mapper.tier._id];
            tier_mapper.update_status(tier_status, location_info);
        }
    }

    /**
     * Map a chunk based on the entire tiering policy
     * Works by picking the tier we want best for the chunk to be stored in,
     * @param {nb.Chunk} chunk
     * @param {nb.Tier} tier
     */
    map_tiering(chunk, tier) {
        const tier_mapper = _.find(this.tier_mappers, mapper => _.isEqual(mapper.tier._id, tier._id));
        tier_mapper.map_tier(chunk);
    }

    select_tier_for_write(start_tier_order) {
        const { tier_mappers } = this;
        let best_mapper;
        for (const tier_mapper of tier_mappers) {
            if (start_tier_order >= 0 && tier_mapper.order < start_tier_order) {
                continue;
            }
            if (tier_mapper.online) {
                best_mapper = tier_mapper;
                break;
            }
            if (!best_mapper) {
                // set a fallback
                best_mapper = tier_mapper;
            }
        }
        return best_mapper;
    }

    // get_tier_mapper(tier, chunk_mapper) {
    //     const tier_mapper = _.find(this.tier_mappers, mapper => _.isEqual(mapper.tier._id, tier));
    //     return tier_mapper.map_tier(chunk_mapper);
    // }
}

const tiering_mapper_cache = {
    hits: 0,
    miss: 0,
    /** @type {WeakMap<nb.Tiering,TieringMapper>} */
    map: new WeakMap(),
};

/**
 * @param {nb.Tiering} tiering The bucket tiering
 * @returns {TieringMapper}
 */
function _get_cached_tiering_mapper(tiering) {
    let tiering_mapper = tiering_mapper_cache.map.get(tiering);
    if (tiering_mapper) {
        tiering_mapper_cache.hits += 1;
    } else {
        tiering_mapper_cache.miss += 1;
        tiering_mapper = new TieringMapper(tiering);
        tiering_mapper_cache.map.set(tiering, tiering_mapper);
    }
    if ((tiering_mapper_cache.hits + tiering_mapper_cache.miss + 1) % 10000 === 0) {
        dbg.log0('tiering_mapper_cache:', tiering_mapper_cache);
    }
    return tiering_mapper;
}

/**
 *
 * map_chunk() the main mapper functionality
 * decide how to map a given chunk, either new, or existing
 *
 * @param {nb.Chunk} chunk The data chunk, with blocks populated
 * @param {nb.Tier} tier The chunk target tier
 * @param {nb.Tiering} tiering The bucket tiering
 * @param {nb.TieringStatus} tiering_status See node_allocator.get_tiering_status()
 * @param {nb.LocationInfo} location_info
 */
function map_chunk(chunk, tier, tiering, tiering_status, location_info) {
    // const tiering_mapper = new TieringMapper(tiering);
    const tiering_mapper = _get_cached_tiering_mapper(tiering);
    tiering_mapper.update_status(tiering_status, location_info);
    tiering_mapper.map_tiering(chunk, tier);
}

/**
 * @param {nb.Tiering} tiering The bucket tiering
 * @param {nb.TieringStatus} tiering_status See node_allocator.get_tiering_status()
 * @param {number} [start_tier_order]
 * @returns {nb.Tier} selected tier
 */
function select_tier_for_write(tiering, tiering_status, start_tier_order) {
    const tiering_mapper = _get_cached_tiering_mapper(tiering);
    tiering_mapper.update_status(tiering_status);
    const tier_mapper = tiering_mapper.select_tier_for_write(start_tier_order);
    return tier_mapper && tier_mapper.tier;
}

function is_chunk_good_for_dedup(chunk) {
    if (!chunk.tier._id) return false; // chunk tier was deleted so will need to be reallocated
    return chunk.mapping.accessible && !chunk.mapping.allocations;
}

function assign_node_to_block(block, node, system_id) {

    const system = system_store.data.get_by_id(system_id);
    if (!system) throw new Error('Could not find system ' + system_id);

    const pool = system.pools_by_name[node.pool];
    if (!pool) throw new Error('Could not find pool ' + node.pool + node);

    block.node = node;
    block.pool = pool._id;
    block.system = system_id;
}

function get_num_blocks_per_chunk(tier) {
    const {
        chunk_coder_config: {
            replicas = 1,
            data_frags = 1,
            parity_frags = 0,
        }
    } = tier.chunk_config;
    return replicas * (data_frags + parity_frags);
}

/**
 * sorting function for sorting blocks with most recent heartbeat first
 * @param {nb.Block} block1
 * @param {nb.Block} block2
 */
function _block_newer_first_sort(block1, block2) {
    return block2._id.getTimestamp().getTime() - block1._id.getTimestamp().getTime();
}

/**
 * sorting function for sorting blocks with most recent heartbeat first
 * @param {nb.Block} block1
 * @param {nb.Block} block2
 */
function _block_sorter_basic(block1, block2) {
    const node1 = block1.node;
    const node2 = block2.node;
    if (node2.readable && !node1.readable) return 1;
    if (node1.readable && !node2.readable) return -1;
    return node2.heartbeat - node1.heartbeat;
}

/**
 * locality sorting function for blocks
 * @param {nb.LocationInfo} location_info
 */
function _block_sorter_local(location_info) {
    /**
     * locality sorting function for blocks
     * @param {nb.Block} block1
     * @param {nb.Block} block2
     */
    return function(block1, block2) {
        const node1 = block1.node;
        const node2 = block2.node;
        const { node_id, host_id, pool_id, region } = location_info;
        if (node2.readable && !node1.readable) return 1;
        if (node1.readable && !node2.readable) return -1;
        if (String(node2._id) === node_id && String(node1._id) !== node_id) return 1;
        if (String(node1._id) === node_id && String(node2._id) !== node_id) return -1;
        if (node2.host_id === host_id && node1.host_id !== host_id) return 1;
        if (node1.host_id === host_id && node2.host_id !== host_id) return -1;
        if (String(block2.pool) === pool_id && String(block1.pool) !== pool_id) return 1;
        if (String(block1.pool) === pool_id && String(block2.pool) !== pool_id) return -1;
        if (region) {
            const pool1 = system_store.data.get_by_id(block1.pool);
            const pool2 = system_store.data.get_by_id(block2.pool);
            if (pool2.region === region && pool1.region !== region) return 1;
            if (pool1.region === region && pool2.region !== region) return -1;
        }
        return node2.heartbeat - node1.heartbeat;
    };
}


/**
 * @param {nb.Pool} pool 
 * @returns {boolean}
 */
function _pool_has_redundancy(pool) {
    return Boolean(pool.cloud_pool_info || pool.mongo_pool_info);
}

function should_rebuild_chunk_to_local_mirror(mapping, location_info) {
    if (!location_info) return false;
    if (!location_info.pool_id && !location_info.region) return false;
    if (!mapping.tier) return false;
    // check if the selected tier is in mirroring mode
    if (mapping.tier.data_placement !== 'MIRROR') return false;
    // check if a pool in the selected tier policy is the location range or pool
    if (!find_local_mirror(mapping.tier.mirrors, location_info)) return false;
    // check if there is already a good block on a mirror that we consider local
    if (_.isEmpty(mapping.blocks_in_use)) return false;
    for (const block of mapping.blocks_in_use) {
        if (block.is_local_mirror) return false;
    }
    // check if a pool from the same region appear in the allocations list -
    // if so then there is enough free space on the pool for this chunk and we should rebuild
    if (!mapping.allocations) return false;
    for (const allocation of mapping.allocations) {
        if (find_local_pool(allocation.pools, location_info)) return true;
    }
    // if we didn't find local pool in all allocations (as supposed to by previous conditions) we shouldn't rebuild - not enough space
    return false;
    // TODO - we don't actually check for available storage on the local mirror - for now we only consider allocations
}

function find_local_mirror(mirrors, location_info) {
    return mirrors.find(mirror => find_local_pool(mirror.spread_pools, location_info));
}

/**
 * @param {nb.Pool[]} pools
 * @param {nb.LocationInfo} [location_info]
 */
function find_local_pool(pools, location_info) {
    return location_info && pools.find(pool =>
        (location_info.region && location_info.region === pool.region) ||
        location_info.pool_id === String(pool._id)
    );
}

// EXPORTS
// exports.ChunkMapper = ChunkMapper;
// exports.TieringMapper = TieringMapper;
exports.map_chunk = map_chunk;
exports.select_tier_for_write = select_tier_for_write;
exports.is_chunk_good_for_dedup = is_chunk_good_for_dedup;
exports.assign_node_to_block = assign_node_to_block;
exports.get_num_blocks_per_chunk = get_num_blocks_per_chunk;
exports.should_rebuild_chunk_to_local_mirror = should_rebuild_chunk_to_local_mirror;
