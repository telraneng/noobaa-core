/* Copyright (C) 2016 NooBaa */
'use strict';

/// <reference path="./nb.d.ts" />

// const _ = require('lodash');
const util = require('util');

const P = require('../util/promise');
const dbg = require('../util/debug_module')(__filename);
const config = require('../../config');
const nb_native = require('../util/nb_native');
const block_store_client = require('../agent/block_store_services/block_store_client').instance();
const { Chunk, Frag, Block } = require('./map_types');
Object.freeze({ Chunk, Frag, Block });

// const system_store = require('../server/system_services/system_store').get_instance();
// const { make_md_id } = require('../server/object_services/md_store');
const { RpcError, RPC_BUFFERS } = require('../rpc');
// dbg.set_level(5, 'core');

class MapClient {

    /**
     * @param {Object} props
     * @param {Chunk[]} props.chunks
     * @param {nb.LocationInfo} [props.location_info]
     * @param {nb.Tier} [props.move_to_tier]
     * @param {boolean} [props.check_dups]
     * @param {Object} props.rpc_client
     * @param {string} [props.desc]
     * @param {function} props.read_frags
     * @param {function} props.report_error
     * @param {nb.Semaphore} props.block_write_sem_global
     * @param {nb.Semaphore} props.block_replicate_sem_global
     * @param {nb.Semaphore} props.block_read_sem_global
     * @param {nb.KeysSemaphore} props.block_write_sem_agent
     * @param {nb.KeysSemaphore} props.block_replicate_sem_agent
     * @param {nb.KeysSemaphore} props.block_read_sem_agent
     */
    constructor(props) {
        this.chunks = props.chunks;
        this.location_info = props.location_info;
        this.move_to_tier = props.move_to_tier;
        this.check_dups = Boolean(props.check_dups);
        this.rpc_client = props.rpc_client;
        this.desc = props.desc;
        this.read_frags = props.read_frags;
        this.report_error = props.report_error;
        this.block_write_sem_global = props.block_write_sem_global;
        this.block_replicate_sem_global = props.block_replicate_sem_global;
        this.block_read_sem_global = props.block_read_sem_global;
        this.block_write_sem_agent = props.block_write_sem_agent;
        this.block_replicate_sem_agent = props.block_replicate_sem_agent;
        this.block_read_sem_agent = props.block_read_sem_agent;
        this.had_errors = false;
        Object.seal(this);
    }

    async run() {
        this.chunks = await this.get_mapping();
        await this.process_mapping();
        await this.put_mapping();
    }

    /**
     * object_server.put_mapping will handle:
     * - allocations
     * - make_room_in_tier
     * @param {Chunk[]} chunks
     * @returns {Promise<Chunk[]>}
     */
    async get_mapping(chunks = this.chunks) {

        /** @type {{ chunks: Object[] }} */
        const res = await this.rpc_client.object.get_mapping({
            chunks: chunks.map(Chunk.to_chunk_api),
            location_info: this.location_info,
            move_to_tier: this.move_to_tier._id,
            check_dups: this.check_dups,
        });
        const res_chunks = res.chunks.map((chunk_api, i) => {
            const input_chunk = chunks[i];
            const chunk = Chunk.from_chunk_api(chunk_api);
            // get the buffer from the input chunks
            chunk.match_frags(input_chunk, (frag, input_frag) => {
                frag.block = input_frag.block;
            });
            return chunk;
        });
        return res_chunks;
    }

