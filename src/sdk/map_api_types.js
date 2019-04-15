/* Copyright (C) 2016 NooBaa */
'use strict';

/** @typedef {typeof import('./nb')} nb */
/** @typedef {import('../server/system_services/system_store').SystemStore} SystemStore */

const _ = require('lodash');
const util = require('util');

const { new_object_id, parse_object_id } = require('../util/mongo_utils');

/** @type {nb.ID} */
const undefined_id = undefined;

/**
 * @implements {nb.Chunk}
 */
class ChunkAPI {

    /** 
     * @param {ChunkAPI} chunk
     * @returns {nb.Chunk}
     */
    static implements_interface(chunk) { return chunk; }

    /**
     * @param {nb.ChunkInfo} chunk_info
     * @param {SystemStore} [system_store]
     */
    constructor(chunk_info, system_store) {
        this.chunk_info = chunk_info;
        this.system_store = system_store;
        this.had_errors = false;
        ChunkAPI.implements_interface(this);
    }

    get _id() { return parse_object_id(this.chunk_info._id); }
    get bucket_id() { return parse_object_id(this.chunk_info.bucket_id); }
    get tier_id() { return parse_object_id(this.chunk_info.tier_id); }
    get size() { return this.chunk_info.size; }
    get compress_size() { return this.chunk_info.compress_size; }
    get frag_size() { return this.chunk_info.frag_size; }
    get digest_b64() { return this.chunk_info.digest_b64; }
    get cipher_key_b64() { return this.chunk_info.cipher_key_b64; }
    get cipher_iv_b64() { return this.chunk_info.cipher_iv_b64; }
    get cipher_auth_tag_b64() { return this.chunk_info.cipher_auth_tag_b64; }
    get chunk_coder_config() { return this.chunk_info.chunk_coder_config; }

    set data(buf) { this.chunk_info.data = buf; }
    get data() { return this.chunk_info.data; }
    get dup_chunk_id() { return parse_object_id(this.chunk_info.dup_chunk); }

    get bucket() { return this.system_store.data.get_by_id(this.chunk_info.bucket_id); }
    get tier() { return this.system_store.data.get_by_id(this.chunk_info.tier_id); }
    get chunk_config() {
        return _.find(this.bucket.system.chunk_configs_by_id,
            c => _.isEqual(c.chunk_coder_config, this.chunk_coder_config));
    }

    get is_accessible() { return this.chunk_info.is_accessible; }
    get is_building_blocks() { return this.chunk_info.is_building_blocks; }
    get is_building_frags() { return this.chunk_info.is_building_frags; }
    set is_accessible(val) { this.chunk_info.is_accessible = val; }
    set is_building_blocks(val) { this.chunk_info.is_building_blocks = val; }
    set is_building_frags(val) { this.chunk_info.is_building_frags = val; }

    get frags() {
        if (!this.__frags) {
            this.__frags = this.chunk_info.frags.map(
                frag_info => new_frag_api(frag_info, this.system_store)
            );
        }
        return this.__frags;
    }
    get frag_by_index() {
        if (!this.__frag_by_index) this.__frag_by_index = _.keyBy(this.frags, 'frag_index');
        return this.__frag_by_index;
    }
    get parts() {
        if (!this.__parts) {
            this.__parts = this.chunk_info.parts.map(
                part_info => new_part_api(part_info, this.system_store)
            );
        }
        return this.__parts;
    }

    /**
     * @param {nb.Frag} frag
     * @param {nb.Pool[]} pools 
     */
    add_block_allocation(frag, pools) {
        const block = new_block_api({
            is_allocation: true,
            block_md: {
                id: new_object_id().toHexString(),
                size: this.frag_size,
            },
        }, this.system_store);
        block.allocation_pools = pools;
        frag.blocks.push(block);
        frag.is_building_blocks = true;
        this.chunk_info.is_building_blocks = true;
    }

    /**
     * @returns {nb.ChunkInfo}
     */
    to_api() {
        return {
            ...this.chunk_info,
            data: undefined,
            frags: this.frags.map(frag => frag.to_api()),
            parts: this.parts.map(part => part.to_api()),
        };
    }

