/* Copyright (C) 2016 NooBaa */
'use strict';

// setup coretest first to prepare the env
const coretest = require('./coretest');
coretest.setup();

const mocha = require('mocha');
const assert = require('assert');

mocha.describe('test_s3_bucket_ops', function() {

    const { s3 } = coretest;
    const BKT = 'test-s3-bucket-ops';

    mocha.it('should create bucket', async function() {
        await s3.createBucket({ Bucket: BKT }).promise();
    });

    mocha.it('should head bucket', async function() {
        await s3.headBucket({ Bucket: BKT }).promise();
    });

    mocha.it('should list buckets with one bucket', async function() {
        const res = await s3.listBuckets().promise();
        assert(res.Buckets.find(bucket => bucket.Name === BKT));
    });

    mocha.it('should delete bucket', async function() {
        await s3.deleteBucket({ Bucket: BKT }).promise();
    });

    mocha.it('should list buckets after no buckets left', async function() {
        const res = await s3.listBuckets().promise();
        assert(!res.Buckets.find(bucket => bucket.Name === BKT));
    });

});
