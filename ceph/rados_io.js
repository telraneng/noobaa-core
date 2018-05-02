/* Copyright (C) 2016 NooBaa */
'use strict';

// const util = require('util');
const assert = require('assert');

const B1 = Buffer.alloc(1);
const B2 = Buffer.alloc(2);
const B4 = Buffer.alloc(4);
const B8 = Buffer.alloc(8);

/**
 * 
 * IO interface
 * 
 * @interface
 * @abstract
 */
class AbstractIO {

    /**
     * @abstract
     * @param {Buffer} buf buffer to write
     */
    write(buf) {
        assert.fail(`UNIMPLEMENTED ${this.constructure.name}.write()`);
    }

    /**
     * @abstract
     * @param {Number} size number of bytes to read
     * @returns {Buffer}
     */
    async read(size) {
        assert.fail(`UNIMPLEMENTED ${this.constructure.name}.read()`);
    }

    /**
     * @abstract
     * @returns {Number} write position
     */
    get_write_pos() {
        assert.fail(`UNIMPLEMENTED ${this.constructure.name}.get_write_pos()`);
    }

    /**
     * @abstract
     * @returns {Number} read position
     */
    get_read_pos() {
        assert.fail(`UNIMPLEMENTED ${this.constructure.name}.get_read_pos()`);
    }

    /**
     * @abstract
     * @param {Number} crc the initial crc value
     * @returns {any} an identifier, keep it and pass to stop_write_crc()
     */
    start_write_crc(crc = 0) {
        return 0;
    }

    /**
     * @abstract
     * @param {any} id as returned from start_write_crc()
     * @returns {Number} crc value
     */
    stop_write_crc(id) {
        return 0;
    }

    /**
     * @abstract
     * @param {Number} crc the initial crc value
     * @returns {any} an identifier, keep it and pass to stop_read_crc()
     */
    start_read_crc(crc = 0) {
        return 0;
    }

    /**
     * @abstract
     * @param {any} id as returned from start_read_crc()
     * @returns {Number} crc value
     */
    stop_read_crc(id) {
        return 0;
    }

    ////////////////////////////////////////////////////////////
    // override these less optimized default implementations:

    /**
     * @param {Buffer[]} bufs to write
     */
    writev(bufs) {
        for (const buf of bufs) this.write(buf);
    }

    /**
     * @param {Number} size number of bytes to read
     * @returns {Buffer[]}
     */
    async readv(size) {
        return [await this.read(size)];
    }

    writeUInt8(val) {
        B1.writeUInt8(val, 0);
        this.write(B1);
    }
    writeUInt16LE(val) {
        B2.writeUInt16LE(val, 0);
        this.write(B2);
    }
    writeUInt16BE(val) {
        B2.writeUInt16BE(val, 0);
        this.write(B2);
    }
    writeUInt32LE(val) {
        B4.writeUInt32LE(val, 0);
        this.write(B4);
    }
    writeUInt32BE(val) {
        B4.writeUInt32BE(val, 0);
        this.write(B4);
    }
    writeUInt64LE(val) {
        writeUInt64LE(B8, val, 0);
        this.write(B8);
    }
    writeUInt64BE(val) {
        writeUInt64BE(B8, val, 0);
        this.write(B8);
    }
    writeInt8(val) {
        B1.writeInt8(val, 0);
        this.write(B1);
    }
    writeInt16LE(val) {
        B2.writeInt16LE(val, 0);
        this.write(B2);
    }
    writeInt16BE(val) {
        B2.writeInt16BE(val, 0);
        this.write(B2);
    }
    writeInt32LE(val) {
        B4.writeInt32LE(val, 0);
        this.write(B4);
    }
    writeInt32BE(val) {
        B4.writeInt32BE(val, 0);
        this.write(B4);
    }
    writeInt64LE(val) {
        writeInt64LE(B8, val, 0);
        this.write(B8);
    }
    writeInt64BE(val) {
        writeInt64BE(B8, val, 0);
        this.write(B8);
    }
    writeFloatLE(val) {
        B4.writeFloatLE(val, 0);
        this.write(B4);
    }
    writeFloatBE(val) {
        B4.writeFloatBE(val, 0);
        this.write(B4);
    }
    writeDoubleLE(val) {
        B8.writeDoubleLE(val, 0);
        this.write(B8);
    }
    writeDoubleBE(val) {
        B8.writeDoubleBE(val, 0);
        this.write(B8);
    }
    writeString(val, encoding = 'utf8') {
        this.write(Buffer.from(val, encoding));
    }

