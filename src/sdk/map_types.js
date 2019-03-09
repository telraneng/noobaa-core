/* Copyright (C) 2016 NooBaa */
'use strict';

/// <reference path="./nb.d.ts" />

const _ = require('lodash');
const util = require('util');

const system_store = require('../server/system_services/system_store').get_instance();
const { make_md_id } = require('../server/object_services/md_store');

class Chunk {

    /**
     * @param {Object} props
     * @param {nb.ID} props._id
     * @param {nb.Bucket} props.bucket
     * @param {nb.Tier} props.tier
     * @param {nb.ChunkCoderConfig} props.chunk_coder_config
     * @param {Frag[]} [props.frags]
     * @param {number} props.size
     * @param {number} props.compress_size
     * @param {number} props.frag_size
     * @param {string} [props.digest_b64]
     * @param {string} [props.cipher_key_b64]
     * @param {string} [props.cipher_iv_b64]
     * @param {string} [props.cipher_auth_tag_b64]
     * @param {nb.Part[]} [props.parts]
     * @param {nb.ObjectMD[]} [props.objects]
     * @param {Chunk} [props.dup_chunk]
     * @param {boolean} [props.had_errors]
     * @param {boolean} [props.missing_frags]
     * @param {'enc'|'dec'} [props.coder] op for nb_native().chunk_coder()
     */
    constructor(props) {
        this._id = props._id;
        this.bucket = props.bucket;
        this.tier = props.tier;
        this.chunk_coder_config = props.chunk_coder_config;
        this.frags = props.frags;
        this.size = props.size;
        this.compress_size = props.compress_size;
        this.frag_size = props.frag_size;
        this.digest_b64 = props.digest_b64;
        this.cipher_key_b64 = props.cipher_key_b64;
        this.cipher_iv_b64 = props.cipher_iv_b64;
        this.cipher_auth_tag_b64 = props.cipher_auth_tag_b64;
        this.parts = props.parts;
        this.objects = props.objects;
        this.dup_chunk = props.dup_chunk;
        this.had_errors = props.had_errors;
        this.missing_frags = props.missing_frags;
        this.coder = props.coder;
        Object.seal(this);
    }

    to_chunk_api() {
        return to_chunk_api(this);
    }

    to_chunk_db() {
        return to_chunk_db(this);
    }

    /** @returns {boolean} */
    get is_new() {
        return !this._id;
    }

    /**
     * @returns {boolean}
     */
    get is_accessible() {
        const frags_by_index = _.keyBy(this.frags, 'frag_index');
        const { data_frags = 1, parity_frags = 0 } = this.chunk_coder_config;
        let num_accessible = 0;
        for (let data_index = 0; data_index < data_frags; ++data_index) {
            const frag_index = `D${data_index}`;
            const frag = frags_by_index[frag_index];
            if (frag.blocks) {
                for (let i = 0; i < frag.blocks.length; ++i) {
                    if (frag.blocks[i].accessible) {
                        num_accessible += 1;
                        break;
                    }
                }
            }
        }
        if (num_accessible >= data_frags) return true;
        for (let parity_index = 0; parity_index < parity_frags; ++parity_index) {
            const frag_index = `P${parity_index}`;
            const frag = frags_by_index[frag_index];
            if (frag.blocks) {
                for (let i = 0; i < frag.blocks.length; ++i) {
                    if (frag.blocks[i].accessible) {
                        num_accessible += 1;
                        break;
                    }
                }
            }
        }
        return num_accessible >= data_frags;
    }

    /**
     * @param {Chunk} other_chunk
     * @param {( f1: Frag, f2: Frag ) => void} frag_func
     */
    match_frags(other_chunk, frag_func) {
        const other_frags_by_index = _.keyBy(other_chunk.frags, 'frag_index');
        for (const frag of this.frags) {
            const other_frag = other_frags_by_index[frag.frag_index];
            frag_func(frag, other_frag);
        }
    }
}


class Frag {