    /**
     * @returns {nb.ChunkSchemaDB}
     */
    to_db() {
        return {
            _id: this._id,
            bucket: this.bucket_id,
            tier: this.tier_id,
            size: this.size,
            compress_size: this.compress_size,
            frag_size: this.frag_size,
            dedup_key: from_b64(this.chunk_info.digest_b64),
            digest: from_b64(this.chunk_info.digest_b64),
            cipher_key: from_b64(this.chunk_info.cipher_key_b64),
            cipher_iv: from_b64(this.chunk_info.cipher_iv_b64),
            cipher_auth_tag: from_b64(this.chunk_info.cipher_auth_tag_b64),
            chunk_config: this.chunk_config._id,
            system: this.bucket.system._id,
            tier_lru: new Date(),
            frags: this.frags.map(frag => frag.to_db()),
        };
    }

}

/**
 * @implements {nb.Frag}
 */
class FragAPI {

    /** 
     * @param {FragAPI} frag
     * @returns {nb.Frag}
     */
    static implements_interface(frag) { return frag; }

    /**
     * @param {nb.FragInfo} frag_info 
     * @param {SystemStore} [system_store]
     */
    constructor(frag_info, system_store) {
        this.frag_info = frag_info;
        this.system_store = system_store;
        this.is_accessible = false;
        this.is_building_blocks = false;
        FragAPI.implements_interface(this);
    }

    get _id() { return parse_object_id(this.frag_info._id); }
    get data_index() { return this.frag_info.data_index; }
    get parity_index() { return this.frag_info.parity_index; }
    get lrc_index() { return this.frag_info.lrc_index; }
    get digest_b64() { return this.frag_info.digest_b64; }

    set data(buf) { this.frag_info.data = buf; }
    get data() { return this.frag_info.data; }

    get frag_index() {
        if (this.frag_info.data_index >= 0) return `D${this.frag_info.data_index}`;
        if (this.frag_info.parity_index >= 0) return `P${this.frag_info.parity_index}`;
        if (this.frag_info.lrc_index >= 0) return `L${this.frag_info.lrc_index}`;
        throw new Error('BAD FRAG ' + util.inspect(this));
    }

    get blocks() {
        if (!this.__blocks) {
            this.__blocks = this.frag_info.blocks.map(
                block_info => new_block_api(block_info, this.system_store)
            );
        }
        return this.__blocks;
    }

    /**
     * @returns {nb.FragInfo}
     */
    to_api() {
        return {
            ...this.frag_info,
            blocks: this.blocks.map(block => block.to_api()),
        };
    }

    /**
     * @returns {nb.FragSchemaDB}
     */
    to_db() {
        return {
            _id: this._id,
            data_index: this.data_index,
            parity_index: this.parity_index,
            lrc_index: this.lrc_index,
            digest: from_b64(this.frag_info.digest_b64),
        };
    }
}

/**
 * @implements {nb.Block}
 */
class BlockAPI {

    /** 
     * @param {BlockAPI} block
     * @returns {nb.Block}
     */
    static implements_interface(block) { return block; }

    /**
     * @param {nb.BlockInfo} block_info
     * @param {SystemStore} [system_store]
     */
    constructor(block_info, system_store) {
        this.block_info = block_info;
        this.block_md = block_info.block_md;
        /** @type {nb.NodeAPI} */
        this.node = undefined;
        this.system_store = system_store;
        /** @type {nb.Pool[]} */
        this.allocation_pools = undefined;
        BlockAPI.implements_interface(this);
    }

    get _id() { return parse_object_id(this.block_md.id); }
    get node_id() { return parse_object_id(this.block_md.node); }
    get pool_id() { return parse_object_id(this.block_md.pool); }
    get chunk_id() { return undefined_id; }
    get frag_id() { return undefined_id; }
    get bucket_id() { return undefined_id; }
    get size() { return this.block_md.size; }
    get address() { return this.block_md.address; }

