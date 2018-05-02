/* Copyright (C) 2016 NooBaa */
'use strict';

const _ = require('lodash');
const util = require('util');
const assert = require('assert');
const ip_module = require('ip');

const {
    Type,
    UInt8_Type,
    UInt16LE_Type,
    UInt16BE_Type,
    UInt32LE_Type,
    UInt64LE_Type,
    Int16LE_Type,
    Int32LE_Type,
    Int64LE_Type,
    FloatLE_Type,
    DoubleLE_Type,
    ConstString,
    ConstValue,
    ConstPad,
    BlockPad,
    VarString,
    VarValue,
    VarSwitch,
    VarArray,
    VarMap,
    VarPairMap,
    Struct,
    Versions,
    CrcFooter,
} = require('./rados_types');


// most of these const and struct definitions are from ceph include files (src/include): msgr.h rados.h ceph_fs.h

// default monitor port
const CEPH_MON_PORT = 6789;

// used by message exchange protocol
const CEPH_MSGR_TAG = Object.freeze({
    READY: 1, // server->client: ready for messages
    RESETSESSION: 2, // server->client: reset, try again
    WAIT: 3, // server->client: wait for racing incoming connection
    RETRY_SESSION: 4, // server->client + cseq: try again with higher cseq
    RETRY_GLOBAL: 5, // server->client + gseq: try again with higher gseq
    CLOSE: 6, // closing pipe
    MSG: 7, // message
    ACK: 8, // message ack
    KEEPALIVE: 9, // just a keepalive byte!
    BADPROTOVER: 10, // bad protocol version
    BADAUTHORIZER: 11, // bad authorizer
    FEATURES: 12, // insufficient features
    SEQ: 13, // 64-bit int follows with seen seq number
    KEEPALIVE2: 14,
    KEEPALIVE2_ACK: 15, // keepalive reply
});

const CEPH_MSGR_TAG_NAME = Object.freeze(_.invert(CEPH_MSGR_TAG));

// message types:
const CEPH_MSG_TYPE = Object.freeze({
    // misc
    SHUTDOWN: 1,
    PING: 2,
    // client <-> monitor
    MON_MAP: 4,
    MON_GET_MAP: 5,
    MON_GET_OSDMAP: 6,
    MON_METADATA: 7,
    STATFS: 13,
    STATFS_REPLY: 14,
    MON_SUBSCRIBE: 15,
    MON_SUBSCRIBE_ACK: 16,
    AUTH: 17,
    AUTH_REPLY: 18,
    MON_GET_VERSION: 19,
    MON_GET_VERSION_REPLY: 20,
    // client <-> mds
    MDS_MAP: 21,
    CLIENT_SESSION: 22,
    CLIENT_RECONNECT: 23,
    CLIENT_REQUEST: 24,
    CLIENT_REQUEST_FORWARD: 25,
    CLIENT_REPLY: 26,
    CLIENT_CAPS: 0x310,
    CLIENT_LEASE: 0x311,
    CLIENT_SNAP: 0x312,
    CLIENT_CAPRELEASE: 0x313,
    CLIENT_QUOTA: 0x314,
    // pool ops
    POOLOP_REPLY: 48,
    POOLOP: 49,
    // osd
    OSD_MAP: 41,
    OSD_OP: 42,
    OSD_OPREPLY: 43,
    WATCH_NOTIFY: 44,
    OSD_BACKOFF: 61,
    FS_MAP: 45, // FSMap subscribers (see all MDS clusters at once)
    FS_MAP_USER: 103, // FSMapUser subscribers (get MDS clusters name->ID mapping)
});

const CEPH_MSG_TYPE_NAME = Object.freeze(_.invert(CEPH_MSG_TYPE));

const CEPH_MSG_PRIO = Object.freeze({
    LOW: 64,
    DEFAULT: 127,
    HIGH: 196,
    HIGHEST: 255,
});

const CEPH_MSG_FOOTER = Object.freeze({
    COMPLETE: 1, // msg wasn't aborted
    NOCRC: 2, // no data crc
    SIGNED: 4, // msg was signed
});

const CEPH_MSG_CONNECT = Object.freeze({
    LOSSY: 1, // messages i send may be safely dropped
});

const CEPH_ENTITY_TYPE = Object.freeze({
    MON: 0x01,
    MDS: 0x02,
    OSD: 0x04,
    CLIENT: 0x08,
    MGR: 0x10,
    AUTH: 0x20,
    ANY: 0xFF,
});

// auth
const CEPH_AUTH_TYPE = Object.freeze({
    UNKNOWN: 0x0,
    NONE: 0x1,
    CEPHX: 0x2,
});

// features
const CEPH_FEATURES = Object.freeze({
    UID: 0,
    NOSRCADDR: 1,
    RETIRED_MONCLOCKCHECK: 2,
    SERVER_NAUTILUS: 2,
    FLOCK: 3,
    SUBSCRIBE2: 4,
    MONNAMES: 5,
    RECONNECT_SEQ: 6,
    DIRLAYOUTHASH: 7,
    OBJECTLOCATOR: 8,
    PGID64: 9,
    INCSUBOSDMAP: 10,
    PGPOOL3: 11,
    OSDREPLYMUX: 12,
    OSDENC: 13,
    RETIRED_OMAP: 14,
    SERVER_KRAKEN: 14,
    MONENC: 15,
    RETIRED_QUERY_T: 16,
    SERVER_O: 16,
    RETIRED_INDEP_PG_MAP: 17,
    OS_PERF_STAT_NS: 17,
    CRUSH_TUNABLES: 18,
    RETIRED_CHUNKY_SCRUB: 19,
    RETIRED_MON_NULLROUTE: 20,
    RETIRED_MON_GV: 21,
    SERVER_LUMINOUS: 21,
    RESEND_ON_SPLIT: 21, // overlap
    RADOS_BACKOFF: 21, // overlap
    OSDMAP_PG_UPMAP: 21, // overlap
    CRUSH_CHOOSE_ARGS: 21, // overlap
    RETIRED_BACKFILL_RESERVATION: 22,
    MSG_AUTH: 23,
    RETIRED_RECOVERY_RESERVATION: 24,
    RECOVERY_RESERVATION_2: 24,
    CRUSH_TUNABLES2: 25,
    CREATEPOOLID: 26,
    REPLY_CREATE_INODE: 27,
    RETIRED_OSD_HBMSGS: 28,
    SERVER_MIMIC: 28,
    MDSENC: 29,
    OSDHASHPSPOOL: 30,
    MON_SINGLE_PAXOS: 31, // deprecate me
    RETIRED_OSD_SNAPMAPPER: 32,
    RETIRED_MON_SCRUB: 33,
    RETIRED_OSD_PACKED_RECOVERY: 34,
    OSD_CACHEPOOL: 35,
    CRUSH_V2: 36,
    EXPORT_PEER: 37,
    DEPRECATED_OSD_ERASURE_CODES: 38,
    OSDMAP_ENC: 39,
    MDS_INLINE_DATA: 40,
    CRUSH_TUNABLES3: 41,
    OSD_PRIMARY_AFFINITY: 41, // overlap
    MSGR_KEEPALIVE2: 42,
    OSD_POOLRESEND: 43,
    DEPRECATED_ERASURE_CODE_PLUGINS_V2: 44,
    RETIRED_OSD_SET_ALLOC_HINT: 45,
    OSD_FADVISE_FLAGS: 46,
    RETIRED_OSD_REPOP: 46, // overlap
    RETIRED_OSD_OBJECT_DIGEST: 46, // overlap
    RETIRED_OSD_TRANSACTION_MAY_LAYOUT: 46, // overlap
    MDS_QUOTA: 47,
    CRUSH_V4: 48,
    RETIRED_OSD_MIN_SIZE_RECOVERY: 49,
    RETIRED_OSD_PROXY_FEATURES: 49, // overlap
    DEPRECATED_MON_METADATA: 50,
    DEPRECATED_OSD_BITWISE_HOBJ_SORT: 51,
    DEPRECATED_OSD_PROXY_WRITE_FEATURES: 52,
    DEPRECATED_ERASURE_CODE_PLUGINS_V3: 53,
    DEPRECATED_OSD_HITSET_GMT: 54,
    DEPRECATED_HAMMER_0_94_4: 55,
    NEW_OSDOP_ENCODING: 56,
    MON_STATEFUL_SUB: 57,
    DEPRECATED_MON_ROUTE_OSDMAP: 57, // overlap
    SERVER_JEWEL: 57, // overlap
    CRUSH_TUNABLES5: 58,
    NEW_OSDOPREPLY_ENCODING: 58, // overlap
    FS_FILE_LAYOUT_V2: 58, // overlap
    FS_BTIME: 59,
    FS_CHANGE_ATTR: 59, // overlap
    MSG_ADDR2: 59, // overlap
    OSD_RECOVERY_DELETES: 60, // *do not share this bit*
    RESERVED2: 61, // unused, but slow down!
    RESERVED: 62, // do not use; used as a sentinal
    DEPRECATED_RESERVED_BROKEN: 63, // client-facing
});

