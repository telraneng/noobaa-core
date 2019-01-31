/* Copyright (C) 2016 NooBaa */
'use strict';

/// <reference path="../api/nb.d.ts" />

const _ = require('lodash');
const util = require('util');

const P = require('../util/promise');
const dbg = require('../util/debug_module')(__filename);
const config = require('../../config');
const nb_native = require('../util/nb_native');
const block_store_client = require('../agent/block_store_services/block_store_client').instance();
const { RpcError, RPC_BUFFERS } = require('../rpc');

// dbg.set_level(5, 'core');

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

class MapClient {

    /**
     * @param {Object} args
     * @param {nb.ChunkInfo[]} args.chunks
     * @param {nb.LocationInfo} [args.location_info]
     * @param {nb.Tier} [args.move_to_tier]
     * @param {boolean} [args.check_dups]
     * @param {Object} args.rpc_client
     * @param {string} [args.desc]
     * @param {function} args.read_frags
     * @param {function} args.report_error
     * @param {nb.Semaphore} args.block_write_sem_global
     * @param {nb.Semaphore} args.block_replicate_sem_global
     * @param {nb.Semaphore} args.block_read_sem_global
     * @param {nb.KeysSemaphore} args.block_write_sem_agent
     * @param {nb.KeysSemaphore} args.block_replicate_sem_agent
     * @param {nb.KeysSemaphore} args.block_read_sem_agent
     */
    constructor({
        chunks,
        location_info,
        move_to_tier,
        check_dups,
        rpc_client,
        desc,
        read_frags,
        report_error,
        block_write_sem_global,
        block_replicate_sem_global,
        block_read_sem_global,
        block_write_sem_agent,
        block_replicate_sem_agent,
        block_read_sem_agent,
    }) {
        this.chunks = chunks;
        this.location_info = location_info;
        this.move_to_tier = move_to_tier;
        this.check_dups = Boolean(check_dups);
        this.rpc_client = rpc_client;
        this.desc = desc;
        this.read_frags = read_frags;
        this.report_error = report_error;
        this.block_write_sem_global = block_write_sem_global;
        this.block_replicate_sem_global = block_replicate_sem_global;
        this.block_read_sem_global = block_read_sem_global;
        this.block_write_sem_agent = block_write_sem_agent;
        this.block_replicate_sem_agent = block_replicate_sem_agent;
        this.block_read_sem_agent = block_read_sem_agent;
        this.had_errors = false;
    }

    async run() {
        await this.get_mapping();
        await this.process_mapping();
        await this.put_mapping();
    }

    /**
     * object_server.put_mapping will handle:
     * - allocations
     * - make_room_in_tier
     */
    async get_mapping() {

        const { chunks } = await this.rpc_client.object.get_mapping({
            chunks: this.chunks.map(pick_chunk_attrs),
            location_info: this.location_info,
            move_to_tier: this.move_to_tier,
            check_dups: this.check_dups,
        });

        /** @type {nb.ChunkInfo[]} */
        this.chunks_mapping = chunks;
        for (let i = 0; i < this.chunks.length; ++i) {
            this.chunks[i][util.inspect.custom] = custom_inspect_chunk;
            this.chunks_mapping[i][util.inspect.custom] = custom_inspect_chunk;
            set_blocks_to_maps(this.chunks[i], this.chunks_mapping[i]);
            dbg.log0('JAJA chunk before get_mapping', this.chunks[i]);
            dbg.log0('JAJA chunk after get_mapping', this.chunks_mapping[i]);
        }
    }

    /**
     * object_server.put_mapping will handle:
     * - deletions
     * - update_db
     */
    async put_mapping() {
        // TODO should we filter out chunk.had_errors from put mapping?
        await this.rpc_client.object.put_mapping({
            chunks: this.chunks_mapping.map(pick_chunk_attrs),
            move_to_tier: this.move_to_tier,
        });
    }

