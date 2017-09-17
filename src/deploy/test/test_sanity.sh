#!/bin/bash

nvm install || exit 1

cp -f build/public/noobaa-NVA-*.tar.gz build/public/noobaa-NVA-$GIT_COMMIT.tar.gz
node src/test/system_tests/sanity_build_test.js \
    --upgrade_pack build/public/noobaa-NVA-$GIT_COMMIT.tar.gz \
    --target_ip jenkins-md-test.westus2.cloudapp.azure.com
    # --target_ip 104.197.54.31

# Cleanup left overs 
rm build/public/noobaa-NVA-$GIT_COMMIT.tar.gz