const CRUSH_BUCKET_ALG = Object.freeze({
    UNIFORM: 1,
    LIST: 2,
    TREE: 3,
    STRAW: 4,
    STRAW2: 5,
});

const CRUSH_BUCKET_TYPE = Object.freeze({
    OSD: 0,
    HOST: 1,
    CHASSIS: 2,
    RACK: 3,
    ROW: 4,
    PDU: 5,
    POD: 6,
    ROOM: 7,
    DATACENTER: 8,
    REGION: 9,
    ROOT: 10,
});


/////////////////////
// PRIMITIVE TYPES //
/////////////////////


const T_U8 = new UInt8_Type({ name: 'T_U8' });

// const T_S8 = new Int8_Type({ name: 'T_S8' });

const T_U16LE = new UInt16LE_Type({ name: 'T_U16LE' });
const T_U32LE = new UInt32LE_Type({ name: 'T_U32LE' });
const T_U64LE = new UInt64LE_Type({ name: 'T_U64LE' });

const T_S16LE = new Int16LE_Type({ name: 'T_S16LE' });
const T_S32LE = new Int32LE_Type({ name: 'T_S32LE' });
const T_S64LE = new Int64LE_Type({ name: 'T_S64LE' });

const T_U16BE = new UInt16BE_Type({ name: 'T_U16BE' });
// const T_U32BE = new UInt32BE_Type({ name: 'T_U32BE' });
// const T_U64BE = new UInt64BE_Type({ name: 'T_U64BE' });

// const T_S16BE = new Int16BE_Type({ name: 'T_S16BE' });
// const T_S32BE = new Int32BE_Type({ name: 'T_S32BE' });
// const T_S64BE = new Int64BE_Type({ name: 'T_S64BE' });

const T_FLOAT_LE = new FloatLE_Type({ name: 'T_FLOAT_LE' });
const T_DOUBLE_LE = new DoubleLE_Type({ name: 'T_DOUBLE_LE' });

// const T_FLOAT_BE = new FloatBE_Type({ name: 'T_FLOAT_BE' });
// const T_DOUBLE_BE = new DoubleBE_Type({ name: 'T_DOUBLE_BE' });

const T_STRING = new VarString({ name: 'T_STRING' });

// const T_OPAQUE = new VarBuffer({ name: 'T_OPAQUE' });


//////////////////
// COMMON TYPES //
//////////////////


const T_IP_V4 = new Type({
    name: 'T_IP_V4',
    size: 4,
    write(io, val, features) {
        if (val.startsWith('::ffff:')) val = val.slice(7);
        io.writeUInt32BE(ip_module.toLong(val));
    },
    async read(io) {
        return ip_module.fromLong(await io.readUInt32BE());
    }
});

// const T_IP_V6 = new Type({
//     name: 'T_IP_V6',
//     size: 16,
//     write(io, val, features) {
//         const buf = ip_module.toBuffer(val);
//         assert.strictEqual(buf.length, this.size);
//         io.write(buf);
//     },
//     async read(io) {
//         const buf = await io.read(this.size);
//         return ip_module.toString(buf);
//     }
// });

const T_UUID = new Type({
    name: 'T_UUID',
    size: 16,
    write(io, val, features) {
        const buf = Buffer.from(val.replace(/-/g, ''), 'hex');
        assert.strictEqual(buf.length, this.size);
        io.write(buf);
    },
    async read(io) {
        const buf = await io.read(this.size);
        const hex = buf.toString('hex');
        return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
    }
});

// from /usr/include/bits/socket.h
const T_AF_INET = new ConstValue({ name: 'AF_INET', type: T_U16BE, val: 2 });
// const T_AF_INET6 = new ConstValue({ name: 'AF_INET6', type: T_U16BE, val: 10 });


////////////////
// CEPH TYPES //
////////////////


const T_CEPH_TAG = new UInt8_Type({
    name: 'T_CEPH_TAG',
    inspect(val) {
        return CEPH_MSGR_TAG_NAME[val] || `<UNKNONWN-TAG-${val}>`;
    }
});

const T_CEPH_SEQ = new UInt64LE_Type({ name: 'T_CEPH_SEQ' });
const T_CEPH_FSID = T_UUID;
const T_CEPH_EPOCH = new UInt32LE_Type({ name: 'T_CEPH_EPOCH' });
const T_CEPH_BANNER = new ConstString({ name: 'T_CEPH_BANNER', str: 'ceph v027', encoding: 'ascii' });

const T_CEPH_FEATURES = new Type({
    name: 'T_CEPH_FEATURES',
    size: 8,
    write(io, val, features) {
        /* eslint-disable no-bitwise */
        let f0 = 0;
        let f1 = 0;
        for (const bit of val) {
            if (bit < 32) {
                f0 |= 1 << bit;
            } else if (bit < 64) {
                f1 |= 1 << (bit - 32);
            } else {
                throw new Error(`BAD FEATURE BIT ${bit}`);
            }
        }
        f0 >>>= 0;
        f1 >>>= 0;
        io.writeUInt32LE(f0);
        io.writeUInt32LE(f1);
        return 8;
    },
    async read(io) {
        /* eslint-disable no-bitwise */
        const features = [];
        let f0 = await io.readUInt32LE();
        let f1 = await io.readUInt32LE();
        for (let i = 0; i < 32; ++i) {
            if (f0 & 1) features.push(i);
            if (f1 & 1) features.push(i + 32);
            f0 >>>= 1;
            f1 >>>= 1;
        }
        features.sort(((a, b) => a - b));
        features[util.inspect.custom] = function() {
            return JSON.stringify(this);
        };
        return features;
    }
});