    async process_mapping() {
        const chunks = this.chunks_mapping;
        this.chunks_mapping = await P.map(chunks, async chunk => {
            try {
                const chunk_mapping = await this.process_chunk(chunk);
                return chunk_mapping;
            } catch (err) {
                chunk.had_errors = true;
                this.had_errors = true;
                dbg.warn('MapClient.process_mapping: chunk ERROR',
                    err.stack || err, 'chunk', chunk,
                    err.chunks ? 'err.chunks ' + inspect(err.chunks) : '',
                );
                return chunk;
            }
        });
    }

    /**
     * @param {nb.ChunkInfo} chunk 
     * @returns {Promise<nb.ChunkInfo>}
     */
    async process_chunk(chunk) {
        dbg.log0('MapClient.process_chunk: allocations needed for chunk', chunk);

        if (chunk.dup_chunk) return chunk;

        if (chunk.missing_frags) {
            await this.read_entire_chunk(chunk);
        }

        const call_process_frag = frag => this.process_frag(chunk, frag);
        const start_time = Date.now();
        let done = false;
        while (!done) {
            try {
                await P.map(chunk.frags, call_process_frag);
                done = true;
            } catch (err) {
                if (chunk.had_errors) throw err;
                if (Date.now() - start_time > config.IO_WRITE_PART_ATTEMPTS_EXHAUSTED) {
                    dbg.error('UPLOAD:', 'write part attempts exhausted', err);
                    throw err;
                }
                dbg.warn('UPLOAD:', 'write part reallocate on ERROR', err);
                const res = await this.rpc_client.object.get_mapping({
                    chunks: [pick_chunk_attrs(chunk)],
                    location_info: this.location_info,
                    move_to_tier: this.move_to_tier,
                    check_dups: this.check_dups,
                });
                chunk = res.chunks[0];
                chunk[util.inspect.custom] = custom_inspect_chunk;
                if (chunk.dup_chunk) return chunk;
            }
        }
        return chunk;
    }

    /**
     * @param {nb.ChunkInfo} chunk 
     */
    async read_entire_chunk(chunk) {
        const part = { ...chunk.parts[0], desc: { chunk: chunk._id } };

        dbg.log0('MapClient.read_entire_chunk: chunk before reading', chunk);
        await this.read_frags(part, chunk.frags);

        dbg.log0('MapClient.read_entire_chunk: chunk before encoding', chunk);
        chunk.coder = 'enc';
        await P.fromCallback(cb => nb_native().chunk_coder(chunk, cb));
        dbg.log0('MapClient.read_entire_chunk: final chunk', chunk);
    }

    /**
     * @param {nb.ChunkInfo} chunk 
     * @param {nb.FragInfo} frag 
     */
    async process_frag(chunk, frag) {
        if (!frag.allocations) return;
        const accessible_blocks = frag.blocks && frag.blocks.filter(block_info => block_info.accessible);
        if (frag.block) { // upload case / fragment rebuild case (read_entire_chunk)
            const first_alloc = frag.allocations[0];
            const rest_allocs = frag.allocations.slice(1);
            await this.retry_write_block(first_alloc.block, frag.block);
            await P.map(rest_allocs, target_alloc => this.retry_replicate_blocks(first_alloc.block, target_alloc.block));
        } else if (accessible_blocks && accessible_blocks.length) {
            let next_source = Math.floor(Math.random() * accessible_blocks.length);
            dbg.log0('JAJA replicate block', accessible_blocks, next_source);
            await P.map(frag.allocations, async alloc => {
                const source_block = accessible_blocks[next_source];
                next_source = (next_source + 1) % accessible_blocks.length;
                return this.retry_replicate_blocks(source_block, alloc.block);
            });
        } else {
            // we already know that this chunk cannot be read here
            // because we already handled missing_frags 
            // and now we still have a frag without data source.
            // so we mark the chunk.had_errors to break from the process_frag loop.
            chunk.had_errors = true;
            this.had_errors = true;
            throw new Error(`No data source for frag ${frag._id}`);
        }
    }

