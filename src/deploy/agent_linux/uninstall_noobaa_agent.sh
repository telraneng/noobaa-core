#!/bin/bash

INSTDIR="/usr/local/noobaa"

echo "=====> Uninstalling service ..."
bash ${INSTDIR}/src/agent/service.sh uninstall
echo "=====> done"

echo "=====> Uninstalling agent ..."
${INSTDIR}/node ${INSTDIR}/src/agent/agent_uninstall.js --remove_noobaa_storage
echo "=====> done"

echo "=====> Removing files ..."
rm -rf ${INSTDIR}
echo "=====> done"

echo "=====> NooBaa agent uninstalled successfuly"
