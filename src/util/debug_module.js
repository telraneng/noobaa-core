/* Copyright (C) 2016 NooBaa */
'use strict';

const _ = require('lodash');
const fs = require('fs');
const path = require('path');
const util = require('util');

const LRU = require('./lru');
const nb_native = require('./nb_native');
const ansi_colors = require('./ansi_colors');

const is_browser = process.title === 'browser';
const original_console_ref = console;
const original_console_clone = _.clone(console);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const SYSLOG_LOG_ERR = 3;
const SYSLOG_LOG_WARNING = 4;
const SYSLOG_LOG_NOTICE = 5;

const DEFAULT_LOG_FILENAME = 'noobaa.log';
const DEFAULT_LOG_DIRNAME = './logs/';

const THROTTLING_PERIOD_SEC = 30;
const MESSAGES_LRU_SIZE = 10000;

function remove_newlines(message) {
    return message.replace(/(\r\n|\n|\r)/gm, '');
}

/**
 * DebugEnv is a 'singleton' used by all DebugModule objects
 */
class DebugEnv {

    constructor() {

        this._modules = { __level: 0 };
        this._console_enabled = true;
        this._syslog_enabled = false;
        this._file_enabled = false;
        this._proc_name = '';
        this._config = { dbg_log_level: 0 };

        // LRU to find recently used messages for throttling
        this._throttle_lru = new LRU({
            name: 'debug_log_throttle_lru',
            max_usage: MESSAGES_LRU_SIZE, // hold up to 10000 messages
            expiry_ms: THROTTLING_PERIOD_SEC * 1000, // 30 seconds before repeating any message
        });

        this.level_error = {
            label: '[ERR] ',
            console: original_console_clone.error,
            color: ansi_colors.RED,
            syslog_level: SYSLOG_LOG_ERR,
        };
        this.level_warn = {
            label: '[WARN]',
            console: original_console_clone.warn,
            color: ansi_colors.YELLOW,
            syslog_level: SYSLOG_LOG_WARNING,
        };
        this.level_info = {
            label: '[INFO]',
            console: original_console_clone.info,
            color: ansi_colors.GREEN,
            syslog_level: SYSLOG_LOG_NOTICE,
        };
        this.level_log = {
            label: '[LOG] ',
            console: original_console_clone.log,
            color: ansi_colors.GREEN,
            syslog_level: SYSLOG_LOG_NOTICE,
        };
        this.level_trace = {
            label: '[TRACE]',
            console: original_console_clone.trace,
            color: ansi_colors.GREEN,
            syslog_level: SYSLOG_LOG_NOTICE,
        };
        this.level_log0 = Object.assign({}, this.level_log, { label: '[L0]  ' });
        this.level_log1 = Object.assign({}, this.level_log, { label: '[L1]  ' });
        this.level_log2 = Object.assign({}, this.level_log, { label: '[L2]  ' });
        this.level_log3 = Object.assign({}, this.level_log, { label: '[L3]  ' });
        this.level_log4 = Object.assign({}, this.level_log, { label: '[L4]  ' });
        this.level_trace0 = Object.assign({}, this.level_trace, { label: '[T0]  ' });
        this.level_trace1 = Object.assign({}, this.level_trace, { label: '[T1]  ' });
        this.level_trace2 = Object.assign({}, this.level_trace, { label: '[T2]  ' });
        this.level_trace3 = Object.assign({}, this.level_trace, { label: '[T3]  ' });
        this.level_trace4 = Object.assign({}, this.level_trace, { label: '[T4]  ' });

        if (is_browser) {
            this.write_log = this.write_log_browser;

        } else {
            this.write_log = this.write_log_node;

            try {
                this._config = require('../../config.js'); // eslint-disable-line global-require
            } catch (err) {
                // ignore
            }

            // check if we run on our server <=> /etc/rsyslog.d/noobaa_syslog.conf exists
            try {
                this._syslog_enabled = fs.statSync('/etc/rsyslog.d/noobaa_syslog.conf').isFile();
            } catch (err) {
                // ignore
            }

            // if not logging to syslog use a file transport
            if (this._syslog_enabled) {
                // this._console_enabled = false;
                this._file_enabled = false;
            } else {
                this._file_enabled = true;
            }

            // if logs directory doesn't exist, create it
            try {
                fs.mkdirSync(DEFAULT_LOG_DIRNAME);
            } catch (e) {
                if (e.code !== 'EEXIST') throw e;
            }

            const winston = require('winston'); // eslint-disable-line global-require
            this._file_transport = new winston.transports.File({
                // GenericTransportOptions
                name: 'file_transport',
                level: 'info',
                // GenericTextTransportOptions
                json: false,
                timestamp: false,
                showLevel: false,
                prettyPrint: false,
                // FileTransportOptions
                tailable: true,
                zippedArchive: true,
                maxFiles: 100,
                maxsize: (10 * 1024 * 1024),
                filename: DEFAULT_LOG_FILENAME,
                dirname: DEFAULT_LOG_DIRNAME,
            });
            this._file_logger = new winston.Logger({
                transports: [this._file_transport],
            });
        }
    }

