/* Copyright (C) 2016 NooBaa */
'use strict';

require('../src/util/panic');

// load .env file before any other modules so that it will contain
// all the arguments even when the modules are loading.
console.log('loading .env file');
require('../src/util/dotenv').load();

// const _ = require('lodash');
const os = require('os');
const net = require('net');
const util = require('util');
const uuid4 = require('uuid/v4');
const assert = require('assert');
const dbg = require('../src/util/debug_module')('rados_server');

const { StreamIO } = require('./rados_io');

const {
    // constants
    CEPH_MON_PORT,
    CEPH_ENTITY_TYPE,
    CEPH_MSGR_TAG,
    // CEPH_MSGR_TAG_NAME,
    CEPH_MSG_TYPE,
    CEPH_MSG_TYPE_NAME,
    CEPH_MSG_PRIO,
    CEPH_MSG_FOOTER,
    CEPH_MSG_CONNECT,
    CEPH_AUTH_TYPE,
    // CEPH_FEATURES,
    CRUSH_BUCKET_ALG,
    CRUSH_BUCKET_TYPE,
    // types
    T_CEPH_TAG,
    T_CEPH_SEQ,
    T_CEPH_TIMESPEC,
    T_CEPH_MSG_HEADER,
    T_CEPH_MSG_FOOTER,
    T_CEPH_MSG_ACCEPT_REQUEST,
    T_CEPH_MSG_ACCEPT_REPLY,
    T_CEPH_MSG_CONNECT_REQUEST,
    T_CEPH_MSG_CONNECT_REPLY,
    T_CEPH_MSG_AUTH_REQUEST,
    T_CEPH_MSG_AUTH_REPLY,
    T_CEPH_MSG_AUTH_NONE,
    T_CEPH_MSG_AUTH_REPLY_CEPHX,
    T_CEPH_MSG_MON_MAP,
    T_CEPH_MSG_OSD_MAP,
    T_CEPH_MSG_MON_SUB_REQUEST_V2,
    T_CEPH_MSG_MON_SUB_REQUEST_V3,
    T_CEPH_MSG_MON_SUB_REPLY,
    T_CEPH_MSG_STATFS_REPLY,
} = require('./rados_messages');

class RadosConn {

    constructor(socket) {
        const la = socket.localAddress.replace(/^::ffff:/, '');
        const ra = socket.remoteAddress.replace(/^::ffff:/, '');
        this.name = `[${ra}:${socket.remotePort}]`;
        this.socket = socket;
        this.sio = new StreamIO(socket);
        this.features = [];
        for (let i = 0; i < 64; ++i) this.features.push(i);
        this.features[util.inspect.custom] = function() {
            return JSON.stringify(this);
        };
        this.peer_features = [];
        this.local_addr = { ip: la, port: socket.localPort };
        this.remote_addr = { ip: ra, port: socket.remotePort };
        this.local_entity_name = { type: CEPH_ENTITY_TYPE.MON, num: 0 };
        this.local_entity_addr = { type: 0, nonce: process.pid, addr: this.local_addr };
        this.local_entity_inst = { name: this.local_entity_name, addr: this.local_entity_addr };
        this.osd_addr = { type: 0, nonce: process.pid, addr: { ip: la, port: CEPH_MON_PORT } }; // port 6800
        this.cluster_addr = { type: 0, nonce: process.pid, addr: { ip: la, port: CEPH_MON_PORT } }; // port 6801
        this.hb_back_addr = { type: 0, nonce: process.pid, addr: { ip: la, port: CEPH_MON_PORT } }; // port 6802
        this.hb_front_addr = { type: 0, nonce: process.pid, addr: { ip: la, port: CEPH_MON_PORT } }; // port 6803
        this.local_seq = 0;
        this.remote_seq = 0;
        this.fsid = '1b18c846-7e17-466d-a9ec-77872460ef7a' || uuid4();
        dbg.log0(`${this.name} new connection started`);
    }