    /**
     * @param {Object} props 
     * @param {nb.ID} props._id
     * @param {Chunk} props.chunk
     * @param {number} [props.data_index]
     * @param {number} [props.parity_index]
     * @param {number} [props.lrc_index]
     * @param {string} [props.digest_b64]
     * @param {Block[]} [props.blocks]
     * @param {Buffer} [props.block]
     * @param {FragAllocation[]} [props.allocations]
     * @param {FragDeletion[]} [props.deletions]
     * @param {FragDeletion[]} [props.future_deletions]
     */
    constructor(props) {
        this._id = props._id;
        this.chunk = props.chunk;
        this.data_index = props.data_index;
        this.parity_index = props.parity_index;
        this.lrc_index = props.lrc_index;
        this.digest_b64 = props.digest_b64;
        this.blocks = props.blocks;
        this.block = props.block;
        this.allocations = props.allocations;
        this.deletions = props.deletions;
        this.future_deletions = props.future_deletions;
        Object.seal(this);
    }

    to_frag_api() {
        return to_frag_api(this);
    }

    to_frag_db() {
        return to_frag_db(this);
    }

    /** @returns {string} */
    get frag_index() {
        if (this.data_index >= 0) return `D${this.data_index}`;
        if (this.parity_index >= 0) return `P${this.parity_index}`;
        if (this.lrc_index >= 0) return `L${this.lrc_index}`;
        throw new Error('BAD FRAG ' + util.inspect(this));
    }
}

class Block {

    /**
     * @param {Object} props 
     * @param {nb.ID} props._id
     * @param {Frag} props.frag
     * @param {Chunk} props.chunk
     * @param {nb.ID} props.node_id
     * @param {nb.Node} [props.node]
     * @param {nb.Pool} props.pool
     * @param {number} props.size
     * @param {boolean} [props.accessible]
     * @param {boolean} [props.preallocated]
     */
    constructor(props) {
        this._id = props._id;
        this.frag = props.frag;
        this.chunk = props.chunk;
        this.node_id = props.node_id;
        this.node = props.node;
        this.pool = props.pool;
        this.size = props.size;
        this.accessible = props.accessible;
        this.preallocated = props.preallocated;
        Object.seal(this);
    }

    to_block_api() {
        return to_block_api(this);
    }

    to_block_md_api() {
        return to_block_md_api(this);
    }

    to_block_db() {
        return to_block_db(this);
    }
}

class FragAllocation {

    /**
     * @param {Object} props
     * @param {Block} props.block
     * @param {nb.ID} props.mirror_group TierMirror._id
     */
    constructor(props) {
        this.block = props.block;
        this.mirror_group = props.mirror_group;
    }
}

class FragDeletion {

    /**
     * @param {Object} props
     * @param {nb.ID} props.block_id
     * @param {Block} props.block
     */
    constructor(props) {
        this.block_id = props.block_id;
        this.block = props.block;
    }
}


//////////////////
//              //
//   FROM API   //
//              //
//////////////////


/**
 * @returns {Chunk}
 */
function from_chunk_api(chunk_api) {
    const chunk = new Chunk({
        _id: make_md_id(chunk_api._id),
        bucket: system_store.data.get_by_id(chunk_api.bucket),
        tier: system_store.data.get_by_id(chunk_api.tier),
        chunk_coder_config: chunk_api.chunk_coder_config,
        size: chunk_api.size,
        compress_size: chunk_api.compress_size,
        frag_size: chunk_api.frag_size,
        digest_b64: chunk_api.digest_b64,
        cipher_key_b64: chunk_api.cipher_key_b64,
        cipher_iv_b64: chunk_api.cipher_iv_b64,
        cipher_auth_tag_b64: chunk_api.cipher_auth_tag_b64,
        missing_frags: chunk_api.missing_frags,
    });
    chunk.frags = chunk_api.frags.map(frag_api => from_frag_api(frag_api, chunk));
    return chunk;
}

/**
 * @param {Object} frag_api
 * @param {Chunk} chunk
 * @returns {Frag}
 */