const T_CEPH_TIMESPEC = new Struct({
    name: 'T_CEPH_TIMESPEC',
    fields: {
        tv_sec: T_U32LE,
        tv_nsec: T_U32LE,
    }
});

const T_CEPH_SOCKADDR_NO_PAD = new Struct({
    name: 'T_CEPH_SOCKADDR_NO_PAD',
    fields: {
        family: T_AF_INET,
        port: T_U16BE,
        ip: T_IP_V4,
    }
});

const T_CEPH_SOCKADDR = new BlockPad({
    name: 'T_CEPH_SOCKADDR',
    size: 128,
    type: T_CEPH_SOCKADDR_NO_PAD
});

const T_CEPH_ENTITY_NAME = new Struct({
    name: 'T_CEPH_ENTITY_NAME',
    fields: {
        type: T_U8, // CEPH_ENTITY_TYPE_*
        num: T_U64LE,
    }
});

const T_CEPH_ENTITY_ADDR1 = new Struct({
    name: 'T_CEPH_ENTITY_ADDR1',
    fields: {
        nonce: T_U32LE, // unique id for process (e.g. pid)
        addr: T_CEPH_SOCKADDR,
    }
});

const T_CEPH_ENTITY_ADDR2 = new Versions({
    name: 'T_CEPH_ENTITY_ADDR2',
    version: 1,
    compat_version: 1,
    versions: {
        1: new Struct({
            name: 'T_CEPH_ENTITY_ADDR2_V1',
            fields: {
                type: T_U32LE,
                nonce: T_U32LE, // unique id for process (e.g. pid)
                addr: T_CEPH_SOCKADDR,
            }
        }),
    }
});

const T_CEPH_ENTITY_ADDR = new Type({
    name: 'T_CEPH_ENTITY_ADDR',
    sizeof(val, features) {
        if (features.includes(CEPH_FEATURES.MSG_ADDR2)) {
            return T_CEPH_ENTITY_ADDR2.sizeof(val) + 1;
        } else {
            return T_CEPH_ENTITY_ADDR1.sizeof(val) + 4;
        }
    },
    write(io, val, features) {
        if (features.includes(CEPH_FEATURES.MSG_ADDR2)) {
            return io.writeUInt8(1) + T_CEPH_ENTITY_ADDR2.write(io, val, features);
        } else {
            return io.writeUInt32LE(0) + T_CEPH_ENTITY_ADDR1.write(io, val, features);
        }
    },
    async read(io) {
        const marker = await io.readUInt8();
        if (marker === 0) {
            await io.readUInt8();
            await io.readUInt16LE();
            return T_CEPH_ENTITY_ADDR1.read(io);
        } else if (marker === 1) {
            return T_CEPH_ENTITY_ADDR2.read(io);
        } else {
            throw new Error(`T_CEPH_ENTITY_ADDR BAD MARKER ${marker}`);
        }
    },
});

const T_CEPH_ENTITY_INST = new Struct({
    name: 'T_CEPH_ENTITY_INST',
    fields: {
        name: T_CEPH_ENTITY_NAME,
        addr: T_CEPH_ENTITY_ADDR,
    }
});


////////////
// ACCEPT //
////////////


const T_CEPH_MSG_ACCEPT_REQUEST = new Struct({
    name: 'T_CEPH_MSG_ACCEPT_REQUEST',
    fields: {
        banner: T_CEPH_BANNER,
        server: T_CEPH_ENTITY_ADDR,
        client: T_CEPH_ENTITY_ADDR,
    }
});

const T_CEPH_MSG_ACCEPT_REPLY = new Struct({
    name: 'T_CEPH_MSG_ACCEPT_REPLY',
    fields: {
        banner: T_CEPH_BANNER,
        client: T_CEPH_ENTITY_ADDR,
    }
});


/////////////
// CONNECT //
/////////////


const T_CEPH_MSG_CONNECT_REQUEST = new Struct({
    name: 'T_CEPH_MSG_CONNECT_REQUEST',
    fields: {
        features: T_CEPH_FEATURES, // supported feature bits
        host_type: T_U32LE, // CEPH_ENTITY_TYPE_*
        global_seq: T_U32LE, // count connections initiated by this host
        connect_seq: T_U32LE, // count connections initiated in this session
        protocol_version: T_U32LE,
        authorizer_protocol: T_U32LE,
        authorizer_len: T_U32LE,
        flags: T_U8, // CEPH_MSG_CONNECT_*
    }
});

const T_CEPH_MSG_CONNECT_REPLY = new Struct({
    name: 'T_CEPH_MSG_CONNECT_REPLY',
    fields: {
        tag: T_U8,
        features: T_CEPH_FEATURES, // feature bits for this session
        global_seq: T_U32LE,
        connect_seq: T_U32LE,
        protocol_version: T_U32LE,
        authorizer_len: T_U32LE,
        flags: T_U8,
    }
});


/////////////
// MESSAGE //
/////////////

const T_CEPH_MSG_TYPE = new UInt16LE_Type({
    name: 'T_CEPH_MSG_TYPE',
    inspect(val) {
        return CEPH_MSG_TYPE_NAME[val] || `<UNKNOWN-MSG-TYPE-${val}`;
    }
});

const T_CEPH_MSG_HEADER = new CrcFooter({
    name: 'T_CEPH_MSG_HEADER',
    type: new Struct({
        fields: {
            seq: T_U64LE, // message seq# for this session
            tid: T_U64LE, // transaction id
            type: T_CEPH_MSG_TYPE, // message type
            priority: T_U16LE, // priority.  higher value == higher priority
            version: T_U16LE, // version of message encoding
            front_len: T_U32LE, // bytes in main payload
            middle_len: T_U32LE, // bytes in middle payload
            data_len: T_U32LE, // bytes of data payload
            data_off: T_U16LE,
            // sender: include full offset
            // receiver: mask against ~PAGE_MASK
            src: T_CEPH_ENTITY_NAME,
            // oldest code we think can decode this. unknown if zero.
            compat_version: T_U16LE,
            reserved: T_U16LE,
            // not including the CRC in the struct since we encode it manually by CrcFooter
            // crc: T_U32LE, // header crc32c
        }
    })
});

// footer follows data payload
const T_CEPH_MSG_FOOTER = new Struct({
    name: 'T_CEPH_MSG_FOOTER',
    fields: {
        front_crc: T_U32LE,
        middle_crc: T_U32LE,
        data_crc: T_U32LE,
        // sig holds the 64 bits of the digital signature for the message PLR
        sig: T_U64LE,
        flags: T_U8,
    }
});

