export as namespace nb;

import { ObjectID } from 'mongodb';

type Semaphore = import('../util/semaphore');
type KeysSemaphore = import('../util/keys_semaphore');

type ID = ObjectID;
type BigInt = number | { n: number; peta: number; };
type Region = string;
type DigestType = 'sha1' | 'sha256' | 'sha384' | 'sha512';
type CompressType = 'snappy' | 'zlib';
type CipherType = 'aes-256-gcm';
type ParityType = 'isa-c1' | 'isa-rs' | 'cm256';
type ResourceType = 'HOSTS' | 'CLOUD' | 'INTERNAL';
type NodeType =
    'BLOCK_STORE_S3' |
    'BLOCK_STORE_MONGO' |
    'BLOCK_STORE_AZURE' |
    'BLOCK_STORE_GOOGLE' |
    'BLOCK_STORE_FS' |
    'ENDPOINT_S3';

interface System {
    _id: ID;
    name: string;
    default_chunk_config?: ChunkConfig;
}

interface Account {
    _id: ID;
    name: string;
    system: System;
}

interface Node {
    _id: ID;
    name: string;
    pool: Pool;
    node_type: NodeType;
    rpc_address: string;
}

interface Pool {
    _id: ID;
    name: string;
    system: System;
    resource_type: ResourceType;
    pool_node_type: NodeType;

    region?: Region;
    cloud_pool_info?: CloudPoolInfo;
    mongo_pool_info?: MongoPoolInfo;
}

interface CloudPoolInfo {

}

interface MongoPoolInfo {

}

interface Tier {
    _id: ID;
    name: string;
    system: System;
    chunk_config: ChunkConfig;
    data_placement: 'MIRROR' | 'SPREAD';
    mirrors: TierMirror[];
}

interface TierMirror {
    _id: ID;
    spread_pools: Pool[];
}

interface Tiering {
    _id: ID;
    name: string;
    system: System;
    chunk_split_config: {
        avg_chunk: number;
        delta_chunk: number;
    };
    tiers: {
        order: number;
        tier: Tier;
        spillover?: boolean;
        disabled?: boolean;
    }[];
}

type TierStatus = {
    pools: {
        [pool_id: string]: {
            valid_for_allocation: boolean;
            num_nodes: number;
            resource_type: ResourceType;
        }
    };
    mirrors_storage: {
        free: BigInt;
        regular_free: BigInt;
        redundant_free: BigInt;
    }[];
};

type TieringStatus = {
    [tier_id: string]: TierStatus
};

interface Bucket {
    _id: ID;
    deleted?: Date;
    name: string;
    system: System;
    versioning: 'DISABLED' | 'SUSPENDED' | 'ENABLED';
    tiering: Tiering;

    tag?: string;
    namespace?: {
        read_resources: NamespaceResource[];
        write_resource: NamespaceResource;
    };
    quota?: Object;
    storage_stats: Object;
    lifecycle_configuration_rules?: Object;
    lambda_triggers?: Object;
}

interface NamespaceResource {
    _id: ID;
    name: string;
    system: System;
    account: Account;
    connection: Object;
}

interface ChunkConfig {
    _id: ID;
    system: System;
    chunk_coder_config: ChunkCoderConfig;
}

interface ChunkCoderConfig {
    replicas: number;
    digest_type: DigestType;
    frag_digest_type: DigestType;
    compress_type: CompressType;
    cipher_type: CipherType;
    data_frags: number;
    parity_frags: number;
    parity_type: ParityType;
    lrc_group?: number;
    lrc_frags?: number;
    lrc_type?: ParityType;
}

interface Part {
    _id: ID;
    deleted?: Date;
    obj: ObjectMD;
    multipart?: ObjectMultipart;
    start: number;
    end: number;
    seq: number;
}

interface ObjectMD {
    _id: ID;
    deleted?: Date;
    bucket: Bucket;
    system: System;
    key: string;
}

interface ObjectMultipart {
    _id: ID;
    obj: ObjectMD;
}

interface LocationInfo {
    node_id?: ID;
    host_id?: ID;
    pool_id?: ID;
    region?: Region;
}
