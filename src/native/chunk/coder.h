/* Copyright (C) 2016 NooBaa */
#pragma once

#include <list>
#include <stdint.h>
#include <string>
#include <vector>

#include <openssl/err.h>
#include <openssl/evp.h>
#include <openssl/rand.h>
#include <openssl/sha.h>

#include "../util/common.h"
#include "../util/struct_buf.h"

namespace noobaa
{

class Chunk_Coder
{
public:
    static void init();

    enum class Coder_Type {
        ENCODER,
        DECODER
    };

    enum class Parity_Type {
        NONE,
        C1,
        RS,
        CM
    };

    class Frag
    {
    public:
        Frag()
            : data_index(-1)
            , parity_index(-1)
            , lrc_index(-1)
        {
            nb_bufs_init(&block);
            nb_buf_init(&digest);
        }
        ~Frag()
        {
            nb_bufs_free(&block);
            nb_buf_free(&digest);
        }
        struct NB_Bufs block;
        struct NB_Buf digest;
        int data_index;
        int parity_index;
        int lrc_index;
    };

    Chunk_Coder()
        : _frags(0)
        , _coder(Coder_Type::ENCODER)
        , _size(0)
        , _compress_size(0)
        , _data_frags(1)
        , _parity_frags(0)
        , _lrc_group(0)
        , _lrc_frags(0)
        , _frags_count(0)
        , _frag_size(0)
    {
        nb_bufs_init(&_data);
        nb_buf_init(&_digest);
        nb_buf_init(&_cipher_key);
        nb_buf_init(&_cipher_auth_tag);
    }

    ~Chunk_Coder()
    {
        nb_bufs_free(&_data);
        nb_buf_free(&_digest);
        nb_buf_free(&_cipher_key);
        nb_buf_free(&_cipher_auth_tag);
        if (_frags) {
            for (int i = 0; i < _frags_count; ++i) {
                Frag* f = _frags + i;
                delete f;
            }
            delete[] _frags;
            _frags = 0;
        }
    }

    void code();

    void add_error(std::string str) { _errors.push_back(str); }
    bool has_errors() { return !_errors.empty(); }

private:
    void _encode();
    void _encrypt(const EVP_CIPHER* evp_cipher);
    void _no_encrypt();
    void _erasure();

    void _decode();
    void _derasure(Frag** frags_map, int total_frags);
    void _decrypt(Frag** frags_map, const EVP_CIPHER* evp_cipher);
    void _no_decrypt(Frag** frags_map);

    void _digest_calc(const EVP_MD* md, struct NB_Bufs* bufs, struct NB_Buf* digest);
    bool _digest_match(const EVP_MD* md, struct NB_Bufs* data, struct NB_Buf* digest);

public:
    Frag* _frags;
    Coder_Type _coder;

    std::string _digest_type;
    std::string _frag_digest_type;
    std::string _compress_type;
    std::string _cipher_type;
    std::string _parity_type;

    std::list<std::string> _errors;

    int _size;
    int _compress_size;
    int _data_frags;
    int _parity_frags;
    int _lrc_group;
    int _lrc_frags;
    int _frags_count;
    int _frag_size;

    struct NB_Bufs _data;
    struct NB_Buf _digest;
    struct NB_Buf _cipher_key;
    struct NB_Buf _cipher_auth_tag;
};
}