const T_CEPH_MSG_HEADER_OLD = new CrcFooter({
    name: 'T_CEPH_MSG_HEADER_OLD',
    type: new Struct({
        fields: {
            seq: T_U64LE, // message seq# for this session
            tid: T_U64LE, // transaction id
            type: T_CEPH_MSG_TYPE, // message type
            priority: T_U16LE, // priority.  higher value == higher priority
            version: T_U16LE, // version of message encoding
            front_len: T_U32LE, // bytes in main payload
            middle_len: T_U32LE, // bytes in middle payload
            data_len: T_U32LE, // bytes of data payload
            data_off: T_U16LE,
            // sender: include full offset
            // receiver: mask against ~PAGE_MASK
            src: T_CEPH_ENTITY_INST,
            orig_src: T_CEPH_ENTITY_INST,
            reserved: T_U32LE,
            // not including the CRC in the struct since we encode it manually
            // crc: T_U32LE, // header crc32c
        }
    })
});

// ceph_msg_footer_old does not support digital signatures on messages PLR
const T_CEPH_MSG_FOOTER_OLD = new Struct({
    name: 'T_CEPH_MSG_FOOTER_OLD',
    fields: {
        front_crc: T_U32LE,
        middle_crc: T_U32LE,
        data_crc: T_U32LE,
        flags: T_U8,
    }
});


//////////
// AUTH //
//////////


const T_CEPH_MSG_AUTH_UNKNOWN = new VarValue({
    name: 'T_CEPH_MSG_AUTH_UNKNOWN',
    type: new Struct({
        fields: {
            struct_v: new ConstValue({ type: T_U8, val: 1 }),
            auth_supported: new VarArray({ type: T_U32LE }),
            entity_name_type: T_U32LE,
            entity_name_id: T_STRING,
            global_id: T_U64LE,
        }
    })
});

const T_CEPH_MSG_AUTH_NONE = new VarValue({
    name: 'T_CEPH_AUTH_NONE',
    type: new ConstPad({ size: 0 })
});

const T_CEPH_MSG_AUTH_CEPHX = new VarValue({
    name: 'T_CEPH_MSG_AUTH_CEPHX',
    type: new Struct({
        fields: {
            // TODO CEPHX AUTH
        }
    })
});

const T_CEPH_MSG_AUTH_REPLY_CEPHX = new VarValue({
    name: 'T_CEPH_MSG_AUTH_REPLY_CEPHX',
    type: new Struct({
        fields: {
            // TODO CEPHX AUTH
        }
    })
});

const T_CEPH_MSG_AUTH_REQUEST = new Struct({
    name: 'T_CEPH_MSG_AUTH_REQUEST',
    fields: {
        paxos_version: T_U64LE,
        paxos_deprecated_session_mon: T_S16LE,
        paxos_deprecated_session_mon_tid: T_U64LE,
        protocol: T_U32LE,
        auth_payload: new VarSwitch({
            name: 'T_CEPH_AUTH_PAYLOAD',
            switch: 'protocol',
            cases: {
                [CEPH_AUTH_TYPE.UNKNOWN]: T_CEPH_MSG_AUTH_UNKNOWN,
                [CEPH_AUTH_TYPE.NONE]: T_CEPH_MSG_AUTH_NONE,
                [CEPH_AUTH_TYPE.CEPHX]: T_CEPH_MSG_AUTH_CEPHX,
            }
        }),
        monmap_epoch: T_CEPH_EPOCH,
    }
});

const T_CEPH_MSG_AUTH_REPLY = new Struct({
    name: 'T_CEPH_MSG_AUTH_REPLY',
    fields: {
        protocol: T_U32LE,
        result: T_U32LE,
        global_id: T_U64LE,
        result_payload: new VarSwitch({
            name: 'T_CEPH_AUTH_RESULT_PAYLOAD',
            switch: 'protocol',
            cases: {
                [CEPH_AUTH_TYPE.NONE]: T_CEPH_MSG_AUTH_NONE,
                [CEPH_AUTH_TYPE.CEPHX]: T_CEPH_MSG_AUTH_REPLY_CEPHX,
            }
        }),
        result_msg: T_STRING,
    }
});


/////////////
// MON MAP //
/////////////


const T_CEPH_MON_FEATURE = new Versions({
    name: 'T_CEPH_MON_FEATURE',
    version: 1,
    compat_version: 1,
    versions: {
        1: new Struct({
            name: 'T_CEPH_MON_FEATURE_V1',
            fields: {
                features: T_CEPH_FEATURES,
            }
        }),
    }
});

const T_CEPH_MON_INFO = new Versions({
    name: 'T_CEPH_MON_INFO',
    version: 2,
    compat_version: 2,
    versions: {
        2: new Struct({
            name: 'T_CEPH_MON_INFO_V2',
            fields: {
                name: T_STRING,
                public_addr: T_CEPH_ENTITY_ADDR,
                priority: T_U16LE,
            }
        }),
    }
});

const T_CEPH_MON_ADDR_MAP = new VarMap({ name: 'T_CEPH_MON_ADDR_MAP', key_type: T_STRING, val_type: T_CEPH_ENTITY_ADDR });
const T_CEPH_MON_INFO_MAP = new VarMap({ name: 'T_CEPH_MON_INFO_MAP', key_type: T_STRING, val_type: T_CEPH_MON_INFO });

const T_CEPH_MON_MAP = new Versions({
    name: 'T_CEPH_MON_MAP',
    version: 5,
    compat_version: 3,
    versions: {
        3: new Struct({
            name: 'T_CEPH_MON_MAP_V3',
            fields: {
                fsid: T_CEPH_FSID,
                epoch: T_CEPH_EPOCH,
                mon_addr: T_CEPH_MON_ADDR_MAP,
                last_changed: T_CEPH_TIMESPEC,
                created: T_CEPH_TIMESPEC,
            }
        }),
        4: new Struct({
            name: 'T_CEPH_MON_MAP_V4',
            fields: {
                fsid: T_CEPH_FSID,
                epoch: T_CEPH_EPOCH,
                mon_addr: T_CEPH_MON_ADDR_MAP,
                last_changed: T_CEPH_TIMESPEC,
                created: T_CEPH_TIMESPEC,
                persistent_features: T_CEPH_MON_FEATURE,
                optional_features: T_CEPH_MON_FEATURE,
            }
        }),
        5: new Struct({
            name: 'T_CEPH_MON_MAP_V5',
            fields: {
                fsid: T_CEPH_FSID,
                epoch: T_CEPH_EPOCH,
                mon_addr: T_CEPH_MON_ADDR_MAP,
                last_changed: T_CEPH_TIMESPEC,
                created: T_CEPH_TIMESPEC,
                persistent_features: T_CEPH_MON_FEATURE,
                optional_features: T_CEPH_MON_FEATURE,
                mon_info: T_CEPH_MON_INFO_MAP, // this superseeds 'mon_addr'
            }
        }),
    }
});

