export as namespace nb;

import { ObjectId } from 'mongodb';

type Semaphore = import('../util/semaphore');
type KeysSemaphore = import('../util/keys_semaphore');

interface System {
    _id: ObjectId;
    name: string;
    default_chunk_config?: ChunkConfig;
}

interface Account {
    _id: ObjectId;
    name: string;
    system: System;
}

type ResourceType = 'HOSTS' | 'CLOUD' | 'INTERNAL';
type NodeType =
    'BLOCK_STORE_S3' |
    'BLOCK_STORE_MONGO' |
    'BLOCK_STORE_AZURE' |
    'BLOCK_STORE_GOOGLE' |
    'BLOCK_STORE_FS' |
    'ENDPOINT_S3';

interface Pool {
    _id: ObjectId;
    name: string;
    system: System;
    resource_type: ResourceType;
    pool_node_type: NodeType;

    region?: string;
    cloud_pool_info?: CloudPoolInfo;
    mongo_pool_info?: MongoPoolInfo;
}

interface CloudPoolInfo {

}

interface MongoPoolInfo {

}

interface Tier {
    _id: ObjectId;
    name: string;
    system: System;
    chunk_config: ChunkConfig;
    data_placement: 'MIRROR' | 'SPREAD';
    mirrors: TierMirror[];
}

interface TierMirror {
    _id: ObjectId;
    spread_pools: Pool[];
}

interface Tiering {
    _id: ObjectId;
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

type PoolsStatusById = {
    [pool_id: string]: {
        valid_for_allocation: boolean;
        num_nodes: number;
        resource_type: ResourceType;
    }
};

type TieringStatus = {
    [tier_id: string]: {
        pools: PoolsStatusById;
        mirrors_storage: {
            free: BigInt;
            regular_free: BigInt;
            redundant_free: BigInt;
        }[];
    }
};

type BigInt = number | { n: number; peta: number; };

interface Bucket {
    _id: ObjectId;
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
    _id: ObjectId;
    name: string;
    system: System;
    account: Account;
    connection: Object;
}

interface ChunkConfig {
    _id: ObjectId;
    system: System;
    chunk_coder_config: ChunkCoderConfig;
}

interface ChunkCoderConfig {
    replicas: number;
    digest_type: 'sha1' | 'sha256' | 'sha384' | 'sha512';
    frag_digest_type: 'sha1' | 'sha256' | 'sha384' | 'sha512';
    compress_type: 'snappy' | 'zlib';
    cipher_type: 'aes-256-gcm';
    data_frags: number;
    parity_frags: number;
    parity_type: 'isa-c1' | 'isa-rs' | 'cm256';
    lrc_group?: number;
    lrc_frags?: number;
    lrc_type?: 'isa-c1' | 'isa-rs' | 'cm256';
}


interface ChunkInfo {
    _id: string;
    tier: string;
    bucket: string;
    frags: FragInfo[];
    missing_frags: boolean;
    dup_chunk: string;
    parts?: PartInfo[];
    chunk_coder_config: ChunkCoderConfig;
    size: number;
    compress_size: number;
    frag_size: number;
    digest_b64: string;
    cipher_key_b64: string;
    cipher_iv_b64: string;
    cipher_auth_tag_b64: string;

    // coder is used when sending chunk info to nb_native().chunk_coder()
    coder?: string;
    had_errors?: boolean;
    objects?: Object[];
    adminfo?: Object;
}

interface FragInfo {
    _id: string;
    data_index: number;
    parity_index: number;
    lrc_index: number;
    digest_b64: string;

    /**
     * the block buffer attached on the frag on upload
     */
    block?: Buffer;
    blocks?: BlockInfo[];

    allocations?: AllocInfo[];
    deletions?: DeletionInfo[];
    future_deletions?: DeletionInfo[];
}

interface BlockInfo {
    block_md: BlockMD;
    accessible: boolean;
    adminfo?: Object;
}

interface BlockMD {

}

interface PartInfo {
    replicas: number;
    start: number;
    end: number;
    seq: number;
    multipart_id: string;
    obj_id: string;
}

interface LocationInfo {
    node_id?: string;
    host_id?: string;
    pool_id?: string;
    region?: string;
}

interface AllocInfo {
    mirror_group: string;
    block: BlockInfo;
}

interface DeletionInfo {
    block_id: ObjectId;
}
