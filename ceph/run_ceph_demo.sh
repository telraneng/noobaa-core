#!/bin/bash

MON_IP="192.168.65.3"
CEPH_PUBLIC_NETWORK="192.168.65.0/24"

if [ "$(docker ps -qf name=ceph)" ]
then
    echo "CEPH: CLEANUP ..."
    docker rm -f ceph
    rm -rf ./ceph/etc/
fi

echo "CEPH: RUN ..."
docker run \
    -d \
    --rm \
    --name ceph \
    --net=host \
    -v $PWD/ceph/etc/:/etc/ceph \
    -e MON_IP=$MON_IP \
    -e CEPH_PUBLIC_NETWORK=$CEPH_PUBLIC_NETWORK \
    ceph/demo

echo "CEPH: SHELL ..."
docker exec -it ceph bash