    async serve() {
        try {
            await this.accept();
            while (!this.socket.destroyed) {
                await this.handle_next();
            }
        } catch (err) {
            dbg.log0(`${this.name} serve error, closing`, (err && err.stack) || err);
            this.socket.destroy();
        }
    }

    async accept() {
        dbg.log0(`${this.name} accept [STAGE-1] send accept msg and wait for reply`);
        this.write_type(T_CEPH_MSG_ACCEPT_REQUEST, {
            server: { type: 0, nonce: 0, addr: this.local_addr },
            client: { type: 0, nonce: 0, addr: this.remote_addr },
        });
        await this.read_type(T_CEPH_MSG_ACCEPT_REPLY);

        dbg.log0(`${this.name} accept [STAGE-2] wait for connect msg and send reply`);
        const connect = await this.read_type(T_CEPH_MSG_CONNECT_REQUEST);
        this.peer_features = connect.features;
        const authorizer_len = 0;
        this.write_type(T_CEPH_MSG_CONNECT_REPLY, {
            tag: CEPH_MSGR_TAG.SEQ,
            features: this.features,
            global_seq: 308, // just an example we had in wireshark
            connect_seq: connect.connect_seq + 1,
            protocol_version: connect.protocol_version,
            authorizer_len: 0,
            flags: CEPH_MSG_CONNECT.LOSSY,
        });
        if (authorizer_len) {
            assert.fail('TODO IMPLEMENT authorizer reply');
        }

        dbg.log0(`${this.name} accept [STAGE-3] send my sequece and wait for ack`);
        this.write_type(T_CEPH_SEQ, this.local_seq);
        this.remote_seq = await this.read_type(T_CEPH_SEQ);
        this.local_seq = seq_increase(this.local_seq);
        this.remote_seq = seq_increase(this.remote_seq);

        dbg.log0(`${this.name} accept [SUCCESS]`);
    }

    write_type(type, val) {
        dbg.log1(`${this.name} write`, type, inspect(type.inspect(val)));
        type.write(this.sio, val, this.peer_features);
    }

    async read_type(type) {
        const val = await type.read(this.sio);
        dbg.log1(`${this.name} read`, type, inspect(type.inspect(val)));
        return val;
    }

    async handle_next() {
        const tag = await this.read_type(T_CEPH_TAG);
        dbg.log1(`${this.name} handle tag ${T_CEPH_TAG.inspect(tag)}`);
        switch (tag) {
            // case CEPH_MSGR_TAG.READY: break;
            // case CEPH_MSGR_TAG.RESETSESSION: break;
            // case CEPH_MSGR_TAG.WAIT: break;
            // case CEPH_MSGR_TAG.RETRY_SESSION: break;
            // case CEPH_MSGR_TAG.RETRY_GLOBAL: break;
            // case CEPH_MSGR_TAG.CLOSE: break;
            case CEPH_MSGR_TAG.MSG:
                return this.handle_msg();
            case CEPH_MSGR_TAG.ACK:
                return this.handle_ack();
            case CEPH_MSGR_TAG.KEEPALIVE:
                return this.handle_keepalive();

                // case CEPH_MSGR_TAG.BADPROTOVER: break;
                // case CEPH_MSGR_TAG.BADAUTHORIZER: break;
                // case CEPH_MSGR_TAG.FEATURES: break;
            case CEPH_MSGR_TAG.SEQ:
                return this.handle_seq();
            case CEPH_MSGR_TAG.KEEPALIVE2:
                return this.handle_keepalive2();
            case CEPH_MSGR_TAG.KEEPALIVE2_ACK:
                return this.handle_keepalive2();
            default:
                throw new Error(`TODO IMPLEMENT TAG ${tag}`);
        }
    }

    async handle_ack() {
        const seq = await this.read_type(T_CEPH_SEQ);
        dbg.log0(`${this.name} handle ack ${seq.toString()}`);
    }

