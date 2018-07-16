/* Copyright (C) 2016 NooBaa */
'use strict';

const http = require('http');
const argv = require('minimist')(process.argv);

const dbg = require('../util/debug_module')(__filename);
const s3_rest = require('./s3/s3_rest');
const ObjectSDK = require('../sdk/object_sdk');
const NamespaceFS = require('../sdk/namespace_fs');
const http_utils = require('../util/http_utils');

dbg.set_process_name('FS3-Standalone-Endpoint');

const port = argv.port || 6001;
const root_dir = argv.dir || '.';

const rpc_client_mock = {
    options: {},
    object: {
        update_bucket_read_counters: () => { /* noop */ },
        update_bucket_write_counters: () => { /* noop */ },
        add_endpoint_usage_report: () => { /* noop */ },
    }
};

const object_io_mock = {};

const namespace_fs = new NamespaceFS({ root_dir });

class FS3SDK extends ObjectSDK {

    constructor() {
        super(rpc_client_mock, object_io_mock);
    }

    /**
     * @override
     */
    _get_account_namespace() {
        return namespace_fs;
    }

    /**
     * @override
     */
    _get_bucket_namespace(name) {
        return namespace_fs;
    }

}

function endpoint_request_handler(req, res) {
    // generate request id, this is lighter than uuid
    req.request_id = `${
        Date.now().toString(36)
    }-${
        process.hrtime()[1].toString(36)
    }-${
        Math.trunc(Math.random() * 65536).toString(36)
    }`;
    http_utils.parse_url_query(req);
    req.object_sdk = new FS3SDK();
    return s3_rest(req, res);
}

function main() {
    const server = http.createServer(endpoint_request_handler);
    server.listen(port, () => console.log(`FS3 server listening on port ${port}`));
}

if (require.main === module) main();
