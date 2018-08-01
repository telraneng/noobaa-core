/* Copyright (C) 2016 NooBaa */
'use strict';

// setup coretest first to prepare the env
const coretest = require('./coretest');
coretest.setup();

const _ = require('lodash');
// const util = require('util');
const mocha = require('mocha');
const assert = require('assert');

mocha.describe('s3.listMultipartUploads()', function() {

    const { s3 } = coretest;

    mocha.describe('works with small number of uploads', function() {
        this.timeout(600000); // eslint-disable-line no-invalid-this

        const BKT = 'test-s3-list-uploads-small';
        const test_uploads = [];

        mocha.before(async function() {
            await create_test_bucket_and_uploads(test_uploads, BKT,
                _.times(17, i => `multipart/file${i}`),
            );
        });

        mocha.it('works with Delimiter=/ and Prefix=multipart/', async function() {
            test_list_uploads(
                await s3.listMultipartUploads({
                    Bucket: BKT,
                    Delimiter: '/',
                    Prefix: 'multipart/',
                }).promise(), {
                    IsTruncated: false,
                    CommonPrefixes: [],
                    Uploads: test_uploads,
                }
            );
        });

        mocha.it('works with Delimiter=/ and Prefix=multipart/ and MaxUploads=1', async function() {
            test_list_uploads(
                await s3.listMultipartUploads({
                    Bucket: BKT,
                    Delimiter: '/',
                    Prefix: 'multipart/',
                    MaxUploads: 1,
                }).promise(), {
                    IsTruncated: true,
                    CommonPrefixes: [],
                    Uploads: test_uploads.slice(0, 1),
                }
            );
        });

        mocha.it('works with MaxUploads=1', async function() {
            test_list_uploads(
                await s3.listMultipartUploads({
                    Bucket: BKT,
                    MaxUploads: 1,
                }).promise(), {
                    IsTruncated: true,
                    CommonPrefixes: [],
                    Uploads: test_uploads.slice(0, 1),
                }
            );
        });

        mocha.it('works with MaxUploads=1 with iteration', async function() {
            test_list_uploads(
                await iterate_list_uploads({
                    Bucket: BKT,
                    MaxUploads: 1,
                }), {
                    IsTruncated: false,
                    CommonPrefixes: [],
                    Uploads: test_uploads,
                }
            );
        });
    });

    mocha.describe('works with truncated list', function() {
        this.timeout(600000); // eslint-disable-line no-invalid-this

        const BKT = 'test-s3-list-uploads-truncated';
        const test_uploads = [];

        mocha.before(async function() {
            await create_test_bucket_and_uploads(test_uploads, BKT,
                _.times(9, () => `multipart1`),
                _.times(9, () => `multipart2`),
                _.times(9, i => `multipart3/file${i}`),
            );
        });

        mocha.it('works with MaxUploads=25', async function() {
            test_list_uploads(
                await s3.listMultipartUploads({
                    Bucket: BKT,
                    MaxUploads: 25,
                }).promise(), {
                    IsTruncated: true,
                    CommonPrefixes: [],
                    Uploads: test_uploads.slice(0, 25),
                }
            );
        });

        mocha.it('works with Delimiter=/ and MaxUploads=25', async function() {
            test_list_uploads(
                await s3.listMultipartUploads({
                    Bucket: BKT,
                    Delimiter: '/',
                    MaxUploads: 25,
                }).promise(), {
                    IsTruncated: false,
                    CommonPrefixes: [{ Prefix: 'multipart3/' }],
                    Uploads: test_uploads.filter(u => !u.Key.startsWith('multipart3')),
                }
            );
        });

    });


    ///////////
    // UTILS //
    ///////////


    async function create_test_bucket_and_uploads(test_uploads, bucket, ...keys_lists) {
        await s3.createBucket({ Bucket: bucket }).promise();
        await Promise.all(keys_lists.map(async keys => {
            for (const key of keys) {
                await s3.createMultipartUpload({ Bucket: bucket, Key: key }).promise();
            }
        }));
        const list_res = await iterate_list_uploads({ Bucket: bucket });
        test_list_uploads_sanity(list_res);
        test_uploads.push(...list_res.Uploads);
        Object.freeze(test_uploads);
    }

    async function iterate_list_uploads(params) {
        const full_res = {
            IsTruncated: true,
            Uploads: [],
            CommonPrefixes: [],
        };
        while (full_res.IsTruncated) {
            const res = await s3.listMultipartUploads(params).promise();
            params.KeyMarker = res.NextKeyMarker;
            params.UploadIdMarker = res.NextUploadIdMarker;
            full_res.IsTruncated = res.IsTruncated;
            full_res.Uploads.push(...res.Uploads);
            full_res.CommonPrefixes.push(...res.CommonPrefixes);
        }
        return full_res;
    }

    function test_list_uploads(res, expected) {
        for (const key of Object.keys(expected)) {
            // console.log(`RES[${key}]`, util.inspect(res[key], true, null, true));
            // console.log(`EXP[${key}]`, util.inspect(expected[key], true, null, true));
            assert.deepStrictEqual(res[key], expected[key]);
        }
        test_list_uploads_sanity(res);
    }

    function test_list_uploads_sanity(res) {
        for (let i = 1; i < res.Uploads.length; ++i) {
            const curr = res.Uploads[i];
            const prev = res.Uploads[i - 1];
            if (prev.Key === curr.Key) {
                assert.ok(prev.Initiated <= curr.Initiated, `${prev.Initiated} <= ${curr.Initiated}`);
            } else {
                assert.ok(prev.Key < curr.Key, `${prev.Key} < ${curr.Key}`);
            }
        }
    }

});