    send_ack(seq) {
        dbg.log0(`${this.name} send ack ${seq.toString()}`);
        this.write_type(T_CEPH_TAG, CEPH_MSGR_TAG.ACK);
        this.write_type(T_CEPH_SEQ, seq);
    }

    async handle_seq() {
        const seq = await this.read_type(T_CEPH_SEQ);
        dbg.log0(`${this.name} handle seq ${seq.toString()}`);
    }

    async handle_keepalive() {
        // just a keepalive byte!
        dbg.log0(`${this.name} handle keepalive`);
    }

    async handle_keepalive2() {
        const time = await this.read_type(T_CEPH_TIMESPEC);
        dbg.log0(`${this.name} handle keepalive2`, time);
        this.write_type(T_CEPH_TAG, CEPH_MSGR_TAG.KEEPALIVE2_ACK);
        this.write_type(T_CEPH_TIMESPEC, time);
    }

    async handle_msg() {
        const msg = await this.read_msg();
        await this.handle_msg_type(msg);
        this.send_ack(msg.header.seq);
    }

    async handle_msg_type(msg) {
        switch (msg.header.type) {
            case CEPH_MSG_TYPE.AUTH:
                return this.handle_msg_auth(msg);
            case CEPH_MSG_TYPE.MON_SUBSCRIBE:
                return this.handle_msg_mon_subscribe(msg);
            case CEPH_MSG_TYPE.STATFS:
                return this.handle_msg_statfs(msg);
            default:
                throw new Error(`TODO IMPLEMENT MSG ${CEPH_MSG_TYPE_NAME[msg.header.type]}`);
        }
    }

    async read_msg() {

        const header = await this.read_type(T_CEPH_MSG_HEADER);

        let crc_id = this.sio.start_read_crc();
        const front = await this.sio.read(header.front_len);
        const front_crc = this.sio.stop_read_crc(crc_id);

        crc_id = this.sio.start_read_crc();
        const middle = await this.sio.read(header.middle_len);
        const middle_crc = this.sio.stop_read_crc(crc_id);

        crc_id = this.sio.start_read_crc();
        const data = await this.sio.read(header.data_len);
        const data_crc = this.sio.stop_read_crc(crc_id);

        const footer = await this.read_type(T_CEPH_MSG_FOOTER);

        if (front_crc !== footer.front_crc) {
            throw new Error(`BAD_FRONT_CRC ${front_crc} expected ${footer.front_crc} ${front.toString('hex')}`);
        }
        if (middle_crc !== footer.middle_crc) {
            throw new Error(`BAD_MIDDLE_CRC ${middle_crc} expected ${footer.middle_crc}`);
        }
        if (data_crc !== footer.data_crc) {
            throw new Error(`BAD_DATA_CRC ${data_crc} expected ${footer.data_crc}`);
        }
        if (!seq_match(header.seq, this.remote_seq)) {
            throw new Error(`BAD_SEQ ${header.seq} expected ${this.remote_seq}`);
        }
        this.remote_seq = seq_increase(this.remote_seq);
        return { header, front, middle, data, footer };
    }

