/* Copyright (C) 2016 NooBaa */
'use strict';

const argv = require('minimist')(process.argv);
const util = require('util');
const crypto = require('crypto');
const mongodb = require('mongodb');

class Job {

    constructor(count, batch, type, func) {
        this.count = count;
        this.batch = batch;
        this.type = type;
        this.func = func;
        this.current = 0;
        this.mark = 0;
        // fast random bytes generator by encrypting zeros with random key+iv
        this.cipher = crypto.createCipheriv('aes-128-gcm', crypto.randomBytes(16), crypto.randomBytes(12));
        this.zeros = Buffer.alloc(1024);
        this.stats = [];
    }

    run() {
        if (!this.progress()) return;
        const list = this.generate();
        process.stdout.write('.');
        // console.log(`job: ${this.current} of ${this.count}`);
        const start = process.hrtime();
        return Promise.resolve()
            .then(() => this.func(list))
            .then(() => {
                const took = process.hrtime(start);
                const took_ms = (took[0] * 1e3) + (took[1] * 1e-6);
                this.stats.push(took_ms);
                // console.log(`job: took ${took_ms.toFixed(1)}ms`);
                return this.run();
            });
    }

    generate() {
        var list = [];
        for (var i = 0; i < this.batch; ++i) {
            const data = this.cipher.update(this.zeros);
            const sha256 = hash(data, 'sha256');
            if (this.type === 'find') {
                list.push(new mongodb.Binary(sha256.slice(0, 8)));
                continue;
            }
            if (this.type === 'findids') {
                const from_time = new mongodb.ObjectId('590adb93bbec393a67f94fb2')
                    .getTimestamp()
                    .getTime();
                const till_time = new mongodb.ObjectId('590b6bda8b98c0bd22641168')
                    .getTimestamp()
                    .getTime();
                const rand_time = from_time + (Math.random() * (till_time - from_time));
                const hex_time = Math.floor(rand_time / 1000).toString(16);
                const object_id = new mongodb.ObjectId(hex_time + hash(data, 'md5', 'hex').slice(0, 24 - hex_time.length));
                list.push(object_id);
                continue;
            }
            const md5 = hash(data, 'md5');
            const sha1 = hash(data, 'sha1');
            const sha384 = hash(data, 'sha384');
            const sha512 = hash(data, 'sha512');
            list.push({
                date: new Date(),
                md5: new mongodb.Binary(md5),
                sha1: new mongodb.Binary(sha1),
                sha256: new mongodb.Binary(sha256),
                sha384: new mongodb.Binary(sha384),
                sha512: new mongodb.Binary(sha512),
                md5_b64: md5.toString('base64'),
                sha1_b64: sha1.toString('base64'),
                sha256_b64: sha256.toString('base64'),
                sha384_b64: sha384.toString('base64'),
                sha512_b64: sha512.toString('base64'),
                sha256_0_8: new mongodb.Binary(sha256.slice(0, 8)),
                sha256_8_16: new mongodb.Binary(sha256.slice(8, 16)),
                sha256_16_24: new mongodb.Binary(sha256.slice(16, 24)),
                sha256_24_32: new mongodb.Binary(sha256.slice(24, 32)),
                sha256_0_16: new mongodb.Binary(sha256.slice(0, 16)),
                sha256_16_32: new mongodb.Binary(sha256.slice(16, 32)),
            });
        }
        return list;
    }

    progress() {
        if (this.current >= this.count) {
            if (this.mark) process.stdout.write(`${' '.repeat(50 - this.mark)} 100%\n`);
            console.log(`job: done ${this.count}`);
            this.summary();
            return false;
        }
        if (this.mark >= 50) {
            process.stdout.write(` ${(100 * this.current / this.count).toFixed(0)}%\n`);
            this.mark = 0;
        }
        process.stdout.write('.');
        this.current += 1;
        this.mark += 1;
        return true;
    }

    summary() {
        this.stats.sort((a, b) => a - b);
        const len = this.stats.length;
        const percentiles_keys = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 99, 100];
        var avg = 0;
        for (const t of this.stats) avg += t;
        avg /= len;
        console.log('Summary:');
        console.log(`    jobs count      : ${len}`);
        var avg_done = false;
        for (const p of percentiles_keys) {
            const t = this.stats[Math.floor((len - 1) * p / 100)];
            if (!avg_done && avg <= t) {
                console.log(`    ~average~       : ${avg.toFixed(1)}ms`);
                avg_done = true;
            }
            console.log(`    percentile ${(p < 10 && '  ') || (p < 100 && ' ') || ''}${p}% : ${t.toFixed(1)}ms`);
        }
    }

}

function hash(data, type, enc) {
    return crypto.createHash(type)
        .update(data)
        .digest(enc);
}

function number_with_commas(x) {
    return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function number_as_megabytes(x) {
    return (x / 1024 / 1024).toFixed(1) + ' MB';
}

function insert(col) {
    const job = new Job(
        Number(argv.insert),
        Number(argv.batch),
        'insert',
        docs => col.insertMany(docs)
    );
    return job.run();
}

function find(col) {
    const job = new Job(
        Number(argv.find),
        Number(argv.batch),
        'find',
        hashes => col.find({ sha256_0_8: { $in: hashes } }).toArray()
    );
    if (argv.explain) {
        return col.find({ sha256_0_8: { $in: job.generate() } })
            .explain()
            .then(explain => console.log(util.inspect(explain, true, null, true)));
    }
    return job.run();
}

function findids(col) {
    const job = new Job(
        Number(argv.findids),
        Number(argv.batch),
        'findids',
        ids => col.find({ _id: { $in: ids } }).toArray()
    );
    if (argv.explain) {
        return col.find({ _id: { $in: job.generate() } })
            .explain()
            .then(explain => console.log(util.inspect(explain, true, null, true)));
    }
    return job.run();
}

function main() {
    argv.db = argv.db || 'big';
    argv.col = argv.col || 'big';
    argv.batch = argv.batch || 10;

    var db;
    var col;

    return mongodb.connect(`mongodb://127.0.0.1/${argv.db}`)
        .then(database => {
            db = database;
            col = db.collection(argv.col);
            return col.stats();
        })
        .then(stats => {
            console.log('count', number_with_commas(stats.count));
            console.log('avgObjSize', stats.avgObjSize);
            console.log('size', number_as_megabytes(stats.size));
            console.log('storageSize', number_as_megabytes(stats.storageSize));
            Object.keys(stats.indexSizes).forEach(name => {
                console.log('indexSize', name, number_as_megabytes(stats.indexSizes[name]));
            });
            console.log('totalIndexSize', number_as_megabytes(stats.totalIndexSize));
            if (argv.insert) return insert(col);
            if (argv.find) return find(col);
            if (argv.findids) return findids(col);
            console.log('Usage: --insert NUM | --find <NUM> | --findids <NUM>');
        })
        .then(() => {
            db.close();
            db = null;
            col = null;
        });
}

main();
