/* Copyright (C) 2016 NooBaa */
'use strict';

const argv = require('minimist')(process.argv);
// const util = require('util');
const redis = require('redis');
const crypto = require('crypto');

function promise(func) {
    return new Promise((resolve, reject) => func((err, res) => (err ? reject(err) : resolve(res))));
}

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
            const object_id = hash(data, 'md5', 'hex');
            const sha256 = hash(data, 'sha256', 'base64');
            if (this.type === 'find') {
                list.push(sha256);
                continue;
            }
            list.push(sha256, object_id);
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

function insert(client) {
    const job = new Job(
        Number(argv.insert),
        Number(argv.batch),
        'insert',
        list => promise(cb => client.hmset(argv.key, list, cb))
    );
    return job.run();
}

function find(client) {
    const job = new Job(
        Number(argv.find),
        Number(argv.batch),
        'find',
        list => promise(cb => client.hmget(argv.key, list, cb))
    );
    return job.run();
}

function main() {
    argv.key = argv.key || 'big';
    argv.batch = argv.batch || 10;

    const client = redis.createClient();
    return Promise.all([
            promise(cb => client.hlen(argv.key, cb)),
            promise(cb => client.info('memory', cb)),
        ])
        .then(res => {
            console.log(`Number of keys          : ${number_with_commas(res[0])}`);
            const info = res[1].split('\n').slice(1)
                .reduce((obj, line) => {
                    const [k, v] = line.split(':');
                    obj[k] = v;
                    return obj;
                }, {});
            console.log(`Used memory             : ${number_as_megabytes(info.used_memory)}`);
            console.log(`Used memory RSS         : ${number_as_megabytes(info.used_memory_rss)}`);
            console.log(`Used memory peak        : ${number_as_megabytes(info.used_memory_peak)}`);
            console.log(`Mem fragmentation ratio : ${info.mem_fragmentation_ratio}`);
            if (argv.insert) return insert(client);
            if (argv.find) return find(client);
            console.log('Usage: --insert NUM | --find <NUM>');
        })
        .then(() => {
            client.quit();
        }, err => {
            client.quit();
            throw err;
        });
}

main();
