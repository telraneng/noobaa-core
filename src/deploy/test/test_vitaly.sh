#!/bin/bash

nvm install || exit 1
mkdir -p report

echo "branch: ${branch}" 
echo "package_location: $package_location"
echo "GIT_COMMIT: $GIT_COMMIT"

#echo "vitaly current ip: 52.191.139.95"
#echo "secret: e3e018ad"
#making sure that we can sudo in this system.
#sed -i  "s/Defaults.*requiretty/Defaults \!requiretty/g" /etc/sudoers

echo "download package"

rm -rf /tmp/archive*
curl -u tamireran:XXX -L $package_location/artifact/*zip*/archive.zip >/tmp/archive.zip
mv /tmp/archive.zip /tmp/noobaa-NVA-${GIT_COMMIT:0:7}.zip
fname=$(sudo unzip -o /tmp/noobaa-NVA-${GIT_COMMIT:0:7}.zip -d  /tmp/|grep "tar.gz"|awk '{ print $2 }')
if [ -z ${fname} ]
then
echo "variable fname is not exist, Exiting."
exit 1
fi

echo "prepare workspace"

mkdir agent_storage

# TODO unsafe-perm is needed because we run as root and is a bad practice because it runs deps npm scripts as root on our machine!
npm install --unsafe-perm

echo "starting the sanity_build_test phase"

node src/test/system_tests/sanity_build_test.js \
    --upgrade_pack $fname \
    --target_ip vitaly-test.westus2.cloudapp.azure.com

echo "starting the runner phase"

node src/test/framework/runner.js --GIT_VERSION ${GIT_COMMIT:0:7}