const T_CEPH_MSG_MON_MAP = new VarValue({ name: 'T_CEPH_MSG_MON_MAP', type: T_CEPH_MON_MAP });


/////////////
// OSD MAP //
/////////////

const T_CEPH_SNAPID = new UInt64LE_Type({ name: 'T_CEPH_SNAPID' });

const T_CEPH_PGID = new Struct({
    name: 'T_CEPH_PGID',
    fields: {
        v: new ConstValue({ type: T_U8, val: 1 }),
        pool: T_U64LE,
        seed: T_U32LE,
        preferred_deprecated: new ConstValue({ type: T_U32LE, val: -1 >>> 0 }),
    }
});

const T_CEPH_SNAP_INFO = new Struct({
    name: 'T_CEPH_SNAP_INFO',
    fields: {
        // TODO T_CEPH_SNAP_INFO
    }
});

const T_CEPH_SNAP_INFO_MAP = new VarPairMap({
    name: 'T_CEPH_SNAP_INFO_MAP',
    key_type: T_CEPH_SNAPID,
    val_type: T_CEPH_SNAP_INFO,
});

const T_CEPH_SNAP_INTERVAL_SET = new VarPairMap({
    name: 'T_CEPH_SNAP_INTERVAL_SET',
    key_type: T_CEPH_SNAPID,
    val_type: T_CEPH_SNAPID,
});

const T_CEPH_SNAP_MAP = new VarPairMap({
    name: 'T_CEPH_SNAP_MAP',
    key_type: T_S64LE,
    val_type: T_CEPH_SNAP_INTERVAL_SET,
});

const T_CEPH_PG_DATA_SINGLE = new VarPairMap({
    name: 'T_CEPH_PG_DATA_SINGLE',
    key_type: T_CEPH_PGID,
    val_type: T_S32LE,
});

const T_CEPH_PG_DATA_ARR = new VarPairMap({
    name: 'T_CEPH_PG_DATA_ARR',
    key_type: T_CEPH_PGID,
    val_type: new VarArray({ type: T_S32LE })
});

const T_CEPH_PG_DATA_MAP = new VarPairMap({
    name: 'T_CEPH_PG_DATA_MAP',
    key_type: T_CEPH_PGID,
    val_type: new VarPairMap({ key_type: T_S32LE, val_type: T_S32LE }),
});

const T_CEPH_HIT_SET_PARAMS = new Versions({
    name: 'T_CEPH_HIT_SET_PARAMS',
    version: 1,
    compat_version: 1,
    versions: {
        1: new Struct({
            fields: {
                type: new ConstValue({ type: T_U8, val: 0 }),
            }
        })
    }
});

const T_CEPH_STRING_MAP_X2 = new VarMap({
    name: 'T_CEPH_STRING_MAP_X2',
    key_type: T_STRING,
    val_type: new VarMap({ key_type: T_STRING, val_type: T_STRING })
});

const T_CEPH_POOL_OPT_VALUE = new Struct({
    name: 'T_CEPH_POOL_OPT_VALUE',
    fields: {
        type: T_S32LE,
        val: new VarSwitch({
            switch: 'type',
            cases: {
                0: T_STRING,
                1: T_S32LE,
                2: T_DOUBLE_LE,
            }
        })
    }
});

const T_CEPH_POOL_OPTS = new Versions({
    name: 'T_CEPH_POOL_OPTS',
    version: 1,
    compat_version: 1,
    versions: {
        1: new VarMap({ key_type: T_S32LE, val_type: T_CEPH_POOL_OPT_VALUE })
    }
});

Symbol(T_CEPH_POOL_OPTS); // fake usage for unused const

const T_CEPH_PG_POOL = new Versions({
    name: 'T_CEPH_PG_POOL',
    version: 21,
    compat_version: 5,
    versions: {
        21: new Struct({
            name: 'T_CEPH_PG_POOL_V21',
            fields: {
                type: T_U8,
                size: T_U8,
                crush_rule: T_U8,
                object_hash: T_U8,
                pg_num: T_U32LE,
                pgp_num: T_U32LE,
                // tell old code that there are no localized pgs.
                lpg_num: T_U32LE,
                lpgp_num: T_U32LE,
                last_change: T_CEPH_EPOCH,
                snap_seq: T_CEPH_SNAPID,
                snap_epoch: T_CEPH_EPOCH,
                snaps: T_CEPH_SNAP_INFO_MAP,
                removed_snaps: T_CEPH_SNAP_INTERVAL_SET,
                auid: T_U64LE,
                flags: T_U64LE,
                crash_replay_interval: T_U32LE,
                min_size: T_U8,
                quota_max_bytes: T_U64LE,
                quota_max_objects: T_U64LE,
                tiers: new VarArray({ type: T_U64LE }),
                tier_of: T_S64LE,
                cache_mode: T_U8,
                read_tier: T_S64LE,
                write_tier: T_S64LE,
                properties: new VarMap({ key_type: T_STRING, val_type: T_STRING }),
                hit_set_params: T_CEPH_HIT_SET_PARAMS,
                hit_set_period: T_U32LE,
                hit_set_count: T_U32LE,
                stripe_width: T_U32LE,
                target_max_bytes: T_U64LE,
                target_max_objects: T_U64LE,
                cache_target_dirty_ratio_micro: T_U32LE,
                cache_target_full_ratio_micro: T_U32LE,
                cache_min_flush_age: T_U32LE,
                cache_min_evict_age: T_U32LE,
                erasure_code_profile: T_STRING,
                last_force_op_resend_preluminous: T_CEPH_EPOCH,
                min_read_recency_for_promote: T_U32LE,
                expected_num_objects: T_U64LE,
                // version >= 19
                cache_target_dirty_high_ratio_micro: T_U32LE,
                // version >= 20
                min_write_recency_for_promote: T_U32LE,
                // version >= 21
                use_gmt_hitset: T_U8, // bool
                // // version >= 22
                // fast_read: T_U8, // bool
                // // version >= 23
                // hit_set_grade_decay_rate: T_U32LE,
                // hit_set_search_last_n: T_U32LE,
                // // version >= 24
                // opts: T_CEPH_POOL_OPTS,
                // // version >= 25
                // last_force_op_resend: T_CEPH_EPOCH,
                // // version >= 26
                // application_metadata: T_CEPH_STRING_MAP_X2,
            }
        }),
    },
    write(io, val, features) {
        if (!features.includes(CEPH_FEATURES.NEW_OSDOP_ENCODING)) {
            // this was the first post-hammer thing we added; if it's missing, encode
            // like hammer.
            val.version = 21;
        } else if (!features.includes(CEPH_FEATURES.SERVER_LUMINOUS)) {
            val.version = 24;
        }
        Versions.prototype.write.call(this, io, val, features);
    }
});

const T_CEPH_POOL_ID = new Int64LE_Type({ name: 'T_CEPH_POOL_ID' });

