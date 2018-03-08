/* Copyright (C) 2016 NooBaa */
'use strict';

const argv = require('minimist')(process.argv);

const suffix = argv.old ? '.OLD.js' : '';
const debug_module_path = `../util/debug_module${suffix}`;
const dbg = require(debug_module_path)(__filename);

dbg.set_console_output(argv.console);
dbg.set_syslog_output(argv.syslog);
dbg.set_file_output(argv.file);
dbg.set_throttle(argv.throttle);

const total_start = Date.now();
let total_count = 0;

function batch() {
    const batch_start = Date.now();
    const batch_count = total_count;
    for (let i = 0; i < 50000; ++i) {
        dbg.error(
            'This is some text',
            batch_start,
            i, {
                this_is_some_property: 'this is some value',
                and_this_is_an_array: [1, 2, 3, 4, 5],
            },
        );
        total_count += 1;
    }
    const now = Date.now();
    const batch_took = now - batch_start;
    const total_took = now - total_start;
    const batch_ops_per_ms = ((total_count - batch_count) / batch_took).toFixed(1);
    const total_ops_per_ms = (total_count / total_took).toFixed(1);
    process.stdout.write(`GOD SPEED: ${batch_ops_per_ms} OPS per ms (average ${total_ops_per_ms})\n`);
    setImmediate(batch);
}

batch();
