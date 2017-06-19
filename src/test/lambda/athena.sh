function call() {
    cmd="$*"
    # echo "$cmd"
    $cmd
    rc=$?
    if [ $rc -ne 0 ]; then
        echo Command Failed: $cmd
        exit $rc
    fi
}

node src/test/lambda/func_runner.js --s3_root sql-sample-data --func src/test/lambda/sql --event.sql "$1"

# call nearleyc src/test/lambda/sql.nearley -o /tmp/sql.nearley.js
# call nearley-test /tmp/sql.nearley.js < input.sql

# echo
# echo "---"
# echo "$(cat input.sql)"
# echo "---"
# echo