    async readUInt8() {
        return (await this.read(1)).readUInt8(0);
    }
    async readUInt16LE() {
        return (await this.read(2)).readUInt16LE(0);
    }
    async readUInt16BE() {
        return (await this.read(2)).readUInt16BE(0);
    }
    async readUInt32LE() {
        return (await this.read(4)).readUInt32LE(0);
    }
    async readUInt32BE() {
        return (await this.read(4)).readUInt32BE(0);
    }
    async readUInt64LE() {
        return readUInt64LE(await this.read(8), 0);
    }
    async readUInt64BE() {
        return readUInt64BE(await this.read(8), 0);
    }
    async readInt8() {
        return (await this.read(1)).readInt8(0);
    }
    async readInt16LE() {
        return (await this.read(2)).readInt16LE(0);
    }
    async readInt16BE() {
        return (await this.read(2)).readInt16BE(0);
    }
    async readInt32LE() {
        return (await this.read(4)).readInt32LE(0);
    }
    async readInt32BE() {
        return (await this.read(4)).readInt32BE(0);
    }
    async readInt64LE() {
        return readInt64LE(await this.read(8), 0);
    }
    async readInt64BE() {
        return readInt64BE(await this.read(8), 0);
    }
    async readFloatLE() {
        return (await this.read(4)).readFloatLE(0);
    }
    async readFloatBE() {
        return (await this.read(4)).readFloatBE(0);
    }
    async readDoubleLE() {
        return (await this.read(8)).readDoubleLE(0);
    }
    async readDoubleBE() {
        return (await this.read(8)).readDoubleBE(0);
    }
    async readString(size, encoding = 'utf8') {
        return (await this.read(size)).toString(encoding);
    }
}


/**
 * Write only IO that counts the size and discards the data
 */
class SizeIO extends AbstractIO {

    constructor() {
        super();
        this.pos = 0;
    }

    get_write_pos() {
        return this.pos;
    }

    // WRITE
    write(buf) {
        this.pos += buf.length;
    }
    writeUInt8(val) {
        this.pos += 1;
    }
    writeUInt16LE(val) {
        this.pos += 2;
    }
    writeUInt16BE(val) {
        this.pos += 2;
    }
    writeUInt32LE(val) {
        this.pos += 4;
    }
    writeUInt32BE(val) {
        this.pos += 4;
    }
    writeUInt64LE(val) {
        this.pos += 8;
    }
    writeUInt64BE(val) {
        this.pos += 8;
    }
    writeInt8(val) {
        this.pos += 1;
    }
    writeInt16LE(val) {
        this.pos += 2;
    }
    writeInt16BE(val) {
        this.pos += 2;
    }
    writeInt32LE(val) {
        this.pos += 4;
    }
    writeInt32BE(val) {
        this.pos += 4;
    }
    writeInt64LE(val) {
        this.pos += 8;
    }
    writeInt64BE(val) {
        this.pos += 8;
    }
    writeFloatLE(val) {
        this.pos += 4;
    }
    writeFloatBE(val) {
        this.pos += 4;
    }
    writeDoubleLE(val) {
        this.pos += 8;
    }
    writeDoubleBE(val) {
        this.pos += 8;
    }
    writeString(val, encoding = 'utf8') {
        this.pos += Buffer.byteLength(val, encoding);
    }
}


/**
 * 
 * Buffer IO
 * 
 */
class BufferIO extends AbstractIO {

    constructor(buf, pos = 0) {
        super();
        this.buf = buf;
        this.pos = pos;
    }

