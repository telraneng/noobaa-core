/* Copyright (C) 2016 NooBaa */
#include "../util/b64.h"
#include "../util/common.h"
#include "../util/napi.h"

#include <chrono>
// #include <time.h>

namespace noobaa
{

#define LOG_DATE_LENGTH 24
#define LOG_DATE_FORMAT "%s-%02d %02d:%02d:%02d.%06d"
static const char* MONTHS[] = { "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec" };

typedef std::chrono::seconds seconds;
typedef std::chrono::microseconds microseconds;
typedef std::chrono::system_clock system_clock;

static Napi::Value
_log_date(const Napi::CallbackInfo& info)
{
    char str[LOG_DATE_LENGTH];

    // couldn't find a simpler chrono api to get the microseconds since the second began,
    // so had to write this boilerplate code, but it works well.
    auto now = system_clock::now();
    auto epoch = now.time_since_epoch();
    seconds epoch_seconds = std::chrono::duration_cast<seconds>(epoch);
    microseconds epoch_micros = std::chrono::duration_cast<microseconds>(epoch);
    microseconds epoch_micros_aligned_to_sec = std::chrono::duration_cast<microseconds>(epoch_seconds);
    const int micros = (epoch_micros - epoch_micros_aligned_to_sec).count();

    // convert the same time point to struct tm with localtime to resolve the date and time
    // NOTE that localtime returns pointer to static structure, so we just read and discard
    std::time_t t = system_clock::to_time_t(now);
    std::tm* tm = std::localtime(&t);

    snprintf(str, sizeof str, LOG_DATE_FORMAT, MONTHS[tm->tm_mon], tm->tm_mday, tm->tm_hour, tm->tm_min, tm->tm_sec, micros);

    return Napi::String::New(info.Env(), str);
}

void
date_napi(Napi::Env env, Napi::Object exports)
{
    exports["log_date"] = Napi::Function::New(env, _log_date);
}
}
