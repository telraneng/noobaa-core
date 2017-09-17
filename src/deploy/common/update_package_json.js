/* Copyright (C) 2016 NooBaa */
'use strict';

const fs = require('fs');

const arg = process.argv[2];

const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
const git = process.env.GIT_COMMIT || 'DEVONLY';
const version = pkg.version.split('-')[0] + '-' + git.slice(0, 7);

if (arg === 'version') {
    console.log(version);
    process.exit(0);
}


const is_agent = arg === 'agent';
const EXCLUDE_DEPS = /mocha|istanbul|eslint|vsphere/;
const INCLUDE_DEV_DEPS = is_agent ? /nomatch^/ : /babel/;

const name = is_agent ? 'noobaa-agent' : 'noobaa-NVA';
const license = 'Copyright (C) 2016 NooBaa all rights reserved';
const scripts = pkg.scripts;
const browser = pkg.browser;
const dependencies = {};
const devDependencies = {};
const optionalDependencies = pkg.optionalDependencies;

for (const dep of Object.keys(pkg.dependencies)) {
    if (EXCLUDE_DEPS.test(dep)) {
        console.warn('exclude dependency:', dep);
    } else {
        dependencies[dep] = pkg.dependencies[dep];
    }
}

for (const dep of Object.keys(pkg.devDependencies)) {
    if (INCLUDE_DEV_DEPS.test(dep)) {
        devDependencies[dep] = pkg.devDependencies[dep];
    }
}

const new_pkg = {
    name,
    version,
    private: true,
    license,
    scripts,
    browser,
    dependencies,
    devDependencies,
    optionalDependencies,
};

fs.writeFileSync('./package.json', JSON.stringify(new_pkg, null, 2) + '\n');

console.log(version);
