/* Copyright (C) 2016 NooBaa */
'use strict';

const _ = require('lodash');
const mocha = require('mocha');
const crypto = require('crypto');
const assert = require('assert');

const RandStream = require('../../util/rand_stream');
const ChunkSplitter = require('../../util/chunk_splitter');

let dedup_map = new Map();

mocha.describe('ChunkSplitter', function() {

    mocha.beforeEach(function() {
        dedup_map = new Map();
    });

    mocha.it('is consistent', async function() {
        const options = {
            avg_chunk: 4503,
            delta_chunk: 1231,
            len: 1517203,
            cipher_seed: sha('Chunk splitting is consistent'),
        };
        const base = await split(options);
        // assert.strictEqual(base.length, 363);
        for (let i = 1; i < 20; ++i) {
            const chunks = await split(options);
            assert.strictEqual(chunks.length, base.length);
            for (let j = 0; j < chunks.length; ++j) {
                assert.strictEqual(chunks[j], base[j]);
            }
        }
    });

    mocha.it('splits almost the same when pushing bytes at the start', async function() {
        this.timeout(600000); // eslint-disable-line no-invalid-this

        const num_chunks = 5000;
        const avg_chunk = 4 * 1024;
        const delta_chunk = avg_chunk / 4;

        // using fixed seed for consistent bytes generator
        const seed = sha('Intelligence is the ability to adapt to change');
        const generator = crypto.createCipheriv('aes-128-gcm', seed.slice(0, 16), seed.slice(16, 24));
        const base_data = generator.update(Buffer.alloc(num_chunks * avg_chunk));
        const base = await split({ avg_chunk, delta_chunk, data: base_data });

        let global_data_size = 0;
        let global_dedup_size = 0;

        for (let i = 1; i < avg_chunk; ++i) {
            const prefix = generator.update(Buffer.alloc(i));
            const chunks = await split({ avg_chunk, delta_chunk, data: [prefix, base_data] });
            const dedup_vs_base = _.sumBy(_.intersection(chunks, base), 'size');
            global_data_size += chunks.data_size;
            global_dedup_size += chunks.dedup_size;
            console.log(`prefix ${i} - dedup ratio (higher is better) |`,
                `base = ${(100 * dedup_vs_base / chunks.data_size).toFixed(1).padStart(5)}% |`,
                `any = ${(100 * chunks.dedup_size / chunks.data_size).toFixed(1).padStart(5)}% |`,
                `global = ${(100 * global_dedup_size / global_data_size).toFixed(1).padStart(5)}% |`,
                `avg chunk size = ${(chunks.data_size / chunks.length).toFixed(1).padStart(8)} |`,
                // `chunks ${chunks.map(c => c.size).slice(0, 100)}`
            );
            assert(dedup_vs_base / chunks.data_size >= 0.1, 'added storage vs. base is too high');
        }
    });

    async function split({ avg_chunk, delta_chunk, data, len, cipher_seed }) {
        return new Promise((resolve, reject) => {
            const chunks = [];
            chunks.data_size = 0;
            chunks.dedup_size = 0;
            const splitter = new ChunkSplitter({
                watermark: 100,
                calc_md5: true,
                calc_sha256: false,
                chunk_split_config: { avg_chunk, delta_chunk }
            });
            splitter.on('data', chunk => {
                chunks.data_size += chunk.size;
                chunk.hash = sha(chunk.data).toString('base64');
                const dedup = dedup_map.get(chunk.hash);
                if (dedup) {
                    dedup.refs += 1;
                    chunks.push(dedup);
                    chunks.dedup_size += chunk.size;
                } else {
                    chunk.refs = 1;
                    chunks.push(chunk);
                    dedup_map.set(chunk.hash, chunk);
                }
            });
            splitter.once('error', reject);
            splitter.once('end', () => resolve(chunks));
            if (Array.isArray(data)) {
                for (const d of data) splitter.write(d);
                splitter.end();
            } else if (Buffer.isBuffer(data)) {
                splitter.end(data);
            } else {
                const stream = new RandStream(len, { cipher_seed });
                stream.pipe(splitter);
            }
        });
    }

});

function sha(data) {
    const h = crypto.createHash('sha512');
    if (Array.isArray(data)) {
        for (const d of data) h.update(d);
    } else {
        h.update(data);
    }
    return h.digest();
}
