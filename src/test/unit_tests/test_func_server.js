/* Copyright (C) 2016 NooBaa */
'use strict';

// setup coretest first to prepare the env
const coretest = require('./coretest');
coretest.setup();

const mocha = require('mocha');
const assert = require('assert');
const P = require('../../util/promise');

mocha.describe('func_server', function() {
    this.timeout(60000); // eslint-disable-line no-invalid-this

    const client = coretest.new_test_client();

    const SYS = 'test_func_server_system';
    const EMAIL = SYS + '@coretest.coretest';
    const PASSWORD = 'tululu';
    const FUNC = 'func1';
    const VERS = '$LATEST';
    const ZIPFILE = Buffer.from('aaa');
    const ZIPFILE2 = Buffer.from('bbb');

    mocha.before(function() {
        return P.resolve()
            .then(() => client.system.create_system({
                activation_code: '1111',
                name: SYS,
                email: EMAIL,
                password: PASSWORD
            }))
            .then(res => {
                client.options.auth_token = res.token;
            });
    });

    mocha.after(function() {
        // NOOP FOR NOW
    });

    mocha.it('works', function() {
        return P.resolve()
            .then(() => client.func.create_func({
                config: {
                    name: FUNC,
                    version: VERS,
                },
                code: { zipfile: ZIPFILE }
            }))
            .then(() => client.func.read_func({
                name: FUNC,
                version: VERS,
                read_code: true,
                read_stats: true,
            }))
            .then(res => {
                assert(ZIPFILE.equals(res.code.zipfile));
                assert.strictEqual(res.config.memory_size, 128);
            })
            .then(() => client.func.update_func({
                config: {
                    name: FUNC,
                    version: VERS,
                    memory_size: 666
                },
                code: { zipfile: ZIPFILE2 }
            }))
            .then(() => client.func.read_func({
                name: FUNC,
                version: VERS,
                read_code: true,
                read_stats: true,
            }))
            .then(res => {
                assert(ZIPFILE2.equals(res.code.zipfile));
                assert.strictEqual(res.config.memory_size, 666);
            })
            .then(() => client.func.delete_func({
                name: FUNC,
                version: VERS,
            }));
    });

});
