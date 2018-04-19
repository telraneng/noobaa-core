/* Copyright (C) 2016 NooBaa */
'use strict';

const _ = require('lodash');
const fs = require('fs');
const util = require('util');
const path = require('path');
const argv = require('minimist')(process.argv);
const parsimmon = require('parsimmon');

const async_read_file = util.promisify(fs.readFile);
const INSPECT_OPTIONS = { depth: null, colors: true, breakLength: 120 };

function create_lang() {

    const {
        string,
        regexp,
        index,
        eof,
        alt,
        seq,
        seqMap,
        sepBy,
        createLanguage
    } = parsimmon;

    const dbgtok = (name, x) => (
        argv.debug ?
        seqMap(index, x.desc(name), index, (start, val, end) => {
            if (name === 'IGNORE' && argv.debug < 2) return;
            let s = (name === String(val)) ? '' : JSON.stringify(val);
            if (s.length > 80) s = s.slice(0, 50) + '...' + s.slice(-50);
            console.log(
                `line ${start.line} col ${start.column}`.padEnd(18),
                ` - `,
                `line ${end.line} col ${end.column}`.padEnd(18),
                name,
                s ? `(${s})` : ''
            );
            return val;
        }) :
        x.desc(name)
    );

    const strtok = (l, s) => dbgtok(s, string(s).skip(l.IGNORE));
    const retok = (l, name, r) => dbgtok(name, regexp(r).skip(l.IGNORE));

    const type_spec = (l, type, spec) => seqMap(
        type,
        alt( // spec | id spec | id
            spec.map(s => ([undefined, s])),
            seq(l.ID, spec),
            l.ID.map(id => ([id])),
        ),
        (t, [id, s]) => ({ t, id, spec: s })
    );

    return createLanguage({

        // symbols
        LP: l => strtok(l, '('),
        RP: l => strtok(l, ')'),
        LC: l => strtok(l, '{'),
        RC: l => strtok(l, '}'),
        LB: l => strtok(l, '['),
        RB: l => strtok(l, ']'),
        LT: l => strtok(l, '<'),
        RT: l => strtok(l, '>'),
        STAR: l => strtok(l, '*'),
        EQUAL: l => strtok(l, '='),
        COMMA: l => strtok(l, ','),
        COLON: l => strtok(l, ':'),
        SEMICOLON: l => strtok(l, ';'),

        // keywords
        VOID_T: l => strtok(l, 'void'),
        BOOL_T: l => strtok(l, 'bool'),
        TRUE_T: l => strtok(l, 'TRUE'),
        FALSE_T: l => strtok(l, 'FALSE'),
        STRING_T: l => strtok(l, 'string'),
        OPAQUE_T: l => strtok(l, 'opaque'),
        INT_T: l => strtok(l, 'int'),
        INT8_T: l => strtok(l, 'int8_t'),
        INT16_T: l => strtok(l, 'int16_t'),
        INT32_T: l => strtok(l, 'int32_t'),
        INT64_T: l => strtok(l, 'int64_t'),
        UNSIGNED_T: l => strtok(l, 'unsigned'),
        UINT_T: l => l.UNSIGNED_T.then(l.INT_T).result('uint'),
        UINT8_T: l => strtok(l, 'uint8_t'),
        UINT16_T: l => strtok(l, 'uint16_t'),
        UINT32_T: l => strtok(l, 'uint32_t'),
        UINT64_T: l => strtok(l, 'uint64_t'),
        CONST_T: l => strtok(l, 'const'),
        TYPEDEF_T: l => strtok(l, 'typedef'),
        ENUM_T: l => strtok(l, 'enum'),
        UNION_T: l => strtok(l, 'union'),
        SWITCH_T: l => strtok(l, 'switch'),
        CASE_T: l => strtok(l, 'case'),
        DEFAULT_T: l => strtok(l, 'default'),
        STRUCT_T: l => strtok(l, 'struct'),
        PROGRAM_T: l => strtok(l, 'program'),
        VERSION_T: l => strtok(l, 'version'),

        // dynamic tokens
        ID: l => retok(l, 'IDENTIFIER', /[_a-zA-Z][_a-zA-Z0-9]*/),
        NUM: l => retok(l, 'NUMBER', /-?0x[0-9a-fA-F]+|-?\d+[.]?\d*(?:[eE][+-]?\d+)?/).map(Number),

        // whitespace and comments
        IGNORE: l => dbgtok('IGNORE', regexp(/(?:[/][*](?:.|\n)*?[*][/]|[/][/][^\n]*?$|#if 0(?:.|\n)*?#endif|\s+)*/m)),

        // XDR ///////////

        RVALUE: l => alt(
            l.ID,
            l.NUM,
            l.TRUE_T.result(true),
            l.FALSE_T.result(false),
        ),

        TYPE: l => alt(
            l.ENUM,
            l.UNION,
            l.STRUCT,
            l.VOID_T,
            l.BOOL_T,
            l.STRING_T,
            l.OPAQUE_T,
            l.UINT8_T, l.UINT16_T, l.UINT32_T, l.UINT64_T, l.UINT_T,
            l.INT8_T, l.INT16_T, l.INT32_T, l.INT64_T, l.INT_T,
            l.ID,
        ),

        VAR: l => alt(
            seqMap(l.TYPE, l.ID, l.RVALUE.fallback().wrap(l.LT, l.RT), (type, id, size) =>
                ({ var: 'vararray', id, type, size })
            ),
            seqMap(l.TYPE, l.ID, l.RVALUE.fallback().wrap(l.LB, l.RB), (type, id, size) =>
                ({ var: 'array', id, type, size })
            ),
            seqMap(l.TYPE, l.STAR, l.ID, (type, _1, id) =>
                ({ var: 'optional', id, type })
            ),
            seqMap(l.TYPE, l.ID, (type, id) =>
                ({ var: 'var', id, type })
            ),
        ),

        CONST: l => seqMap(
            l.CONST_T,
            l.ID,
            l.EQUAL,
            l.RVALUE,
            (t, id, _1, v) => ({ t, id, v })
        ),

        TYPEDEF: l => seqMap(
            l.TYPEDEF_T,
            l.VAR,
            (t, v) => ({ t, ...v })
        ),

        ENUM: l => type_spec(l,
            l.ENUM_T,
            sepBy(l.ENUM_VAL, l.COMMA).wrap(l.LC, l.RC)
        ),

        ENUM_VAL: l => seqMap(
            l.ID,
            l.EQUAL.then(l.RVALUE).fallback(),
            (id, v) => ({ id, v })
        ),

        UNION: l => type_spec(l,
            l.UNION_T,
            seqMap(
                l.SWITCH_T.then(l.VAR.wrap(l.LP, l.RP)),
                l.CASE.many().wrap(l.LC, l.RC),
                (sw, cases) => ({ switch: sw, cases })
            )
        ),

        CASE: l => seqMap(
            alt(
                l.DEFAULT_T,
                l.CASE_T.then(l.RVALUE)
            ).skip(l.COLON),
            alt(
                l.VOID_T.skip(l.SEMICOLON),
                l.VAR.skip(l.SEMICOLON).atLeast(1),
            ).fallback('fallthrough'),
            (c, v) => ({ case: c, v })
        ),

        STRUCT: l => type_spec(l,
            l.STRUCT_T,
            l.VAR
            .skip(l.SEMICOLON)
            .many()
            .wrap(l.LC, l.RC)
        ),

        PROGRAM: l => seqMap(
            l.PROGRAM_T,
            l.ID,
            l.VERSION.many().wrap(l.LC, l.RC),
            l.EQUAL.then(l.NUM),
            (t, id, versions, num) => ({ t, id, num, versions })
        ),

        VERSION: l => seqMap(
            l.VERSION_T,
            l.ID,
            l.PROC.many().wrap(l.LC, l.RC),
            l.NUM.wrap(l.EQUAL, l.SEMICOLON),
            (t, id, procs, num) => ({ t, id, num, procs })
        ),

        PROC: l => seqMap(
            l.TYPE,
            l.ID,
            l.TYPE.wrap(l.LP, l.RP),
            l.NUM.wrap(l.EQUAL, l.SEMICOLON),
            (res, id, req, num) => ({ t: 'proc', id, num, req, res })
        ),

        STMT: l => alt(
                l.CONST,
                l.TYPEDEF,
                l.ENUM,
                l.UNION,
                l.STRUCT,
                l.PROGRAM,
            )
            .skip(l.SEMICOLON),

        XDR: l => l.STMT.many().trim(l.IGNORE).skip(eof),
    });
}


const xdr_lang = create_lang();

function parse_xdr(xdr_input) {
    const xdr = xdr_lang.XDR.parse(xdr_input);
    if (!xdr.status || !xdr.value) {
        throw new Error(`Failed to parse XDR ${util.inspect(xdr, INSPECT_OPTIONS)}`);
    }
    const order = {
        const: 1,
        typedef: 2,
        enum: 3,
        union: 4,
        struct: 5,
        program: 6,
    };
    xdr.value.sort((a, b) => (order[a.t] || 0) - (order[b.t] || 0));
    xdr.ids = _.groupBy(xdr.value, 'id');
    return xdr;
}

function print_xdr(xdr) {
    for (const v of xdr.value) {
        console.log(util.inspect(v, INSPECT_OPTIONS));
    }
}

async function load_xdr(name) {
    const fname = path.join(__dirname, `${name}.x`);
    const input = await async_read_file(fname, 'utf8');
    return parse_xdr(input);
}

async function main() {
    try {
        const xdr = await load_xdr(argv.file || 'nfs');
        print_xdr(xdr);
    } catch (err) {
        console.error(err.stack);
    }
}

exports.parse_xdr = parse_xdr;
exports.load_xdr = load_xdr;
if (require.main === module) main();
