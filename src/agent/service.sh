#!/bin/bash

# this script installs/removes the agent service on linux.

ISO_TIME=$(date -u +"%Y%m%dT%H%M%SZ")
LOG_FILE="/var/log/noobaa_service_${ISO_TIME}"
INSTDIR="/usr/local/noobaa"

main()
{
    cmd="$1"

    echo_log "Logging to ${LOGFILE}"

    mkdir -p ${INSTDIR}/logs

    # detect init mechanism
    if [[ -f /usr/bin/systemctl || -f /bin/systemctl ]]
    then
        echo_log "Systemd detected"
        mechanism="systemd"
    elif [[ -d /etc/init ]]
    then
        echo_log "Upstart detected"
        mechanism="upstart"
    elif [[ -d /etc/init.d ]]
    then
        echo_log "SysV-init detected"
        mechanism="sysv_init"
    else
        echo_log "ERROR: This linux platform is not supported for NooBaa service installation"
        echo_log "ERROR: Cannot detect a supported init mechanism (tried Systemd/Upstart/init.d)"
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
        echo_log "ERROR: Unknown command $cmd"
        echo_log "Usage: $0 install|uninstall|status"
        exit 1
    fi

    ${mechanism}_${cmd}

    echo_log "done"
    exit 0
}


###########
# SYSTEMD #
###########

systemd_install()
{
    echo_log "Installing service ..."
    cp ${INSTDIR}/src/agent/system_d.conf /lib/systemd/system/noobaalocalservice.service
    echo_log "Updating systemctl ..."
    run_command systemctl daemon-reload
    echo_log "Enabling service ..."
    run_command systemctl enable noobaalocalservice
    systemd_start
    echo_log "Service installed."
}

systemd_uninstall()
{
    systemd_stop
    echo_log "Uninstalling service ..."
    #attempting to uninstall bruteforce service installations
    run_command warn rm /etc/systemd/system/multi-user.target.wants/noobaalocalservice.service
    run_command warn rm /lib/systemd/system/noobaalocalservice.service
    run_command systemctl daemon-reload
    echo_log "Service uninstalled."
}

systemd_start()
{
    echo_log "Starting service ..."
    run_command systemctl daemon-reload
    run_command systemctl restart noobaalocalservice
    echo_log "Service started."
}

systemd_stop()
{
    echo_log "Stopping service ..."
    run_command warn systemctl stop noobaalocalservice
    run_command systemctl disable noobaalocalservice
    echo_log "Service stopped."
}

systemd_status()
{
    run_command systemctl status noobaalocalservice
}


###########
# UPSTART #
###########

upstart_install()
{
    echo_log "Installing service ..."
    cp ${INSTDIR}/src/agent/upstart.conf /etc/init/noobaalocalservice.conf
    sleep 1
    upstart_start
    echo_log "Service installed."
}

upstart_uninstall()
{
    upstart_stop
    echo_log "Uninstalling service ..."
    run_command warn rm /etc/init/noobaalocalservice.conf
    echo_log "Service uninstalled."
}

upstart_start()
{
    echo_log "Starting service ..."
    run_command initctl start noobaalocalservice
    echo_log "Service started."
}

upstart_stop()
{
    echo_log "Stopping service ..."
    run_command warn initctl stop noobaalocalservice
    echo_log "Service stopped."
}

upstart_status()
{
    run_command initctl status noobaalocalservice
}


########
# SYSV #
########

sysv_init_install()
{
    echo_log "Installing service ..."
    run_command ${INSTDIR}/node ${INSTDIR}/src/agent/agent_linux_installer
    sysv_init_start
    echo_log "Service installed."
}

sysv_init_uninstall()
{
    sysv_init_stop
    echo_log "Uninstalling service ..."
    run_command warn ${INSTDIR}/node ${INSTDIR}/src/agent/agent_linux_installer --uninstall
    run_command warn rm /etc/init.d/noobaalocalservice
    echo_log "Service uninstalled."
}

sysv_init_start()
{
    echo_log "Starting service ..."
    # if chkconfig doesn't exist (depends on linux distro) then fallback to manual update
    if type chkconfig &> /dev/null
    then
        run_command chkconfig noobaalocalservice on
    else
        run_command update-rc.d noobaalocalservice enable
    fi
    run_command service noobaalocalservice start
    echo_log "Service started."
}

sysv_init_stop()
{
    echo_log "Stopping service ..."
    # if chkconfig doesn't exist (depends on linux distro) then fallback to manual update
    if type chkconfig &> /dev/null
    then
        run_command warn chkconfig noobaalocalservice off
    else
        run_command warn update-rc.d noobaalocalservice disable
    fi
    run_command warn service noobaalocalservice stop
    echo_log "Service stopped."
}

sysv_init_status()
{
    run_command service noobaalocalservice status
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
