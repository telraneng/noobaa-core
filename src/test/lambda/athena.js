/* Copyright (C) 2016 NooBaa */
'use strict';

const AWS = require('aws-sdk');
const util = require('util');
const SqlParser = require('../../util/sql_parser').SqlParser;

const lambda = new AWS.Lambda();
const s3 = new AWS.S3();

function handler(event, context, callback) {
    return Promise.resolve()
        .then(() => {
            if (event.sql) {
                return process_sql(event.sql, event.debug);
            }
            if (event.query && event.bucket && event.file) {
                return process_file(event.query, event.bucket, event.file);
            }
        })
        .then(
            res => callback(null, res),
            err => callback(err instanceof Error ? err : new Error(err.message))
        );
}

function process_sql(sql, debug) {
    console.log('SQL:', sql);
    const sql_parser = new SqlParser(debug);
    const sql_list = sql_parser.parse(sql);
    console.log('PARSED:', util.inspect(sql_list, true, null, true));
    if (!sql_list || sql_list.length !== 1 || sql_list[0].t !== 'SELECT') {
        throw new Error('SQL PARSE EXPECTS SINGLE SELECT QUERY');
    }
    const query = sql_list[0];
    if (!query.from) return query.columns.map(n => evaluate(n.v));
    if (query.from.length !== 1) throw new Error('TODO JOIN');
    const from = query.from[0].v.v || '';
    const from_slash = from.indexOf('/');
    const bucket = from_slash < 0 ? from : from.slice(0, from_slash);
    const prefix = from_slash < 0 ? '' : from.slice(from_slash + 1);
    const results = new_results(query);
    return loop();

    function loop(list) {
        const list_completed = list && !list.IsTruncated && !list.Contents.length;
        if (list_completed || results.completed) {
            return process_results(query, results);
        }

        const list_objects_promise =
            (!list || list.IsTruncated) &&
            make_promise(cb => s3.listObjects({
                Bucket: bucket,
                Prefix: prefix,
                Marker: list && list.NextMarker,
                MaxKeys: 20,
            }, cb));

        const process_objects_promise =
            list &&
            Promise.all(list.Contents.map(file =>
                make_promise(cb => lambda.invoke({
                    FunctionName: 'athena',
                    Payload: JSON.stringify({
                        query,
                        bucket,
                        file: file.Key,
                    }),
                }, cb))
                .then(items => process_items(query, results, items))
            ));

        return Promise.all([list_objects_promise, process_objects_promise])
            .then(([next_list]) => loop(next_list));
    }
}

function process_file(query, bucket, file) {
    return make_promise(cb => s3.getObject({
            Bucket: bucket,
            Key: file,
        }, cb))
        .then(res => {
            const lines = res.Body.toString().split('\n');
            const items = [];
            for (var i = 0; i < lines.length; ++i) {
                try {
                    const item = JSON.parse(lines[i].trim());
                    const processed_item = process_item(query, item);
                    if (processed_item) items.push(processed_item);
                } catch (err) {
                    // TODO handle parsing errors?
                }
            }
            return items;
        });
}

function process_item(query, item) {
    if (query.where && !evaluate(query.where, item)) return;
    const fields = {};
    const nodes = [
        query.columns,
        query.order_by,
        query.group_by,
        query.having,
    ];
    while (nodes.length) {
        const n = nodes.pop();
        if (!n) continue;
        if (Array.isArray(n)) {
            nodes.push(...n);
            continue;
        }
        if (!n.t) continue;
        if (n.t === 'ID') {
            fields[n.v] = fix_null(n.v.split('/').reduce((obj, p) => obj && obj[p], item));
            continue;
        }
        if (n.t === 'STAR') {
            fields['*'] = fix_null(item);
            continue;
        }
        for (var k in n) {
            if (typeof n[k] === 'object') nodes.push(n[k]);
        }
    }
    return fields;
}

