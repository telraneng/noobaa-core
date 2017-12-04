/* Copyright (C) 2016 NooBaa */
#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "../util/b64.h"
#include "../util/napi.h"
#include "coder.h"

namespace noobaa
{

#define CODER_JS_SIGNATURE "function chunk_coder(chunk/s, callback?)"

static Napi::Value _chunk_coder(const Napi::CallbackInfo& info);
static void _load_chunk(Chunk_Coder& coder, Napi::Object chunk);
static void _update_chunk(Chunk_Coder& coder, Napi::Object chunk);

void
chunk_coder_napi(Napi::Env env, Napi::Object exports)
{
    Chunk_Coder::init();
    exports["chunk_coder"] = Napi::Function::New(env, _chunk_coder);
}

class CoderWorker : public Napi::AsyncWorker
{
public:
    CoderWorker(Napi::Object chunks, Napi::Function callback)
        : Napi::AsyncWorker(callback)
        , _chunks_ref(Napi::ObjectReference::New(chunks, 1))
    {
        if (chunks.IsArray()) {
            auto chunks_arr = chunks.As<Napi::Array>();
            _coders.resize(chunks_arr.Length());
            for (size_t i = 0; i < _coders.size(); ++i) {
                auto chunk = Napi::Value(chunks_arr[i]).As<Napi::Object>();
                _load_chunk(_coders[i], chunk);
            }
        } else {
            _load_chunk(_coders[0], chunks);
        }
    }

    virtual ~CoderWorker() {}

    virtual void Execute()
    {
        for (size_t i = 0; i < _coders.size(); ++i) {
            _coders[i].code();
        }
    }