    get_write_pos() {
        return this.pos;
    }
    get_read_pos() {
        return this.pos;
    }

    // WRITE
    write(buf) {
        this.pos += buf.copy(this.buf, this.pos);
    }
    writeUInt8(val) {
        this.buf.writeUInt8(val, this.pos);
        this.pos += 1;
    }
    writeUInt16LE(val) {
        this.buf.writeUInt16LE(val, this.pos);
        this.pos += 2;
    }
    writeUInt16BE(val) {
        this.buf.writeUInt16BE(val, this.pos);
        this.pos += 2;
    }
    writeUInt32LE(val) {
        this.buf.writeUInt32LE(val, this.pos);
        this.pos += 4;
    }
    writeUInt32BE(val) {
        this.buf.writeUInt32BE(val, this.pos);
        this.pos += 4;
    }
    writeUInt64LE(val) {
        writeUInt64LE(this.buf, val, this.pos);
        this.pos += 8;
    }
    writeUInt64BE(val) {
        writeUInt64BE(this.buf, val, this.pos);
        this.pos += 8;
    }
    writeInt8(val) {
        this.buf.writeInt8(val, this.pos);
        this.pos += 1;
    }
    writeInt16LE(val) {
        this.buf.writeInt16LE(val, this.pos);
        this.pos += 2;
    }
    writeInt16BE(val) {
        this.buf.writeInt16BE(val, this.pos);
        this.pos += 2;
    }
    writeInt32LE(val) {
        this.buf.writeInt32LE(val, this.pos);
        this.pos += 4;
    }
    writeInt32BE(val) {
        this.buf.writeInt32BE(val, this.pos);
        this.pos += 4;
    }
    writeInt64LE(val) {
        writeInt64LE(this.buf, val, this.pos);
        this.pos += 8;
    }
    writeInt64BE(val) {
        writeInt64BE(this.buf, val, this.pos);
        this.pos += 8;
    }
    writeFloatLE(val) {
        this.buf.writeFloatLE(val, this.pos);
        this.pos += 4;
    }
    writeFloatBE(val) {
        this.buf.writeFloatBE(val, this.pos);
        this.pos += 4;
    }
    writeDoubleLE(val) {
        this.buf.writeDoubleLE(val, this.pos);
        this.pos += 8;
    }
    writeDoubleBE(val) {
        this.buf.writeDoubleBE(val, this.pos);
        this.pos += 8;
    }
    writeString(val, encoding = 'utf8') {
        this.pos += this.buf.write(val, this.pos, encoding);
    }

    // READ
    read(size) {
        const buf = this.buf.slice(this.pos, this.pos + size);
        this.pos += buf.length;
        return buf;
    }
    readv(size) {
        return [this.read(size)];
    }
    readUInt8() {
        const val = this.buf.readUInt8(this.pos);
        this.pos += 1;
        return val;
    }
    readUInt16LE() {
        const val = this.buf.readUInt16LE(this.pos);
        this.pos += 2;
        return val;
    }
    readUInt16BE() {
        const val = this.buf.readUInt16BE(this.pos);
        this.pos += 2;
        return val;
    }
    readUInt32LE() {
        const val = this.buf.readUInt32LE(this.pos);
        this.pos += 4;
        return val;
    }
    readUInt32BE() {
        const val = this.buf.readUInt32BE(this.pos);
        this.pos += 4;
        return val;
    }
    readUInt64LE() {
        const val = readUInt64LE(this.buf, this.pos);
        this.pos += 8;
        return val;
    }
    readUInt64BE() {
        const val = readUInt64BE(this.buf, this.pos);
        this.pos += 8;
        return val;
    }
    readInt8() {
        const val = this.buf.readInt8(this.pos);
        this.pos += 1;
        return val;
    }
    readInt16LE() {
        const val = this.buf.readInt16LE(this.pos);
        this.pos += 2;
        return val;
    }
    readInt16BE() {
        const val = this.buf.readInt16BE(this.pos);
        this.pos += 2;
        return val;
    }
    readInt32LE() {
        const val = this.buf.readInt32LE(this.pos);
        this.pos += 4;
        return val;
    }
    readInt32BE() {
        const val = this.buf.readInt32BE(this.pos);
        this.pos += 4;
        return val;
    }
    readInt64LE() {
        const val = readInt64LE(this.buf, this.pos);
        this.pos += 8;
        return val;
    }
    readInt64BE() {
        const val = readInt64BE(this.buf, this.pos);
        this.pos += 8;
        return val;
    }
    readFloatLE() {
        const val = this.buf.readFloatLE(this.pos);
        this.pos += 4;
        return val;
    }
    readFloatBE() {
        const val = this.buf.readFloatBE(this.pos);
        this.pos += 4;
        return val;
    }
    readDoubleLE() {
        const val = this.buf.readDoubleLE(this.pos);
        this.pos += 8;
        return val;
    }
    readDoubleBE() {
        const val = this.buf.readDoubleBE(this.pos);
        this.pos += 8;
        return val;
    }
    readString(size, encoding = 'utf8') {
        const val = this.buf.toString(encoding, this.pos, this.pos + size);
        this.pos += size;
        return val;
    }
}