    write_log_browser(msg, args, level, mod) {
        const prefix = `${this.formatted_time()} ${level.label} [${mod._name}]: `;
        if (typeof msg === 'string') {
            // when msg is a string it may contain printf %d,%s formatting so keeping it as first argument by concatenating the prefix
            level.console(prefix + msg, ...args);
        } else {
            // when msg is *not* a string we cannot concatenate it to prefix, so passing as two distinct arguments
            level.console(prefix, msg, ...args);
        }
    }

    write_log_node(msg, args, level, mod) {
        const prefix = `${ansi_colors.DARK_GRAY}${nb_native().log_date()} ${ansi_colors.MAGENTA}${this._proc_name}[${process.pid}]`;
        msg = `${level.color}${level.label} ${ansi_colors.CYAN}[${mod._name}]${ansi_colors.RESET}: ${util.format(msg, ...args)}`;
        args = undefined; // allow gc to take the args memory
        if (mod._throttle) {
            // find message as key in lru
            // every 200 messages print message count, otherwise return
            const lru_item = this._throttle_lru.find_or_add_item(msg);
            lru_item.hits = (lru_item.hits || 0) + 1;
            if (lru_item.hits === 1) {
                msg = `${prefix} ${msg}`;
            } else if (lru_item.hits === 2) {
                msg = `${prefix} ${msg} ${ansi_colors.YELLOW}[Duplicated message. Suppressing for ${THROTTLING_PERIOD_SEC} seconds]${ansi_colors.RESET}`;
            } else if (lru_item.hits % 200 === 0) {
                msg = `${prefix} ${msg} ${ansi_colors.YELLOW}[Message repeated ${lru_item.hits} times since ${new Date(lru_item.time)}]${ansi_colors.RESET}`;
            } else {
                return;
            }
        } else {
            msg = `${prefix} ${msg}`;
        }
        if (this._console_enabled) level.console(msg);
        const oneline_msg = remove_newlines(msg);
        if (this._syslog_enabled) nb_native().syslog(level.syslog_level, oneline_msg, 'LOG_LOCAL0');
        if (this._file_enabled) this._file_logger.info(oneline_msg);
    }

    set_process_name(name) {
        this._proc_name = name;
        if (this._syslog_enabled) {
            nb_native().closelog();
            nb_native().openlog(name);
        }
    }

    set_console_output(is_enabled) {
        this._console_enabled = Boolean(is_enabled);
    }

    set_syslog_output(is_enabled) {
        this._syslog_enabled = Boolean(is_enabled);
    }

    set_file_output(is_enabled) {
        this._file_enabled = Boolean(is_enabled);
    }

    set_log_file(log_file) {
        if (log_file) {
            const log_path = path.parse(log_file);
            this._file_transport.filename = log_path.base;
            this._file_transport.dirname = log_path.dir;
        } else {
            this._file_transport.filename = DEFAULT_LOG_FILENAME;
            this._file_transport.dirname = DEFAULT_LOG_DIRNAME;
        }
    }

    formatted_time() {
        const d = new Date();
        const month = MONTHS[d.getMonth()];
        const day = d.getDate().toString().padStart(2, '0');
        const hour = d.getHours().toString().padStart(2, '0');
        const minutes = d.getMinutes().toString().padStart(2, '0');
        const seconds = d.getSeconds().toString().padStart(2, '0');
        const millis = d.getMilliseconds().toString().padStart(3, '0');
        return `${month}-${day} ${hour}:${minutes}:${seconds}.${millis}`;
    }