    virtual void OnOK()
    {
        auto chunks = _chunks_ref.Value();
        bool has_errors = false;
        if (chunks.IsArray()) {
            auto chunks_arr = chunks.As<Napi::Array>();
            for (size_t i = 0; i < _coders.size(); ++i) {
                has_errors = has_errors || _coders[i].has_errors();
                auto chunk = Napi::Value(chunks_arr[i]).As<Napi::Object>();
                _update_chunk(_coders[i], chunk);
            }
        } else {
            has_errors = has_errors || _coders[0].has_errors();
            _update_chunk(_coders[0], chunks);
        }
        if (has_errors) {
            auto err = Napi::Error::New(Env(), "Chunk Coder had errors");
            Callback().MakeCallback(Env().Global(), { err.Value() });
        } else {
            Callback().MakeCallback(Env().Global(), { Env().Null() });
        }
    }

private:
    Napi::ObjectReference _chunks_ref;
    std::vector<Chunk_Coder> _coders;
};

static Napi::Value
_chunk_coder(const Napi::CallbackInfo& info)
{
    if (!info[0].IsObject() && !info[0].IsArray()) {
        throw Napi::TypeError::New(
            info.Env(), "1st argument should be chunk (Object) or chunks (Object[]) - " CODER_JS_SIGNATURE);
    }
    if (!info[1].IsFunction() && !info[1].IsUndefined()) {
        throw Napi::TypeError::New(
            info.Env(), "2nd argument should be callback (Function) or undefined - " CODER_JS_SIGNATURE);
    }

    if (info[1].IsFunction()) {
        auto chunks = info[0].As<Napi::Object>();
        auto callback = info[1].As<Napi::Function>();
        auto worker = new CoderWorker(chunks, callback);
        worker->Queue();
        return info.Env().Undefined();

    } else {
        if (info[0].IsArray()) {
            auto chunks = info[1].As<Napi::Array>();
            const int chunks_len = chunks.Length();
            for (int i = 0; i < chunks_len; ++i) {
                auto chunk = Napi::Value(chunks[i]).As<Napi::Object>();
                Chunk_Coder coder;
                _load_chunk(coder, chunk);
                coder.code();
                _update_chunk(coder, chunk);
            }
        } else {
            auto chunk = info[0].As<Napi::Object>();
            Chunk_Coder coder;
            _load_chunk(coder, chunk);
            coder.code();
            _update_chunk(coder, chunk);
        }
        return info.Env().Undefined();
    }
}

static void
_load_chunk(Chunk_Coder& coder, Napi::Object chunk)
{
    Napi::Value v;

    std::string coder_type = Napi::Value(chunk["coder"]).As<Napi::String>();
    if (coder_type == "enc") {
        coder._coder = Chunk_Coder::Coder_Type::ENCODER;
    } else if (coder_type == "dec") {
        coder._coder = Chunk_Coder::Coder_Type::DECODER;
    } else {
        coder.add_error(XSTR() << "Unknown coder type " << coder_type);
        return;
    }

    auto config = Napi::Value(chunk["chunk_coder_config"]).As<Napi::Object>();

    v = config["digest_type"];
    if (v.IsString()) coder._digest_type = v.As<Napi::String>();

    v = config["compress_type"];
    if (v.IsString()) coder._compress_type = v.As<Napi::String>();

    v = config["cipher_type"];
    if (v.IsString()) coder._cipher_type = v.As<Napi::String>();

    v = config["frag_digest_type"];
    if (v.IsString()) coder._frag_digest_type = v.As<Napi::String>();

    v = config["parity_type"];
    if (v.IsString()) coder._parity_type = v.As<Napi::String>();

    v = config["data_frags"];
    if (v.IsNumber()) coder._data_frags = v.As<Napi::Number>();

    v = config["parity_frags"];
    if (v.IsNumber()) coder._parity_frags = v.As<Napi::Number>();

    v = config["lrc_group"];
    if (v.IsNumber()) coder._lrc_group = v.As<Napi::Number>();

    v = config["lrc_frags"];
    if (v.IsNumber()) coder._lrc_frags = v.As<Napi::Number>();

    v = config["size"];
    if (v.IsNumber()) coder._size = v.As<Napi::Number>();

    v = config["frag_size"];
    if (v.IsNumber()) coder._frag_size = v.As<Napi::Number>();

    v = config["compress_size"];
    if (v.IsNumber()) coder._compress_size = v.As<Napi::Number>();

    nb_napi_get_buf_b64(chunk.Env(), chunk, "digest_b64", &coder._digest);
    nb_napi_get_buf_b64(chunk.Env(), chunk, "cipher_key_b64", &coder._cipher_key);
    nb_napi_get_buf_b64(chunk.Env(), chunk, "cipher_auth_tag_b64", &coder._cipher_auth_tag);

    if (!coder._size) {
        coder.add_error("Cannot code zero size chunk");
    }

    if (coder._coder == Chunk_Coder::Coder_Type::ENCODER) {

        nb_napi_get_bufs(chunk.Env(), chunk, "data", &coder._data);

        // TODO fail if no data? - coder.add_error("coder.data should be buffer/s");

    } else if (coder._coder == Chunk_Coder::Coder_Type::DECODER) {

        auto frags = Napi::Value(chunk["frags"]).As<Napi::Array>();
        coder._frags_count = frags.Length();
        coder._frags = new Chunk_Coder::Frag[coder._frags_count];
        for (int i = 0; i < coder._frags_count; ++i) {
            auto frag = Napi::Value(frags[i]).As<Napi::Object>();
            Chunk_Coder::Frag& f = coder._frags[i];

            v = config["data_index"];
            if (v.IsNumber()) f.data_index = v.As<Napi::Number>();

            v = config["parity_index"];
            if (v.IsNumber()) f.parity_index = v.As<Napi::Number>();

            v = config["lrc_index"];
            if (v.IsNumber()) f.lrc_index = v.As<Napi::Number>();

            nb_napi_get_bufs(frag.Env(), frag, "block", &f.block);
            nb_napi_get_buf_b64(frag.Env(), frag, "digest_b64", &f.digest);
        }
    }
}

static void
_update_chunk(Chunk_Coder& coder, Napi::Object chunk)
{
    if (coder.has_errors()) {
        auto errors = Napi::Array::New(chunk.Env(), coder._errors.size());
        int i = 0;
        for (auto it = coder._errors.begin(); it != coder._errors.end(); ++it) {
            errors[i++] = Napi::String::New(chunk.Env(), *it);
        }
        chunk["errors"] = errors;
        return;
    }

    if (coder._coder == Chunk_Coder::Coder_Type::ENCODER) {

        chunk["frag_size"] = Napi::Number::New(chunk.Env(), coder._frag_size);
        if (!coder._compress_type.empty()) {
            chunk["compress_size"] = Napi::Number::New(chunk.Env(), coder._compress_size);
        }
        if (!coder._digest_type.empty()) {
            nb_napi_set_buf_b64(chunk.Env(), chunk, "digest_b64", &coder._digest);
        }
        if (!coder._cipher_type.empty()) {
            nb_napi_set_buf_b64(chunk.Env(), chunk, "cipher_key_b64", &coder._cipher_key);
            if (coder._cipher_auth_tag.len) {
                nb_napi_set_buf_b64(chunk.Env(), chunk, "cipher_auth_tag_b64", &coder._cipher_auth_tag);
            }
        }

        auto frags = Napi::Array::New(chunk.Env(), coder._frags_count);
        for (int i = 0; i < coder._frags_count; ++i) {
            Chunk_Coder::Frag& f = coder._frags[i];
            auto frag = Napi::Object::New(chunk.Env());
            frags[i] = frag;
            if (f.data_index >= 0) frag["data_index"] = Napi::Number::New(frag.Env(), f.data_index);
            if (f.parity_index >= 0) frag["parity_index"] = Napi::Number::New(frag.Env(), f.parity_index);
            if (f.lrc_index >= 0) frag["lrc_index"] = Napi::Number::New(frag.Env(), f.lrc_index);
            nb_napi_set_bufs(frag.Env(), frag, "block", &f.block);
            if (!coder._frag_digest_type.empty()) {
                nb_napi_set_buf_b64(frag.Env(), frag, "digest_b64", &f.digest);
            }
        }

    } else if (coder._coder == Chunk_Coder::Coder_Type::DECODER) {

        nb_napi_set_bufs(chunk.Env(), chunk, "data", &coder._data);
    }
}
}
