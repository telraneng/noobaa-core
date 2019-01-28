export as namespace nb;

export interface ChunkInfo {
    _id: string;
    tier: string;
    bucket: string;
    frags: FragInfo[];
    missing_frags: boolean;
    dup_chunk: string;
    parts: PartInfo[];
    chunk_coder_config: ChunkCoderConfig;
    size: number;
    compress_size: number;
    frag_size: number;
    digest_b64: string;
    cipher_key_b64: string;
    cipher_iv_b64: string;
    cipher_auth_tag_b64: string;

    // used when sending chunk info to nb_native().chunk_coder()
    coder?: string;
}

interface ChunkCoderConfig {
    replicas: number;
}

interface FragInfo {
    data_index: number;
    parity_index: number;
    lrc_index: number;
    digest_b64: string;
    allocations: any;
    deletions: any;
    future_deletions: any;
}

interface PartInfo {
    replicas: number;
    start: number;
    end: number;
    seq: number;
    multipart_id: string;
    obj_id: string;
}

type Tier = any;

type Semaphore = any;

interface LocationInfo {

}