/**
 * 
 * Buffer List IO
 * 
 * This is a minimal and unoptimized implementation.
 * If desired should optimize by overriding the typed IO methods (writeUInt8 etc)
 */
class BufferListIO extends AbstractIO {

    constructor() {
        super();
        this.bufs = [];
        this.offset = 0;
        this.size = 0;
        this.wpos = 0;
        this.rpos = 0;
    }

    get_write_pos() {
        return this.wpos;
    }
    get_read_pos() {
        return this.rpos;
    }

    // WRITE
    write(buf) {
        this.bufs.push(buf);
        this.size += buf.length;
        this.wpos += buf.length;
    }

    // READ
    read(size) {
        if (!size) return Buffer.alloc(0);
        const bufs = this.readv(size);
        if (bufs.length === 1) return bufs[0];
        return Buffer.concat(bufs, size);
    }

    readv(size) {
        const vec = [];
        let need = size;
        while (need > 0) {
            const buf = this.bufs[0];
            if (!buf) throw new Error('BLIO READ EXHAUSTED');
            const have = buf.length - this.offset;
            const take = Math.min(have, need);
            if (take === have) {
                vec.push(this.offset ? buf.slice(this.offset) : buf);
                this.offset = 0;
                this.bufs.shift();
            } else { // take === need
                vec.push(buf.slice(this.offset, this.offset + take));
                this.offset += take;
            }
            need -= take;
            this.size -= take;
            this.rpos += take;
        }
        return vec;
    }
}


/**
 * Socket IO
 */
class StreamIO extends AbstractIO {

    constructor(stream) {
        super();
        this._stream = stream;
        this._wpos = 0;
        this._rpos = 0;
        this._woffset = 0;
        this._roffset = 0;
        this._wsize = 0;
        this._rsize = 0;
        this._wbufs = [];
        this._rbufs = [];
        this._wcrc = new Map();
        this._rcrc = new Map();
        stream.on('close', (...av) => this._on_close(...av));
        stream.on('error', (...av) => this._on_error(...av));
        stream.on('readable', (...av) => this._on_readable(...av));
    }

    get_write_pos() {
        return this._wpos;
    }
    get_read_pos() {
        return this._rpos;
    }

    start_write_crc(val = 0) {
        const id = {};
        this._wcrc.set(id, val);
        return id;
    }
    stop_write_crc(id) {
        const val = this._wcrc.get(id);
        this._wcrc.delete(id);
        return val;
    }
    update_write_crcs(buf, offset, size) {
        if (!this._wcrc.size) return;
        for (const [id, crc] of this._wcrc.entries()) {
            const new_crc = crc32_buffer(crc, buf, offset, size);
            this._wcrc.set(id, new_crc);
        }
    }

