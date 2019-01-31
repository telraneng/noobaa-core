export as namespace nb;

type Semaphore = import('../util/semaphore');
type KeysSemaphore = import('../util/keys_semaphore');

export interface ChunkInfo {
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

    // used when sending chunk info to nb_native().chunk_coder()
    coder?: string;
    had_errors?: boolean;

    objects?: any[];

    adminfo?: any;
}

interface ChunkCoderConfig {
    replicas: number;
}

interface FragInfo {
    _id: string;
    data_index: number;
    parity_index: number;
    lrc_index: number;
    digest_b64: string;
    allocations: any;
    deletions: any;
    future_deletions: any;
    blocks?: BlockInfo[];

    /**
     * the block buffer attached on the frag on upload
     */
    block?: any;
}

interface BlockInfo {
    block_md: BlockMD;
    accessible: boolean;
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

type Tier = any;

interface LocationInfo {

}