function from_frag_api(frag_api, chunk) {
    const frag = new Frag({
        _id: make_md_id(frag_api._id),
        chunk,
        data_index: frag_api.data_index,
        parity_index: frag_api.parity_index,
        lrc_index: frag_api.lrc_index,
        digest_b64: frag_api.digest_b64,
    });
    let blocks_by_id;
    if (frag_api.blocks) {
        frag.blocks = frag_api.blocks.map(block_api => from_block_api(block_api, frag));
        blocks_by_id = _.keyBy(frag.blocks, '_id');
    } else {
        blocks_by_id = {};
    }
    if (frag_api.allocations) {
        frag.allocations = frag_api.allocations.map(({ block, mirror_group }) => new FragAllocation({
            block: from_block_api(block, frag),
            mirror_group,
        }));
    }
    if (frag_api.deletions) {
        frag.deletions = frag_api.deletions.map(
            ({ block_id }) => new FragDeletion({ block_id, block: blocks_by_id[block_id] })
        );
    }
    if (frag_api.future_deletions) {
        frag.future_deletions = frag_api.future_deletions.map(
            ({ block_id }) => new FragDeletion({ block_id, block: blocks_by_id[block_id] })
        );
    }
    return frag;
}

/**
 * @param {Object} block_api
 * @param {Frag} frag
 * @returns {Block}
 */
function from_block_api(block_api, frag) {
    const block = new Block({
        _id: make_md_id(block_api.block_md.id),
        frag,
        chunk: frag.chunk,
        node_id: make_md_id(block_api.node),
        pool: system_store.data.get_by_id(block_api.block_md.pool),
        size: block_api.size,
        accessible: block_api.accessible,
        preallocated: undefined,
    });
    return block;
}


//////////////////
//              //
//    TO API    //
//              //
//////////////////


/**
 * @param {Chunk} chunk
 * @returns {Object}
 */
function to_chunk_api(chunk) {
    const chunk_api = {
        _id: make_md_id(chunk._id),
        bucket: system_store.data.get_by_id(chunk.bucket),
        tier: system_store.data.get_by_id(chunk.tier),
        chunk_coder_config: chunk.chunk_coder_config,
        frags: chunk.frags.map(frag => to_frag_api(frag)),
        size: chunk.size,
        compress_size: chunk.compress_size,
        frag_size: chunk.frag_size,
        digest_b64: chunk.digest_b64,
        cipher_key_b64: chunk.cipher_key_b64,
        cipher_iv_b64: chunk.cipher_iv_b64,
        cipher_auth_tag_b64: chunk.cipher_auth_tag_b64,
        missing_frags: chunk.missing_frags,
    };
    return chunk_api;
}

/**
 * @param {Frag} frag
 * @returns {Object}
 */
function to_frag_api(frag) {
    const frag_api = {
        _id: make_md_id(frag._id),
        data_index: frag.data_index,
        parity_index: frag.parity_index,
        lrc_index: frag.lrc_index,
        digest_b64: frag.digest_b64,
        block: undefined,
        blocks: frag.blocks && frag.blocks.map(block => to_block_api(block)),
        allocations: frag.allocations && frag.allocations.map(
            ({ block, mirror_group }) => ({ block: to_block_api(block), mirror_group })
        ),
        deletions: frag.deletions && frag.deletions.map(
            ({ block_id }) => ({ block_id })
        ),
        future_deletions: frag.future_deletions && frag.future_deletions.map(
            ({ block_id }) => ({ block_id })
        ),
    };
    return frag_api;
}

/**
 * @param {Block} block
 * @returns {Object}
 */
function to_block_api(block) {
    const block_api = {
        block_md: to_block_md_api(block),
        accessible: block.accessible,
        // adminfo: {},
    };
    return block_api;
}

/**
 * @param {Block} block
 * @returns {Object}
 */
function to_block_md_api(block) {
    return {
        id: block._id,
        address: block.node.rpc_address,
        node: block.node_id,
        pool: block.pool._id,
        size: block.size,
        digest_type: block.frag.digest_b64,
        preallocated: block.preallocated,
    };
}