    extract_module(mod, ignore_extension) {

        // for initial module construction, filename is passed, remove extension
        // for set_level, name of module is passed, don't try to remove extension
        var name;
        if (ignore_extension) {
            name = mod;
        } else {
            // remove the extension
            var last_dot = mod.lastIndexOf('.');
            name = last_dot >= 0 ? mod.substr(0, last_dot) : mod;
        }

        return name
            // replace all the path up to src with core    
            // the 'core.' prefix is helpful for setting the level for all modules
            .replace(/.*\/src\//, 'core.')
            .replace(/.*\\src\\/, 'core.')
            // replace non-word chars with dots
            .replace(/\W/g, '.')
            // then replace multi dot which might have appeared into a single dot
            .replace(/\.\.+/g, '.')
            // then remove leading dots
            .replace(/^\.+/, '');
    }

    build_module_context(mod, mod_object) {
        var mod_name;
        var new_mod;
        // skip empty modules
        while (mod[0] === '.') {
            mod = mod.substr(1);
        }
        var ind = mod.indexOf('.');
        if (ind === -1) {
            mod_name = mod;
            new_mod = '';
        } else {
            mod_name = mod.substr(0, ind);
            new_mod = mod.substr(ind + 1); //skipping the . and continuing the processing
        }
        if (mod_name) {
            if (!mod_object[mod_name]) {
                mod_object[mod_name] = {
                    __level: 0
                };
            }
        }
        if (new_mod) {
            return this.build_module_context(new_mod, mod_object[mod_name]);
        } else {
            return mod_object[mod_name];
        }
    }

    // Traverse on modules tree, set level
    populate_subtree(mod, level) {
        mod.__level = level;
        _.each(mod, (sub_mod, name) => {
            if (name[0] !== '_') {
                this.populate_subtree(sub_mod, level);
            }
        });
    }

    // Setting level for a node in the tree sets all the subtree to the same level
    set_level(mod, level) {
        var parts = mod.split('.');
        var tmp_mod = this._modules;
        //find the desired node to set level for
        for (var ind = 0; ind < parts.length; ++ind) {
            if (!tmp_mod[parts[ind]]) {
                console.log('No such module ' + mod + ' registered');
                return;
            }
            tmp_mod = tmp_mod[parts[ind]];
        }
        tmp_mod.__level = level;
        //If subtree exists, set __level for all nodes in it
        this.populate_subtree(tmp_mod, level);
    }

    // Getting level for a node in the tree
    get_level(mod) {
        var parts = mod.split('.');
        var tmp_mod = this._modules;
        //find the desired node to set level for
        for (var ind = 0; ind < parts.length; ++ind) {
            if (!tmp_mod[parts[ind]]) {
                console.log('No such module ' + mod + ' registered');
                return;
            }
            tmp_mod = tmp_mod[parts[ind]];
        }
        return tmp_mod.__level;
    }

}

const dbg_env = new DebugEnv();


/**
 * DebugModule is our handler for sending log messages.
 * An instance of DebugModule should be created per a code module where typically `mod` is __filename.
 * It provides multi nested modules definitions for easier module->level management.
 * 
 * DebugModule exposes logging functions:
 *  error/warn/info/log/trace('these methods will always log')
 *  logX('this will print if log level >= X')
 *  traceX('this will print and will add the backtrace if log level >=X')
 *
 */
class DebugModule {

    constructor(mod) {
        this._name = dbg_env.extract_module(mod);
        this._throttle = true;
        this._cur_level = dbg_env.build_module_context(this._name, dbg_env._modules);

        // set debug level for all modules, if defined
        const level = dbg_env._config.dbg_log_level;
        if (process.env.DEBUG_MODE === 'true' && level !== 0) {
            console.warn('setting log level of', mod, level);
            dbg_env.set_level(this._name, level);
        }
    }

    error(msg, ...args) {
        dbg_env.write_log(msg, args, dbg_env.level_error, this);
    }

    warn(msg, ...args) {
        dbg_env.write_log(msg, args, dbg_env.level_warn, this);
    }

    info(msg, ...args) {
        dbg_env.write_log(msg, args, dbg_env.level_info, this);
    }

    log(msg, ...args) {
        dbg_env.write_log(msg, args, dbg_env.level_log, this);
    }

