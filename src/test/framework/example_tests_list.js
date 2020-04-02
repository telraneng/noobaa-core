/* Copyright (C) 2016 NooBaa */
'use strict';

const tests = [{
    name: 'system-config',
    test: './src/test/unit_tests/example.test.js',
    server_cpu: '400m',
    server_mem: '400Mi',
    agent_cpu: '250m',
    agent_mem: '150Mi'
} ;

module.exports = tests;
