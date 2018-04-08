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

        const avg_chunk = 4000;
        const delta_chunk = 100;

        // using fixed seed for consistent bytes generator
        const seed = sha('Intelligence is the ability to adapt to change');
        const generator = crypto.createCipheriv('aes-128-gcm', seed.slice(0, 16), seed.slice(16, 24));
        const base_data = generator.update(Buffer.alloc(30 * avg_chunk));
        const base = await split({ avg_chunk, delta_chunk, data: base_data });

        let data_size = base.data_size;
        let storage_size = base.storage_size;

        for (let i = 0; i < avg_chunk; ++i) {
            const prefix = generator.update(Buffer.alloc(i));
            const chunks = await split({ avg_chunk, delta_chunk, data: [prefix, base_data] });
            const storage_size_vs_base = _.sumBy(_.difference(chunks, base), 'size');
            data_size += chunks.data_size;
            storage_size += chunks.storage_size;
            console.log(`${i} storage/data ratio (lower is better):`,
                `new vs. base ${percent(storage_size_vs_base, chunks.data_size)}`,
                `new vs. all ${chunks.storage_percent}`,
                `total ${percent(storage_size, data_size)}`
            );
        }
    });

    async function split({ avg_chunk, delta_chunk, data, len, cipher_seed }) {
        return new Promise((resolve, reject) => {
            const chunks = [];
            chunks.data_size = 0;
            chunks.storage_size = 0;
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
                } else {
                    chunk.refs = 1;
                    chunks.push(chunk);
                    chunks.storage_size += chunk.size;
                    dedup_map.set(chunk.hash, chunk);
                }
            });
            splitter.once('error', reject);
            splitter.once('end', () => {
                chunks.storage_percent = percent(chunks.storage_size, chunks.data_size); // lower is better
                return resolve(chunks);
            });
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


function percent(a, b) {
    return (100 * a / b).toFixed(1) + '%';
}

function sha(data) {
    const h = crypto.createHash('sha512');
    if (Array.isArray(data)) {
        for (const d of data) h.update(d);
    } else {
        h.update(data);
    }
    return h.digest();
}
