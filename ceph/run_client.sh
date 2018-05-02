#!/bin/bash

docker build \
    --rm \
    --quiet \
    -t librados \
    -f ./ceph/librados.Dockerfile \
    ./ceph

sudo rm -f ./ceph/dump.pcap
touch ./ceph/dump.pcap
sudo tcpdump -w ./ceph/dump.pcap -s 0 -U -i any \
    port 6789 or port 6800 or port 6801 or port 6802 or port 6803 &

docker run \
    --rm \
    -it \
    --name librados \
    --net=host \
    -v $PWD/ceph/:/ceph \
    -v $PWD/ceph/etc/:/etc/ceph \
    librados \
    python client.py

sleep 2
kill %1