    /**
     * object_server.put_mapping will handle:
     * - deletions
     * - update_db
     */
    async put_mapping() {
        // TODO should we filter out chunk.had_errors from put mapping?
        await this.rpc_client.object.put_mapping({
            chunks: this.chunks_mapping.map(Chunk.to_chunk_api),
            move_to_tier: this.move_to_tier._id,
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
                    err.chunks ? 'err.chunks ' + util.inspect(err.chunks) : '',
                );
                return chunk;
            }
        });
    }

    /**
     * @param {Chunk} chunk 
     * @returns {Promise<Chunk>}
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
                const [chunk_map] = await this.get_mapping([chunk]);
                chunk = chunk_map;
                if (chunk.dup_chunk) return chunk;
            }
        }
        return chunk;
    }

    /**
     * @param {Chunk} chunk 
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
     * @param {Chunk} chunk 
     * @param {Frag} frag 
     */
    async process_frag(chunk, frag) {
        if (!frag.allocations) return;
        const accessible_blocks = frag.blocks && frag.blocks.filter(block_info => block_info.accessible);
        if (frag.block) { // upload case / fragment rebuild case (read_entire_chunk)
            const first_alloc = frag.allocations[0];
            const rest_allocs = frag.allocations.slice(1);
            await this.retry_write_block(first_alloc.block, frag.block);
            await P.map(rest_allocs, alloc => this.retry_replicate_blocks(alloc.block, first_alloc.block));
        } else if (accessible_blocks && accessible_blocks.length) {
            let next_source = Math.floor(Math.random() * accessible_blocks.length);
            dbg.log0('JAJA replicate block', accessible_blocks, next_source);
            await P.map(frag.allocations, async alloc => {
                const source_block = accessible_blocks[next_source];
                next_source = (next_source + 1) % accessible_blocks.length;
                return this.retry_replicate_blocks(alloc.block, source_block);
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
     * @param {Block} block
     * @param {Buffer} buffer
     */
    async retry_write_block(block, buffer) {
        let done = false;
        let retries = 0;
        while (!done) {
            try {
                await this.write_block(block, buffer);
                done = true;
            } catch (err) {
                await this.report_error(block, 'write', err);
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
     * @param {Block} block
     * @param {Block} source_block
     */
    async retry_replicate_blocks(block, source_block) {
        let done = false;
        let retries = 0;
        while (!done) {
            try {
                await this.replicate_block(block, source_block);
                done = true;
            } catch (err) {
                await this.report_error(block, 'replicate', err);
                if (err.rpc_code === 'NO_BLOCK_STORE_SPACE') throw err;
                retries += 1;
                if (retries > config.IO_REPLICATE_BLOCK_RETRIES) throw err;
                await P.delay(config.IO_REPLICATE_RETRY_DELAY_MS);
            }
        }
    }

    /**
     * write a block to the storage node
     * limit writes per agent + global IO semaphore to limit concurrency
     * @param {Block} block
     * @param {Buffer} buffer
     */
    async write_block(block, buffer) {
        await this.block_write_sem_agent.surround_key(String(block.node_id), async () =>
            this.block_write_sem_global.surround(async () => {
                dbg.log1('UPLOAD:', this.desc, 'write block',
                    'buffer', buffer.length,
                    'to', block._id, 'node', block.node_id, block.node.name, block.node.rpc_address);

                this._error_injection_on_write();

                return block_store_client.write_block(this.rpc_client, {
                    block_md: block.to_block_md_api(),
                    [RPC_BUFFERS]: { data: buffer },
                }, {
                    address: block.node.rpc_address,
                    timeout: config.IO_WRITE_BLOCK_TIMEOUT,
                });
            }));
    }

    /**
     * write a block to the storage node
     * limit replicates per agent + Global IO semaphore to limit concurrency
     * @param {Block} block
     * @param {Block} source_block
     */
    async replicate_block(block, source_block) {
        await this.block_replicate_sem_agent.surround_key(String(block.node_id), async () =>
            this.block_replicate_sem_global.surround(async () => {
                dbg.log1('UPLOAD:', this.desc, 'replicate block',
                    'from', source_block._id, 'node', source_block.node._id, source_block.node.name, source_block.node.rpc_address,
                    'to', block._id, 'node', block.node_id, block.node.name, block.node.rpc_address);

                this._error_injection_on_write();

                return this.rpc_client.block_store.replicate_block({
                    target: block.to_block_md_api(),
                    source: block.to_block_md_api(),
                }, {
                    address: block.node.rpc_address,
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

exports.MapClient = MapClient;
