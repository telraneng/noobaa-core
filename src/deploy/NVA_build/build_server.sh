#!/bin/bash

nvm install || exit 1
NODEJS_VERSION=$(nvm current)
mkdir -p build/public/

echo "=====> update package.json for git commit $GIT_COMMIT"
NB_VERSION=$(node src/deploy/common/update_package_json.js server)
echo "=====> version $NB_VERSION"

echo "=====> npm install"
npm install || exit 1

echo "=====> npm install frontend"
pushd frontend
npm install || exit 1
popd

echo "=====> download node.js tarball ($NODEJS_VERSION} and nvm.sh (latest)"
wget -P build/public/ https://nodejs.org/dist/${NODEJS_VERSION}/node-${NODEJS_VERSION}-linux-x64.tar.xz || exit 1
wget -P build/public/ https://raw.githubusercontent.com/creationix/nvm/master/nvm.sh || exit 1

echo "=====> tar noobaa-NVA-${NB_VERSION}.tar.gz"
tar \
    --transform='s:^:noobaa-core/:' \
    --exclude='src/native' \
    -czf noobaa-NVA-${NB_VERSION}.tar.gz \
    LICENSE \
    EULA.pdf \
    package.json \
    config.js \
    .nvmrc \
    src/ \
    frontend/dist/ \
    build/public/ \
    build/Release/ \
    node_modules/ \
    || exit 1
mv noobaa-NVA-${NB_VERSION}.tar.gz build/public/