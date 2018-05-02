/* Copyright (C) 2016 NooBaa */
'use strict';

const util = require('util');
const assert = require('assert');
const { BufferIO, SizeIO } = require('./rados_io');

//////////
//      //
// BASE //
//      //
//////////


/**
 * Base Type
 * 
 * @interface
 * @abstract
 */
class Type {

    /**
     * @param {String} name readable string to identify the type
     */
    constructor(params) {
        for (const key of Object.keys(params)) {
            this[key] = params[key];
        }
        this.name = this.name || this.constructor.name;
    }

    /**
     * Write encoded value
     * 
     * @abstract
     * @param {IO} io
     * @param {*} val value of this type
     */
    write(io, val, features) {
        assert.fail(`UNIMPLEMENTED ${this.name}.write()`);
    }

    /**
     * Read decoded value
     * 
     * @abstract
     * @param {IO} io 
     * @returns {*} decoded value of this type
     */
    async read(io) {
        assert.fail(`UNIMPLEMENTED ${this.name}.read()`);
    }

    /**
     * Return encoded size in bytes
     * 
     * @param {*} val value to encode
     * @returns {Number} number of bytes
     */
    sizeof(val, features) {
        if (this.size >= 0) return this.size;
        const size_io = new SizeIO();
        this.write(size_io, val, features);
        return size_io.get_write_pos();
    }

    /**
     * Encode value into a existing/new buffer
     * 
     * @param {*} val value to write
     */
    write_buffer(val, features, buf, pos) {
        if (!buf) {
            const size = this.sizeof(val, features);
            buf = Buffer.allocUnsafe(size);
            pos = 0;
        }
        const io = new BufferIO(buf, pos);
        this.write(io, val, features);
        return buf;
    }

    /**
     * Decode a value from a buffer
     * 
     * @param {*} val value to write
     */
    async read_buffer(buf, pos) {
        const io = new BufferIO(buf, pos);
        return this.read(io);
    }

    /**
     * Translate a value to a readable value
     * 
     * @param {*} val value to translate
     */
    inspect(val) {
        return val;
    }

    toString() {
        return this.name;
    }

    [util.inspect.custom]() {
        return this.name;
    }
}


/////////////
//         //
// NUMBERS //
//         //
/////////////


class UInt8_Type extends Type {
    constructor(params) {
        params.size = 1;
        super(params);
    }
    write(io, val, features) {
        io.writeUInt8(val);
    }
    async read(io) {
        return io.readUInt8();
    }
}

class UInt16LE_Type extends Type {
    constructor(params) {
        params.size = 2;
        super(params);
    }
    write(io, val, features) {
        io.writeUInt16LE(val);
    }
    async read(io) {
        return io.readUInt16LE();
    }
}

class UInt16BE_Type extends Type {
    constructor(params) {
        params.size = 2;
        super(params);
    }
    write(io, val, features) {
        io.writeUInt16BE(val);
    }
    async read(io) {
        return io.readUInt16BE();
    }
}

class UInt32LE_Type extends Type {
    constructor(params) {
        params.size = 4;
        super(params);
    }
    write(io, val, features) {
        io.writeUInt32LE(val);
    }
    async read(io) {
        return io.readUInt32LE();
    }
}

class UInt32BE_Type extends Type {
    constructor(params) {
        params.size = 4;
        super(params);
    }
    write(io, val, features) {
        io.writeUInt32BE(val);
    }
    async read(io) {
        return io.readUInt32BE();
    }
}

class UInt64LE_Type extends Type {
    constructor(params) {
        params.size = 8;
        super(params);
    }
    write(io, val, features) {
        io.writeUInt64LE(val);
    }
    async read(io) {
        return io.readUInt64LE();
    }
}

class UInt64BE_Type extends Type {
    constructor(params) {
        params.size = 8;
        super(params);
    }
    write(io, val, features) {
        io.writeUInt64BE(val);
    }
    async read(io) {
        return io.readUInt64BE();
    }
}

class Int8_Type extends Type {
    constructor(params) {
        params.size = 1;
        super(params);
    }
    write(io, val, features) {
        io.writeInt8(val);
    }
    async read(io) {
        return io.readInt8();
    }
}

class Int16LE_Type extends Type {
    constructor(params) {
        params.size = 2;
        super(params);
    }
    write(io, val, features) {
        io.writeInt16LE(val);
    }
    async read(io) {
        return io.readInt16LE();
    }
}