//////////////////
//              //
//   FROM DB    //
//              //
//////////////////


/**
 * @param {Object} chunk_db
 * @returns {Chunk}
 */
function from_chunk_db(chunk_db) {
    const chunk = new Chunk({
        _id: chunk_db._id,
        bucket: system_store.data.get_by_id(chunk_db.bucket),
        tier: system_store.data.get_by_id(chunk_db.tier),
        chunk_coder_config: chunk_db.chunk_coder_config,
        frags: chunk_db.frags.map(frag_db => from_frag_db(frag_db, chunk)),
        size: chunk_db.size,
        compress_size: chunk_db.compress_size,
        frag_size: chunk_db.frag_size,
        digest_b64: chunk_db.digest_b64,
        cipher_key_b64: chunk_db.cipher_key_b64,
        cipher_iv_b64: chunk_db.cipher_iv_b64,
        cipher_auth_tag_b64: chunk_db.cipher_auth_tag_b64,
    });
    chunk.frags = chunk_db.frags.map(frag_db => from_frag_db(frag_db, chunk));
    return chunk;
}

/**
 * @param {Object} frag_db
 * @param {Chunk} chunk
 * @returns {Frag}
 */
function from_frag_db(frag_db, chunk) {
    const frag = new Frag({
        _id: frag_db._id,
        chunk,
        data_index: frag_db.data_index,
        parity_index: frag_db.parity_index,
        lrc_index: frag_db.lrc_index,
        digest_b64: frag_db.digest_b64,
        block: undefined,
        blocks: undefined,
        allocations: frag_db.allocations,
        deletions: frag_db.deletions,
        future_deletions: frag_db.future_deletions,
    });
    frag.blocks = frag_db.blocks.map(block_db => from_block_db(block_db, frag));
    return frag;
}

/**
 * @param {Object} block_db
 * @param {Frag} frag
 * @returns {Block}
 */
function from_block_db(block_db, frag) {
    const block = new Block({
        _id: block_db._id,
        frag,
        chunk: frag.chunk,
        node_id: block_db.node,
        node: undefined,
        pool: system_store.data.get_by_id(block_db.pool),
        size: block_db.size,
        accessible: block_db.accessible,
        preallocated: undefined,
    });
    return block;
}


//////////////////
//              //
//    TO DB     //
//              //
//////////////////


/**
 * @param {Chunk} chunk
 * @returns {Object}
 */
function to_chunk_db(chunk) {
    const chunk_db = {
        _id: chunk._id,
        bucket: system_store.data.get_by_id(chunk.bucket),
        tier: system_store.data.get_by_id(chunk.tier),
        chunk_coder_config: chunk.chunk_coder_config,
        frags: chunk.frags.map(frag_db => from_frag_db(frag_db, chunk)),
        size: chunk.size,
        compress_size: chunk.compress_size,
        frag_size: chunk.frag_size,
        digest_b64: chunk.digest_b64,
        cipher_key_b64: chunk.cipher_key_b64,
        cipher_iv_b64: chunk.cipher_iv_b64,
        cipher_auth_tag_b64: chunk.cipher_auth_tag_b64,
    };
    chunk_db.frags = chunk.frags.map(frag => to_frag_db(frag));
    return chunk_db;
}

/**
 * @param {Frag} frag
 * @returns {Object}
 */
function to_frag_db(frag) {
    const frag_db = {
        _id: frag._id,
        data_index: frag.data_index,
        parity_index: frag.parity_index,
        lrc_index: frag.lrc_index,
        digest_b64: frag.digest_b64,
        block: undefined,
        blocks: undefined,
        allocations: frag.allocations,
        deletions: frag.deletions,
        future_deletions: frag.future_deletions,
    };
    frag_db.blocks = frag.blocks.map(block => to_block_db(block));
    return frag_db;
}

/**
 * @param {Block} block
 * @returns {Object}
 */
