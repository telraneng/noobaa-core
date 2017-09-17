/* Copyright (C) 2016 NooBaa */
'use strict';

const child_process = require('child_process');

class Expect {

    constructor({ output }) {
        this._output = output || (() => { /*noop*/ });
        this._stdout = '';
        this._stderr = '';
        this._expects = [];
        this.MAX = 100000;
    }

    spawn(cmd, args) {
        console.log('=====> spawn:', cmd, args);
        this._proc = child_process
            .spawn(cmd, args, { stdio: 'pipe' })
            .on('error', err => console.error('=====> spawn: error', err))
            .on('exit', (code, signal) => console.error('=====> spawn: exit', code, signal));

        this._proc.stdout.on('data', data => {
            this._output(data);
            this._stdout = (this._stdout + data.toString()).slice(-this.MAX);
            this._check_expects();
        });
        this._proc.stderr.on('data', data => {
            this._output(data);
            this._stderr = (this._stderr + data.toString()).slice(-this.MAX);
            this._check_expects();
        });
    }

    expect(str, timeout) {
        const e = {
            str,
            resolve: null,
            reject: null,
            timeout: setTimeout(() => this._on_timeout(e), timeout ? timeout : 10000)
        };
        this._expects.push(e);
        return new Promise((resolve, reject) => {
            e.resolve = resolve;
            e.reject = reject;
            this._check_expects();
        });
    }

    send(str) {
        console.log('=====> send:', str);
        this._proc.stdin.write(str);
        this._flush();
    }

    end() {
        console.log('=====> end:');
        this._proc.stdin.end();
        this._flush();
    }

    _check_expects() {
        for (var i = this._expects.length - 1; i >= 0; --i) {
            const e = this._expects[i];
            if (this._stdout.search(e.str) >= 0) {
                console.log('=====> expect:', e.str);
                e.resolve();
                clearTimeout(e.timeout);
                this._expects.splice(i, 1);
            }
        }
    }

    _on_timeout(e) {
        e.reject(new Error('TIMEOUT'));
        this._proc.kill();
    }

    _flush() {
        this._stdout = '';
        this._stderr = '';
    }


    static output_raw(data) {
        process.stdout.write(data);
    }

    static output_stripped(data) {
        process.stdout.write(Expect.strip_ansi_escape_codes(data.toString()));
    }

    static strip_ansi_escape_codes(str) {
        const ansi_escape_codes_regexp = /[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[a-zA-Z\d]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PRZcf-ntqry=><~]))/g;
        return str
            .replace(ansi_escape_codes_regexp, ' ')
            .replace(/t?q{4,}u?/g, ' ')
            .replace(/m?q{4,}j?/g, ' ')
            .replace(/l?q{4,}j?/g, ' ')
            .replace(/[ ]{2,}/g, ' ')
            .replace(/^\s*$/gm, '');
    }

    // useful ansi codes

    static get UP() {
        return '\x1BOA';
    }
    static get DOWN() {
        return '\x1BOB';
    }
    static get RIGHT() {
        return '\x1BOC';
    }
    static get LEFT() {
        return '\x1BOD';
    }

}

/**
 * Usage example
 *
 * NOTES:
 *
 * 1. the double -t -t for ssh is not a mistake!
 *    it is needed to force ssh to create a pseudo-tty eventhough stdin is a pipe.
 *
 * 2. sending user password doesn't work (not sure why yet)
 *    so you need to stick your public key (id_rsa.pub) to the host's /home/noobaa/.ssh/authorized_keys
 *
 */
function first_install(host) {
    const raw = false;
    const e = new Expect({
        output: raw ? Expect.output_raw : Expect.output_stripped,
    });

    return Promise.resolve()
        .then(() => e.spawn('ssh', ['-t', '-t', `noobaa@${host}`]))
        .then(() => e.expect('Are you sure you wish to override the previous configuration'))
        .then(() => e.send('y'))
        .then(() => e.expect('This is a short first install wizard'))
        .then(() => e.send('\r'))
        .then(() => e.expect('Choose one of the items below'))
        .then(() => e.send(`${Expect.DOWN}${Expect.DOWN}${Expect.DOWN}\r`))
        .then(() => e.expect('was configured and is ready to use'))
        .then(() => e.send('\r'))
        .then(() => e.end())
        .catch(err => console.error('FAILED', err));
}

if (require.main === module) {
    setImmediate(() => first_install(process.argv[2]));
}

exports.Expect = Expect;
