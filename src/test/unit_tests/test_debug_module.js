/* Copyright (C) 2016 NooBaa */
'use strict';

var _ = require('lodash');
var fs = require('fs');
var os = require('os');
var mocha = require('mocha');
var assert = require('assert');

var P = require('../../util/promise');
var DebugModule = require('../../util/debug_module');

async function read_last_msg() {
    await P.delay(1000);

    var content;
    if (os.type() === 'Darwin') {
        content = await fs.readFileAsync('./logs/noobaa.log', 'utf8');
    } else {
        content = await fs.readFileAsync('/var/log/noobaa.log', 'utf8');
    }
    content = content.slice(-1024);
    const lines = content.split('\n').filter(line => line);
    const line = _.last(lines);
    const msg = line.split(':').slice(3).join(':');
    return msg.trim();
}

async function assert_in_log(expected) {
    const line = await read_last_msg();
    assert.strictEqual(line, expected);
}

async function assert_not_in_log(unexpected) {
    const line = await read_last_msg();
    assert.notStrictEqual(line, unexpected);
}


mocha.describe('debug_module', function() {
    const self = this; // eslint-disable-line no-invalid-this

    //when log is 100MB, reading the log file for
    //verification can take about 1 sec.
    //various logs test creates inconsistency as it may reach timeout.
    self.timeout(10000);

    // This test case fails becauuse __filename is full path !
    // shouldn't the module trim the base path ??
    mocha.it('should parse __filename', function() {
        //CI integration workaround
        var filename = __filename.indexOf('noobaa-util') >= 0 ?
            __filename :
            '/Users/someuser/github/noobaa-core/src/util/test_debug_module.js';

        var dbg = new DebugModule(filename);
        assert.strictEqual(dbg._name, 'core.util.test_debug_module');
    });

    mocha.it('should parse heroku path names', function() {
        var dbg = new DebugModule('/app/src/blabla');
        assert.strictEqual(dbg._name, 'core.blabla');
    });

    mocha.it('should parse file names with extension', function() {
        var dbg = new DebugModule('/app/src/blabla.asd');
        assert.strictEqual(dbg._name, 'core.blabla');
    });

    mocha.it('should parse file names with folder with extention', function() {
        var dbg = new DebugModule('/app/src/blabla.asd/lll.asd');
        assert.strictEqual(dbg._name, 'core.blabla.asd.lll');
    });

    mocha.it('should parse file names with stems', function() {
        var dbg = new DebugModule('/noobaa-core/src/blabla.asd/lll.asd');
        assert.strictEqual(dbg._name, 'core.blabla.asd.lll');
    });

    mocha.it('should parse file names with stems and prefix', function() {
        var dbg = new DebugModule('/web/noise/noobaa-core/src/blabla.asd/lll.asd');
        assert.strictEqual(dbg._name, 'core.blabla.asd.lll');
    });

    mocha.it('should parse windows style paths', function() {
        var dbg = new DebugModule('C:\\Program Files\\NooBaa\\src\\agent\\agent_cli.js');
        assert.strictEqual(dbg._name, 'core.agent.agent_cli');
    });

    mocha.it('should set level for windows style module and propogate', function() {
        var dbg = new DebugModule('C:\\Program Files\\NooBaa\\src\\agent\\agent_cli.js');
        dbg.set_level(3, 'C:\\Program Files\\NooBaa\\src\\agent');
        assert.strictEqual(dbg._cur_level.__level, 3);
    });

    mocha.it('should log when level is appropriate', async function() {
        var dbg = new DebugModule('/web/noise/noobaa-core/src/blabla.asd/lll.asd');
        dbg.log0('test_debug_module: log0 should appear in the log');
        return assert_in_log('test_debug_module: log0 should appear in the log');
    });

    mocha.it('should NOT log when level is lower', async function() {
        var dbg = new DebugModule('/web/noise/noobaa-core/src/blabla.asd/lll.asd');
        dbg.log2('test_debug_module: log2 should not appear in the log');
        return assert_not_in_log('test_debug_module: log2 should not appear in the log');
    });

    mocha.it('should log after changing level of module', async function() {
        var dbg = new DebugModule('/web/noise/noobaa-core/src/blabla.asd/lll.asd');
        dbg.set_level(4);
        var a = {
            out: 'out',
            second: {
                inner: 'inner'
            }
        };
        dbg.log4('test_debug_module: log4 should appear after level change', a);
        dbg.set_level(0);
        return assert_in_log('test_debug_module: log4 should appear after level change');
    });

    mocha.it('trace0 should log backtrace', async function() {
        var dbg = new DebugModule('/web/noise/noobaa-core/src/blabla.asd/lll.asd');
        dbg.trace0('test_debug_module: trace0 should appear with backtrace');
        return assert_in_log('test_debug_module: trace0 should appear with backtrace     at');
    });

    mocha.it('setting a higher module should affect sub module', async function() {
        var dbg = new DebugModule('/web/noise/noobaa-core/src/blabla.asd/lll.asd');
        dbg.set_level(2, 'core');
        dbg.log2('test_debug_module: log2 setting a higher level module level should affect current');
        dbg.set_level(0, 'core');
        return assert_in_log('test_debug_module: log2 setting a higher level module level should affect current');
    });

    mocha.it('formatted string should be logged correctly (string substitutions)', async function() {
        var dbg = new DebugModule('/web/noise/noobaa-core/src/blabla.asd/lll.asd');
        var s1 = 'this';
        var s2 = 'should';
        var s3 = 'expected';
        var d1 = 3;
        var d2 = 2;
        dbg.log0('%s string substitutions (%d) %s be logged as %s, with two (%d) numbers', s1, d1, s2, s3, d2);
        return assert_in_log('this string substitutions (3) should be logged as expected, with two (2) numbers');
    });

    mocha.it('console various logs should be logged as well', async function() {
        for (const l of ['error', 'warn', 'info', 'log', 'trace']) {
            console[l]('console - %s - should be captured', l);
            await assert_in_log('console - ' + l + ' - should be captured');
        }
    });

    mocha.it('fake browser verify logging and console wrapping', async function() {
        var dbg = new DebugModule('/web/noise/noobaa-core/src/blabla.asd/lll.asd');
        dbg.log0('test_debug_module: browser should appear in the log');
        return assert_in_log('test_debug_module: browser should appear in the log');
    });
});
