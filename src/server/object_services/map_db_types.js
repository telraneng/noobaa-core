/* Copyright (C) 2016 NooBaa */
'use strict';

/// <reference path="../nb.d.ts" />

const _ = require('lodash');
const util = require('util');

const system_store = require('../system_services/system_store').get_instance();
const { make_object_id } = require('../../util/mongo_utils');


/** @type {nb.ID} */
const undefined_id = undefined;
/** @type {Buffer} */
const undefined_buffer = undefined;

/**
 * @implements {nb.Chunk}
 */
class ChunkDB {

    /** 
     * @param {ChunkDB} chunk
     * @returns {nb.Chunk}
     */
    static implements_interface(chunk) { return chunk; }

    /**
     * @param {nb.ChunkSchemaDB} chunk_db
     */
    constructor(chunk_db) {
        this.chunk_db = chunk_db;
        this.data = undefined_buffer;
        this.had_errors = false;
        this.dup_chunk_id = undefined_id;
        this.is_accessible = false;
        this.is_building_blocks = false;
        this.is_building_frags = false;
        ChunkDB.implements_interface(this);
    }

    get _id() { return this.chunk_db._id; }
    get bucket_id() { return this.chunk_db.bucket; }
    get tier_id() { return this.chunk_db.tier; }
    get size() { return this.chunk_db.size; }
    get compress_size() { return this.chunk_db.compress_size; }
    get frag_size() { return this.chunk_db.frag_size; }
    get digest_b64() { return to_b64(this.chunk_db.digest); }
    get cipher_key_b64() { return to_b64(this.chunk_db.cipher_key); }
    get cipher_iv_b64() { return to_b64(this.chunk_db.cipher_iv); }
    get cipher_auth_tag_b64() { return to_b64(this.chunk_db.cipher_auth_tag); }
    get chunk_coder_config() { return this.chunk_config.chunk_coder_config; }
    get frags() {
        if (!this.__frags) this.__frags = this.chunk_db.frags.map(new_frag_db);
        return this.__frags;
    }
    get frag_by_index() {
        if (!this.__frag_by_index) this.__frag_by_index = _.keyBy(this.frags, 'frag_index');
        return this.__frag_by_index;
    }

    /** @returns {nb.Bucket} */
    get bucket() { return system_store.data.get_by_id(this.chunk_db.bucket); }
    /** @returns {nb.Tier} */
    get tier() { return system_store.data.get_by_id(this.chunk_db.tier); }
    /** @returns {nb.ChunkConfig} */
    get chunk_config() { return system_store.data.get_by_id(this.chunk_db.chunk_config); }

    // get parts() { return /** @type {nb.Part[]} */ (undefined); }
    // get objects() { return /** @type {nb.ObjectMD[]} */ (undefined); }

    /**
     * @param {nb.Frag} frag 
     * @param {nb.Pool[]} pools 
     */
    add_block_allocation(frag, pools) {
        const block = new_block_db({
            _id: make_object_id(),
            system: this.bucket.system._id,
            bucket: this.bucket_id,
            chunk: this._id,
            frag: frag._id,
            size: this.frag_size,
            node: undefined,
            pool: undefined,
        });
        block.allocation_pools = pools;
        frag.blocks.push(block);
        frag.is_building_blocks = true;
        this.is_building_blocks = true;
    }

    /**
     * @returns {nb.ChunkInfo}
     */
    to_api() {
        return {
            _id: this._id.toHexString(),
            bucket_id: this.bucket_id.toHexString(),
            tier_id: this.tier_id.toHexString(),
            size: this.size,
            compress_size: this.compress_size,
            frag_size: this.frag_size,
            digest_b64: this.digest_b64,
            cipher_key_b64: this.cipher_key_b64,
            cipher_iv_b64: this.cipher_iv_b64,
            cipher_auth_tag_b64: this.cipher_auth_tag_b64,
            chunk_coder_config: this.chunk_coder_config,
            dup_chunk: this.dup_chunk_id.toHexString(),
            is_accessible: this.is_accessible,
            is_building_blocks: this.is_building_blocks,
            is_building_frags: this.is_building_frags,
            frags: this.frags.map(frag => frag.to_api()),
        };
    }

    /**
     * @returns {nb.ChunkSchemaDB}
     */
    to_db() {
        return this.chunk_db;
    }

}

/**
 * @implements {nb.Frag}
 */
class FragDB {

    /** 
     * @param {FragDB} frag
     * @returns {nb.Frag}
     */
    static implements_interface(frag) { return frag; }

    /**
     * @param {nb.FragSchemaDB} frag_db 
     */
    constructor(frag_db) {
        this.frag_db = frag_db;
        this.data = undefined_buffer;
        this.is_accessible = false;
        this.is_building_blocks = false;
        FragDB.implements_interface(this);
    }