class Int16BE_Type extends Type {
    constructor(params) {
        params.size = 2;
        super(params);
    }
    write(io, val, features) {
        io.writeInt16BE(val);
    }
    async read(io) {
        return io.readInt16BE();
    }
}

class Int32LE_Type extends Type {
    constructor(params) {
        params.size = 4;
        super(params);
    }
    write(io, val, features) {
        io.writeInt32LE(val);
    }
    async read(io) {
        return io.readInt32LE();
    }
}

class Int32BE_Type extends Type {
    constructor(params) {
        params.size = 4;
        super(params);
    }
    write(io, val, features) {
        io.writeInt32BE(val);
    }
    async read(io) {
        return io.readInt32BE();
    }
}

class Int64LE_Type extends Type {
    constructor(params) {
        params.size = 8;
        super(params);
    }
    write(io, val, features) {
        io.writeInt64LE(val);
    }
    async read(io) {
        return io.readInt64LE();
    }
}

class Int64BE_Type extends Type {
    constructor(params) {
        params.size = 8;
        super(params);
    }
    write(io, val, features) {
        io.writeInt64BE(val);
    }
    async read(io) {
        return io.readInt64BE();
    }
}

class FloatLE_Type extends Type {
    constructor(params) {
        params.size = 4;
        super(params);
    }
    write(io, val, features) {
        io.writeFloatLE(val);
    }
    async read(io) {
        return io.readFloatLE();
    }
}

class FloatBE_Type extends Type {
    constructor(params) {
        params.size = 4;
        super(params);
    }
    write(io, val, features) {
        io.writeFloatBE(val);
    }
    async read(io) {
        return io.readFloatBE();
    }
}

class DoubleLE_Type extends Type {
    constructor(params) {
        params.size = 8;
        super(params);
    }
    write(io, val, features) {
        io.writeDoubleLE(val);
    }
    async read(io) {
        return io.readDoubleLE();
    }
}

class DoubleBE_Type extends Type {
    constructor(params) {
        params.size = 8;
        super(params);
    }
    write(io, val, features) {
        io.writeDoubleBE(val);
    }
    async read(io) {
        return io.readDoubleBE();
    }
}


///////////
//       //
// CONST //
//       //
///////////


class ConstBuffer extends Type {
    constructor(params) {
        params.size = params.buf.length;
        super(params);
    }
    write(io, val, features) {
        io.write(this.buf);
    }
    async read(io) {
        const bufs = await io.readv(this.size);
        let pos = 0;
        for (const buf of bufs) {
            assert.strictEqual(buf.compare(this.buf, pos, pos + buf.length), 0);
            pos += buf.length;
        }
        return this; // always return this type instance from const reads
    }
}

class ConstString extends ConstBuffer {
    constructor(params) {
        params.buf = Buffer.from(params.str, params.encoding);
        super(params);
    }
}

class ConstValue extends ConstBuffer {
    constructor(params) {
        params.buf = params.type.write_buffer(params.val, params.features);
        super(params);
    }
}

class ConstPad extends ConstBuffer {
    constructor(params) {
        params.buf = Buffer.allocUnsafeSlow(params.size).fill(0);
        super(params);
    }
}


////////////
//        //
// BLOCKS //
//        //
////////////


class BlockBuffer extends Type {
    write(io, val, features) {
        assert.strictEqual(val.length, this.size);
        io.write(val);
    }
    async read(io) {
        return io.read(this.size);
    }
}

class BlockString extends BlockBuffer {
    write(io, val, features) {
        assert.strictEqual(Buffer.byteLength(val, this.encoding), this.size);
        io.writeString(val, this.encoding);
    }
    async read(io) {
        return io.readString(this.size, this.encoding);
    }
}

class BlockPad extends Type {
    constructor(params) {
        super(params);
        this.zeros = Buffer.allocUnsafeSlow(this.size).fill(0);
    }
    write(io, val, features) {
        const wstart = io.get_write_pos();
        this.type.write(io, val, features);
        const wsize = io.get_write_pos() - wstart;
        assert(wsize <= this.size);
        io.write(this.zeros.slice(wsize));
    }
    async read(io, ...values) {
        const rstart = io.get_read_pos();
        const val = await this.type.read(io, ...values);
        const rsize = io.get_read_pos() - rstart;
        assert(rsize <= this.size);
        if (rsize < this.size) await io.readv(this.size - rsize);
        return val;
    }
}


