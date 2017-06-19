/* Copyright (C) 2016 NooBaa */
'use strict';

const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');
const util = require('util');
const argv = require('minimist')(process.argv);
const func_proc = require('../../agent/func_services/func_proc');

const func_name = argv.func;
const event = argv.event || {};
const s3_root = argv.s3_root || '.';
const func_root = argv.func_root || path.dirname(func_name);

/**
 * This is a partial mock of S3 SDK running over a filesystem
 */
class S3 {

    listBuckets(params, callback) {
        return fs.readdir(s3_root, (err, buckets) => {
            if (err) return callback(err);
            buckets.sort();
            return callback(null, {
                Buckets: buckets.map(bucket => ({ Name: bucket }))
            });
        });
    }

    listObjects(params, callback) {
        const bucket_path = path.join(s3_root, params.Bucket);
        const limit = params.MaxKeys || 1000;
        return fs.readdir(bucket_path, (err, files) => {
            if (err) return callback(err);
            files.sort();
            if (params.Marker) {
                const index = files.indexOf(params.Marker);
                if (index >= 0) {
                    files = files.slice(index + 1, index + 1 + limit);
                }
            }
            if (files.length > limit) {
                files = files.slice(0, limit);
            }
            if (!files.length) {
                return callback(null, {
                    IsTruncated: false,
                    Contents: []
                });
            }
            return callback(null, {
                IsTruncated: true,
                NextMarker: files[files.length - 1],
                Contents: files.map(file => ({ Key: file })),
            });
        });
    }

    getObject(params, callback) {
        const file_path = path.join(s3_root, params.Bucket, params.Key);
        return fs.readFile(file_path, (err, data) => {
            if (err) return callback(err);
            return callback(null, {
                Body: data
            });
        });
    }

}

/**
 * This is a partial mock of Lambda SDK invoking functions using func_proc
 */
class Lambda {

    invoke(params, callback) {
        func_proc.run({
            config: {
                handler: `${path.join(func_root, params.FunctionName)}.handler`,
            },
            event: JSON.parse(params.Payload),
            // aws_config,
            // rpc_options,
        }, callback);
    }

}

// Override the AWS SDK with mock classes
AWS.Lambda = Lambda;
AWS.S3 = S3;

// run the function
func_proc.run({
    config: {
        handler: `${func_name}.handler`,
    },
    event,
    // aws_config,
    // rpc_options,
}, (err, res) => {
    if (err) {
        console.error('ERROR:', err.stack || err);
    } else {
        console.log('RESULT:');
        console.log(util.inspect(res, {
            depth: null,
            maxArrayLength: null,
            colors: true,
            showHidden: true,
        }));
    }
});
