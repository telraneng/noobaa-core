/* Copyright (C) 2016 NooBaa */
#pragma once

#include "common.h"
#include "struct_buf.h"

namespace noobaa
{

int nb_snappy_compress(struct NB_Bufs* bufs, std::list<std::string>& errors);
int nb_snappy_uncompress(struct NB_Bufs* bufs, std::list<std::string>& errors);
}