    send_msg({
        msg_type,
        front_type,
        front_val,
        middle_type,
        middle_val,
        data_type,
        data_val,
        version,
        compat_version,
    }) {
        dbg.log0(`${this.name} send msg ${CEPH_MSG_TYPE_NAME[msg_type]}`, inspect(front_val));

        // prepare header
        const front_len = front_type ? front_type.sizeof(front_val, this.peer_features) : 0;
        const middle_len = middle_type ? middle_type.sizeof(middle_val, this.peer_features) : 0;
        const data_len = data_type ? data_type.sizeof(data_val, this.peer_features) : 0;

        this.write_type(T_CEPH_TAG, CEPH_MSGR_TAG.MSG);
        this.write_type(T_CEPH_MSG_HEADER, {
            seq: this.local_seq,
            tid: 0,
            type: msg_type,
            priority: CEPH_MSG_PRIO.HIGH,
            version: version || 1,
            front_len,
            middle_len,
            data_len,
            data_off: 0,
            src: this.local_entity_name,
            compat_version: compat_version || 1,
            reserved: 0,
        });

        let crc_id = this.sio.start_write_crc();
        if (front_type) this.write_type(front_type, front_val);
        const front_crc = this.sio.stop_write_crc(crc_id);

        crc_id = this.sio.start_write_crc();
        if (middle_type) this.write_type(middle_type, middle_val);
        const middle_crc = this.sio.stop_write_crc(crc_id);

        crc_id = this.sio.start_write_crc();
        if (data_type) this.write_type(data_type, data_val);
        const data_crc = this.sio.stop_write_crc(crc_id);

        this.write_type(T_CEPH_MSG_FOOTER, {
            front_crc,
            middle_crc,
            data_crc,
            sig: 0,
            flags: CEPH_MSG_FOOTER.COMPLETE,
        });

        this.local_seq = seq_increase(this.local_seq);
    }

    async handle_msg_auth({ header, front, middle, data, footer }) {
        const req = await T_CEPH_MSG_AUTH_REQUEST.read_buffer(front);
        if (req.protocol === CEPH_AUTH_TYPE.UNKNOWN) {
            this.handle_auth_unknown(req);
        } else if (req.protocol === CEPH_AUTH_TYPE.CEPHX) {
            this.handle_auth_cephx(req);
        } else {
            throw new Error(`UNKNOWN AUTH PROTOCOL ${req.protocol}`);
        }
    }

    handle_auth_unknown(req) {
        dbg.log0(`${this.name} handle auth (unknown)`, inspect(req));
        // this.send_mon_map();
        this.send_msg({
            msg_type: CEPH_MSG_TYPE.AUTH_REPLY,
            front_type: T_CEPH_MSG_AUTH_REPLY,
            front_val: {
                protocol: CEPH_AUTH_TYPE.NONE,
                result: 0,
                global_id: req.auth_payload.global_id,
                result_payload: { type: T_CEPH_MSG_AUTH_NONE },
                result_msg: '',
            }
        });
    }

    // TODO AUTH CEPHX
    handle_auth_cephx(req) {
        dbg.log0(`${this.name} handle auth (cephx)`, inspect(req));
        this.send_msg({
            msg_type: CEPH_MSG_TYPE.AUTH_REPLY,
            front_type: T_CEPH_MSG_AUTH_REPLY,
            front_val: {
                protocol: CEPH_AUTH_TYPE.CEPHX,
                result: 0,
                global_id: req.auth_payload.global_id,
                result_payload: {
                    type: T_CEPH_MSG_AUTH_REPLY_CEPHX,
                    val: {
                        // TODO AUTH CEPHX
                    }
                },
                result_msg: '',
            }
        });
    }

    async handle_msg_mon_subscribe({ header, front, middle, data, footer }) {
        const type = [
            null,
            null, // T_CEPH_MSG_MON_SUB_REQUEST_V1,
            T_CEPH_MSG_MON_SUB_REQUEST_V2,
            T_CEPH_MSG_MON_SUB_REQUEST_V3
        ][header.version];
        const req = await type.read_buffer(front);
        dbg.log0(`${this.name} handle mon subscribe`, inspect(req));
        if (req.what.monmap) {
            this.send_mon_map(req.what.monmap.start);
        }
        if (req.what.osdmap) {
            this.send_osd_map(req.what.osdmap.start);
        }
        this.send_msg({
            msg_type: CEPH_MSG_TYPE.MON_SUBSCRIBE_ACK,
            front_type: T_CEPH_MSG_MON_SUB_REPLY,
            front_val: {
                interval: 24 * 3600, // 24h
                fsid: this.fsid,
            }
        });
    }

