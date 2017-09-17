#!/bin/bash

nvm install || exit 1
BLD=$WORKSPACE/build/agent_linux
ART=$WORKSPACE/artifacts

echo "=====> clean $BLD"
rm -rf $BLD
mkdir -p $BLD/package/src
mkdir -p $ART

echo "=====> pushd $BLD"
pushd $BLD

echo "=====> copy makeself to $BLD/"
wget -P $BLD https://raw.githubusercontent.com/megastep/makeself/master/makeself.sh || exit 1
wget -P $BLD https://raw.githubusercontent.com/megastep/makeself/master/makeself-header.sh || exit 1
# replace -- with /S in order to use exactly the same flags like windows.
sed -i s/'\--)'/'\/S)'/ $BLD/makeself-header.sh
chmod +x $BLD/makeself.sh

echo "=====> copy package files to $BLD/package/"
cp \
    $(nvm which current)
    $WORKSPACE/package.json \
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

echo "=====> delete native sources from the package"
rm -rf binding.gyp src/native/ || exit 1

echo "=====> popd package"
popd

echo "=====> make installer"
$BLD/makeself.sh $BLD/package $ART/noobaa-setup-$NB_VERSION $NB_VERSION ./install_noobaa_agent.sh || exit 1
echo "=====> installer: $ART/noobaa-setup-$NB_VERSION"

echo "=====> popd $BLD"
popd

echo "=====> done"
exit 0