const T_CEPH_CRUSH_BUCKET = new Type({
    name: 'T_CEPH_CRUSH_BUCKET',
    write(io, val, features) {
        io.writeUInt32LE(val.alg); // CRUSH_BUCKET_ALG.*
        if (!val.alg) return;
        io.writeInt32LE(val.id);
        io.writeUInt16LE(val.type); // CRUSH_BUCKET_TYPE.*
        io.writeUInt8(val.alg);
        io.writeUInt8(val.hash);
        io.writeUInt32LE(val.weight);
        io.writeUInt32LE(val.items.length);
        for (const item of val.items) {
            io.writeInt32LE(item);
        }
        switch (val.alg) {
            case CRUSH_BUCKET_ALG.UNIFORM:
                io.writeUInt32LE(val.item_weight);
                break;
            case CRUSH_BUCKET_ALG.LIST:
                for (let i = 0; i < val.items.length; ++i) {
                    io.writeUInt32LE(val.item_weights[i]);
                    io.writeUInt32LE(val.sum_weights[i]);
                }
                break;
            case CRUSH_BUCKET_ALG.TREE:
                io.writeUInt8(val.num_nodes);
                for (let i = 0; i < val.num_nodes; ++i) {
                    io.writeUInt32LE(val.node_weights[i]);
                }
                break;
            case CRUSH_BUCKET_ALG.STRAW:
                for (let i = 0; i < val.items.length; ++i) {
                    io.writeUInt32LE(val.item_weights[i]);
                    io.writeUInt32LE(val.straws[i]);
                }
                break;
            case CRUSH_BUCKET_ALG.STRAW2:
                for (let i = 0; i < val.items.length; ++i) {
                    io.writeUInt32LE(val.item_weights[i]);
                }
                break;
            default:
                throw new Error(`CRUSH BUCKET BAD ALG ${val.alg}`);
        }
    },
    async read(io) {
        assert.fail('TODO T_CEPH_CRUSH_BUCKET.read()');
    },
});

const T_CEPH_CRUSH_RULE = new Type({
    name: 'T_CEPH_CRUSH_RULE',
    write(io, val, features) {
        if (!val || val.disabled) {
            io.writeUInt32LE(0);
            return;
        }
        io.writeUInt32LE(1);
        io.writeUInt32LE(val.steps.length);
        io.writeUInt8(val.mask.ruleset);
        io.writeUInt8(val.mask.type);
        io.writeUInt8(val.mask.min_size);
        io.writeUInt8(val.mask.max_size);
        for (const step of val.steps) {
            io.writeUInt32LE(step.op);
            io.writeInt32LE(step.arg1);
            io.writeInt32LE(step.arg2);
        }
    },
    async read(io) {
        assert.fail('TODO T_CEPH_CRUSH_RULE.read()');
    }
});

const T_CEPH_CRUSH_HEADER = new Struct({
    name: 'T_CEPH_CRUSH_HEADER',
    fields: {
        crush_magic: new ConstValue({ type: T_U32LE, val: 0x00010000 }),
        max_buckets: T_S32LE,
        max_rules: T_U32LE,
        max_devices: T_S32LE,
    }
});

const T_CEPH_CRUSH_NAME_INFO_MAP = new VarMap({
    name: 'T_CEPH_CRUSH_NAME_INFO_MAP',
    key_type: T_S32LE,
    val_type: T_STRING
});

const T_CEPH_CRUSH_NAME_INFO = new Struct({
    name: 'T_CEPH_CRUSH_NAME_INFO',
    fields: {
        type_map: T_CEPH_CRUSH_NAME_INFO_MAP,
        name_map: T_CEPH_CRUSH_NAME_INFO_MAP,
        rule_name_map: T_CEPH_CRUSH_NAME_INFO_MAP,
    }
});

const T_CEPH_CRUSH_TUNABLES = new Struct({
    name: 'T_CEPH_CRUSH_TUNABLES',
    fields: {
        choose_local_tries: T_U32LE,
        choose_local_fallback_tries: T_U32LE,
        choose_total_tries: T_U32LE,
        chooseleaf_descend_once: T_U32LE,
        chooseleaf_vary_r: T_U8,
        straw_calc_version: T_U8,
        allowed_bucket_algs: T_U32LE,
    }
});

const T_CEPH_CRUSH_LUMINOUS = new Struct({
    name: 'T_CEPH_CRUSH_LUMINOUS',
    fields: {
        class_map: new VarMap({ key_type: T_S32LE, val_type: T_S32LE }),
        class_name: new VarMap({ key_type: T_S32LE, val_type: T_STRING }),
        class_bucket: new VarMap({ key_type: T_S32LE, val_type: new VarMap({ key_type: T_S32LE, val_type: T_S32LE }) }),
        choose_args: new VarArray({ type: T_STRING }), // TODO choose_args
        //     // choose args
        //     __u32 size = (__u32)choose_args.size();
        //     encode(size, bl);
        //     for (auto c : choose_args) {
        //          encode(c.first, bl);
        //          crush_choose_arg_map arg_map = c.second;
        //          size = 0;
        //          for (__u32 i = 0; i < arg_map.size; i++) {
        //              crush_choose_arg *arg = &arg_map.args[i];
        //              if (arg->weight_set_size == 0 && arg->ids_size == 0) continue;
        //              size++;
        //          }
        //          encode(size, bl);
        //          for (__u32 i = 0; i < arg_map.size; i++) {
        //              crush_choose_arg *arg = &arg_map.args[i];
        //              if (arg->weight_set_size == 0 && arg->ids_size == 0) continue;
        //              encode(i, bl);
        //              encode(arg->weight_set_size, bl);
        //              for (__u32 j = 0; j < arg->weight_set_size; j++) {
        //                  crush_weight_set *weight_set = &arg->weight_set[j];
        //                  encode(weight_set->size, bl);
        //                  for (__u32 k = 0; k < weight_set->size; k++) encode(weight_set->weights[k], bl);
        //              }
        //              encode(arg->ids_size, bl);
        //              for (__u32 j = 0; j < arg->ids_size; j++) encode(arg->ids[j], bl);
        //          }
        //     }
    }
});

const T_CEPH_CRUSH = new Type({
    name: 'T_CEPH_CRUSH',
    write(io, val, features) {
        const header = {
            max_buckets: val.buckets.length,
            max_rules: val.rules.length,
            max_devices: val.max_devices,
        };
        T_CEPH_CRUSH_HEADER.write(io, header, features);
        for (const bucket of val.buckets) {
            T_CEPH_CRUSH_BUCKET.write(io, bucket, features);
        }
        for (const rule of val.rules) {
            T_CEPH_CRUSH_RULE.write(io, rule, features);
        }
        T_CEPH_CRUSH_NAME_INFO.write(io, val.name_info, features);
        T_CEPH_CRUSH_TUNABLES.write(io, val.tunables, features);
        if (features.includes(CEPH_FEATURES.CRUSH_TUNABLES5)) {
            io.writeUint8(val.tunables.chooseleaf_stable);
        }
        if (features.includes(CEPH_FEATURES.SERVER_LUMINOUS)) {
            T_CEPH_CRUSH_LUMINOUS.write(io, val.luminous, features);
        }
    },
    async read(io) {
        const val = { buckets: [], rules: [] };
        const hdr = await T_CEPH_CRUSH_HEADER.read(io);
        for (let i = 0; i < hdr.max_buckets; ++i) {
            val.buckets.push(await T_CEPH_CRUSH_BUCKET.read(io));
        }
        for (let i = 0; i < hdr.max_rules; ++i) {
            val.rules.push(await T_CEPH_CRUSH_RULE.read(io));
        }
        val.name_info = await T_CEPH_CRUSH_NAME_INFO.read(io);
        val.tunables = await T_CEPH_CRUSH_TUNABLES.read(io);
        val.luminous = await T_CEPH_CRUSH_LUMINOUS.read(io);
    },
});

