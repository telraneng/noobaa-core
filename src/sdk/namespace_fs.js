/* Copyright (C) 2016 NooBaa */
'use strict';

const _ = require('lodash');
const fs = require('fs');
const path = require('path');
const util = require('util');
const mime = require('mime');
const crypto = require('crypto');
const stream = require('stream');

// const P = require('../util/promise');
const dbg = require('../util/debug_module')(__filename);
// const fs_utils = require('../util/fs_utils');

const async_stat = util.promisify(fs.stat);
const async_readdir = util.promisify(fs.readdir);
const async_unlink = util.promisify(fs.unlink);

class NamespaceFS {

    constructor({ root_dir }) {
        this.root_dir = root_dir;
    }

    // check if copy can be done server side 
    is_same_namespace(other) {
        return other instanceof NamespaceFS && this.root_dir === other.root_dir;
    }

    get_bucket(bucket) {
        return bucket;
    }


    ///////////////////////
    // ACCOUNT NAMESPACE //
    ///////////////////////

    async list_buckets() {
        const list = await async_readdir(this.root_dir);
        return { buckets: list.map(name => ({ name })) };
    }

    async read_bucket(params) {
        const bucket_path = path.join(this.root_dir, params.name);
        const stat = await async_stat(bucket_path);
        if (!stat.isDirectory()) throw new Error(`Bucket should be a directory: ${bucket_path}`);
        return { name: params.name, bucket_type: 'NAMESPACE' };
    }

    async create_bucket(params) {
        throw new Error('NamespaceFS.create_bucket: TODO');
    }

    async delete_bucket(params) {
        throw new Error('NamespaceFS.delete_bucket: TODO');
    }

    /////////////////
    // OBJECT LIST //
    /////////////////

    // TODO implement limit and key_marker
    async list_objects(params, object_sdk) {
        dbg.log0('NamespaceFS.list_objects:', this.root_dir, inspect(params));

        const objects = [];
        const common_prefixes = [];
        const prefixes = _decode_prefixes(params.prefix, params.delimiter);
        console.log('prefixes', prefixes);

        const scan_dir = async (fs_dir, key_dir, entry_prefix) => {
            console.log('scan_dir', fs_dir);

            const list = await async_readdir(fs_dir);

            for (const entry of list) {
                if (!entry.startsWith(entry_prefix)) continue;
                const fs_path = path.join(fs_dir, entry);
                const key_path = key_dir ? `${key_dir}${prefixes.delimiter || '/'}${entry}` : entry;

                /** @type {fs.Stats} */
                const stat = await async_stat(fs_path);

                if (stat.isDirectory()) {
                    if (prefixes.delimiter) {
                        common_prefixes.push(key_path + prefixes.delimiter);
                    } else {
                        await scan_dir(fs_path, key_path, '');
                    }
                } else {
                    objects.push(this._get_fs_object_info(stat, key_path, params.bucket));
                }
            }
        };

        const dir = path.join(this.root_dir, params.bucket, prefixes.dir);
        await scan_dir(dir, prefixes.dir, prefixes.entry);

        return {
            objects,
            common_prefixes,
            is_truncated: false,
        };
    }

    async list_object_versions(params, object_sdk) {
        dbg.log0('NamespaceFS.list_object_versions:', this.root_dir, inspect(params));
        return this.list_objects(params, object_sdk);
    }

    async list_uploads(params, object_sdk) {
        dbg.log0('NamespaceFS.list_uploads:', this.root_dir, inspect(params));
        return {
            objects: [],
            common_prefixes: [],
            is_truncated: false,
        };
    }
    /////////////////
    // OBJECT READ //
    /////////////////

    async read_object_md(params, object_sdk) {
        dbg.log0('NamespaceFS.read_object_md:', this.root_dir, inspect(params));
        const file_path = path.join(this.root_dir, params.bucket, params.key);
        const stat = await async_stat(file_path);
        return this._get_fs_object_info(stat, params.key, params.bucket);
    }

    async read_object_stream(params, object_sdk) {
        dbg.log0('NamespaceFS.read_object_stream:', this.root_dir, inspect(_.omit(params, 'object_md.ns')));
        const file_path = path.join(this.root_dir, params.bucket, params.key);
        return fs.createReadStream(file_path);
    }

    ///////////////////
    // OBJECT UPLOAD //
    ///////////////////

    async upload_object(params, object_sdk) {
        dbg.log0('NamespaceFS.upload_object:', this.root_dir, inspect(_.omit(params, 'source_stream')));
        const file_path = path.join(this.root_dir, params.bucket, params.key);
        if (params.copy_source) {
            throw new Error('NamespaceFS.upload_multipart: copy_source TODO');
        }
        const src = params.source_stream;
        const md5 = crypto.createHash('md5');
        const file = fs.createWriteStream(file_path);
        src.pipe(new stream.Transform({
                transform(data, encoding, callback) {
                    md5.update(data);
                    this.push(data);
                    return callback();
                }
            }))
            .pipe(file);
        await new Promise((resolve, reject) => {
            file.once('finish', resolve);
            file.once('error', reject);
            src.once('error', reject);
        });
        const etag = md5.digest('hex');
        return { etag };
    }

    /////////////////////////////
    // OBJECT MULTIPART UPLOAD //
    /////////////////////////////

