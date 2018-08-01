/* Copyright (C) 2016 NooBaa */
'use strict';

// setup coretest first to prepare the env
const coretest = require('./coretest');
coretest.setup();

const _ = require('lodash');
// const util = require('util');
const mocha = require('mocha');
const assert = require('assert');
const crypto = require('crypto');

mocha.describe('s3.listObjectVersions()', function() {

    const { s3 } = coretest;

    mocha.describe('works with small number of versions', function() {
        this.timeout(600000); // eslint-disable-line no-invalid-this

        const BKT = 'test-s3-list-versions-small';
        const folders_to_upload = Object.freeze(_.times(23, i => `folder${i}/`));
        const files_in_folders_to_upload = Object.freeze(_.times(29, i => `folder1/file${i}`));
        const files_in_utf_diff_delimiter = Object.freeze(_.times(31, i => `תיקיה#קובץ${i}`));
        const files_without_folders_to_upload = Object.freeze(_.times(37, i => `file_without_folder${i}`));
        const test_folders = Object.freeze(_.sortBy(folders_to_upload.map(s => ({ Prefix: s })), 'Prefix'));
        const test_versions = [];

        mocha.before(async function() {
            await create_test_bucket_and_versions(test_versions, BKT,
                folders_to_upload,
                files_in_folders_to_upload,
                files_without_folders_to_upload,
                files_in_utf_diff_delimiter
            );
        });

        mocha.it('works with Delimiter=#', async function() {
            test_list_versions(
                await s3.listObjectVersions({
                    Bucket: BKT,
                    Delimiter: '#',
                }).promise(), {
                    IsTruncated: false,
                    CommonPrefixes: [{ Prefix: 'תיקיה#' }],
                    Versions: test_versions.filter(f =>
                        folders_to_upload.includes(f.Key) ||
                        files_in_folders_to_upload.includes(f.Key) ||
                        files_without_folders_to_upload.includes(f.Key)
                    )
                }
            );
        });

        mocha.it('works with Delimiter=/', async function() {
            test_list_versions(
                await s3.listObjectVersions({
                    Bucket: BKT,
                    Delimiter: '/',
                }).promise(), {
                    IsTruncated: false,
                    CommonPrefixes: test_folders,
                    Versions: test_versions.filter(f =>
                        files_without_folders_to_upload.includes(f.Key) ||
                        files_in_utf_diff_delimiter.includes(f.Key)
                    ),
                }
            );
        });

        mocha.it('works with Delimiter=/ and Prefix=folder', async function() {
            test_list_versions(
                await s3.listObjectVersions({
                    Bucket: BKT,
                    Delimiter: '/',
                    Prefix: 'folder',
                }).promise(), {
                    IsTruncated: false,
                    CommonPrefixes: test_folders,
                    Versions: [],
                }
            );
        });

        mocha.it('works with Delimiter=/ and Prefix=folder1/', async function() {
            test_list_versions(
                await s3.listObjectVersions({
                    Bucket: BKT,
                    Delimiter: '/',
                    Prefix: 'folder1/',
                }).promise(), {
                    IsTruncated: false,
                    CommonPrefixes: [],
                    Versions: test_versions.filter(f =>
                        f.Key === 'folder1/' ||
                        files_in_folders_to_upload.includes(f.Key)
                    ),
                }
            );
        });

        mocha.it('works with Delimiter=/ and MaxKeys=5', async function() {
            test_list_versions(
                await s3.listObjectVersions({
                    Bucket: BKT,
                    Delimiter: '/',
                    MaxKeys: 5,
                }).promise(), {
                    IsTruncated: true,
                    CommonPrefixes: [],
                    Versions: test_versions.filter(f =>
                        f.Key === 'file_without_folder0' ||
                        f.Key === 'file_without_folder1' ||
                        f.Key === 'file_without_folder10' ||
                        f.Key === 'file_without_folder11' ||
                        f.Key === 'file_without_folder12'
                    ),
                }
            );
        });

        mocha.it('works with Prefix=file_without', async function() {
            test_list_versions(
                await s3.listObjectVersions({
                    Bucket: BKT,
                    Prefix: 'file_without',
                }).promise(), {
                    IsTruncated: false,
                    CommonPrefixes: [],
                    Versions: test_versions.filter(f =>
                        files_without_folders_to_upload.includes(f.Key)
                    ),
                }
            );
        });

        mocha.it('works with Prefix=file_without_folder0', async function() {
            test_list_versions(
                await s3.listObjectVersions({
                    Bucket: BKT,
                    Prefix: 'file_without_folder0',
                }).promise(), {
                    IsTruncated: false,
                    CommonPrefixes: [],
                    Versions: test_versions.filter(f =>
                        f.Key === files_without_folders_to_upload[0]
                    ),
                }
            );
        });

        mocha.it('works with MaxKeys=0', async function() {
            test_list_versions(
                await s3.listObjectVersions({
                    Bucket: BKT,
                    MaxKeys: 0,
                }).promise(), {
                    IsTruncated: false,
                    CommonPrefixes: [],
                    Versions: [],
                }
            );
        });

        mocha.it('works with Delimiter=/ and MaxKeys=3 iteration', async function() {
            test_list_versions(
                await iterate_list_versions({
                    Bucket: BKT,
                    Delimiter: '/',
                    MaxKeys: 3,
                }), {
                    IsTruncated: false,
                    CommonPrefixes: test_folders,
                    Versions: test_versions.filter(f =>
                        files_without_folders_to_upload.includes(f.Key) ||
                        files_in_utf_diff_delimiter.includes(f.Key)
                    ),
                }
            );
        });
    });

    mocha.describe('works with large (>1000) number of files and folders', async function() {
        this.timeout(600000); // eslint-disable-line no-invalid-this

        const BKT = 'test-s3-list-versions-large';
        const test_versions = [];

        mocha.before(async function() {
            await create_test_bucket_and_versions(test_versions, BKT,
                ..._.times(20, i => _.times(111, j => `max_keys_test_${i}_${j}`))
            );
        });

        mocha.it('works with MaxKeys=5555 (above real limit = 1000)', async function() {
            test_list_versions(
                await s3.listObjectVersions({
                    Bucket: BKT,
                    MaxKeys: 5555, // we expect the server to truncate to 1000 in any case
                }).promise(), {
                    IsTruncated: true,
                    CommonPrefixes: [],
                    Versions: test_versions.slice(0, 1000),
                }
            );
        });

        mocha.it('works with Delimiter=/ and MaxKeys=3 iteration', async function() {
            test_list_versions(
                await iterate_list_versions({
                    Bucket: BKT,
                    Delimiter: '/',
                    MaxKeys: 3,
                }), {
                    IsTruncated: false,
                    CommonPrefixes: [],
                    Versions: test_versions,
                }
            );
        });

        mocha.it('throws InvalidArgument with MaxKeys=-666', async function() {
            try {
                await s3.listObjectVersions({
                    Bucket: BKT,
                    MaxKeys: -666,
                }).promise();
                assert.fail('expected error InvalidArgument');
            } catch (err) {
                assert.strictEqual(err.code, 'InvalidArgument');
            }
        });

    });


    ///////////
    // UTILS //
    ///////////


    /**
     * @param {AWS.S3.ObjectVersionList} test_versions 
     * @param {String} bucket 
     * @param {String[]} keys_lists 
     */
    async function create_test_bucket_and_versions(test_versions, bucket, ...keys_lists) {
        await s3.createBucket({ Bucket: bucket }).promise();
        await s3.putBucketVersioning({ Bucket: bucket, VersioningConfiguration: { Status: 'Enabled' } }).promise();
        const map = new Map();
        await Promise.all(keys_lists.map(async keys => {
            for (const key of keys) {
                const body = crypto.randomBytes(64);
                const res = await s3.putObject({
                    Bucket: bucket,
                    Key: key,
                    Body: body,
                }).promise();
                assert.strictEqual(res.ETag, `"${crypto.createHash('md5').update(body).digest('hex')}"`);
                map.set(res.ETag, res.VersionId);
            }
        }));
        const list_res = await iterate_list_versions({ Bucket: bucket });
        // check that all the returned list is exactly as expected
        for (const ver of list_res.Versions) {
            const version_id = map.get(ver.ETag);
            assert.strictEqual(version_id, ver.VersionId);
            map.delete(ver.ETag);
        }
        assert.strictEqual(map.size, 0);
        test_list_versions_sanity(list_res);
        test_versions.push(...list_res.Versions);
        Object.freeze(test_versions);
    }

    /**
     * @param {AWS.S3.ListObjectVersionsRequest} params
     * @returns {AWS.S3.ListObjectVersionsOutput}
     */
    async function iterate_list_versions(params) {
        const full_res = {
            IsTruncated: true,
            Versions: [],
            CommonPrefixes: [],
        };
        while (full_res.IsTruncated) {
            const res = await s3.listObjectVersions(params).promise();
            params.KeyMarker = res.NextKeyMarker;
            params.VersionIdMarker = res.NextVersionIdMarker;
            full_res.IsTruncated = res.IsTruncated;
            full_res.Versions.push(...res.Versions);
            full_res.CommonPrefixes.push(...res.CommonPrefixes);
        }
        return full_res;
    }

    /**
     * @param {AWS.S3.ListObjectVersionsOutput} res
     * @param {AWS.S3.ListObjectVersionsOutput} expected
     */
    function test_list_versions(res, expected) {
        for (const key of Object.keys(expected)) {
            assert.deepStrictEqual(res[key], expected[key]);
        }
        test_list_versions_sanity(res);
    }

    /**
     * @param {AWS.S3.ListObjectVersionsOutput} res
     */
    function test_list_versions_sanity(res) {
        for (let i = 1; i < res.Versions.length; ++i) {
            const curr = res.Versions[i];
            const prev = res.Versions[i - 1];
            if (prev.Key === curr.Key) {
                assert.ok(prev.LastModified >= curr.LastModified, `${prev.LastModified} >= ${curr.LastModified}`);
                assert.strictEqual(curr.IsLatest, false);
            } else {
                assert.ok(prev.Key <= curr.Key, `${prev.Key} <= ${curr.Key}`);
                assert.strictEqual(curr.IsLatest, true);
            }
        }
    }

});