const T_CEPH_OSD_INFO = new Struct({
    name: 'T_CEPH_OSD_INFO',
    fields: {
        struct_v1: new ConstValue({ type: T_U8, val: 1 }),
        last_clean_begin: T_CEPH_EPOCH,
        last_clean_end: T_CEPH_EPOCH,
        up_from: T_CEPH_EPOCH,
        up_thru: T_CEPH_EPOCH,
        down_at: T_CEPH_EPOCH,
        lost_at: T_CEPH_EPOCH,
    }
});

const T_CEPH_OSD_XINFO = new Versions({
    name: 'T_CEPH_OSD_XINFO',
    version: 3,
    compat_version: 1,
    versions: {
        3: new Struct({
            name: 'T_CEPH_OSD_XINFO_V3',
            fields: {
                down_stamp: T_CEPH_TIMESPEC,
                laggy_probability: T_U32LE,
                laggy_interval: T_U32LE,
                features: T_CEPH_FEATURES,
                old_weight: T_U32LE,
            }
        })
    }
});

const T_CEPH_OSD_MAP_CLIENT_USABLE = new Versions({
    name: 'T_CEPH_OSD_MAP_CLIENT_USABLE',
    version: 3,
    compat_version: 1,
    versions: {
        3: new Struct({
            name: 'T_CEPH_OSD_MAP_CLIENT_USABLE_V3',
            fields: {
                fsid: T_CEPH_FSID,
                epoch: T_CEPH_EPOCH,
                created: T_CEPH_TIMESPEC,
                modified: T_CEPH_TIMESPEC,
                pools: new VarPairMap({ key_type: T_CEPH_POOL_ID, val_type: T_CEPH_PG_POOL }),
                pool_names: new VarPairMap({ key_type: T_CEPH_POOL_ID, val_type: T_STRING }),
                pool_max: T_S32LE,
                flags: T_U32LE,
                max_osd: T_S32LE,
                osd_state: new VarArray({ type: T_U8 }),
                osd_weight: new VarArray({ type: T_U32LE }),
                osd_addrs: new VarArray({ type: T_CEPH_ENTITY_ADDR }),
                pg_temp: T_CEPH_PG_DATA_ARR,
                primary_temp: T_CEPH_PG_DATA_SINGLE,
                osd_primary_affinity: new VarArray({ type: T_U32LE }),
                crush: new VarValue({ type: T_CEPH_CRUSH }),
                erasure_code_profiles: T_CEPH_STRING_MAP_X2,
            }
        }),
        7: new Struct({
            name: 'T_CEPH_OSD_MAP_CLIENT_USABLE_V7',
            fields: {
                fsid: T_CEPH_FSID,
                epoch: T_CEPH_EPOCH,
                created: T_CEPH_TIMESPEC,
                modified: T_CEPH_TIMESPEC,
                pools: new VarPairMap({ key_type: T_CEPH_POOL_ID, val_type: T_CEPH_PG_POOL }),
                pool_names: new VarPairMap({ key_type: T_CEPH_POOL_ID, val_type: T_STRING }),
                pool_max: T_S32LE,
                flags: T_U32LE,
                max_osd: T_S32LE,
                osd_state: new VarArray({ type: T_U8 }),
                osd_weight: new VarArray({ type: T_U32LE }),
                osd_addrs: new VarArray({ type: T_CEPH_ENTITY_ADDR }),
                pg_temp: T_CEPH_PG_DATA_ARR,
                primary_temp: T_CEPH_PG_DATA_SINGLE,
                osd_primary_affinity: new VarArray({ type: T_U32LE }),
                crush: new VarValue({ type: T_CEPH_CRUSH }),
                erasure_code_profiles: T_CEPH_STRING_MAP_X2,
                // version >= 4
                pg_upmap: T_CEPH_PG_DATA_ARR,
                pg_upmap_items: T_CEPH_PG_DATA_MAP,
                // version >= 6
                crush_version: T_U32LE,
                // version >= 7
                new_removed_snaps: T_CEPH_SNAP_MAP,
                new_purged_snaps: T_CEPH_SNAP_MAP,
            }
        }),
    }
});

const T_CEPH_OSD_MAP_OSD_ONLY = new Versions({
    name: 'T_CEPH_OSD_MAP_OSD_ONLY',
    version: 1,
    compat_version: 1,
    versions: {
        1: new Struct({
            name: 'T_CEPH_OSD_MAP_OSD_ONLY_V1',
            fields: {
                hb_back_addr: new VarArray({ type: T_CEPH_ENTITY_ADDR }),
                osd_info: new VarArray({ type: T_CEPH_OSD_INFO }),
                blacklist_map: new VarArray({
                    type: new Struct({
                        fields: {
                            addr: T_CEPH_ENTITY_ADDR,
                            time: T_CEPH_TIMESPEC,
                        }
                    })
                }),
                cluster_addr: new VarArray({ type: T_CEPH_ENTITY_ADDR }),
                cluster_snapshot_epoch: T_CEPH_EPOCH,
                cluster_snapshot: T_STRING,
                osd_uuid: new VarArray({ type: T_UUID }),
                osd_xinfo: new VarArray({ type: T_CEPH_OSD_XINFO }),
                hb_front_addr: new VarArray({ type: T_CEPH_ENTITY_ADDR }),
            }
        }),
        6: new Struct({
            name: 'T_CEPH_OSD_MAP_OSD_ONLY_V6',
            fields: {
                hb_back_addr: new VarArray({ type: T_CEPH_ENTITY_ADDR }),
                osd_info: new VarArray({ type: T_CEPH_OSD_INFO }),
                blacklist_map: new VarArray({
                    type: new Struct({
                        fields: {
                            addr: T_CEPH_ENTITY_ADDR,
                            time: T_CEPH_TIMESPEC,
                        }
                    })
                }),
                cluster_addr: new VarArray({ type: T_CEPH_ENTITY_ADDR }),
                cluster_snapshot_epoch: T_CEPH_EPOCH,
                cluster_snapshot: T_STRING,
                osd_uuid: new VarArray({ type: T_UUID }),
                osd_xinfo: new VarArray({ type: T_CEPH_OSD_XINFO }),
                hb_front_addr: new VarArray({ type: T_CEPH_ENTITY_ADDR }),
                // version >= 2
                nearfull_ratio: T_FLOAT_LE,
                full_ratio: T_FLOAT_LE,
                backfillfull_ratio: T_FLOAT_LE,
                // 4 was string-based new_require_min_compat_client
                // version >= 5
                require_min_compat_client: T_U8,
                require_osd_release: T_U8,
                // version >= 6
                removed_snaps_queue: T_CEPH_SNAP_MAP,
            }
        }),
    }
});