    start_read_crc(val = 0) {
        const id = {};
        this._rcrc.set(id, val);
        return id;
    }
    stop_read_crc(id) {
        const val = this._rcrc.get(id);
        this._rcrc.delete(id);
        return val;
    }
    update_read_crcs(buf, offset, size) {
        if (!this._rcrc.size) return;
        for (const [id, crc] of this._rcrc.entries()) {
            const new_crc = crc32_buffer(crc, buf, offset, size);
            this._rcrc.set(id, new_crc);
        }
    }

    flush_write() {
        const count = this._wbufs.length;
        for (let i = 0; i < count - 1; ++i) {
            this._stream.write(this._wbufs[i]);
        }
        if (count) {
            const last = this._wbufs[count - 1];
            if (this._woffset < last.length) {
                this._stream.write(last.slice(0, this._woffset));
            } else {
                this._stream.write(last);
            }
        }
        this._wbufs.length = 0;
        this._woffset = 0;
        this._wsize = 0;
    }

    _on_close() {
        if (this._receiver) this._receiver.reject(new Error('SIO CLOSED'));
        this._stream.destroy();
    }

    _on_error(err) {
        if (this._receiver) this._receiver.reject(err);
        this._stream.destroy();
    }

    _on_readable() {
        if (this._receiver) this._receiver.resolve();
    }

    /**
     * @param {Number} size
     * @returns {Buffer}
     */
    _get_write_buf(size) {
        let wbuf = this._wbufs[this._wbufs.length - 1];
        if (!wbuf || wbuf.length < this._woffset + size) {
            if (wbuf) this._wbufs[this._wbufs.length - 1] = wbuf.slice(0, this._woffset);
            wbuf = Buffer.allocUnsafe(1024);
            this._wbufs.push(wbuf);
            this._woffset = 0;
            assert(wbuf.length > size);
        }
        return wbuf;
    }

    /**
     * @param {Buffer} wbuf
     * @param {Number} size
     * @returns {Number} size
     */
    _advance_write(wbuf, size) {
        this.update_write_crcs(wbuf, this._woffset, size);
        this._woffset += size;
        this._wsize += size;
        this._wpos += size;
        return size;
    }

    /**
     * @param {Number} size 
     * @returns {Buffer}
     */
    async _get_read_buffer(size) {
        // Use optimized path when we can easily pop from the first read buf.
        // We avoid handling the need to shift _rbufs when first buf gets fully consumed,
        // by checking that there is a spare byte more than the size we need (strict-greater-than sign)
        const buf = this._rbufs[0];
        if (buf && buf.length > this._roffset + size) {
            const offset = this._roffset;
            this.update_read_crcs(buf, this._roffset, size);
            this._roffset += size;
            this._rsize -= size;
            this._rpos += size;
            return { buf, offset };
        } else {
            return {
                buf: await this.read(size),
                offset: 0,
            };
        }
    }

    write(buf) {
        if (!buf || !buf.length) return;
        // Truncate the last buffer to it's actual used offset
        // as we will push the new buffers after the last,
        // and we don't want extra bytes to appear.
        // We might want to consider copy small buffers 
        const last = this._wbufs.length - 1;
        let wbuf = this._wbufs[last];
        if (wbuf) this._wbufs[last] = wbuf.slice(0, this._woffset);
        this._wbufs.push(buf);
        this.update_write_crcs(buf);
        this._woffset = buf.length;
        this._wsize += buf.length;
        this._wpos += buf.length;
    }

    writev(bufs) {
        // Truncate the last buffer to it's actual used offset
        // as we will push the new buffers after the last,
        // and we don't want extra bytes to appear.
        // We might want to consider copy small buffers 
        const last = this._wbufs.length - 1;
        let wbuf = this._wbufs[last];
        if (wbuf) this._wbufs[last] = wbuf.slice(0, this._woffset);
        let size = 0;
        for (wbuf of bufs) {
            if (!wbuf || !wbuf.length) continue;
            this._wbufs.push(wbuf);
            this.update_write_crcs(wbuf);
            size += wbuf.length;
        }
        this._woffset = wbuf.length;
        this._wsize += size;
        this._wpos += size;
    }

