#!/bin/bash

# this script installs/removes the agent service on linux.

INSTDIR="/usr/local/noobaa"

main()
{
    cmd="$1"

    log "$(date -u +'%Y%m%dT%H%M%SZ.%N')"

    mkdir -p ${INSTDIR}/logs

    # detect init mechanism
    if command -v systemctl >/dev/null
    then
        log "Detected systemd"
        mechanism="systemd"
    elif [[ -d /etc/init ]]
    then
        log "Detected upstart"
        mechanism="upstart"
    elif [[ -d /etc/init.d ]]
    then
        log "Detected init (sysv)"
        mechanism="sysv_init"
    else
        log "ERROR: This linux platform is not supported for NooBaa service installation"
        log "ERROR: Cannot detect a supported init mechanism (tried Systemd/Upstart/init.d)"
        exit 1
    fi

    if [[ \
            "$cmd" != "install" && \
            "$cmd" != "uninstall" && \
            "$cmd" != "start" && \
            "$cmd" != "stop" && \
            "$cmd" != "status" \
        ]]
    then
        log "ERROR: Unknown command $cmd"
        log "Usage: $0 install|uninstall|start|stop|status"
        exit 1
    fi

    ${mechanism}_${cmd}

    log "done"
    exit 0
}


###########
# SYSTEMD #
###########

systemd_install()
{
    log "Installing service ..."
    run systemctl enable ${INSTDIR}/src/agent/noobaad.service
    log "Service installed."
    systemd_start
}

systemd_uninstall()
{
    systemd_stop
    log "Uninstalling service ..."
    run systemctl disable noobaad
    log "Service uninstalled."
}

systemd_start()
{
    log "Starting service ..."
    run systemctl start noobaad
    log "Service started."
}

systemd_stop()
{
    log "Stopping service ..."
    run systemctl stop noobaad
    log "Service stopped."
}

systemd_status()
{
    run systemctl status noobaad
}


###########
# UPSTART #
###########

upstart_install()
{
    log "Installing service ..."
    ln -s ${INSTDIR}/src/agent/noobaad.upstart /etc/init/noobaad.conf
    sleep 1
    log "Service installed."
    upstart_start
}

upstart_uninstall()
{
    upstart_stop
    log "Uninstalling service ..."
    run warn rm /etc/init/noobaad.conf
    log "Service uninstalled."
}

upstart_start()
{
    log "Starting service ..."
    run initctl start noobaad
    log "Service started."
}

upstart_stop()
{
    log "Stopping service ..."
    run warn initctl stop noobaad
    log "Service stopped."
}

upstart_status()
{
    run initctl status noobaad
}


########
# SYSV #
########

sysv_init_install()
{
    log "Installing service ..."
    run ${INSTDIR}/node ${INSTDIR}/src/agent/agent_linux_installer
    log "Service installed."
    sysv_init_start
}

sysv_init_uninstall()
{
    sysv_init_stop
    log "Uninstalling service ..."
    run warn ${INSTDIR}/node ${INSTDIR}/src/agent/agent_linux_installer --uninstall
    run warn rm /etc/init.d/noobaad
    log "Service uninstalled."
}

sysv_init_start()
{
    log "Starting service ..."
    # if chkconfig doesn't exist (depends on linux distro) then fallback to manual update
    if type chkconfig &> /dev/null
    then
        run chkconfig noobaad on
    else
        run update-rc.d noobaad enable
    fi
    run service noobaad start
    log "Service started."
}

sysv_init_stop()
{
    log "Stopping service ..."
    # if chkconfig doesn't exist (depends on linux distro) then fallback to manual update
    if type chkconfig &> /dev/null
    then
        run warn chkconfig noobaad off
    else
        run warn update-rc.d noobaad disable
    fi
    run warn service noobaad stop
    log "Service stopped."
}

sysv_init_status()
{
    run service noobaad status
}


#########
# UTILS #
#########

log()
{
    logger -s -t noobaa_service "=====>" "$@"
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
    "$@" 2>&1 | logger -s -t noobaa_service
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