const T_CEPH_OSD_MAP = new Type({
    name: 'T_CEPH_OSD_MAP',
    version: 8,
    compat_version: 7,
    write(io, val, features) {
        const version = (val && val.version) || this.version;
        const compat_version = (val && val.compat_version) || this.compat_version;
        const type = this.versions[version];
        const size = type.sizeof(val, features);
        io.writeUInt32LE(size + 10); // 10 === 1(version) + 1(compat_version) + 4(size) + 4(crc)
        const crc_id = io.start_write_crc(0xffffffff);
        io.writeUInt8(version);
        io.writeUInt8(compat_version);
        io.writeUInt32LE(size + 4); // add 4 to include the crc in the struct size
        const wstart = io.get_write_pos();
        type.write(io, val, features);
        const crc = io.stop_write_crc(crc_id);
        const wsize = io.get_write_pos() - wstart;
        io.writeUInt32LE(crc);
        assert.strictEqual(wsize, size);
    },
    async read(io) {
        // TODO
    },
    versions: {
        8: new Struct({
            name: 'T_CEPH_OSD_MAP_V8',
            fields: {
                client_usable: T_CEPH_OSD_MAP_CLIENT_USABLE,
                osd_only: T_CEPH_OSD_MAP_OSD_ONLY,
            }
        })
    }
});

const T_CEPH_MSG_OSD_MAP = new Struct({
    name: 'T_CEPH_MSG_OSD_MAP',
    fields: {
        fsid: T_CEPH_FSID,
        incremental_maps: new VarMap({ key_type: T_CEPH_EPOCH, val_type: T_CEPH_OSD_MAP }),
        maps: new VarMap({ key_type: T_CEPH_EPOCH, val_type: T_CEPH_OSD_MAP }),
        oldest_map: T_CEPH_EPOCH,
        newest_map: T_CEPH_EPOCH,
        // gap_removed_snaps: T_CEPH_SNAP_MAP,
    }
});

const T_CEPH_MON_SUB_ITEM_V2 = new Struct({
    name: 'T_CEPH_MON_SUB_ITEM_V2',
    fields: {
        start: T_U64LE,
        flags: T_U8,
    }
});

const T_CEPH_MSG_MON_SUB_REQUEST_V2 = new Struct({
    name: 'T_CEPH_MSG_MON_SUB_REQUEST_V2',
    fields: {
        what: new VarMap({ key_type: T_STRING, val_type: T_CEPH_MON_SUB_ITEM_V2 }),
    }
});

const T_CEPH_MSG_MON_SUB_REQUEST_V3 = new Struct({
    name: 'T_CEPH_MSG_MON_SUB_REQUEST_V3',
    fields: {
        what: new VarMap({ key_type: T_STRING, val_type: T_CEPH_MON_SUB_ITEM_V2 }),
        hostname: T_STRING,
    }
});

const T_CEPH_MSG_MON_SUB_REPLY = new Struct({
    name: 'T_CEPH_MSG_MON_SUB_REPLY',
    fields: {
        interval: T_U32LE,
        fsid: T_CEPH_FSID,
    }
});

const T_CEPH_MSG_STATFS_REPLY = new Struct({
    name: 'T_CEPH_MSG_STATFS_REPLY',
    fields: {
        // TODO STATFS
    }
});


/////////////
// EXPORTS //
/////////////

// CONSTS
exports.CEPH_MON_PORT = CEPH_MON_PORT;
exports.CEPH_MSGR_TAG = CEPH_MSGR_TAG;
exports.CEPH_MSGR_TAG_NAME = CEPH_MSGR_TAG_NAME;
exports.CEPH_MSG_TYPE = CEPH_MSG_TYPE;
exports.CEPH_MSG_TYPE_NAME = CEPH_MSG_TYPE_NAME;
exports.CEPH_MSG_PRIO = CEPH_MSG_PRIO;
exports.CEPH_MSG_FOOTER = CEPH_MSG_FOOTER;
exports.CEPH_MSG_CONNECT = CEPH_MSG_CONNECT;
exports.CEPH_ENTITY_TYPE = CEPH_ENTITY_TYPE;
exports.CEPH_AUTH_TYPE = CEPH_AUTH_TYPE;
exports.CEPH_FEATURES = CEPH_FEATURES;
exports.CRUSH_BUCKET_ALG = CRUSH_BUCKET_ALG;
exports.CRUSH_BUCKET_TYPE = CRUSH_BUCKET_TYPE;
// CEPH TYPES
exports.T_CEPH_TAG = T_CEPH_TAG;
exports.T_CEPH_SEQ = T_CEPH_SEQ;
exports.T_CEPH_TIMESPEC = T_CEPH_TIMESPEC;
// ACCEPT
exports.T_CEPH_MSG_ACCEPT_REQUEST = T_CEPH_MSG_ACCEPT_REQUEST;
exports.T_CEPH_MSG_ACCEPT_REPLY = T_CEPH_MSG_ACCEPT_REPLY;
// CONNECT
exports.T_CEPH_MSG_CONNECT_REQUEST = T_CEPH_MSG_CONNECT_REQUEST;
exports.T_CEPH_MSG_CONNECT_REPLY = T_CEPH_MSG_CONNECT_REPLY;
// MESSAGE
exports.T_CEPH_MSG_HEADER = T_CEPH_MSG_HEADER;
exports.T_CEPH_MSG_FOOTER = T_CEPH_MSG_FOOTER;
exports.T_CEPH_MSG_HEADER_OLD = T_CEPH_MSG_HEADER_OLD;
exports.T_CEPH_MSG_FOOTER_OLD = T_CEPH_MSG_FOOTER_OLD;
// AUTH
exports.T_CEPH_MSG_AUTH_REQUEST = T_CEPH_MSG_AUTH_REQUEST;
exports.T_CEPH_MSG_AUTH_REPLY = T_CEPH_MSG_AUTH_REPLY;
exports.T_CEPH_MSG_AUTH_NONE = T_CEPH_MSG_AUTH_NONE;
exports.T_CEPH_MSG_AUTH_REPLY_CEPHX = T_CEPH_MSG_AUTH_REPLY_CEPHX;
// MONITOR
exports.T_CEPH_MSG_MON_MAP = T_CEPH_MSG_MON_MAP;
exports.T_CEPH_MSG_OSD_MAP = T_CEPH_MSG_OSD_MAP;
exports.T_CEPH_MSG_MON_SUB_REQUEST_V2 = T_CEPH_MSG_MON_SUB_REQUEST_V2;
exports.T_CEPH_MSG_MON_SUB_REQUEST_V3 = T_CEPH_MSG_MON_SUB_REQUEST_V3;
exports.T_CEPH_MSG_MON_SUB_REPLY = T_CEPH_MSG_MON_SUB_REPLY;
exports.T_CEPH_MSG_STATFS_REPLY = T_CEPH_MSG_STATFS_REPLY;