    /**
     * retry the write operation
     * once retry exhaust we report and throw an error
     */
    async retry_write_block(block, buffer) {
        const block_md = block.block_md;
        let done = false;
        let retries = 0;
        while (!done) {
            try {
                await this.write_block(block_md, buffer);
                done = true;
            } catch (err) {
                await this.report_error(block_md, 'write', err);
                if (err.rpc_code === 'NO_BLOCK_STORE_SPACE') throw err;
                retries += 1;
                if (retries > config.IO_WRITE_BLOCK_RETRIES) throw err;
                await P.delay(config.IO_WRITE_RETRY_DELAY_MS);
            }
        }
    }

    /**
     * retry the replicate operations
     * once any retry exhaust we report and throw an error
     * @param {nb.BlockInfo} source_block
     * @param {nb.BlockInfo} target_block
     */
    async retry_replicate_blocks(source_block, target_block) {
        let done = false;
        let retries = 0;
        while (!done) {
            try {
                await this.replicate_block(source_block.block_md, target_block.block_md);
                done = true;
            } catch (err) {
                await this.report_error(target_block.block_md, 'replicate', err);
                if (err.rpc_code === 'NO_BLOCK_STORE_SPACE') throw err;
                retries += 1;
                if (retries > config.IO_REPLICATE_BLOCK_RETRIES) throw err;
                await P.delay(config.IO_REPLICATE_RETRY_DELAY_MS);
            }
        }
    }

    /**
     * write a block to the storage node
     */
    async write_block(block_md, buffer) {
        // limit writes per agent + global IO semaphore to limit concurrency
        await this.block_write_sem_agent.surround_key(String(block_md.node), async () =>
            this.block_write_sem_global.surround(async () => {
                dbg.log1('UPLOAD:', this.desc, 'write block', block_md.id, block_md.address, buffer.length);

                this._error_injection_on_write();

                return block_store_client.write_block(this.rpc_client, {
                    [RPC_BUFFERS]: { data: buffer },
                    block_md,
                }, {
                    address: block_md.address,
                    timeout: config.IO_WRITE_BLOCK_TIMEOUT,
                });
            }));
    }

    async replicate_block(source_md, target_md) {
        // limit replicates per agent + Global IO semaphore to limit concurrency
        await this.block_replicate_sem_agent.surround_key(String(target_md.node), async () =>
            this.block_replicate_sem_global.surround(async () => {
                dbg.log1('UPLOAD:', this.desc,
                    'replicate block', source_md.id, source_md.address,
                    'to', target_md.id, target_md.address);

                this._error_injection_on_write();

                return this.rpc_client.block_store.replicate_block({
                    target: target_md,
                    source: source_md,
                }, {
                    address: target_md.address,
                    timeout: config.IO_REPLICATE_BLOCK_TIMEOUT,
                });
            }));
    }

    _error_injection_on_write() {
        if (config.ERROR_INJECTON_ON_WRITE &&
            config.ERROR_INJECTON_ON_WRITE > Math.random()) {
            throw new RpcError('ERROR_INJECTON_ON_WRITE');
        }
    }

}

function pick_chunk_attrs(chunk) {
    const c = _.pick(chunk, CHUNK_ATTRS);
    c.frags = _.map(c.frags, frag => _.pick(frag, FRAG_ATTRS));
    c.parts = _.map(c.parts, part => _.pick(part, PART_ATTRS));
    return c;
}

function set_blocks_to_maps(chunk, chunk_mapping) {
    for (const frag of chunk_mapping.frags) {
        const frag_with_data = _.find(
            chunk.frags,
            _.matches(_.pick(frag, 'data_index', 'parity_index', 'lrc_index'))
        );
        frag.block = frag_with_data.block;
    }
}

function inspect(obj) {
    return util.inspect(obj, { depth: null, breakLength: Infinity, colors: true });
}

/**
 * avoid printing rpc_client to logs, it's ugly
 * also avoid infinite recursion and omit inspect function
 * @this {nb.ChunkInfo}
 */
function custom_inspect_chunk() {
    return inspect(_.omit(this, 'rpc_client', 'parts', util.inspect.custom));
}


exports.MapClient = MapClient;
exports.pick_chunk_attrs = pick_chunk_attrs;