    async create_object_upload(params, object_sdk) {
        dbg.log0('NamespaceFS.create_object_upload:', this.root_dir, inspect(params));
        // return { obj_id: res.UploadId };
        throw new Error('NamespaceFS.create_object_upload: TODO');
    }

    async upload_multipart(params, object_sdk) {
        dbg.log0('NamespaceFS.upload_multipart:', this.root_dir, inspect(params));
        // if (params.copy_source) {
        //     throw new Error('NamespaceFS.upload_multipart: copy_source TODO');
        // }
        // const res = await this.s3.uploadPart({
        //     Key: params.key,
        //     UploadId: params.obj_id,
        //     PartNumber: params.num,
        //     Body: params.source_stream,
        //     ContentLength: params.size,
        // }).promise();
        // dbg.log0('NamespaceFS.upload_multipart:', this.root_dir, inspect(params), 'res', inspect(res));
        // const etag = ''; // s3_utils.parse_etag(res.ETag);
        // return { etag };
        throw new Error('NamespaceFS.upload_multipart: TODO');
    }

    async list_multiparts(params, object_sdk) {
        dbg.log0('NamespaceFS.list_multiparts:', this.root_dir, inspect(params));
        // const res = await this.s3.listParts({
        //     Key: params.key,
        //     UploadId: params.obj_id,
        //     MaxParts: params.max,
        //     PartNumberMarker: params.num_marker,
        // }).promise();
        // dbg.log0('NamespaceFS.list_multiparts:', this.root_dir, inspect(params), 'res', inspect(res));
        // return {
        //     is_truncated: res.IsTruncated,
        //     next_num_marker: res.NextPartNumberMarker,
        //     multiparts: _.map(res.Parts, p => ({
        //         num: p.PartNumber,
        //         size: p.Size,
        //         etag: '', // s3_utils.parse_etag(p.ETag),
        //         last_modified: p.LastModified,
        //     }))
        // };
        throw new Error('NamespaceFS.list_multiparts: TODO');
    }

    async complete_object_upload(params, object_sdk) {
        dbg.log0('NamespaceFS.complete_object_upload:', this.root_dir, inspect(params));
        // const res = await this.s3.completeMultipartUpload({
        //     Key: params.key,
        //     UploadId: params.obj_id,
        //     MultipartUpload: {
        //         Parts: _.map(params.multiparts, p => ({
        //             PartNumber: p.num,
        //             ETag: `"${p.etag}"`,
        //         }))
        //     }
        // }).promise();
        // dbg.log0('NamespaceFS.complete_object_upload:', this.root_dir, inspect(params), 'res', inspect(res));
        // const etag = ''; // s3_utils.parse_etag(res.ETag);
        // return { etag };
        throw new Error('NamespaceFS.complete_object_upload: TODO');
    }

    async abort_object_upload(params, object_sdk) {
        dbg.log0('NamespaceFS.abort_object_upload:', this.root_dir, inspect(params));
        // const res = await this.s3.abortMultipartUpload({
        //     Key: params.key,
        //     UploadId: params.obj_id,
        // }).promise();
        // dbg.log0('NamespaceFS.abort_object_upload:', this.root_dir, inspect(params), 'res', inspect(res));
        throw new Error('NamespaceFS.abort_object_upload: TODO');
    }

    ///////////////////
    // OBJECT DELETE //
    ///////////////////

    async delete_object(params, object_sdk) {
        dbg.log0('NamespaceFS.delete_object:', this.root_dir, inspect(params));
        const file_path = path.join(this.root_dir, params.bucket, params.key);
        await async_unlink(file_path);
        return {};
    }

    async delete_multiple_objects(params, object_sdk) {
        dbg.log0('NamespaceFS.delete_multiple_objects:', this.root_dir, inspect(params));
        await Promise.all(_.map(params.keys, async key => {
            const file_path = path.join(this.root_dir, params.bucket, params.key);
            await async_unlink(file_path);
        }));
        dbg.log0('NamespaceFS.delete_multiple_objects:', this.root_dir, inspect(params));
        return _.map(params.keys, key => ({}));
    }

    /**
     * 
     * @param {fs.Stats} stat
     * @param {String} key 
     * @param {String} bucket 
     */
    _get_fs_object_info(stat, key, bucket) {
        return {
            obj_id: String(stat.ino),
            bucket,
            key,
            size: stat.size,
            etag: String(stat.ino),
            create_time: stat.mtime,
            content_type: mime.getType(key),
            is_latest: true,
            xattr: {
                'noobaa-namespace-fs-bucket': this.root_dir,
            },
        };
    }

}

function inspect(x) {
    return util.inspect(x, true, 5, true);
}

function _decode_prefixes(prefix = '', delimiter = '') {
    if (delimiter !== '' && delimiter.length !== 1) {
        throw new Error(`Invalid delmiter: ${delimiter}`);
    }
    if (prefix && delimiter && delimiter !== '/') {
        let old;
        do {
            old = prefix;
            prefix = prefix.replace(delimiter, '/');
        } while (prefix !== old);
    }
    const pos = prefix.lastIndexOf('/');
    const dir = prefix.slice(0, pos + 1);
    const entry = prefix.slice(pos + 1);
    return { prefix, delimiter, dir, entry };
}

module.exports = NamespaceFS;
