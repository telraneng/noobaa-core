#!/bin/bash

# this script installs the agent package on linux.
# it is bundled in the package and executed when unpacked.

INSTDIR="/usr/local/noobaa"

main()
{
    log "$(date -u +'%Y%m%dT%H%M%SZ.%N')"

    log "Preparing folder ..."
    rm -rf ${INSTDIR}.new
    mkdir -p ${INSTDIR}.new

    for arg in "$@"
    do
        # config is the first argument that is not a flag which means it doesn't starts with - or /
        if [[ $arg != -* && $arg != /* ]]
        then
            log "Parsing config argument ..."
            run ./node -e "fs.writeFileSync(\"${INSTDIR}.new/agent_conf.json\", JSON.stringify(JSON.parse(Buffer.from(\"$arg\",'base64')), null, 2))"
        fi
    done

    log "Copying files ..."
    cp -R . ${INSTDIR}.new/

    if [ -d ${INSTDIR} ]
    then
        log "Copying config files ..."
        if [ ! -f ${INSTDIR}.new/agent_conf.json ]
        then
            cp ${INSTDIR}/agent_conf.json ${INSTDIR}.new/
        else
            log "WARNING: Previous installation config overriden by new config argument"
        fi
        cp ${INSTDIR}/.env ${INSTDIR}.new/
    fi

    if [ ! -f ${INSTDIR}.new/agent_conf.json ]
    then
        log "ERROR: missing config"
        exit 1
    fi

    if [ -f ${INSTDIR}/src/agent/service.sh ]
    then
        log "Uninstalling service ..."
        run warn bash ${INSTDIR}/src/agent/service.sh uninstall
    fi

    log "Switching to new folder ..."
    [ -d ${INSTDIR}.old ] && rm -rf ${INSTDIR}.old
    [ -d ${INSTDIR}     ] && mv ${INSTDIR} ${INSTDIR}.old
    mv ${INSTDIR}.new ${INSTDIR}

    log "Installing service ..."
    run warn bash ${INSTDIR}/src/agent/service.sh uninstall
    run bash ${INSTDIR}/src/agent/service.sh install

    log "NooBaa agent installed successfuly"
}


#########
# UTILS #
#########

log()
{
    logger -s -t noobaa_install "=====>" "$@"
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
    "$@" 2>&1 | logger -s -t noobaa_install
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