    trace(msg, ...args) {
        dbg_env.write_log(msg, args, dbg_env.level_trace, this);
    }

    log0(msg, ...args) {
        dbg_env.write_log(msg, args, dbg_env.level_log0, this);
    }

    log1(msg, ...args) {
        if (this._cur_level.__level < 1) return;
        dbg_env.write_log(msg, args, dbg_env.level_log1, this);
    }

    log2(msg, ...args) {
        if (this._cur_level.__level < 2) return;
        dbg_env.write_log(msg, args, dbg_env.level_log2, this);
    }

    log3(msg, ...args) {
        if (this._cur_level.__level < 3) return;
        dbg_env.write_log(msg, args, dbg_env.level_log3, this);
    }

    log4(msg, ...args) {
        if (this._cur_level.__level < 4) return;
        dbg_env.write_log(msg, args, dbg_env.level_log4, this);
    }

    trace0(msg, ...args) {
        dbg_env.write_log(msg, args, dbg_env.level_trace0, this);
    }

    trace1(msg, ...args) {
        if (this._cur_level.__level < 1) return;
        dbg_env.write_log(msg, args, dbg_env.level_trace1, this);
    }

    trace2(msg, ...args) {
        if (this._cur_level.__level < 2) return;
        dbg_env.write_log(msg, args, dbg_env.level_trace2, this);
    }

    trace3(msg, ...args) {
        if (this._cur_level.__level < 3) return;
        dbg_env.write_log(msg, args, dbg_env.level_trace3, this);
    }

    trace4(msg, ...args) {
        if (this._cur_level.__level < 4) return;
        dbg_env.write_log(msg, args, dbg_env.level_trace4, this);
    }

    set_level(level, mod) {
        if (mod) {
            dbg_env.set_level(dbg_env.extract_module(mod, true), level);
        } else {
            dbg_env.set_level(this._name, level);
        }
    }

    get_level(mod) {
        if (mod) {
            return dbg_env.get_level(mod);
        } else {
            return dbg_env.get_level(this._name);
        }
    }

    get_module_structure() {
        return dbg_env._modules;
    }

    set_logger_name(name) {
        this._name = name;
    }

    set_process_name(name) {
        dbg_env.set_process_name(name);
    }

    set_console_output(is_enabled) {
        dbg_env.set_console_output(is_enabled);
    }

    set_syslog_output(is_enabled) {
        dbg_env.set_syslog_output(is_enabled);
    }

    set_file_output(is_enabled) {
        dbg_env.set_file_output(is_enabled);
    }

    set_log_file(log_file) {
        dbg_env.set_log_file(log_file);
    }

    set_throttle(is_enabled) {
        this._throttle = Boolean(is_enabled);
    }

    replace_console() {
        const replaced_console = _.create(console, {
            trace: (...args) => this.trace(...args),
            log: (...args) => this.log(...args),
            info: (...args) => this.info(...args),
            warn: (...args) => this.warn(...args),
            error: (...args) => this.error(...args),
        });
        if (is_browser) {
            global.console = replaced_console;
        } else {
            console.trace = replaced_console.trace;
            console.log = replaced_console.log;
            console.info = replaced_console.info;
            console.warn = replaced_console.warn;
            console.error = replaced_console.error;
        }
    }

    original_console() {
        if (is_browser) {
            global.console = original_console_ref;
        } else {
            console.trace = original_console_clone.trace;
            console.log = original_console_clone.log;
            console.info = original_console_clone.info;
            console.warn = original_console_clone.warn;
            console.error = original_console_clone.error;
        }
    }

    /**
     * Returns an empty object to be used for log inspection of large objects - usage:
     * 
     *   dbg.log3('this is a big object that only prints on log level 3', dbg.inspect(system));
     * 
     * This is better than manually calling dbg.log3(util.inspect(...)) because the latter
     * has to evaluate the object even if the log level is not printed.
     * 
     * By using an object with custom inspect function we only evaluate 
     * the object if printing is really done.
     */
    inspect(obj) {
        return {
            [util.inspect.custom]() {
                return util.inspect(obj, true, null, true);
            }
        };
    }

}

// Register a 'console' DebugModule
var dbg_console = new DebugModule('CONSOLE.js');
dbg_console.replace_console();

function debug_module(mod) {
    return new DebugModule(mod);
}

module.exports = debug_module;