    send_mon_map(start) {
        dbg.log1(`${this.name} send mon map`);
        if (start > 1) return;
        const hostname = os.hostname();
        this.send_msg({
            msg_type: CEPH_MSG_TYPE.MON_MAP,
            front_type: T_CEPH_MSG_MON_MAP,
            front_val: {
                fsid: this.fsid,
                epoch: 1,
                mon_addr: {
                    [hostname]: this.local_entity_addr
                },
                last_changed: timespec(),
                created: timespec(),
                persistent_features: { features: [] },
                optional_features: { features: [] },
                mon_info: { // this superseeds 'mon_addr'
                    [hostname]: {
                        name: hostname,
                        public_addr: this.local_entity_addr,
                        priority: 0,
                    }
                },
            }
        });
    }

    send_osd_map(start) {
        dbg.log1(`${this.name} send osd map`);
        if (start > 1) return;
        const minus_one_64 = [0xffffffff, 0xffffffff];
        this.send_msg({
            msg_type: CEPH_MSG_TYPE.OSD_MAP,
            version: 3,
            compat_version: 3,
            front_type: T_CEPH_MSG_OSD_MAP,
            front_val: {
                fsid: this.fsid,
                incremental_maps: {},
                maps: {
                    1: {
                        client_usable: {
                            fsid: this.fsid,
                            epoch: 1,
                            created: timespec(),
                            modified: timespec(),
                            pools: [{
                                key: 0,
                                val: {
                                    type: 1, // replicated
                                    size: 1,
                                    crush_rule: 0,
                                    object_hash: 2,
                                    pg_num: 64,
                                    pgp_num: 64,
                                    // tell old code that there are no localized pgs.
                                    lpg_num: 0,
                                    lpgp_num: 0,
                                    last_change: 0,
                                    snap_seq: 0,
                                    snap_epoch: 0,
                                    snaps: [],
                                    removed_snaps: [],
                                    auid: 0,
                                    flags: 0,
                                    crash_replay_interval: 0,
                                    min_size: 0,
                                    quota_max_bytes: 0,
                                    quota_max_objects: 0,
                                    tiers: [],
                                    tier_of: minus_one_64,
                                    cache_mode: 0,
                                    read_tier: minus_one_64,
                                    write_tier: minus_one_64,
                                    properties: {},
                                    hit_set_params: {},
                                    hit_set_period: 0,
                                    hit_set_count: 0,
                                    stripe_width: 0,
                                    target_max_bytes: 0,
                                    target_max_objects: 0,
                                    cache_target_dirty_ratio_micro: 0,
                                    cache_target_full_ratio_micro: 0,
                                    cache_min_flush_age: 0,
                                    cache_min_evict_age: 0,
                                    erasure_code_profile: '',
                                    last_force_op_resend_preluminous: 0,
                                    min_read_recency_for_promote: 0,
                                    expected_num_objects: 0,
                                    // version >= 19
                                    cache_target_dirty_high_ratio_micro: 0,
                                    // version >= 20
                                    min_write_recency_for_promote: 0,
                                    // version >= 21
                                    use_gmt_hitset: 1, // bool
                                    // version >= 22
                                    fast_read: 0, // bool
                                    // version >= 23
                                    hit_set_grade_decay_rate: 0,
                                    hit_set_search_last_n: 0,
                                    // version >= 24
                                    opts: {},
                                    // version >= 25
                                    last_force_op_resend: 0,
                                    // version >= 26
                                    application_metadata: {},
                                }
                            }],
                            pool_names: [{
                                key: 0,
                                val: 'noobaa',
                            }],
                            pool_max: 0,
                            flags: 0x00038000,
                            max_osd: 1,
                            osd_state: [3],
                            osd_weight: [65536],
                            osd_addrs: [this.osd_addr],
                            pg_temp: [],
                            primary_temp: [],
                            osd_primary_affinity: [],
                            crush: {
                                buckets: [{
                                    alg: CRUSH_BUCKET_ALG.UNIFORM,
                                    id: -1,
                                    type: CRUSH_BUCKET_TYPE.OSD,
                                    hash: 0,
                                    weight: 0x10000,
                                    items: [],
                                }],
                                rules: [],
                                max_devices: 0,
                                name_info: {
                                    type_map: [],
                                    name_map: [],
                                    rule_name_map: [],
                                },
                                tunables: {
                                    choose_local_tries: 0,
                                    choose_local_fallback_tries: 0,
                                    choose_total_tries: 0,
                                    chooseleaf_descend_once: 0,
                                    chooseleaf_vary_r: 0,
                                    straw_calc_version: 0,
                                    allowed_bucket_algs: 0,
                                    chooseleaf_stable: 0,
                                },
                                luminous: {
                                    class_map: [],
                                    class_name: [],
                                    class_bucket: [],
                                    choose_args: [],
                                },
                            },
                            erasure_code_profiles: {
                                default: {
                                    m: '1',
                                    k: '2',
                                    plugin: 'jerasure',
                                    technique: 'reed_sol_van',
                                }
                            },
                            pg_upmap: [],
                            pg_upmap_items: [],
                            crush_version: 0,
                            new_removed_snaps: [],
                            new_purged_snaps: [],
                        },
                        osd_only: {
                            hb_back_addr: [this.hb_back_addr],
                            osd_info: [{
                                last_clean_begin: 0,
                                last_clean_end: 0,
                                up_from: 0,
                                up_thru: 0,
                                down_at: 0,
                                lost_at: 0,
                            }],
                            blacklist_map: [],
                            cluster_addr: [this.cluster_addr],
                            cluster_snapshot_epoch: 0,
                            cluster_snapshot: '',
                            osd_uuid: [uuid4()],
                            osd_xinfo: [{
                                down_stamp: timespec(),
                                laggy_probability: 0,
                                laggy_interval: 0,
                                features: this.features,
                                old_weight: 0,
                            }],
                            hb_front_addr: [this.hb_front_addr],
                            nearfull_ratio: 0,
                            full_ratio: 0,
                            backfillfull_ratio: 0,
                            require_min_compat_client: 0,
                            require_osd_release: 0,
                            removed_snaps_queue: [],
                        },
                    }
                },
                oldest_map: 1,
                newest_map: 1,
                gap_removed_snaps: [],
            }
        });
    }