function to_block_db(block) {
    const block_db = {
        _id: block._id,
        frag: block.frag._id,
        chunk: block.frag.chunk._id,
        node: block.node_id,
        pool: system_store.data.get_by_id(block.pool),
        size: block.size,
        accessible: block.accessible,
        preallocated: undefined,
    };
    return block_db;
}


//////////////////
//              //
//   EXPORTS    //
//              //
//////////////////

// export static functions on classes

Chunk.from_chunk_api = from_chunk_api;
Chunk.from_chunk_db = from_chunk_db;
Chunk.to_chunk_api = to_chunk_api;
Chunk.to_chunk_db = to_chunk_db;

Frag.from_frag_api = from_frag_api;
Frag.from_frag_db = from_frag_db;
Frag.to_frag_api = to_frag_api;
Frag.to_frag_db = to_frag_db;

Block.from_block_api = from_block_api;
Block.from_block_db = from_block_db;
Block.to_block_api = to_block_api;
Block.to_block_md_api = to_block_md_api;
Block.to_block_db = to_block_db;

exports.Chunk = Chunk;
exports.Frag = Frag;
exports.Block = Block;


/*

const PART_ATTRS = [
    'start',
    'end',
    'seq',
    'multipart_id',
    'obj_id',
];

const CHUNK_ATTRS = [
    '_id',
    'tier',
    'bucket',
    'frags',
    'missing_frags',
    'dup_chunk',
    'parts',
    'chunk_coder_config',
    'size',
    'compress_size',
    'frag_size',
    'digest_b64',
    'cipher_key_b64',
    'cipher_iv_b64',
    'cipher_auth_tag_b64',
];

const FRAG_ATTRS = [
    'data_index',
    'parity_index',
    'lrc_index',
    'digest_b64',
    'allocations',
    'deletions',
    'future_deletions',
    'blocks',
];

function get_part_info(part, adminfo, tiering_status, location_info) {
    const chunk_info = get_chunk_info(part.chunk, adminfo, tiering_status, location_info);
    return {
        start: part.start,
        end: part.end,
        seq: part.seq,
        multipart_id: part.multipart,
        chunk_id: part.chunk._id,
        chunk: chunk_info,
        chunk_offset: part.chunk_offset, // currently undefined
    };
}

function get_chunk_info(chunk, adminfo, tiering_status, location_info) {
    const bucket = chunk.bucket;
    let mapping;
    let allocations_by_frag_id;
    let deletions_by_frag_id;
    let future_deletions_by_frag_id;
    if (tiering_status) {
        mapping = map_chunk(chunk, chunk.tier, bucket.tiering, tiering_status, location_info);
        allocations_by_frag_id = _.groupBy(mapping.allocations, allocation => String(allocation.frag._id));
        deletions_by_frag_id = _.groupBy(mapping.deletions, deletion => String(deletion.frag));
        future_deletions_by_frag_id = _.groupBy(mapping.future_deletions, deletion => String(deletion.frag));
    }
    const blocks_by_frag_id = _.groupBy(chunk.blocks, 'frag');
    if (adminfo) {
        if (!mapping.accessible) {
            adminfo = { health: 'unavailable' };
        } else if (mapping.allocations) {
            adminfo = { health: 'building' };
        } else {
            adminfo = { health: 'available' };
        }
    }
    return {
        _id: chunk._id,
        bucket: bucket._id,
        tier: chunk.tier._id,
        dup_chunk: chunk.dup_chunk,
        missing_frags: Boolean(mapping && mapping.missing_frags),
        chunk_coder_config: chunk.chunk_coder_config,
        size: chunk.size,
        frag_size: chunk.frag_size,
        compress_size: chunk.compress_size,
        digest_b64: chunk.digest && chunk.digest.toString('base64'),
        cipher_key_b64: chunk.cipher_key && chunk.cipher_key.toString('base64'),
        cipher_iv_b64: chunk.cipher_iv && chunk.cipher_iv.toString('base64'),
        cipher_auth_tag_b64: chunk.cipher_auth_tag && chunk.cipher_auth_tag.toString('base64'),
        frags: chunk.frags && _.map(chunk.frags, frag =>
            get_frag_info(chunk, frag, blocks_by_frag_id[frag._id], {
                    allocations: allocations_by_frag_id && allocations_by_frag_id[frag._id],
                    deletions: deletions_by_frag_id && deletions_by_frag_id[frag._id],
                    future_deletions: future_deletions_by_frag_id && future_deletions_by_frag_id[frag._id],
                },
                adminfo,
                location_info)
        ),
        adminfo: adminfo || undefined,
    };
}


function get_frag_info(chunk, frag, blocks, mapping, adminfo, location_info) {
    // sorting the blocks to have most available node on front
    // TODO GUY OPTIMIZE what about load balancing - maybe random the order of good blocks
    if (blocks) blocks.sort(location_info ? _block_sorter_local(location_info) : _block_sorter_basic);
    return {
        _id: frag._id,
        data_index: frag.data_index,
        parity_index: frag.parity_index,
        lrc_index: frag.lrc_index,
        digest_b64: frag.digest && frag.digest.toString('base64'),
        blocks: blocks && _.map(blocks, block => get_block_info(chunk, frag, block, adminfo)),
        deletions: mapping.deletions ? _.map(mapping.deletions, block => ({
            block_id: get_block_md(chunk, frag, block).id
        })) : [],
        future_deletions: mapping.future_deletions ? _.map(mapping.future_deletions, block => ({
            block_id: get_block_md(chunk, frag, block).id
        })) : [],
        allocations: mapping.allocations ? _.map(mapping.allocations, alloc => get_alloc_info(alloc)) : [],
    };
}


function get_block_info(chunk, frag, block, adminfo) {
    if (adminfo) {
        const node = block.node;
        const system = system_store.data.get_by_id(block.system);
        const pool = system.pools_by_name[node.pool];
        const bucket = chunk.bucket;

        // Setting mirror_group for the block:
        // We return mirror_group undefined to mark blocks that are no longer relevant to the tiering policy,
        // such as disabled tiers or pools that were removed completely from the tierig policy.
        let mirror_group;
        _.forEach(bucket.tiering.tiers, ({ tier, disabled }) => {
            if (disabled) return;
            _.forEach(tier.mirrors, mirror => {
                if (_.find(mirror.spread_pools, pool)) {
                    mirror_group = String(mirror._id);
                }
            });
        });

        adminfo = {
            pool_name: pool.name,
            mirror_group,
            node_name: node.os_info.hostname + '#' + node.host_seq,
            host_name: node.os_info.hostname,
            mount: node.drive.mount,
            node_ip: node.ip,
            in_cloud_pool: Boolean(node.is_cloud_node),
            in_mongo_pool: Boolean(node.is_mongo_node),
            online: Boolean(node.online),
        };
    }
    return {
        block_md: get_block_md(chunk, frag, block),
        accessible: _is_block_accessible(block),
        misplaced: _is_block_misplaced(block),
        adminfo: adminfo || undefined,
    };
}

function get_alloc_info(alloc) {
    return {
        mirror_group: alloc.mirror_group,
        block: alloc.block,
    };
}

function get_block_md(chunk, frag, block) {
    return {
        size: block.size,
        id: block._id,
        address: block.node.rpc_address,
        node: block.node._id,
        node_type: block.node.node_type,
        pool: block.pool,
        digest_type: chunk.chunk_coder_config.frag_digest_type,
        digest_b64: frag.digest_b64 || (frag.digest && frag.digest.toString('base64')),
    };
}

function pick_chunk_attrs(chunk) {
    const c = _.pick(chunk, CHUNK_ATTRS);
    c.frags = _.map(c.frags, frag => _.pick(frag, FRAG_ATTRS));
    c.parts = _.map(c.parts, part => _.pick(part, PART_ATTRS));
    return c;
}


exports.get_part_info = get_part_info;
exports.get_chunk_info = get_chunk_info;
exports.get_frag_info = get_frag_info;
exports.get_block_info = get_block_info;
exports.get_block_md = get_block_md;
exports.get_alloc_info = get_alloc_info;

*/