//////////////
//          //
// VARIABLE //
//          //
//////////////


class VarBuffer extends Type {
    write(io, val, features) {
        io.writeUInt32LE(val.length);
        io.write(val);
    }
    async read(io) {
        const len = await io.readUInt32LE();
        const val = await io.read(len);
        return val;
    }
}

class VarString extends Type {
    write(io, val, features) {
        const size = Buffer.byteLength(val, this.encoding);
        io.writeUInt32LE(size);
        io.writeString(val, this.encoding);
    }
    async read(io) {
        const size = await io.readUInt32LE();
        const val = await io.readString(size, this.encoding);
        return val;
    }
}

class VarValue extends Type {
    write(io, val, features) {
        const size = this.type.sizeof(val, features);
        io.writeUInt32LE(size);
        this.type.write(io, val, features);
    }
    async read(io) {
        const size = await io.readUInt32LE();
        const rstart = io.get_read_pos();
        const val = await this.type.read(io);
        const rsize = io.get_read_pos() - rstart;
        assert.strictEqual(rsize, size);
        return val;
    }
}

class VarSwitch extends Type {
    write(io, val, features) {
        val.type.write(io, val.val, features);
    }
    async read(io, ...values) {
        const struct = values[values.length - 1];
        const type = this.cases[struct[this.switch]];
        const val = await type.read(io);
        return val;
    }
}

class VarArray extends Type {
    write(io, val, features) {
        io.writeUInt32LE(val.length);
        for (let i = 0; i < val.length; ++i) {
            this.type.write(io, val[i], features);
        }
    }
    async read(io, ...values) {
        const val = [];
        val.length = await io.readUInt32LE();
        for (let i = 0; i < val.length; ++i) {
            val[i] = await this.type.read(io, ...values, val);
        }
        return val;
    }
    // sizeof optimization for fixed size item type
    sizeof(val, features) {
        return this.type.size >= 0 ? (4 + (val.length * this.type.size)) : super.sizeof(val, features);
    }
}

class VarMap extends Type {
    constructor(params) {
        super(params);
        this.pair_size =
            this.key_type.size >= 0 && this.val_type.size >= 0 ?
            this.key_type.size + this.val_type.size : -1;
    }
    write(io, val, features) {
        const keys = Object.keys(val);
        io.writeUInt32LE(keys.length);
        for (const key of keys) {
            this.key_type.write(io, key, features);
            this.val_type.write(io, val[key], features);
        }
    }
    async read(io, ...values) {
        const map = {};
        const len = await io.readUInt32LE();
        for (let i = 0; i < len; ++i) {
            const key = await this.key_type.read(io, ...values, { map, len });
            const val = await this.val_type.read(io, ...values, { map, len, key });
            map[key] = val;
        }
        return map;
    }
    // sizeof optimization for fixed size pair type
    sizeof(val, features) {
        return this.pair_size >= 0 ? (4 + (Object.keys(val).length * this.pair_size)) : super.sizeof(val, features);
    }
}

class VarPairMap extends Type {
    constructor(params) {
        super(params);
        this.pair_size =
            this.key_type.size >= 0 && this.val_type.size >= 0 ?
            this.key_type.size + this.val_type.size : -1;
    }
    write(io, val, features) {
        io.writeUInt32LE(val.length);
        for (const pair of val) {
            this.key_type.write(io, pair.key, features);
            this.val_type.write(io, pair.val, features);
        }
    }
    async read(io, ...values) {
        const pair_map = [];
        const len = await io.readUInt32LE();
        for (let i = 0; i < len; ++i) {
            const key = await this.key_type.read(io, ...values, { pair_map, len });
            const val = await this.val_type.read(io, ...values, { pair_map, len, key });
            pair_map.push({ key, val });
        }
        return pair_map;
    }
    // sizeof optimization for fixed size pair type
    sizeof(val, features) {
        return this.pair_size >= 0 ? (4 + (val.length * this.pair_size)) : super.sizeof(val, features);
    }
}



////////////
//        //
// STRUCT //
//        //
////////////