    async read(size) {
        const bufs = await this.readv(size);
        return bufs.length > 1 ? Buffer.concat(bufs, size) : bufs[0];
    }

    async readv(size) {
        const bufs = [];
        this.flush_write();
        while (size > 0) {
            let buf = this._rbufs[0];
            while (!buf) {
                buf = this._stream.read();
                while (!buf) {
                    this._receiver = defer();
                    await this._receiver.promise;
                    this._receiver = null;
                    buf = this._stream.read();
                }
                this._rbufs.push(buf);
                this._rsize += buf.length;
            }
            if (buf.length > this._roffset + size) {
                // the current buffer covers more than is missing to complete the read
                // in this case we take a slice starting from rpos and then advance rpos
                bufs.push(buf.slice(this._roffset, this._roffset + size));
                this.update_read_crcs(buf, this._roffset, size);
                this._roffset += size;
                this._rsize -= size;
                this._rpos += size;
                size = 0;
            } else {
                // the current buffer is small and we can extract it all
                bufs.push(buf);
                this.update_read_crcs(buf);
                this._rbufs.shift();
                this._roffset = 0;
                this._rsize -= buf.length;
                this._rpos += buf.length;
                size -= buf.length;
            }
        }
        return bufs;
    }

    // WRITE
    writeUInt8(val) {
        const wbuf = this._get_write_buf(1);
        wbuf.writeUInt8(val, this._woffset);
        this._advance_write(wbuf, 1);
    }
    writeUInt16LE(val) {
        const wbuf = this._get_write_buf(2);
        wbuf.writeUInt16LE(val, this._woffset);
        this._advance_write(wbuf, 2);
    }
    writeUInt16BE(val) {
        const wbuf = this._get_write_buf(2);
        wbuf.writeUInt16BE(val, this._woffset);
        this._advance_write(wbuf, 2);
    }
    writeUInt32LE(val) {
        const wbuf = this._get_write_buf(4);
        wbuf.writeUInt32LE(val, this._woffset);
        this._advance_write(wbuf, 4);
    }
    writeUInt32BE(val) {
        const wbuf = this._get_write_buf(4);
        wbuf.writeUInt32BE(val, this._woffset);
        this._advance_write(wbuf, 4);
    }
    writeUInt64LE(val) {
        const wbuf = this._get_write_buf(8);
        writeUInt64LE(wbuf, val, this._woffset);
        this._advance_write(wbuf, 8);
    }
    writeUInt64BE(val) {
        const wbuf = this._get_write_buf(8);
        writeUInt64BE(wbuf, val, this._woffset);
        this._advance_write(wbuf, 8);
    }
    writeInt8(val) {
        const wbuf = this._get_write_buf(1);
        wbuf.writeInt8(val, this._woffset);
        this._advance_write(wbuf, 1);
    }
    writeInt16LE(val) {
        const wbuf = this._get_write_buf(2);
        wbuf.writeInt16LE(val, this._woffset);
        this._advance_write(wbuf, 2);
    }
    writeInt16BE(val) {
        const wbuf = this._get_write_buf(2);
        wbuf.writeInt16BE(val, this._woffset);
        this._advance_write(wbuf, 2);
    }
    writeInt32LE(val) {
        const wbuf = this._get_write_buf(4);
        wbuf.writeInt32LE(val, this._woffset);
        this._advance_write(wbuf, 4);
    }
    writeInt32BE(val) {
        const wbuf = this._get_write_buf(4);
        wbuf.writeInt32BE(val, this._woffset);
        this._advance_write(wbuf, 4);
    }
    writeInt64LE(val) {
        const wbuf = this._get_write_buf(8);
        writeInt64LE(wbuf, val, this._woffset);
        this._advance_write(wbuf, 8);
    }
    writeInt64BE(val) {
        const wbuf = this._get_write_buf(8);
        writeInt64BE(wbuf, val, this._woffset);
        this._advance_write(wbuf, 8);
    }
    writeFloatLE(val) {
        const wbuf = this._get_write_buf(4);
        wbuf.writeFloatLE(val, this._woffset);
        this._advance_write(wbuf, 4);
    }
    writeFloatBE(val) {
        const wbuf = this._get_write_buf(4);
        wbuf.writeFloatBE(val, this._woffset);
        this._advance_write(wbuf, 4);
    }
    writeDoubleLE(val) {
        const wbuf = this._get_write_buf(8);
        wbuf.writeDoubleLE(val, this._woffset);
        this._advance_write(wbuf, 8);
    }
    writeDoubleBE(val) {
        const wbuf = this._get_write_buf(8);
        wbuf.writeDoubleBE(val, this._woffset);
        this._advance_write(wbuf, 8);
    }
    writeString(val, encoding = 'utf8') {
        const size = Buffer.byteLength(val, encoding);
        const wbuf = this._get_write_buf(size);
        wbuf.write(val, this._woffset, encoding);
        this._advance_write(wbuf, size);
    }