    /** @returns {nb.Pool} */
    get pool() { return this.system_store.data.get_by_id(this.pool_id); }
    /** @returns {nb.Bucket} */
    get bucket() { return this.system_store.data.get_by_id(this.bucket_id); }
    /** @returns {nb.System} */
    get system() { return this.pool.system; }

    // get frag() { return undefined_frag; }
    // get chunk() { return undefined_chunk; }

    get is_preallocated() { return Boolean(this.block_md.is_preallocated); }
    set is_preallocated(val) { this.block_md.is_preallocated = Boolean(val); }
    get is_accessible() { return Boolean(this.block_info.is_accessible); }
    set is_accessible(val) { this.block_info.is_accessible = Boolean(val); }
    get is_allocation() { return Boolean(this.block_info.is_allocation); }
    set is_allocation(val) { this.block_info.is_allocation = Boolean(val); }
    get is_deletion() { return Boolean(this.block_info.is_deletion); }
    set is_deletion(val) { this.block_info.is_deletion = Boolean(val); }
    get is_future_deletion() { return Boolean(this.block_info.is_future_deletion); }
    set is_future_deletion(val) { this.block_info.is_future_deletion = Boolean(val); }

    // get is_misplaced() { return false; }
    // get is_missing() { return false; }
    // get is_tampered() { return false; }
    // get is_local_mirror() { return false; }


    to_block_md() {
        return this.block_md;
    }

    /** @returns {nb.BlockInfo} */
    to_api() {
        return this.block_info;
    }

    /** @returns {nb.BlockSchemaDB} */
    to_db() {
        return {
            _id: this._id,
            bucket: this.bucket_id,
            chunk: this.chunk_id,
            frag: this.frag_id,
            node: this.node_id,
            pool: this.pool_id,
            size: this.size,
            system: this.pool.system._id,
        };
    }
}

/**
 * @implements {nb.Part}
 */
class PartAPI {

    /** 
     * @param {PartAPI} part
     * @returns {nb.Part}
     */
    static implements_interface(part) { return part; }

    /**
     * @param {nb.PartInfo} part_info
     * @param {SystemStore} [system_store]
     */
    constructor(part_info, system_store) {
        this.part_info = part_info;
        this.system_store = system_store;
        PartAPI.implements_interface(this);
    }

    get _id() { return undefined; } // { return parse_object_id(this.part_info._id); }
    get obj_id() { return parse_object_id(this.part_info.obj_id); }
    get chunk_id() { return parse_object_id(this.part_info.chunk_id); }
    get multipart_id() { return parse_object_id(this.part_info.multipart_id); }

    get start() { return this.part_info.start; }
    get end() { return this.part_info.end; }
    get seq() { return this.part_info.seq; }

    /** @returns {nb.PartInfo} */
    to_api() {
        return this.part_info;
    }

    /** @returns {nb.PartSchemaDB} */
    to_db() {
        return {
            _id: this._id,
            chunk: this.chunk_id,
            obj: this.obj_id,
            multipart: this.multipart_id,

            system: undefined_id,
            bucket: undefined_id,

            seq: this.seq,
            start: this.start,
            end: this.end,

            uncommitted: true,
        };
    }
}

/**
 * @param {nb.FragInfo} frag_info 
 * @param {SystemStore} [system_store]
 */
function new_frag_api(frag_info, system_store) {
    return new FragAPI(frag_info, system_store);
}

/**
 * @param {nb.BlockInfo} block_info 
 * @param {SystemStore} [system_store]
 */
function new_block_api(block_info, system_store) {
    return new BlockAPI(block_info, system_store);
}

/**
 * @param {nb.PartInfo} part_info 
 * @param {SystemStore} [system_store]
 */
function new_part_api(part_info, system_store) {
    return new PartAPI(part_info, system_store);
}

/**
 * @param {string} [optional_string]
 * @returns {nb.DBBuffer | undefined}
 */
function from_b64(optional_string) {
    if (optional_string) return Buffer.from(optional_string, 'base64');
}


exports.ChunkAPI = ChunkAPI;
exports.FragAPI = FragAPI;
exports.BlockAPI = BlockAPI;
