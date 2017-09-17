#!/bin/bash

nvm install || exit 1

echo "=====> get package for git commit $GIT_COMMIT"
NB_VERSION=$(node src/deploy/common/update_package_json.js version)
echo "=====> version $NB_VERSION"

echo "=====> update tar noobaa-NVA-${NB_VERSION}.tar.gz"
gunzip build/public/noobaa-NVA-${NB_VERSION}.tar.gz || exit 1
mv build/linux/noobaa-setup-${NB_VERSION} build/public/ || exit 1
mv build/windows/noobaa-setup-${NB_VERSION}.exe build/public/ || exit 1
tar --transform='s:^:noobaa-core/:' \
    -rf build/public/noobaa-NVA-${NB_VERSION}.tar \
    build/public/noobaa-setup-${NB_VERSION} \
    build/public/noobaa-setup-${NB_VERSION}.exe \
    || exit 1
gzip build/public/noobaa-NVA-${NB_VERSION}.tar
