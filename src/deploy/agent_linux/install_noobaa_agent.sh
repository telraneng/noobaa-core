#!/bin/bash

# this script installs the agent package on linux.
# it is bundled in the makeself package and executed when unpacked.

ISO_TIME=$(date -u +"%Y%m%dT%H%M%SZ")
LOG_FILE="/var/log/noobaa_install_service_${ISO_TIME}"
INSTDIR="/usr/local/noobaa"

main()
{
    echo_to_log "Logging to ${LOGFILE}"

    mkdir -p ${INSTDIR}.new
    cp -R . ${INSTDIR}.new/

    if [ -d ${INSTDIR} ]
    then
        cp \
            ${INSTDIR}/agent_conf.json \
            ${INSTDIR}/.env \
            ${INSTDIR}.new/
    else
        # config is the first argument that is not a flag which means it doesn't starts with - or /
        for arg in "$@"
        do
            if [[ $arg != -* && $arg != /* ]]
            then
                config=$arg
            fi
        done
    fi

    [ -d ${INSTDIR}.old ] && rm -rf ${INSTDIR}.old
    [ -d ${INSTDIR}     ] && mv ${INSTDIR} ${INSTDIR}.old
    mv ${INSTDIR}.new ${INSTDIR}
}


#########
# UTILS #
#########

echo_log()
{
    echo "$@"
    echo "$@" >> ${LOG_FILE}
}

run_command()
{
    local -i rc
    local -i warn

    if [[ "$1" == "warn" ]]
    then 
        warn=1
        shift
    fi

    echo_log "Running command:" "$@"
    "$@" >> ${LOG_FILE} 2>&1
    rc=$?

    if (( rc ))
    then
        if (( warn ))
        then
            echo_log "WARNING: Comand failed with $rc:" "$@"
        else
            echo_log "ERROR: Comand failed with $rc:" "$@"
            exit 1
        fi
    fi
}

main "$@"
