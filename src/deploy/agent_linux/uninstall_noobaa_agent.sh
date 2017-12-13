#!/bin/bash

# this script uninstalls the agent package on linux.

INSTDIR="/usr/local/noobaa"

main()
{
    log "$(date -u +'%Y%m%dT%H%M%SZ.%N')"

    log "Uninstalling service ..."
    run bash ${INSTDIR}/src/agent/service.sh uninstall

    log "Removing data ..."
    run ${INSTDIR}/node ${INSTDIR}/src/agent/agent_uninstall.js --remove_noobaa_storage

    log "Removing files ..."
    run rm -rf ${INSTDIR}

    log "NooBaa agent uninstalled successfuly"
}

#########
# UTILS #
#########

log()
{
    logger -s -t noobaa_uninstall "=====>" "$@"
}

run()
{
    local -i warn=0     # int
    local -a rc=()      # array
    local -a errors=()  # array

    [[ "$1" == "warn" ]] && { warn=1; shift; }
    log "Running command:" "$@"

    # checking the return code of all the piped processes
    # errors array filters out zero return codes using pattern substitution ${arr[@]/pattern/replacement}
    "$@" 2>&1 | logger -s -t noobaa_uninstall
    rc=(${PIPESTATUS[@]})
    errors=(${rc[@]/0})

    if (( ${#errors[@]} ))
    then
        if (( warn ))
        then
            log "WARNING: Command failed:" "$rc" "$@"
        else
            log "ERROR: Command failed:" "$rc" "$@"
            exit 1
        fi
    fi
}

main "$@"