function new_results(query) {
    return {
        rows: [],
        group_by: query.group_by ? new Map() : null,
        order_by: query.order_by ? new Map() : null,
        completed: false,
    };
}

function process_items(query, results, items) {
    for (var i = 0; i < items.length; i++) {
        const item = items[i];
        let row;
        let group;
        let group_mm;
        if (query.group_by) {
            if (query.having && !evaluate(query.having, item)) continue;
            group = query.group_by.map(n => evaluate(n.v, item));
            group_mm = make_multi_map(results.group_by, group);
            row = group_mm.get(group[group.length - 1]);
            // console.log('GROUP', group, group_mm, row);
        }
        if (row) {
            for (var c = 0; c < query.columns.length; ++c) {
                const n = query.columns[c];
                const state = row.columns[c];
                const value = evaluate(n.v, item, state);
                row.columns[c] = value;
                // console.log('COLUMN', n.v, 'state', state, 'value', value);
            }
            if (query.order_by) {
                // TODO
            }
        } else {
            row = {
                item,
                group,
                columns: query.columns.map(n => evaluate(n.v, item)),
                order: query.order_by && query.order_by.map(n => evaluate(n.v, item)),
            };
            if (group) group_mm.set(group[group.length - 1], row);
            if (query.order_by) {
                // TODO
            } else {
                results.rows.push(row);
            }
        }
        // console.log('ROW', row, 'item', item);
    }
    if (query.top || query.top === 0) {
        results.completed = !query.group_by && !query.order_by && results.rows.length >= query.top;
    }
}

function process_results(query, results) {
    // console.log(util.inspect(results, true, null, true));
    const rows = query.top ?
        results.rows.slice(0, query.top) :
        results.rows;
    const table = rows.map(r => r.columns);
    table.unshift(query.columns.map(n => n.alias || n.text));
    return table;
}