    handle_msg_statfs({ header, front, middle, data, footer }) {
        dbg.log0(`${this.name} handle statfs`, inspect(header));
        this.send_msg({
            msg_type: CEPH_MSG_TYPE.STATFS_REPLY,
            front_type: T_CEPH_MSG_STATFS_REPLY,
            front_val: {
                interval: 24 * 3600, // 24h
                fsid: this.fsid,
            }
        });
    }
}


function seq_match(s, t) {
    if (Number.isSafeInteger(s)) {
        return s === t;
    } else {
        return s[0] === t[0] && s[1] === t[1];
    }
}

function seq_increase(seq) {
    if (Number.isSafeInteger(seq) && Number.isSafeInteger(seq + 1)) {
        return seq + 1;
    } else {
        const [high, low] = seq;
        return (low === 0xffffffff) ? [high + 1, 0] : [high, low + 1];
    }
}

function timespec(date = new Date()) {
    const time = date.getTime();
    const tv_sec = Math.floor(time / 1000);
    const tv_nsec = (time % 1000) * 1000000;
    return { tv_sec, tv_nsec };
}

function inspect(x) {
    return util.inspect(x, { color: true, showHidden: true, depth: Infinity, breakLength: Infinity });
}

async function main() {
    const server = net.createServer();
    server.on('listening', () => {
        dbg.log0('Listening on', server.address());
    });
    server.on('connection', socket => {
        const conn = new RadosConn(socket);
        conn.serve();
    });
    server.listen(CEPH_MON_PORT);
}

if (require.main === module) main();
