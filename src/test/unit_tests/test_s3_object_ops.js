/* Copyright (C) 2016 NooBaa */
'use strict';

// setup coretest first to prepare the env
const coretest = require('./coretest');
coretest.setup();

const mocha = require('mocha');
const assert = require('assert');

mocha.describe('test_s3_object_ops', function() {

    const { s3 } = coretest;
    const BKT = 'test-s3-object-ops';

    mocha.before(async function() {
        await s3.createBucket({ Bucket: BKT }).promise();
    });

    mocha.it('should create text-file', async function() {
        await s3.putObject({
            Bucket: BKT,
            Key: 'text-file',
            Body: '',
            ContentType: 'text/plain',
        }).promise();
    });

    mocha.it('should head text-file', async function() {
        await s3.headObject({ Bucket: BKT, Key: 'text-file' }).promise();
    });

    mocha.it('should get text-file', async function() {
        const res = await s3.getObject({ Bucket: BKT, Key: 'text-file' }).promise();
        assert.strictEqual(res.Body.toString(), '');
        assert.strictEqual(res.ContentType, 'text/plain');
        assert.strictEqual(res.ContentLength, 0);
    });

    mocha.it('should list objects with text-file', async function() {
        const res = await s3.listObjects({ Bucket: BKT }).promise();
        assert.strictEqual(res.Contents[0].Key, 'text-file');
        assert.strictEqual(res.Contents[0].Size, 0);
        assert.strictEqual(res.Contents.length, 1);
    });

    mocha.it('should delete text-file', async function() {
        await s3.deleteObject({ Bucket: BKT, Key: 'text-file' }).promise();
    });

    mocha.it('should list objects after no objects left', async function() {
        const res = await s3.listObjects({ Bucket: BKT }).promise();
        assert.strictEqual(res.Contents.length, 0);
    });

    mocha.after(async function() {
        await s3.deleteBucket({ Bucket: BKT }).promise();
    });

});