// eslint-disable-next-line complexity, max-statements
function evaluate(n, item, state) {
    if (!n) return null;
    if (n.t === 'VALUE') {
        return fix_null(n.v);
    }
    if (n.t === 'ID') {
        return fix_null(item && item[n.v]);
    }
    if (n.t === 'STAR') {
        return fix_null(item && item['*']);
    }
    // if (n.t === 'BIND') { TODO }

    if (n.t === 'COLUMN') {
        return evaluate(n.v, item, state);
    }
    if (n.t === 'NOT') {
        return !evaluate(n.v, item, state);
    }
    if (n.t === 'AND') {
        for (let i = 0; i < n.v.length; ++i) {
            if (!evaluate(n.v[i], item, state)) return false;
        }
        return true;
    }
    if (n.t === 'OR') {
        for (let i = 0; i < n.v.length; ++i) {
            if (evaluate(n.v[i], item, state)) return true;
        }
        return false;
    }

    if (n.t === 'OPERAND') {
        const left = evaluate(n.l, item, state);
        const right = evaluate(n.r, item, state);
        if (left === null || right === null) return null;
        if (n.op === '||') return String(left) + String(right);
    }
    if (n.t === 'SUMMAND') {
        const left = evaluate(n.l, item, state);
        const right = evaluate(n.r, item, state);
        if (left === null || right === null) return null;
        if (n.op === '+') return left + right;
        if (n.op === '-') return left - right;
    }
    if (n.t === 'FACTOR') {
        const left = evaluate(n.l, item, state);
        const right = evaluate(n.r, item, state);
        if (left === null || right === null) return null;
        if (n.op === '*') return left * right;
        if (n.op === '/') return left / right;
        if (n.op === '%') return left % right;
    }

    if (n.t === 'IS') {
        const left = evaluate(n.l, item);
        const right = evaluate(n.r, item);
        const res = n.distinctFrom ? (left !== right) : (left === right);
        return n.not ? !res : res;
    }
    if (n.t === 'COMPARE') {
        const left = evaluate(n.l, item);
        const right = evaluate(n.r, item);
        if (n.op === '=') return left === right;
        if (n.op === '<>') return left !== right;
        if (n.op === '!=') return left !== right;
        if (n.op === '>') return left > right;
        if (n.op === '<') return left < right;
        if (n.op === '<=') return left <= right;
        if (n.op === '>=') return left >= right;
        if (n.op === '!<') return left >= right;
        if (n.op === '!>') return left <= right;
    }
    if (n.t === 'BETWEEN') {
        const left = evaluate(n.l, item);
        const low = evaluate(n.r[0], item);
        const high = evaluate(n.r[1], item);
        const res = left >= low && left <= high;
        return n.not ? !res : res;
    }
    if (n.t === 'IN_LIST') {
        const left = evaluate(n.l, item);
        const right = n.v.map(c => evaluate(c, item));
        const res = right.includes(left);
        return n.not ? !res : res;
    }
    if (n.t === 'LIKE') {
        const left = evaluate(n.l, item);
        const like = evaluate(n.r, item);
        const regex_str = like.replace(/%/g, '.*').replace(/_/g, '.');
        const regex = new RegExp(`^${regex_str}$`);
        const res = regex.test(left);
        return n.not ? !res : res;
    }

    if (n.t === 'FUNC') {
        const args = [];
        if (n.args) {
            args.length = n.args.length;
            for (let i = 0; i < n.args.length; ++i) {
                args[i] = evaluate(n.args[i], item, state);
            }
        }
        const fn = n.name.toUpperCase();
        if (fn === 'GETDATE' || fn === 'NOW') {
            return new Date()
                .toISOString()
                .replace('T', ' ')
                .replace('Z', '');
        }
        if (fn === 'CONCAT') return args.join('');
        if (state) {
            if (fn === 'COUNT') return state + ((args[0] !== undefined && args[0] !== null) ? 1 : 0);
            if (fn === 'MAX') return (args[0] > state) ? args[0] : state;
            if (fn === 'MIN') return (args[0] < state) ? args[0] : state;
            if (fn === 'SUM') return state + args[0];
            if (fn === 'AVG') {
                if (args[0] !== undefined && args[0] !== null) {
                    state.sum += args[0];
                    state.count += 1;
                }
                return state;
            }
        } else {
            if (fn === 'COUNT') return args[0] ? 1 : 0;
            if (fn === 'MAX') return args[0];
            if (fn === 'MIN') return args[0];
            if (fn === 'SUM') return args[0];
            if (fn === 'AVG') {
                return {
                    op: 'AVG',
                    sum: args[0],
                    count: 1,
                };
            }
        }
    }

    // TODO unimplemented sub queries
    // if (n.t === 'EXISTS') {} // n.v = [{ node: 'Select' , ... }]
    // if (n.t === 'COMPARE_SELECT') {} // n.kind = 'all'|'any' and n.v = [{ node: 'SELECT' , ... }] }
    // if (n.t === 'IN_SELECT') {} // n.kind = 'all'|'any' and n.v = [{ node: 'SELECT' , ... }] }
    // if (n.t === 'DISTINCT') {} // n.v is expression that only distinct values should be sent to a function

    console.error('NOT IMPLEMENTED', util.inspect(n, {
        depth: null,
        maxArrayLength: null,
        colors: true,
        showHidden: true,
    }));
    throw new Error('NOT IMPLEMENTED');
}

function make_multi_map(map, keys) {
    const last = keys.length - 1;
    for (var i = 0; i < last; ++i) {
        const next = map.get(keys[i]);
        if (next) {
            map = next;
        } else {
            const new_map = new Map();
            map.set(keys[i], new_map);
            map = new_map;
        }
    }
    return map;
}

function fix_null(v) {
    const t = typeof v;
    return (t === 'undefined') || (t === 'number' && isNaN(v)) ? null : v;
}

function make_promise(func) {
    return new Promise((resolve, reject) => func((err, res) => (err ? reject(err) : resolve(res))));
}

exports.handler = handler;
