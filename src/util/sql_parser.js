/* Copyright (C) 2016 NooBaa */
'use strict';

const fs = require('fs');
const vm = require('vm');
const path = require('path');
const util = require('util');
const moo = require('moo');

const nearley = require('nearley');
const nearlry_lint = require('nearley/lib/lint');
const nearlry_compile = require('nearley/lib/compile');
const nearlry_generate = require('nearley/lib/generate');
const nearlry_lang = require('nearley/lib/nearley-language-bootstrapped');

class SqlParser {

    constructor(debug) {
        this.debug = debug;
    }

    parse(sql) {
        const parser = this._get_parser();
        parser.feed(sql);
        if (this.debug) {
            const state_to_index = new Map();
            parser.table.forEach((column, c) => {
                column.states.forEach((state, r) => {
                    state_to_index.set(state, `${c}:${r}`);
                });
            });
            parser.table.forEach((column, c) => {
                column.states.forEach((state, r) => {
                    console.log(`${c}:${r} from [${
                            state.wantedBy.map(s => state_to_index.get(s)).join(',')
                        }] {${state.rule.toString(state.dot)}}`);
                    if (state.data && state.data.length) {
                        console.log('data', util.inspect(state.data, true, null, true));
                    }
                });
            });
        }
        return parser.results[0];
    }

    _get_parser() {
        if (this._parser) return this._parser;
        this._parser = new nearley.Parser(this._get_grammer(), {
            keepHistory: this.debug
        });
        return this._parser;
    }

    _get_grammer() {
        if (this._grammer) return this._grammer;
        const generated = this._get_generated_grammer();
        const lexer = this._get_lexer();
        // run the grammer module in order to capture it's exported grammer object
        const context = {
            module: { exports: {} },
            lexer,
        };
        vm.runInNewContext(generated, context);
        this._grammer = nearley.Grammar.fromCompiled(context.module.exports);
        return this._grammer;
    }

    _get_generated_grammer() {
        if (this._generated_grammer) return this._generated_grammer;

        const grammer_path = path.join(__dirname, 'sql.nearley');
        const sql_nearley = fs.readFileSync(grammer_path, 'utf8');
        const parsed = this._parse_nearley_lang(sql_nearley);

        // compile and generate grammer module to string
        const compiled = nearlry_compile(parsed, {});
        nearlry_lint(compiled, {});
        this._generated_grammer = nearlry_generate(compiled, 'grammer');
        return this._generated_grammer;
    }

    _parse_nearley_lang(input) {
        const nearley_lang_parser = this._get_nearley_lang_parser();
        nearley_lang_parser.feed(input);
        return nearley_lang_parser.results[0];
    }

    // create a parser for the nearley language
    _get_nearley_lang_parser() {
        if (this._nearley_lang_parser) return this._nearley_lang_parser;
        const grammer = nearley.Grammar.fromCompiled(nearlry_lang);
        this._nearley_lang_parser = new nearley.Parser(grammer);
        return this._nearley_lang_parser;
    }

    // LEXER  : https://github.com/tjvr/moo
    // moo is a fast lexer/tokenizer
    // we use it to process the text and spit out larger tokens to the nearley parser
    _get_lexer() {
        if (this._lexer) return this._lexer;
        const lexer_rules_map = this._get_lexer_rules_map();
        const moo_base = this._get_moo_base();
        const moo_lexer = moo_base.clone();
        this._lexer = {
            debug: this.debug,
            next() {
                // swallow whitespace and comments
                var tok = moo_lexer.next();
                var nswallowed = 0;
                while (tok && (tok.type === 'WHITESPACE' || tok.type === 'COMMENT')) {
                    tok = moo_lexer.next();
                    nswallowed += 1;
                }
                if (tok) tok.nswallowed = nswallowed;
                if (this.debug && tok) console.log('TOKEN', tok.type, tok.value);
                return tok;
            },
            has(token_type) {
                return lexer_rules_map.has(token_type);
            },
            reset(chunk, info) {
                return moo_lexer.reset(chunk, info);
            },
            save() {
                return moo_lexer.save();
            },
            formatError(token) {
                return moo_lexer.formatError(token);
            },
        };
        return this._lexer;
    }

    // build rules map for the sake of implementing lexer.has()
    _get_lexer_rules_map() {
        if (this._lexer_rules_map) return this._lexer_rules_map;
        this._lexer_rules_map = new Map();
        const lexer_rules = this._get_lexer_rules();
        for (var i = 0; i < lexer_rules.length; ++i) {
            this._lexer_rules_map.set(lexer_rules[i].name, lexer_rules[i]);
        }
        return this._lexer_rules_map;
    }

    _get_moo_base() {
        if (this._moo_base) return this._moo_base;
        this._moo_base = moo.compile(this._get_lexer_rules());
        return this._moo_base;
    }

    _get_lexer_rules() {
        if (this._lexer_rules) return this._lexer_rules;

        this._lexer_rules = [

            // NOTE: regexp tokens must use non-capture group (?: ... ) instead of plain groups ( ... )
            // otherwise it will mix up with moo's groups.

            // regexp tokens
            {
                name: 'COMMENT',
                match: /[/][*](?:.|\n)*?[*][/]/,
                lineBreaks: true
            }, {
                name: 'STRING',
                match: /'(?:\\['\\]|[^\n'\\])*?'/
            }, {
                name: 'DBL_STRING',
                match: /"(?:\\["\\]|[^\n"\\])*?"/
            }, {
                name: 'IDENTIFIER',
                match: /[a-zA-Z_][a-zA-Z0-9_]*/
            }, {
                name: 'NUMBER',
                match: /[0-9]+(?:\.[0-9]+)?/
            }, {
                name: 'WHITESPACE',
                match: /\s+/,
                lineBreaks: true
            },

            // symbols
            {
                name: 'DOT',
                match: '.'
            }, {
                name: 'COMMA',
                match: ','
            }, {
                name: 'SEMICOLON',
                match: ';'
            }, {
                name: 'PLUS',
                match: '+'
            }, {
                name: 'MINUS',
                match: '-'
            }, {
                name: 'DIVIDE',
                match: '/'
            }, {
                name: 'STAR',
                match: '*'
            }, {
                name: 'MODULO',
                match: '%'
            }, {
                name: 'EQ',
                match: '='
            }, {
                name: 'NEQ',
                match: ['!=', '<>']
            }, {
                name: 'GTE',
                match: '>='
            }, {
                name: 'GT',
                match: '>'
            }, {
                name: 'LTE',
                match: '<='
            }, {
                name: 'LT',
                match: '<'
            }, {
                name: 'LPAREN',
                match: '('
            }, {
                name: 'RPAREN',
                match: ')'
            }, {
                name: 'CONCAT',
                match: '||'
            }, {
                name: 'BIND',
                match: '?'
            },
        ];

        // add reserved words as keyword rules
        // these will override the identifier rule when matched
        // and therefore behave as reserved words
        fs.readFileSync(path.join(__dirname, 'sql_reserved_words.txt'), 'utf8')
            .split('\n')
            .forEach(keyword => {
                keyword = keyword.trim();
                if (!keyword || keyword.startsWith('#')) return;
                const upper = keyword.toUpperCase();
                const lower = keyword.toLowerCase();
                const capital = upper[0] + lower.slice(1);
                this._lexer_rules.push({
                    name: upper,
                    match: [upper, lower, capital]
                });
            });

        return this._lexer_rules;
    }

}


exports.SqlParser = SqlParser;
