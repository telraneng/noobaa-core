import os
import atexit
import subprocess
import rados

mon_host = os.environ.get('MON_HOST', '127.0.0.1')
mon_host = '192.168.65.3'   # CEPH (docker)
mon_host = '172.20.80.76'   # BE ALL (WIFI)
mon_host = '172.26.72.2'    # BE ALL (LAN)
mon_host = '10.0.0.3'       # HOME

print '>>> Running librados.py ... '
r = rados.Rados()
r.conf_read_file('/etc/ceph/ceph.conf')
r.conf_set('mon host', mon_host)

print '>>> Configuration:'
for opt in ['mon host', 'public network', 'cluster network', 'fsid']:
    print '    -', opt, '=', r.conf_get(opt)

print '>>> Connect ... '
r.connect()
print '>>> Connected!'

# print '>>> Get Cluster Stats ... '
# print '\t', r.get_cluster_stats()

print '>>> List Pools ... '
print '\t', r.list_pools()

# print '>>> Create Pool ... '
# print '\t', r.create_pool('noobaa')

# print '>>> Open ioctx ... '
# io = r.open_ioctx('noobaa')

# print '>>> Write object ... '
# print '\t', io.write_full('hello', 'world')

# print '>>> Read object ... '
# print '\t', io.read('hello')

# print '>>> Close ioctx ... '
# print '\t', io.close()

print '>>> Shutdown ... '
print '\t', r.shutdown()

print '>>> Done'
