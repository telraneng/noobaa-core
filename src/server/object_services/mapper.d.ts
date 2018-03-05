/* Copyright (C) 2016 NooBaa */

export interface Chunk {
    frags: Frag[];
    blocks: Block[];
    chunk_coder_config: Coder_Config;
    // TODO
}

export interface Coder_Config {
    // TODO
}

export interface Frag {
    // TODO
}

export interface Block {
    // TODO
}

export interface Tiering {
    tiers: any;
    // TODO
}

export interface Tiering_Status {
    [tier_id: string]: Tier_Status;
}

export interface Tier_Status {
    mirrors_storage: any;
    // TODO
}

export interface Allocation {
    frag: Frag;
    // TODO
}

export interface Mapping {
    accessible: boolean;
    allocations: Allocation[];
    extra_allocations: Allocation[];
    deletions: Block[];
    missing_frags: Frag[];
}

export function map_chunk(chunk: Chunk, tiering: Tiering, tiering_status: Tiering_Status): Mapping;



//////////////////////////
// TEMPORARY MOCHA DEFS //
//////////////////////////

import * as mocha from 'mocha';

declare module 'mocha' {

    export const mocha: Mocha;
    export const describe: Mocha.IContextDefinition;
    export const xdescribe: Mocha.IContextDefinition;
    export const context: Mocha.IContextDefinition;
    export const suite: Mocha.IContextDefinition;
    export const it: Mocha.ITestDefinition;
    export const xit: Mocha.ITestDefinition;
    export const test: Mocha.ITestDefinition;
    export const specify: Mocha.ITestDefinition;

    export function setup(callback: (this: Mocha.IBeforeAndAfterContext, done: MochaDone) => any): void;
    export function teardown(callback: (this: Mocha.IBeforeAndAfterContext, done: MochaDone) => any): void;
    export function suiteSetup(callback: (this: Mocha.IHookCallbackContext, done: MochaDone) => any): void;
    export function suiteTeardown(callback: (this: Mocha.IHookCallbackContext, done: MochaDone) => any): void;
    export function before(callback: (this: Mocha.IHookCallbackContext, done: MochaDone) => any): void;
    export function before(description: string, callback: (this: Mocha.IHookCallbackContext, done: MochaDone) => any): void;
    export function after(callback: (this: Mocha.IHookCallbackContext, done: MochaDone) => any): void;
    export function after(description: string, callback: (this: Mocha.IHookCallbackContext, done: MochaDone) => any): void;
    export function beforeEach(callback: (this: Mocha.IBeforeAndAfterContext, done: MochaDone) => any): void;
    export function beforeEach(description: string, callback: (this: Mocha.IBeforeAndAfterContext, done: MochaDone) => any): void;
    export function afterEach(callback: (this: Mocha.IBeforeAndAfterContext, done: MochaDone) => any): void;
    export function afterEach(description: string, callback: (this: Mocha.IBeforeAndAfterContext, done: MochaDone) => any): void;

}
