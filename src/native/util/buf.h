#ifndef NB__BUF__H
#define NB__BUF__H

#include "common.h"
#include "../third_party/base64/cencode.h"
#include "../third_party/base64/cdecode.h"

/**
 * Like a nodejs buffer, but thread safe
 */
class Buf
{
public:

    Buf()
        : _data(0)
        , _len(0)
    {
    }

    explicit Buf(int len)
        : _alloc(new Alloc(len))
        , _data(_alloc->data())
        , _len(_alloc->length())
    {
    }

    explicit Buf(int len, uint8_t fill)
        : _alloc(new Alloc(len))
        , _data(_alloc->data())
        , _len(_alloc->length())
    {
        memset(_data, fill, _len);
    }

    explicit Buf(void* data, int len)
        : _alloc()
        , _data(reinterpret_cast<uint8_t*>(data))
        , _len(len)
    {
    }

    explicit Buf(const void* data, int len)
        : _alloc()
        , _data(reinterpret_cast<uint8_t*>(const_cast<void*>(data)))
        , _len(len)
    {
    }

    Buf(const Buf& other)
    {
        init(other);
    }

    Buf(const Buf& other, int offset, int len)
    {
        init(other);
        slice(offset, len);
    }


    // copyful concat
    template <typename Iter>
    Buf(int len, Iter begin, Iter end)
        : _alloc(new Alloc(len))
        , _data(_alloc->data())
        , _len(_alloc->length())
    {
        uint8_t* data = _data;
        while (len > 0) {
            assert(begin != end);
            const Buf& buf = *begin;
            int now = std::min<int>(len, buf.length());
            memcpy(data, buf.data(), now);
            data += now;
            len -= now;
            begin++;
        }
    }

    enum Encoding { HEX, BASE64 };

    Buf(std::string data, Encoding encoding)
    {
        switch (encoding) {
            case HEX:
                _len = (data.size()+1) / 2;
                _alloc.reset(new Alloc(_len));
                _data = _alloc->data();
                for (int i=0, j=0; i<_len; ++i, j+=2) {
                    _data[i] = (hex_to_int(data[j]) << 4) | hex_to_int(data[j+1]);
                }
                break;
            case BASE64:
                _len = data.size();
                _alloc.reset(new Alloc(_len));
                _data = _alloc->data();
                base64_decodestate state;
                base64_init_decodestate(&state);
                _len = base64_decode_block(data.data(), data.size(), cdata(), &state);
                break;
        }
    }

    ~Buf()
    {
    }

    const Buf& operator=(const Buf& other)
    {
        init(other);
        return other;
    }

    inline uint8_t* data()
    {
        return _data;
    }

    inline const uint8_t* data() const
    {
        return _data;
    }

    inline char* cdata()
    {
        return reinterpret_cast<char*>(_data);
    }

    inline const char* cdata() const
    {
        return reinterpret_cast<const char*>(_data);
    }

    inline int length() const
    {
        return _len;
    }

    inline uint8_t& operator[](int i)
    {
        return _data[i];
    }

    inline const uint8_t& operator[](int i) const
    {
        return _data[i];
    }

    inline void slice(int offset, int len)
    {
        // skip to offset
        if (offset > _len) {
            offset = _len;
        }
        if (offset < 0) {
            offset = 0;
        }
        _data += offset;
        _len -= offset;
        // truncate to length
        if (_len > len) {
            _len = len;
        }
        if (_len < 0) {
            _len = 0;
        }
    }

    inline void reset()
    {
        _data = _alloc->data();
        _len = _alloc->length();
    }

    // detach the allocated memory back to the responsibility of the caller
    inline uint8_t* detach_alloc()
    {
        return _alloc->detach();
    }

    inline bool unique_alloc()
    {
        return _alloc.unique();
    }

    inline bool same(const Buf& buf) const
    {
        return (_len == buf._len) && !memcmp(_data, buf._data, _len);
    }

    inline std::string hex() const
    {
        std::string str;
        str.resize(2 * _len);
        for (int i=0, j=0; i<_len; ++i, j+=2) {
            str[j]   = HEX_CHARS[_data[i] >> 4];
            str[j+1] = HEX_CHARS[_data[i] & 0xf];
        }
        return str;
    }

    inline std::string base64() const
    {
        std::string str;
        str.resize(2 * _len);
        char* data = const_cast<char*>(str.data());
        int pos = 0;
        base64_encodestate state;
        base64_init_encodestate(&state);
        pos += base64_encode_block(cdata(), _len, data, &state);
        pos += base64_encode_blockend(data + pos, &state);
        str.resize(pos);
        return str;
    }

private:

    class Alloc
    {
private:
        uint8_t* _data;
        int _len;
public:
        explicit Alloc(int len)
            : _data(new uint8_t[len])
            , _len(len)
        {
        }
        explicit Alloc(void* data, int len)
            : _data(reinterpret_cast<uint8_t*>(data))
            , _len(len)
        {
        }
        explicit Alloc(const void* data, int len)
            : _data(reinterpret_cast<uint8_t*>(const_cast<void*>(data)))
            , _len(len)
        {
        }
        Alloc(const Alloc& other)
            : _data(new uint8_t[other._len])
            , _len(other._len)
        {
            memcpy(_data, other._data, _len);
        }
        ~Alloc()
        {
            delete[] _data;
        }
        inline uint8_t* data()
        {
            return _data;
        }
        inline char* cdata()
        {
            return reinterpret_cast<char*>(_data);
        }
        inline int length()
        {
            return _len;
        }
        // detach the allocated memory to the responsibility of the caller
        inline uint8_t* detach()
        {
            uint8_t* data = _data;
            _data = NULL;
            _len = 0;
            return data;
        }
    };

    void init(const Buf& other)
    {
        _alloc = other._alloc;
        _data = other._data;
        _len = other._len;
    }

    static const char HEX_CHARS[16];

    inline int hex_to_int(char hex)
    {
        switch(hex) {
        case '0': return 0;
        case '1': return 1;
        case '2': return 2;
        case '3': return 3;
        case '4': return 4;
        case '5': return 5;
        case '6': return 6;
        case '7': return 7;
        case '8': return 8;
        case '9': return 9;
        case 'a': return 10;
        case 'b': return 11;
        case 'c': return 12;
        case 'd': return 13;
        case 'e': return 14;
        case 'f': return 15;
        case 'A': return 10;
        case 'B': return 11;
        case 'C': return 12;
        case 'D': return 13;
        case 'E': return 14;
        case 'F': return 15;
        default: return 0;
        }
    }

    std::shared_ptr<Alloc> _alloc;
    uint8_t* _data;
    int _len;
};

#endif // NB__BUF__H
