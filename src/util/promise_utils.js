// module targets: nodejs & browserify
'use strict';

var _ = require('lodash');
var fs = require('fs');
var child_process = require('child_process');
require('setimmediate');
var ncp = require('ncp').ncp;
var P = require('./promise');
var dbg = require('../util/debug_module')(__filename);

var is_windows = (process.platform === "win32");

module.exports = {
    join: join,
    iterate: iterate,
    loop: loop,
    retry: retry,
    delay_unblocking: delay_unblocking,
    run_background_worker: run_background_worker,
    next_tick: next_tick,
    set_immediate: set_immediate,
    promised_spawn: promised_spawn,
    promised_exec: promised_exec,
    full_dir_copy: full_dir_copy,
    file_copy: file_copy,
    file_delete: file_delete,
    folder_delete: folder_delete,
    pack: pack,
    wait_for_event: wait_for_event,
    pwhile: pwhile,
    auto: auto,
    all_obj: all_obj,
};


/**
 *
 */
function join(obj, property, func) {
    var promise = obj[property];
    if (promise) {
        return promise;
    }
    promise =
        P.fcall(func)
        .finally(function() {
            delete obj[property];
        });
    obj[property] = promise;
    return promise;
}

/**
 *
 * Iterate on an array, accumulate promises and return results of each
 * invocation
 *
 */
function iterate(array, func) {
    var i = -1;
    var results = [];
    if (!array || !array.length) {
        return P.resolve(results);
    }
    results.length = array.length;

    function next(res) {

        // save the result of last iteration (unless it's the initial call)
        if (i >= 0) {
            results[i] = res;
        }

        // incrementing - notice that i starts from -1 so we increment before
        // in order to avoid creating a callback per iteration
        i += 1;

        // when finished, make sure to set length so that if array got truncated
        // during iteration then also results will have same length
        if (i >= array.length) {
            results.length = array.length;
            return;
        }

        // call func as function(item, index, array)
        return P.fcall(func, array[i], i, array).then(next);
    }

    return P.fcall(next).return(results);
}



/**
 *
 * simple promise loop, similar to _.times but ignores the return values,
 * and only returns a promise for completion or failure
 *
 */
function loop(times, func, current_index) {
    current_index = current_index || 0;
    if (current_index < times) {
        return P.fcall(func, current_index)
            .then(function() {
                return loop(times, func, current_index + 1);
            });
    }
}


function pwhile(condition, body) {
    return loop2();

    // When the result of calling `condition` is no longer true, we are done.
    // Use `when`, in case `body` does not return a promise.
    // When it completes loop again otherwise, if it fails, reject the
    // done promise
    function loop2() {
        if (condition()) {
            return P.fcall(body).then(loop2);
        }
    }
}

/**
 *
 * simple promise loop, similar to _.times but ignores the return values,
 * and only returns a promise for completion or failure
 *
 * @param attempts number of attempts. can be Infinity.
 * @param delay number of milliseconds between retries
 * @param func with signature function(attempts), passing remaining attempts just fyi
 */
function retry(attempts, delay, func, error_logger) {

    // call func and catch errors,
    // passing remaining attempts just fyi
    return P.fcall(func, attempts)
        .then(null, function(err) {

            // check attempts
            attempts -= 1;
            if (attempts <= 0 || err.DO_NOT_RETRY) {
                throw err;
            }

            if (error_logger) {
                error_logger(err);
            }

            // delay and retry next attempt
            return P.delay(delay).then(function() {
                return retry(attempts, delay, func, error_logger);
            });

        });
}


/**
 * create a timeout promise that does not block the event loop from exiting
 * in case there are no other events waiting.
 * see http://nodejs.org/api/timers.html#timers_unref
 */
function delay_unblocking(delay) {
    var defer = P.defer();
    var timer = setTimeout(defer.resolve, delay);
    timer.unref();
    return defer.promise;
}



// for the sake of tests to be able to exit we schedule the worker with unblocking delay
// so that it won't prevent the process from existing if it's the only timer left
function run_background_worker(worker) {
    var DEFUALT_DELAY = 10000;

    function run() {
        P.fcall(function() {
                return worker.run_batch();
            })
            .then(function(delay) {
                return delay_unblocking(delay || worker.delay || DEFUALT_DELAY);
            }, function(err) {
                dbg.log('run_background_worker', worker.name, 'UNCAUGHT ERROR', err, err.stack);
                return delay_unblocking(worker.delay || DEFUALT_DELAY);
            })
            .then(run);
    }
    dbg.log('run_background_worker:', 'INIT', worker.name);
    delay_unblocking(worker.boot_delay || worker.delay || DEFUALT_DELAY).then(run);
    return worker;
}

function next_tick() {
    var defer = P.defer();
    process.nextTick(defer.resolve);
    return defer.promise;
}

function set_immediate() {
    var defer = P.defer();
    setImmediate(defer.resolve);
    return defer.promise;
}

/*
 * Run child process spawn wrapped by a promise
 */
function promised_spawn(command, args, options, ignore_rc) {
    return new P((resolve, reject) => {
        options = options || {};
        dbg.log0('promised_spawn:', command, args.join(' '), options, ignore_rc);
        options.stdio = options.stdio || 'inherit';
        var proc = child_process.spawn(command, args, options);
        proc.on('exit', function(code) {
            if (code === 0 || ignore_rc) {
                resolve();
            } else {
                reject(new Error('promised_spawn "' +
                    command + ' ' + args.join(' ') +
                    '" exit with error code ' + code));
            }
        });
        proc.on('error', function(error) {
            if (ignore_rc) {
                dbg.warn('promised_spawn ' +
                    command + ' ' + args.join(' ') +
                    ' exited with error ' + error +
                    ' and ignored');
                resolve();
            } else {
                reject(new Error('promised_spawn ' +
                    command + ' ' + args.join(' ') +
                    ' exited with error ' + error));
            }
        });
    });
}