    // READ
    async readUInt8() {
        const { buf, offset } = await this._get_read_buffer(1);
        return buf.readUInt8(offset);
    }
    async readUInt16LE() {
        const { buf, offset } = await this._get_read_buffer(2);
        return buf.readUInt16LE(offset);
    }
    async readUInt16BE() {
        const { buf, offset } = await this._get_read_buffer(2);
        return buf.readUInt16BE(offset);
    }
    async readUInt32LE() {
        const { buf, offset } = await this._get_read_buffer(4);
        return buf.readUInt32LE(offset);
    }
    async readUInt32BE() {
        const { buf, offset } = await this._get_read_buffer(4);
        return buf.readUInt32BE(offset);
    }
    async readUInt64LE() {
        const { buf, offset } = await this._get_read_buffer(8);
        return readUInt64LE(buf, offset);
    }
    async readUInt64BE() {
        const { buf, offset } = await this._get_read_buffer(8);
        return readUInt64BE(buf, offset);
    }
    async readInt8() {
        const { buf, offset } = await this._get_read_buffer(1);
        return buf.readInt8(offset);
    }
    async readInt16LE() {
        const { buf, offset } = await this._get_read_buffer(2);
        return buf.readInt16LE(offset);
    }
    async readInt16BE() {
        const { buf, offset } = await this._get_read_buffer(2);
        return buf.readInt16BE(offset);
    }
    async readInt32LE() {
        const { buf, offset } = await this._get_read_buffer(4);
        return buf.readInt32LE(offset);
    }
    async readInt32BE() {
        const { buf, offset } = await this._get_read_buffer(4);
        return buf.readInt32BE(offset);
    }
    async readInt64LE() {
        const { buf, offset } = await this._get_read_buffer(8);
        return readInt64LE(buf, offset);
    }
    async readInt64BE() {
        const { buf, offset } = await this._get_read_buffer(8);
        return readInt64BE(buf, offset);
    }
    async readFloatLE() {
        const { buf, offset } = await this._get_read_buffer(4);
        return buf.readFloatLE(offset);
    }
    async readFloatBE() {
        const { buf, offset } = await this._get_read_buffer(4);
        return buf.readFloatBE(offset);
    }
    async readDoubleLE() {
        const { buf, offset } = await this._get_read_buffer(8);
        return buf.readDoubleLE(offset);
    }
    async readDoubleBE() {
        const { buf, offset } = await this._get_read_buffer(8);
        return buf.readDoubleBE(offset);
    }
    async readString(size, encoding = 'utf8') {
        const { buf, offset } = await this._get_read_buffer(size);
        return buf.toString(encoding, offset, offset + size);
    }
}

function writeUInt64LE(buf, val, pos) {
    const [high, low] = uint64_split(val);
    buf.writeUInt32LE(low, pos);
    buf.writeUInt32LE(high, pos + 4);
}

function writeUInt64BE(buf, val, pos) {
    const [high, low] = uint64_split(val);
    buf.writeUInt32BE(high, pos);
    buf.writeUInt32BE(low, pos + 4);
}

function writeInt64LE(buf, val, pos) {
    const [high, low] = int64_split(val);
    buf.writeUInt32LE(low, pos);
    buf.writeUInt32LE(high, pos + 4);
}