class Struct extends Type {
    constructor(params) {
        let size = 0;
        params.fields = Object.keys(params.fields).map(key => {
            const type = params.fields[key];
            size = (size >= 0 && type.size >= 0) ? size + type.size : -1;
            return { key, type };
        });
        if (typeof params.size === 'undefined') params.size = size;
        super(params);
    }
    write(io, val, features) {
        for (const { key, type } of this.fields) {
            type.write(io, val[key], features);
        }
    }
    async read(io, ...values) {
        const val = {};
        for (const { key, type } of this.fields) {
            val[key] = await type.read(io, ...values, val);
        }
        return val;
    }
}

class Versions extends Type {

    constructor(params) {
        super(params);
        let version = 0;
        let compat_version = 0;
        for (const v of Object.keys(this.versions)) {
            if (v > version) version = v;
            if (v < compat_version || !compat_version) {
                compat_version = v;
            }
        }
        if (!this.version) this.version = version;
        if (!this.compat_version) this.compat_version = compat_version;
    }
    write(io, val, features) {
        const version = (val && val.version) || this.version;
        const compat_version = (val && val.compat_version) || this.compat_version;
        const type = this.versions[version];
        const size = type.sizeof(val, features);
        io.writeUInt8(version);
        io.writeUInt8(compat_version);
        io.writeUInt32LE(size);
        const wstart = io.get_write_pos();
        type.write(io, val, features);
        const wsize = io.get_write_pos() - wstart;
        assert.strictEqual(wsize, size);
    }
    async read(io, ...values) {
        const version = await io.readUInt8();
        const compat_version = await io.readUInt8();
        const size = await io.readUInt32LE();
        const type = this.versions[version];
        if (!type) throw new Error(`UNSUPPORTED VERSION ${this.name} v${version}`);
        const rstart = io.get_read_pos();
        const val = await type.read(io, ...values);
        const rsize = io.get_read_pos() - rstart;
        val.version = version;
        val.compat_version = compat_version;
        assert.strictEqual(rsize, size);
        return val;
    }
}


class CrcFooter extends Type {
    write(io, val, features) {
        const crc_id = io.start_write_crc(this.initial_crc);
        this.type.write(io, val, features);
        const crc = io.stop_write_crc(crc_id);
        io.writeUInt32LE(crc);
    }
    async read(io, ...values) {
        const crc_id = io.start_read_crc(this.initial_crc);
        const val = await this.type.read(io);
        const actual_crc = io.stop_read_crc(crc_id);
        const expected_crc = await io.readUInt32LE();
        if (actual_crc !== expected_crc) throw new Error('BAD CRC FOOTER');
        return val;
    }
    // sizeof optimization for fixed size type
    sizeof(val, features) {
        return this.type.size >= 0 ? (4 + this.type.size) : super.sizeof(val, features);
    }
}



/////////////
// exports //
/////////////

exports.Type = Type;

exports.UInt8_Type = UInt8_Type;
exports.Int8_Type = Int8_Type;

exports.UInt16LE_Type = UInt16LE_Type;
exports.UInt32LE_Type = UInt32LE_Type;
exports.UInt64LE_Type = UInt64LE_Type;

exports.UInt16BE_Type = UInt16BE_Type;
exports.UInt32BE_Type = UInt32BE_Type;
exports.UInt64BE_Type = UInt64BE_Type;

exports.Int16LE_Type = Int16LE_Type;
exports.Int32LE_Type = Int32LE_Type;
exports.Int64LE_Type = Int64LE_Type;

exports.Int16BE_Type = Int16BE_Type;
exports.Int32BE_Type = Int32BE_Type;
exports.Int64BE_Type = Int64BE_Type;

exports.FloatLE_Type = FloatLE_Type;
exports.DoubleLE_Type = DoubleLE_Type;

exports.FloatBE_Type = FloatBE_Type;
exports.DoubleBE_Type = DoubleBE_Type;

exports.ConstBuffer = ConstBuffer;
exports.ConstString = ConstString;
exports.ConstValue = ConstValue;
exports.ConstPad = ConstPad;

exports.BlockBuffer = BlockBuffer;
exports.BlockString = BlockString;
exports.BlockPad = BlockPad;

exports.VarBuffer = VarBuffer;
exports.VarString = VarString;
exports.VarSwitch = VarSwitch;
exports.VarValue = VarValue;
exports.VarArray = VarArray;
exports.VarMap = VarMap;
exports.VarPairMap = VarPairMap;

exports.Struct = Struct;
exports.Versions = Versions;
exports.CrcFooter = CrcFooter;
