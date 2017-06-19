function BLOW {
    # cmd="node src/test/db/db_blow.js $*"
    cmd="node src/test/db/redis_blow.js $*"
    echo ' '
    echo '$ ' $cmd
    $cmd
}

BLOW --find 1000 --batch 1
BLOW --find 1000 --batch 10
BLOW --find 1000 --batch 100
BLOW --find 500 --batch 200
BLOW --find 500 --batch 400
BLOW --find 200 --batch 1000

BLOW --insert 1000 --batch 1
BLOW --insert 1000 --batch 10
BLOW --insert 500 --batch 100
BLOW --insert 500 --batch 200
BLOW --insert 200 --batch 400
BLOW --insert 100 --batch 1000
