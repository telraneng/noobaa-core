#!/bin/bash

. ~/.bashrc
nvm install || exit 1
BLD=$WORKSPACE/build/agent_linux

echo "=====> clean $BLD"
rm -rf $BLD
mkdir -p $BLD/package/src

echo "=====> pushd $BLD"
pushd $BLD

echo "=====> copy package files to $BLD/package/"
cp \
    $(nvm which current) \
    $WORKSPACE/package.json \
    $WORKSPACE/npm-shrinkwrap.json \
    $WORKSPACE/binding.gyp \
    $WORKSPACE/config.js \
    $WORKSPACE/src/deploy/agent_linux/install_noobaa_agent.sh \
    $WORKSPACE/src/deploy/agent_linux/uninstall_noobaa_agent.sh \
    $BLD/package/ \
    || exit 1

echo "=====> copy source files to $BLD/package/src/"
cp -R \
    $WORKSPACE/src/agent \
    $WORKSPACE/src/api \
    $WORKSPACE/src/endpoint \
    $WORKSPACE/src/native \
    $WORKSPACE/src/rpc \
    $WORKSPACE/src/s3 \
    $WORKSPACE/src/sdk \
    $WORKSPACE/src/tools \
    $WORKSPACE/src/util \
    $BLD/package/src/ \
    || exit 1

echo "=====> pushd package"
pushd package

echo "=====> update package.json for git commit $GIT_COMMIT"
NB_VERSION=$(node $WORKSPACE/src/deploy/common/update_package_json.js agent)
echo "=====> version $NB_VERSION"

echo "=====> npm install --production"
npm install --production || exit 1

echo "=====> remove unwanted files from the package"
rm -rf \
    binding.gyp \
    src/native/ \
    build/src \
    build/Release/.deps \
    build/Release/obj.target \
    || exit 1

echo "=====> popd package"
popd

echo "=====> make installer"
go run $WORKSPACE/src/tools/sfx/sfx.go $BLD/noobaa-setup-$NB_VERSION $BLD/package install_noobaa_agent.sh || exit 1
echo "=====> installer: $BLD/noobaa-setup-$NB_VERSION"

echo "=====> popd $BLD"
popd

echo "=====> done"
exit 0