function writeInt64BE(buf, val, pos) {
    const [high, low] = int64_split(val);
    buf.writeUInt32BE(high, pos);
    buf.writeUInt32BE(low, pos + 4);
}

function readUInt64LE(buf, pos) {
    const low = buf.readUInt32LE(pos);
    const high = buf.readUInt32LE(pos + 4);
    return uint64_merge(high, low);
}

function readUInt64BE(buf, pos) {
    const high = buf.readUInt32BE(pos);
    const low = buf.readUInt32BE(pos + 4);
    return uint64_merge(high, low);
}

function readInt64LE(buf, pos) {
    const low = buf.readUInt32LE(pos);
    const high = buf.readUInt32LE(pos + 4);
    return int64_merge(high, low);
}

function readInt64BE(buf, pos) {
    const high = buf.readUInt32BE(pos);
    const low = buf.readUInt32BE(pos + 4);
    return int64_merge(high, low);
}

function uint64_split(val) {
    /* eslint-disable no-bitwise */
    if (!Number.isSafeInteger(val)) return val;
    const low = int32_abs(val & 0xffffffff);
    const high = val > 0xffffffff ? ((val - low) / (0xffffffff + 1)) : 0;
    return [high, low];
}

function int64_split(val) {
    /* eslint-disable no-bitwise */
    if (!Number.isSafeInteger(val)) return val;
    if (val > -1) return uint64_split(val);
    const [high_neg, low_neg] = uint64_split(-val);
    const high = int32_ones_complement(high_neg);
    const low = int32_ones_complement(low_neg);
    return (low === 0xffffffff) ? [high + 1, 0] : [high, low + 1];
}

function uint64_merge(high, low) {
    /* eslint-disable no-bitwise */
    const val = (high * (0xffffffff + 1)) + low;
    return Number.isSafeInteger(val) ? val : [high, low];
}

function int64_merge(high, low) {
    /* eslint-disable no-bitwise */
    if (high & 0x80000000 === 0) return uint64_merge(high, low);
    high = int32_ones_complement(high);
    low = int32_ones_complement(low);
    return -((high * (0xffffffff + 1)) + low + 1);
}

function int32_abs(val) {
    /* eslint-disable no-bitwise */
    return val < 0 ? (val & 0x7fffffff) + 0x80000000 : val;
}

function int32_ones_complement(val) {
    /* eslint-disable no-bitwise */
    return int32_abs(~val);
}

function defer() {
    let resolve;
    let reject;
    const promise = new Promise((resolve_arg, reject_arg) => {
        if (reject) return reject_arg(reject);
        if (resolve) return resolve_arg(resolve);
        reject = reject_arg;
        resolve = resolve_arg;
    });
    return {
        promise,
        resolve: val => {
            if (resolve) resolve(val);
            else resolve = val;
        },
        reject: err => {
            if (reject) reject(err);
            else reject = err;
        },
    };
}

// const CRC_POLY = 0x1EDC6F41;
const CRC_POLY_REVERSE = 0x82F63B78;
const CRC_TABLE = (function() {
    /* eslint-disable no-bitwise */
    const table = [];
    table.length = 256;
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (var k = 0; k < 8; k++) {
            c = (c & 1) ? (c >>> 1) ^ CRC_POLY_REVERSE : c >>> 1;
        }
        table[n] = c;
    }
    return table;
}());

function crc32_buffer(crc, buf, offset = 0, count = buf.length) {
    /* eslint-disable no-bitwise */
    for (var i = 0; i < count; i++) {
        crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[offset + i]) & 0xFF];
    }
    return crc >>> 0;
}

// function crc32_byte(crc, byte) {
//     /* eslint-disable no-bitwise */
//     return ((crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xFF]) >>> 0;
// }

exports.AbstractIO = AbstractIO;
exports.SizeIO = SizeIO;
exports.BufferIO = BufferIO;
exports.BufferListIO = BufferListIO;
exports.StreamIO = StreamIO;