function promised_exec(command, ignore_rc, return_stdout) {
    return new P((resolve, reject) => {
        dbg.log2('promise exec', command, ignore_rc);
        child_process.exec(command, {
            maxBuffer: 5000 * 1024, //5MB, should be enough
        }, function(error, stdout, stderr) {
            if (!error || ignore_rc) {
                if (error) {
                    dbg.warn(command + " exited with error " + error + " and ignored");
                }
                if (return_stdout) {
                    resolve(stdout);
                } else {
                    resolve();
                }
            } else {
                reject(new Error(command + " exited with error " + error));
            }
        });
    });
}

function pack(tar_file_name, source) {
    console.log('pack windows?', is_windows);
    if (is_windows) {
        console.log('in windows', '7za.exe a -ttar -so tmp.tar ' + source.replace(/\//g, '\\') + '| 7za.exe a -si ' + tar_file_name.replace(/\//g, '\\'));
        return promised_exec('7za.exe a -ttar -so tmp.tar ' + source.replace(/\//g, '\\') + '| 7za.exe a -si ' + tar_file_name.replace(/\//g, '\\'));
    } else {
        console.log('not windows?', is_windows);
        return promised_exec('tar -zcvf ' + tar_file_name + ' ' + source + '/*');
    }
}

function file_copy(src, dst) {
    if (is_windows) {
        console.log('file copy ' + src.replace(/\//g, '\\') + ' ' + dst.replace(/\//g, '\\'));
        return promised_exec('copy /Y  "' + src.replace(/\//g, '\\') + '" "' + dst.replace(/\//g, '\\') + '"');
    } else {
        return promised_exec('cp -f ' + src + ' ' + dst);
    }
}

function folder_delete(path) {
    if (fs.existsSync(path)) {
        fs.readdirSync(path).forEach(function(file, index) {
            var curPath = path + "/" + file;
            if (fs.lstatSync(curPath).isDirectory()) { // recurse
                folder_delete(curPath);
            } else { // delete file
                fs.unlinkSync(curPath);
            }
        });
        fs.rmdirSync(path);
    }
}

function file_delete(file_name) {
    if (fs.existsSync(file_name)) {
        return fs.unlinkAsync(file_name);
    }
}

function full_dir_copy(src, dst, filter_regex) {
    ncp.limit = 10;
    let ncp_options = {};
    if (filter_regex) {
        //this regexp will filter out files that matches, except path.
        var ncp_filter_regex = new RegExp(filter_regex);
        var ncp_filter_function = function(input) {
            if (input.indexOf('/') > 0) {
                return false;
            } else if (ncp_filter_regex.test(input)) {
                return false;
            } else {
                return true;
            }
        };
        ncp_options.filter = ncp_filter_function;
    }
    if (!src || !dst) {
        return P.reject(new Error('Both src and dst must be given'));
    }

    return P.nfcall(ncp, src, dst, ncp_options).return();
}

function wait_for_event(emitter, event, timeout) {
    return new P(function(resolve, reject) {
        // the first event to fire wins.
        // since we use emitter.once and the promise will not change after settling
        // then we can be lazy and leave dangling listeners
        emitter.once(event, resolve);
        if (event !== 'close') {
            emitter.once('close', reject);
        }
        if (event !== 'error') {
            emitter.once('error', reject);
        }
        if (timeout) {
            setTimeout(reject, timeout);
        }
    });
}

/**
 * auto run set of tasks with dependencies as fast as possible.
 * based on async.js auto.
 * the tasks format is for example:
 *  {
 *      load1: function() { return P.delay(1000).resolve(1) },
 *      load2: function() { return P.delay(2000).resolve(2) },
 *      sum: ['load1', 'load2', function(load1, load2) { return load1 + load2 }],
 *      mult: ['load1', 'load2', function(load1, load2) { return load1 * load2 }],
 *      save: ['sum', 'mult', function(sum, mult) { console.log('sum', sum, 'mult', mult) }],
 *  }
 */
function auto(tasks) {
    var tasks_info = _.mapValues(tasks, function(func, name) {
        var deps;
        if (_.isArray(func)) {
            deps = func.slice(0, -1);
            func = func[func.length - 1];
        }
        if (!_.isFunction(func)) {
            throw new Error('task value must be a function for task:' + name);
        }
        _.each(deps, function(dep) {
            if (!tasks[dep]) {
                throw new Error('no such task dep: ' + dep + ' for task: ' + name);
            }
        });
        return {
            func: func,
            deps: deps,
            defer: P.defer()
        };
    });
    all_obj(_.mapValues(tasks_info, function(task, name) {
        return P.all(_.map(task.deps, function(dep) {
                return tasks_info[dep].defer.promise;
            }))
            .then(function(results) {
                return task.func.apply(null, results);
            })
            .then(task.defer.resolve, task.defer.reject);
    }));
}

/**
 * like P.all but for objects.
 * returns new object with all values resolved, or reject if any failed.
 */
function all_obj(obj, func) {
    var new_obj = {};
    func = func || ((val, key) => val);
    return P.all(_.map(obj, (val, key) => {
            return P.fcall(func, val, key)
                .then(res => {
                    new_obj[key] = res;
                });
        }))
        .return(new_obj);
}
