/* Copyright (C) 2016 NooBaa */
'use strict';

function parse(data) {
    var group = [];
    var avg = NaN;
    var run = null;
    var op = null;
    data.split('\n')
        .forEach(x => {
            const v = x.replace(/.*:/, '').trim();
            run = run || x.match(/--(find|insert)\s+([0-9]+)\s+--batch\s+([0-9]+)/);
            if (run) {
                if (!op) {
                    op = run[1];
                    console.log('-----', op, '-----');
                } else if (op !== run[1]) {
                    op = run[1];
                    console.log('-----', op, '-----');
                }
            }
            if (x.match(/average/)) {
                avg = v;
            } else if (x.match(/percentile.*100%/)) {
                group.push(v, avg);
                group.forEach(y => console.log(y.replace(/ms/, '')));
                group = [];
                avg = NaN;
                run = null;
            } else if (x.match(/percentile/)) {
                group.push(v);
            }
        });
}

function read() {
    return new Promise((resolve, reject) => {
        const bufs = [];
        process.stdin
            .on('data', b => bufs.push(b))
            .once('error', reject)
            .once('end', () => resolve(Buffer.concat(bufs).toString()));
    });
}

read().then(parse);