    get _id() { return this.frag_db._id; }
    get data_index() { return this.frag_db.data_index; }
    get parity_index() { return this.frag_db.parity_index; }
    get lrc_index() { return this.frag_db.lrc_index; }
    get digest_b64() { return to_b64(this.frag_db.digest); }
    get frag_index() {
        if (this.frag_db.data_index >= 0) return `D${this.frag_db.data_index}`;
        if (this.frag_db.parity_index >= 0) return `P${this.frag_db.parity_index}`;
        if (this.frag_db.lrc_index >= 0) return `L${this.frag_db.lrc_index}`;
        throw new Error('BAD FRAG ' + util.inspect(this));
    }
    get blocks() {
        if (!this.__blocks) this.__blocks = this.frag_db.blocks.map(new_block_db);
        return this.__blocks;
    }

    /**
     * @returns {nb.FragInfo}
     */
    to_api() {
        return {
            _id: this._id.toHexString(),
            data_index: this.data_index,
            parity_index: this.parity_index,
            lrc_index: this.lrc_index,
            digest_b64: this.digest_b64,
            blocks: this.blocks.map(block => block.to_api())
        };
    }

    /**
     * @returns {nb.FragSchemaDB}
     */
    to_db() {
        return this.frag_db;
    }
}

/**
 * @implements {nb.Block}
 */
class BlockDB {

    /** 
     * @param {BlockDB} block
     * @returns {nb.Block}
     */
    static implements_interface(block) { return block; }

    /**
     * @param {nb.BlockSchemaDB} block_db
     */
    constructor(block_db) {
        this.block_db = block_db;
        this.is_accessible = false;
        this.is_preallocated = false;
        this.is_allocation = false;
        this.is_deletion = false;
        this.is_future_deletion = false;
        /** @type {nb.Pool[]} */
        this.allocation_pools = undefined;
        // this.is_misplaced = false;
        // this.is_missing = false;
        // this.is_tampered = false;
        // this.is_local_mirror = false;
        /** @type {nb.NodeAPI} */
        this.node = undefined;
        BlockDB.implements_interface(this);
    }

    get _id() { return this.block_db._id; }
    get node_id() { return this.block_db.node; }
    get pool_id() { return this.block_db.pool; }
    get chunk_id() { return this.block_db.chunk; }
    get frag_id() { return this.block_db.frag; }
    get bucket_id() { return this.block_db.bucket; }
    get size() { return this.block_db.size; }
    get address() { return this.node.rpc_address; }

    /** @returns {nb.Pool} */
    get pool() { return system_store.data.get_by_id(this.pool_id); }
    /** @returns {nb.Bucket} */
    get bucket() { return system_store.data.get_by_id(this.bucket_id); }
    /** @returns {nb.System} */
    get system() { return this.pool.system; }

    // get frag() { return undefined_frag; }
    // get chunk() { return undefined_chunk; }

    /** @returns {nb.BlockMD} */
    to_block_md() {
        return {
            id: this.block_db._id.toHexString(),
            address: this.address,
            node: this.block_db.node.toHexString(),
            pool: this.block_db.pool.toHexString(),
            size: this.block_db.size,
            digest_type: string,
            digest_b64: string,
            node_type: this.node.node_type,
            is_preallocated: this.is_preallocated,
        };
    }

    /** 
     * @param {boolean} [adminfo]
     * @returns {nb.BlockInfo}
     */
    to_api(adminfo) {
        let adminfo_data;
        if (adminfo) {
            let mirror_group;
            for (const { tier, disabled } of this.bucket.tiering.tiers) {
                if (disabled) continue;
                for (const mirror of tier.mirrors) {
                    if (mirror.spread_pools.find(pool => pool._id.toHexString() === this.pool_id.toHexString())) {
                        mirror_group = mirror._id.toHexString();
                    }
                }
            }
            adminfo_data = {
                node_name: this.node.name,
                host_name: this.node.os_info.hostname,
                mount: this.node.drive.mount,
                pool_name: this.pool.name,
                node_ip: this.node.ip,
                online: Boolean(this.node.online),
                in_cloud_pool: Boolean(this.node.is_cloud_node),
                in_mongo_pool: Boolean(this.node.is_mongo_node),
                mirror_group,
            };
        }
        return {
            block_md: this.to_block_md(),
            is_accessible: this.is_accessible,
            is_allocation: this.is_allocation,
            is_deletion: this.is_deletion,
            is_future_deletion: this.is_future_deletion,
            adminfo: adminfo_data,
        };
    }

    /** @returns {nb.BlockSchemaDB} */
    to_db() {
        return this.block_db;
    }
}

/**
 * @param {nb.FragSchemaDB} frag_db 
 */
function new_frag_db(frag_db) {
    return new FragDB(frag_db);
}

/**
 * @param {nb.BlockSchemaDB} block_db 
 */
function new_block_db(block_db) {
    return new BlockDB(block_db);
}

/**
 * @param {nb.DBBuffer} [optional_buffer]
 * @returns {string | undefined}
 */
function to_b64(optional_buffer) {
    if (optional_buffer) return optional_buffer.toString('base64');
}

exports.ChunkDB = ChunkDB;
exports.FragDB = FragDB;
exports.BlockDB = BlockDB;
