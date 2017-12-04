/* Copyright (C) 2016 NooBaa */
#include "coder.h"

#include <assert.h>

#include "../third_party/cm256/cm256.h"
#include "../third_party/isa-l/include/erasure_code.h"
#include "../util/b64.h"
#include "../util/common.h"
#include "../util/snappy.h"
#include "../util/zlib.h"

namespace noobaa
{

#define MAX_DATA_FRAGS 32
#define MAX_PARITY_FRAGS 32
#define MAX_TOTAL_FRAGS (MAX_DATA_FRAGS + MAX_PARITY_FRAGS)
#define MAX_MATRIX_SIZE (MAX_DATA_FRAGS * MAX_TOTAL_FRAGS)

// for now just ignore the auth tag to save performance
// our chunk digest is already covering for data integrity
#define USE_GCM_AUTH_TAG false

static inline int
_nb_div_up(int n, int align)
{
    return (n + align - 1) / align;
}

static inline int
_nb_align_up(int n, int align)
{
    return _nb_div_up(n, align) * align;
}

void
Chunk_Coder::init()
{
    cm256_init();
#ifndef WIN32
    // static inline unused functions from gf256.h
    (void)gf256_add;
    (void)gf256_mul;
    (void)gf256_div;
    (void)gf256_inv;
    (void)gf256_div_mem;
#endif
}

void
Chunk_Coder::code()
{
    if (has_errors()) return;
    switch (_coder) {
    case Coder_Type::ENCODER:
        _encode();
        break;
    case Coder_Type::DECODER:
        _decode();
        break;
    }
}

void
Chunk_Coder::_encode()
{
    const EVP_MD* evp_md = 0;
    const EVP_MD* evp_md_frag = 0;
    const EVP_CIPHER* evp_cipher = 0;

    if (!_digest_type.empty()) {
        evp_md = EVP_get_digestbyname(_digest_type.c_str());
        if (!evp_md) {
            add_error(XSTR() << "Chunk Encoder: unsupported digest type " << _digest_type);
            return;
        }
    }

    if (!_frag_digest_type.empty()) {
        evp_md_frag = EVP_get_digestbyname(_frag_digest_type.c_str());
        if (!evp_md_frag) {
            add_error(XSTR() << "Chunk Encoder: unsupported frag digest type " << _frag_digest_type);
            return;
        }
    }

    if (!_cipher_type.empty()) {
        evp_cipher = EVP_get_cipherbyname(_cipher_type.c_str());
        if (!evp_cipher) {
            add_error(XSTR() << "Chunk Encoder: unsupported cipher type " << _cipher_type);
            return;
        }
        const int cipher_block_size = EVP_CIPHER_block_size(evp_cipher);
        if (cipher_block_size != 1) {
            add_error(
                XSTR() << "Chunk Encoder: unsupported cipher type " << _cipher_type
                       << " with block size " << cipher_block_size);
            return;
        }
    }

    if (_data.len != _size) {
        add_error(
            XSTR() << "Chunk Encoder: chunk size mismatch " << _size
                   << " data length " << _data.len);
        return;
    }

    if (evp_md) {
        _digest_calc(evp_md, &_data, &_digest);
    }

    if (!_compress_type.empty()) {
        if (_compress_type == "snappy") {
            if (nb_snappy_compress(&_data, _errors)) return;
        } else if (_compress_type == "zlib") {
            if (nb_zlib_compress(&_data, _errors)) return;
        } else {
            add_error(XSTR() << "Chunk Encoder: unsupported compress type " << _compress_type);
            return;
        }
        _compress_size = _data.len;
    }

    const int lrc_groups = (_lrc_group == 0)
        ? 0
        : (_data_frags + _parity_frags) / _lrc_group;
    const int lrc_total_frags = lrc_groups * _lrc_frags;
    const int total_frags = _data_frags + _parity_frags + lrc_total_frags;

    // align compressed_size up with zeros padding for data_frags
    const int padded_size = _nb_align_up(_data.len, _data_frags);
    assert(padded_size >= _data.len);
    if (padded_size > _data.len) {
        nb_bufs_push_zeros(&_data, padded_size - _data.len);
    }

    // init frags
    _frag_size = _data.len / _data_frags;
    _frags_count = total_frags;
    _frags = new Frag[total_frags];
    for (int i = 0; i < _frags_count; ++i) {
        Frag* f = _frags + i;
        if (i < _data_frags) {
            f->data_index = i;
        } else if (i < _data_frags + _parity_frags) {
            f->parity_index = i - _data_frags;
        } else {
            f->lrc_index = i - _data_frags - _parity_frags;
        }
    }

    if (evp_cipher) {
        _encrypt(evp_cipher);
    } else {
        _no_encrypt();
    }

    if (has_errors()) return;

    if (!_parity_type.empty()) {
        _erasure();
    }

    if (has_errors()) return;

    if (evp_md_frag) {
        for (int i = 0; i < _frags_count; ++i) {
            Frag* f = _frags + i;
            _digest_calc(evp_md_frag, &f->block, &f->digest);
        }
    }
}

void
Chunk_Coder::_encrypt(const EVP_CIPHER* evp_cipher)
{
    EVP_CIPHER_CTX ctx;
    struct NB_Buf iv;
    int evp_ret = 0;

    // generate random cipher key
    // using iv of zeros since we generate random key per chunk
    EVP_CIPHER_CTX_init(&ctx);
    const int key_len = EVP_CIPHER_key_length(evp_cipher);
    const int iv_len = EVP_CIPHER_iv_length(evp_cipher);
    nb_buf_init_zeros(&iv, iv_len);

    if (_cipher_key.len) {
        assert(_cipher_key.len == key_len);
    } else {
        nb_buf_free(&_cipher_key);
        nb_buf_init_alloc(&_cipher_key, key_len);
        RAND_bytes(_cipher_key.data, _cipher_key.len);
    }

    ON_RETURN cleanup([&] {
        EVP_CIPHER_CTX_cleanup(&ctx);
        nb_buf_free(&iv);
    });

    evp_ret = EVP_EncryptInit_ex(&ctx, evp_cipher, NULL, _cipher_key.data, iv.data);
    if (!evp_ret) {
        add_error(XSTR() << "Chunk Encoder: cipher encrypt init failed " << _cipher_type);
        return;
    }

    // allocate blocks for all data frags
    for (int i = 0; i < _data_frags; ++i) {
        Frag* f = _frags + i;
        nb_bufs_push_alloc(&f->block, _frag_size);
    }

    int frag_pos = 0;
    Frag* f = _frags;

    for (int i = 0; i < _data.count; ++i) {
        struct NB_Buf* b = nb_bufs_get(&_data, i);

        for (int pos = 0; pos < b->len;) {

            if (f >= _frags + _data_frags) {
                assert(!"data frags exceeded");
                add_error("Chunk Encoder: data frags exceeded");
                return;
            }

            struct NB_Buf* fb = nb_bufs_get(&f->block, 0);
            assert(fb && fb->len == _frag_size);

            if (frag_pos > fb->len) {
                assert(!"block len exceeded");
                add_error("Chunk Encoder: block len exceeded");
                return;
            }

            if (frag_pos == fb->len) {
                frag_pos = 0;
                f++;
                continue; // in order to recheck the conditions
            }

            const int needed = fb->len - frag_pos;
            const int avail = b->len - pos;
            const int len = avail < needed ? avail : needed;

            int out_len = 0;
            evp_ret = EVP_EncryptUpdate(&ctx, fb->data + frag_pos, &out_len, b->data + pos, len);
            if (!evp_ret) {
                add_error(XSTR() << "Chunk Encoder: cipher encrypt update failed " << _cipher_type);
                return;
            }

            pos += len;
            frag_pos += out_len;
        }
    }

    if (f + 1 != _frags + _data_frags) {
        assert(!"data frags incomplete");
        add_error("Chunk Encoder: data frags incomplete");
        return;
    }

    if (frag_pos != _frag_size) {
        assert(!"block len incomplete");
        add_error(
            XSTR() << "Chunk Encoder: block len incomplete "
                   << frag_pos << " != " << _frag_size
                   << " cipher " << _cipher_type);
        return;
    }

    int out_len = 0;
    evp_ret = EVP_EncryptFinal_ex(&ctx, 0, &out_len);
    if (!evp_ret) {
        add_error(XSTR() << "Chunk Encoder: cipher encrypt final failed " << _cipher_type);
        return;
    }
    assert(!out_len);

    if (USE_GCM_AUTH_TAG && EVP_CIPHER_CTX_mode(&ctx) == EVP_CIPH_GCM_MODE) {
        nb_buf_free(&_cipher_auth_tag);
        nb_buf_init_alloc(&_cipher_auth_tag, 16);
        evp_ret = EVP_CIPHER_CTX_ctrl(
            &ctx, EVP_CTRL_GCM_GET_TAG, _cipher_auth_tag.len, _cipher_auth_tag.data);
        if (!evp_ret) {
            add_error(XSTR() << "Chunk Encoder: cipher encrypt get tag failed " << _cipher_type);
            return;
        }
    }
}

void
Chunk_Coder::_no_encrypt()
{
    Frag* f = _frags;

    for (int i = 0; i < _data.count; ++i) {
        struct NB_Buf* b = nb_bufs_get(&_data, i);

        for (int pos = 0; pos < b->len;) {

            if (f >= _frags + _data_frags) {
                assert(!"data frags exceeded");
                add_error("Chunk Encoder: data frags exceeded");
                return;
            }

            if (f->block.len > _frag_size) {
                assert(!"block len exceeded");
                add_error("Chunk Encoder: block len exceeded");
                return;
            }

            if (f->block.len == _frag_size) {
                f++;
                continue; // in order to recheck the conditions
            }

            const int needed = _frag_size - f->block.len;
            const int avail = b->len - pos;
            const int len = avail < needed ? avail : needed;

            nb_bufs_push_shared(&f->block, b->data + pos, len);
            pos += len;
        }
    }

    if (f + 1 != _frags + _data_frags) {
        assert(!"data frags incomplete");
        add_error("Chunk Encoder: data frags incomplete");
        return;
    }

    if (f->block.len != _frag_size) {
        assert(!"block len incomplete");
        add_error(
            XSTR() << "Chunk Encoder: block len incomplete "
                   << f->block.len << " != " << _frag_size
                   << " cipher " << _cipher_type);
        return;
    }
}

void
Chunk_Coder::_erasure()
{
    struct NB_Buf parity_buf;

    Parity_Type parity_type;
    if (_parity_type == "isa-c1") {
        parity_type = Parity_Type::C1;
    } else if (_parity_type == "isa-rs") {
        parity_type = Parity_Type::RS;
    } else if (_parity_type == "cm256") {
        parity_type = Parity_Type::CM;
    } else {
        parity_type = Parity_Type::NONE;
    }

    if (parity_type == Parity_Type::NONE || _parity_frags <= 0) return;

    if (_data_frags > MAX_DATA_FRAGS || _parity_frags > MAX_PARITY_FRAGS) {
        add_error(
            XSTR() << "Chunk Encoder: erasure code above hardcoded limits"
                   << " data_frags " << _data_frags
                   << " MAX_DATA_FRAGS " << MAX_DATA_FRAGS
                   << " parity_frags " << _parity_frags
                   << " MAX_PARITY_FRAGS " << MAX_PARITY_FRAGS);
        return;
    }

    // allocate a single buffer for all the parity blocks
    // the first parity fragment will become the owner of the entire allocation
    // and the rest will share it
    nb_buf_init_alloc(&parity_buf, _parity_frags * _frag_size);
    for (int i = 0; i < _parity_frags; ++i) {
        Frag* f = _frags + _data_frags + i;
        if (i == 0) {
            nb_bufs_push_owned(&f->block, parity_buf.data, _frag_size);
        } else {
            nb_bufs_push_shared(
                &f->block, parity_buf.data + (i * _frag_size), _frag_size);
        }
    }

    if (parity_type == Parity_Type::C1 || parity_type == Parity_Type::RS) {
        uint8_t ec_matrix_encode[MAX_MATRIX_SIZE];
        uint8_t ec_table[MAX_MATRIX_SIZE * 32];
        uint8_t* ec_blocks[MAX_TOTAL_FRAGS];
        const int k = _data_frags;
        const int m = _data_frags + _parity_frags;
        for (int i = 0; i < m; ++i) {
            Frag* f = _frags + i;
            ec_blocks[i] = nb_bufs_merge(&f->block, 0);
        }
        if (parity_type == Parity_Type::C1) {
            gf_gen_cauchy1_matrix(ec_matrix_encode, m, k);
        } else {
            gf_gen_rs_matrix(ec_matrix_encode, m, k);
        }
        ec_init_tables(k, m - k, &ec_matrix_encode[k * k], ec_table);
        ec_encode_data(_frag_size, k, m - k, ec_table, ec_blocks, &ec_blocks[k]);
    } else if (parity_type == Parity_Type::CM) {
        cm256_encoder_params cm_params;
        cm256_block cm_blocks[MAX_DATA_FRAGS];
        cm_params.BlockBytes = _frag_size;
        cm_params.OriginalCount = _data_frags;
        cm_params.RecoveryCount = _parity_frags;
        for (int i = 0; i < _data_frags; ++i) {
            Frag* f = _frags + i;
            cm_blocks[i].Index = i;
            cm_blocks[i].Block = nb_bufs_merge(&f->block, 0);
        }
        int encode_err = cm256_encode(cm_params, cm_blocks, parity_buf.data);
        if (encode_err) {
            add_error(
                XSTR() << "Chunk Encoder: erasure encode failed " << encode_err
                       << " frags_count " << _frags_count
                       << " frag_size " << _frag_size
                       << " data_frags " << _data_frags
                       << " parity_frags " << _parity_frags);
            return;
        }
    }
}

void
Chunk_Coder::_decode()
{
    const EVP_MD* evp_md = 0;
    const EVP_MD* evp_md_frag = 0;
    const EVP_CIPHER* evp_cipher = 0;
    Frag** frags_map = 0;

    ON_RETURN cleanup([&] {
        if (frags_map) nb_free(frags_map);
    });

    if (!_digest_type.empty()) {
        evp_md = EVP_get_digestbyname(_digest_type.c_str());
        if (!evp_md) {
            add_error(XSTR() << "Chunk Decoder: unsupported digest type " << _digest_type);
            return;
        }
    }

    if (!_frag_digest_type.empty()) {
        evp_md_frag = EVP_get_digestbyname(_frag_digest_type.c_str());
        if (!evp_md_frag) {
            add_error(XSTR() << "Chunk Decoder: unsupported frag digest type " << _frag_digest_type);
            return;
        }
    }

    if (!_cipher_type.empty()) {
        evp_cipher = EVP_get_cipherbyname(_cipher_type.c_str());
        if (!evp_cipher) {
            add_error(XSTR() << "Chunk Decoder: unsupported cipher type " << _cipher_type);
            return;
        }
        const int cipher_block_size = EVP_CIPHER_block_size(evp_cipher);
        if (cipher_block_size != 1) {
            add_error(
                XSTR() << "Chunk Decoder: unsupported cipher type " << _cipher_type
                       << " with block size " << cipher_block_size);
            return;
        }
    }

    if (_frags_count < _data_frags) {
        add_error("Chunk Decoder: missing data frags");
        return;
    }

    const int lrc_groups =
        (_lrc_group == 0) ? 0 : (_data_frags + _parity_frags) / _lrc_group;
    const int lrc_total_frags = lrc_groups * _lrc_frags;
    const int total_frags = _data_frags + _parity_frags + lrc_total_frags;
    const int decrypted_size = _compress_size > 0 ? _compress_size : _size;
    const int padded_size = _nb_align_up(decrypted_size, _data_frags);

    if (_frag_size != padded_size / _data_frags) {
        add_error("Chunk Decoder: mismatch frag size");
        return;
    }

    frags_map = new Frag*[total_frags];

    _derasure(frags_map, total_frags);

    if (has_errors()) return;

    if (evp_cipher) {
        _decrypt(frags_map, evp_cipher);
    } else {
        _no_decrypt(frags_map);
    }

    if (has_errors()) return;

    if (_data.len < decrypted_size || _data.len > padded_size) {
        add_error(
            XSTR() << "Chunk Decoder: size mismatch " << decrypted_size
                   << " data length " << _data.len);
        return;
    }

    nb_bufs_truncate(&_data, decrypted_size);

    if (!_compress_type.empty()) {
        if (_compress_type == "snappy") {
            nb_snappy_uncompress(&_data, _errors);
        } else if (_compress_type == "zlib") {
            nb_zlib_uncompress(&_data, _size, _errors);
        } else {
            add_error(XSTR() << "Chunk Decoder: unsupported compress type " << _compress_type);
        }
        if (has_errors()) return;
    }

    // check that chunk size matches the size used when encoding
    if (_data.len != _size) {
        add_error(
            XSTR() << "Chunk Decoder: size mismatch " << _size
                   << " data length " << _data.len);
        return;
    }

    // check that chunk data digest matches the digest computed during encoding
    if (evp_md) {
        if (!_digest_match(evp_md, &_data, &_digest)) {
            add_error(XSTR() << "Chunk Decoder: chunk digest mismatch " << _digest_type);
        }
    }
}

static void
_ec_select_available_fragments(
    Chunk_Coder::Frag** frags_map,
    int k,
    int m,
    uint8_t* a,
    uint8_t* b,
    uint8_t* out_index,
    int* p_out_len,
    uint8_t** in_bufs)
{
    int out_len = 0;
    for (int i = 0, r = 0; i < k; ++i, ++r) {
        assert(r >= 0 && r < m);
        while (!frags_map[r]) {
            if (r < k) {
                // decoding only data fragments
                out_index[out_len] = r;
                ++out_len;
            }
            ++r;
            assert(r >= 0 && r < m);
        }
        in_bufs[i] = nb_bufs_merge(&frags_map[r]->block, 0);
        memcpy(&b[k * i], &a[k * r], k);
    }
    *p_out_len = out_len;
}

static void
_ec_update_decoded_fragments(
    Chunk_Coder::Frag** frags_map,
    int k,
    int m,
    int out_len,
    uint8_t** out_bufs,
    int frag_size)
{
    // replace parity fragments with the decoded data fragments
    for (int i = 0, j = 0, r = k; i < out_len; ++i, ++j, ++r) {
        assert(j >= 0 && j < k);
        while (frags_map[j]) {
            ++j;
            assert(j >= 0 && j < k);
        }
        assert(r >= k && r < m);
        while (!frags_map[r]) {
            ++r;
            assert(r >= k && r < m);
        }
        Chunk_Coder::Frag* f = frags_map[r];
        f->data_index = j;
        nb_bufs_free(&f->block);
        nb_bufs_init(&f->block);
        nb_bufs_push_owned(&f->block, out_bufs[i], frag_size);
        frags_map[r] = 0;
        frags_map[j] = f;
    }
}

void
Chunk_Coder::_derasure(Chunk_Coder::Frag** frags_map, int total_frags)
{
    const EVP_MD* evp_md_frag = 0;
    int num_avail_data_frags = 0;
    int num_avail_parity_frags = 0;

    Parity_Type parity_type;
    if (_parity_type == "isa-c1") {
        parity_type = Parity_Type::C1;
    } else if (_parity_type == "isa-rs") {
        parity_type = Parity_Type::RS;
    } else if (_parity_type == "cm256") {
        parity_type = Parity_Type::CM;
    } else {
        parity_type = Parity_Type::NONE;
    }

    if (!_frag_digest_type.empty()) {
        evp_md_frag = EVP_get_digestbyname(_frag_digest_type.c_str());
    }

    for (int i = 0; i < total_frags; ++i) {
        frags_map[i] = 0;
    }

    for (int i = 0; i < _frags_count; ++i) {
        Frag* f = _frags + i;
        int index = -1;
        if (f->data_index >= 0 && f->data_index < _data_frags) {
            index = f->data_index;
        } else if (f->parity_index >= 0 && f->parity_index < _parity_frags) {
            index = _data_frags + f->parity_index;
        } else if (f->lrc_index >= 0 && f->lrc_index < total_frags - _data_frags - _parity_frags) {
            continue; // lrc not yet applicable
        } else {
            continue; // invalid chunk index
        }
        if (f->block.len != _frag_size) {
            if (f->block.len) {
                std::cout << "Chunk Decoder: Frag size mismatch "
                        << f->block.len << " != " << _frag_size
                        << " at " << i
                        << " index " << index
                        << std::endl;
            }
            continue; // mismatching block size
        }
        if (frags_map[index]) {
            continue; // duplicate frag
        }
        if (evp_md_frag) {
            if (!_digest_match(evp_md_frag, &f->block, &f->digest)) {
                continue; // mismatching block digest
            }
        }
        frags_map[index] = f;
        if (index < _data_frags) {
            num_avail_data_frags++;
        } else {
            num_avail_parity_frags++;
        }
    }

    assert(num_avail_data_frags <= _data_frags);

    if (num_avail_data_frags < _data_frags) {

        if (_parity_frags <= 0) {
            add_error("Chunk Decoder: missing data frags and no parity");
            return;
        }
        if (num_avail_data_frags + num_avail_parity_frags < _data_frags) {
            add_error("Chunk Decoder: missing data frags and not enough parity");
            return;
        }

        if (parity_type == Parity_Type::C1 || parity_type == Parity_Type::RS) {
            const int k = _data_frags;
            const int m = _data_frags + _parity_frags;
            uint8_t ec_table[MAX_MATRIX_SIZE * 32];
            uint8_t a[MAX_MATRIX_SIZE];
            uint8_t b[MAX_MATRIX_SIZE];
            uint8_t* in_bufs[MAX_DATA_FRAGS];
            uint8_t* out_bufs[MAX_PARITY_FRAGS];
            uint8_t out_index[MAX_PARITY_FRAGS];
            int out_len = 0;
            // calculate the decode matrix:
            if (parity_type == Parity_Type::C1) {
                gf_gen_cauchy1_matrix(a, m, k);
            } else {
                gf_gen_rs_matrix(a, m, k);
            }
            _ec_select_available_fragments(frags_map, k, m, a, b, out_index, &out_len, in_bufs);
            assert(out_len == _data_frags - num_avail_data_frags);
            if (gf_invert_matrix(b, a, k) < 0) {
                add_error(
                    XSTR() << "Chunk Decoder: erasure decode invert failed"
                           << " data_frags " << num_avail_data_frags << "/" << _data_frags
                           << " parity_frags " << num_avail_parity_frags << "/" << _parity_frags);
                return;
            }
            // select rows of missing data fragments
            for (int i = 0; i < out_len; ++i) {
                memcpy(&b[k * i], &a[k * out_index[i]], k);
                out_bufs[i] = nb_new_mem(_frag_size);
            }
            ec_init_tables(k, out_len, b, ec_table);
            ec_encode_data(_frag_size, k, out_len, ec_table, in_bufs, out_bufs);
            _ec_update_decoded_fragments(frags_map, k, m, out_len, out_bufs, _frag_size);

        } else if (parity_type == Parity_Type::CM) {
            cm256_encoder_params cm_params;
            cm_params.BlockBytes = _frag_size;
            cm_params.OriginalCount = _data_frags;
            cm_params.RecoveryCount = _parity_frags;
            cm256_block cm_blocks[MAX_DATA_FRAGS];
            int next_parity = _data_frags;
            for (int i = 0; i < _data_frags; ++i) {
                while (!frags_map[i]) {
                    assert(next_parity < _data_frags + _parity_frags);
                    frags_map[i] = frags_map[next_parity];
                    frags_map[next_parity] = 0;
                    ++next_parity;
                }
                if (frags_map[i]->data_index >= 0) {
                    cm_blocks[i].Index = frags_map[i]->data_index;
                } else {
                    cm_blocks[i].Index = _data_frags + frags_map[i]->parity_index;
                }
                cm_blocks[i].Block = nb_bufs_merge(&frags_map[i]->block, 0);
            }
            int decode_err = cm256_decode(cm_params, cm_blocks);
            if (decode_err) {
                add_error(
                    XSTR() << "Chunk Decoder: erasure decode failed " << decode_err
                           << " data_frags " << num_avail_data_frags << "/" << _data_frags
                           << " parity_frags " << num_avail_parity_frags << "/" << _parity_frags);
                return;
            }

        } else {
            add_error(
                XSTR() << "Chunk Decoder: erasure decode bad type " << _parity_type
                       << " data_frags " << num_avail_data_frags << "/" << _data_frags
                       << " parity_frags " << num_avail_parity_frags << "/" << _parity_frags);
            return;
        }

        // we could test the digest of re-computed fragments here
        // but it seems anal because the chunk digest should cover it
    }
}

void
Chunk_Coder::_decrypt(Chunk_Coder::Frag** frags_map, const EVP_CIPHER* evp_cipher)
{
    EVP_CIPHER_CTX ctx;
    struct NB_Buf iv;
    int evp_ret = 0;
    bool skip_auth = false;

    // const int key_len = EVP_CIPHER_key_length(evp_cipher);
    const int iv_len = EVP_CIPHER_iv_length(evp_cipher);
    const int decrypted_size = _compress_size > 0 ? _compress_size : _size;
    const int padded_size = _nb_align_up(decrypted_size, _data_frags);

    // using iv of zeros since we generate random key per chunk
    nb_buf_init_zeros(&iv, iv_len);
    EVP_CIPHER_CTX_init(&ctx);

    ON_RETURN cleanup([&] {
        EVP_CIPHER_CTX_cleanup(&ctx);
        nb_buf_free(&iv);
    });

    evp_ret = EVP_DecryptInit_ex(&ctx, evp_cipher, NULL, _cipher_key.data, iv.data);
    if (!evp_ret) {
        add_error(XSTR() << "Chunk Decoder: cipher decrypt init failed " << _cipher_type);
        return;
    }

    if (EVP_CIPHER_CTX_mode(&ctx) == EVP_CIPH_GCM_MODE) {
        if (USE_GCM_AUTH_TAG && _cipher_auth_tag.len) {
            evp_ret = EVP_CIPHER_CTX_ctrl(
                &ctx,
                EVP_CTRL_GCM_SET_TAG,
                _cipher_auth_tag.len,
                _cipher_auth_tag.data);
            if (!evp_ret) {
                add_error(XSTR() << "Chunk Decoder: cipher decrypt set tag failed " << _cipher_type);
                return;
            }
        } else {
            skip_auth = true;
        }
    }

    int pos = 0;
    struct NB_Buf* b = nb_bufs_push_alloc(&_data, padded_size);

    for (int i = 0; i < _data_frags; ++i) {
        Frag* f = frags_map[i];
        for (int j = 0; j < f->block.count; ++j) {
            struct NB_Buf* fb = nb_bufs_get(&f->block, j);

            int out_len = 0;
            evp_ret = EVP_DecryptUpdate(&ctx, b->data + pos, &out_len, fb->data, fb->len);
            if (!evp_ret) {
                add_error(XSTR() << "Chunk Decoder: cipher decrypt update failed " << _cipher_type);
                return;
            }
            pos += out_len;
        }
    }

    int out_len = 0;
    evp_ret = EVP_DecryptFinal_ex(&ctx, 0, &out_len);
    if (!evp_ret && !skip_auth) {
        add_error(XSTR() << "Chunk Decoder: cipher decrypt final failed " << _cipher_type);
        return;
    }
    assert(!out_len);
}

void
Chunk_Coder::_no_decrypt(Chunk_Coder::Frag** frags_map)
{
    for (int i = 0; i < _data_frags; ++i) {
        Frag* f = frags_map[i];
        for (int j = 0; j < f->block.count; ++j) {
            struct NB_Buf* b = nb_bufs_get(&f->block, j);
            nb_bufs_push_shared(&_data, b->data, b->len);
        }
    }
}

void
Chunk_Coder::_digest_calc(const EVP_MD* md, struct NB_Bufs* data, struct NB_Buf* digest)
{
    EVP_MD_CTX ctx_md;
    EVP_MD_CTX_init(&ctx_md);
    EVP_DigestInit_ex(&ctx_md, md, NULL);

    struct NB_Buf* b = nb_bufs_get(data, 0);
    for (int i = 0; i < data->count; ++i, ++b) {
        EVP_DigestUpdate(&ctx_md, b->data, b->len);
    }

    uint32_t digest_len = EVP_MD_size(md);
    nb_buf_free(digest);
    nb_buf_init_alloc(digest, digest_len);
    EVP_DigestFinal_ex(&ctx_md, digest->data, &digest_len);
    assert((int)digest_len == digest->len);

    EVP_MD_CTX_cleanup(&ctx_md);
}

bool
Chunk_Coder::_digest_match(const EVP_MD* md, struct NB_Bufs* data, struct NB_Buf* digest)
{
    struct NB_Buf computed_digest;
    nb_buf_init(&computed_digest);
    _digest_calc(md, data, &computed_digest);

    bool match =
        (computed_digest.len == digest->len &&
         memcmp(computed_digest.data, digest->data, digest->len) == 0);

    nb_buf_free(&computed_digest);

    // if (!match) {
    // struct NB_Buf expected_hex;
    // struct NB_Buf computed_hex;
    // nb_buf_init_hex_str(&computed_hex, &computed_digest);
    // nb_buf_init_hex_str(&expected_hex, digest);
    // printf(
    //     "digest_type %s computed %s expected %s\n",
    //     digest_type,
    //     (char *)computed_hex.data,
    //     (char *)expected_hex.data);
    // nb_buf_free(&computed_hex);
    // nb_buf_free(&expected_hex);
    // }

    return match;
}
}
