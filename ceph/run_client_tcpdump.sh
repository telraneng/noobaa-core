#!/bin/bash

rm -f dump.pcap
tcpdump -i any -s 0 -U -w dump.pcap &

sleep 1

python client.py &

sleep 3

echo "Kill client ..."
kill %2

echo "Kill tcpdump ..."
kill %1
