/* Copyright (C) 2016 NooBaa */
'use strict';

// Terminal ANSI colors
// https://misc.flogisoft.com/bash/tip_colors_and_formatting

const ESC = '\x1B[';
const END = 'm';

function color(code) {
    return `${ESC}${code}${END}`;
}

// set formatting
exports.BOLD = color(1);
exports.DIM = color(2);
exports.UNDERLINE = color(4);
exports.BLINK = color(5);
exports.INVERTED = color(7);
exports.HIDDEN = color(8);

// reset formatting
exports.RESET = color(0);
exports.RESET_BOLD = color(21);
exports.RESET_DIM = color(22);
exports.RESET_UNDERLINE = color(24);
exports.RESET_BLINK = color(25);
exports.RESET_INVERT = color(27);
exports.RESET_HIDDEN = color(28);

// 8 fg colors
exports.BLACK = color(30);
exports.RED = color(31);
exports.GREEN = color(32);
exports.YELLOW = color(33);
exports.BLUE = color(34);
exports.MAGENTA = color(35);
exports.CYAN = color(36);
exports.LIGHT_GRAY = color(37);

// 16 fg colors
exports.DARK_GRAY = color(90);
exports.LIGHT_RED = color(91);
exports.LIGHT_GREEN = color(92);
exports.LIGHT_YELLOW = color(93);
exports.LIGHT_BLUE = color(94);
exports.LIGHT_MAGENTA = color(95);
exports.LIGHT_CYAN = color(96);
exports.WHITE = color(97);

// 8 bg colors
exports.BG_BLACK = color(40);
exports.BG_RED = color(41);
exports.BG_GREEN = color(42);
exports.BG_YELLOW = color(43);
exports.BG_BLUE = color(44);
exports.BG_MAGENTA = color(45);
exports.BG_CYAN = color(46);
exports.BG_LIGHT_GRAY = color(47);

// 16 bg colors
exports.BG_DARK_GRAY = color(100);
exports.BG_LIGHT_RED = color(101);
exports.BG_LIGHT_GREEN = color(102);
exports.BG_LIGHT_YELLOW = color(103);
exports.BG_LIGHT_BLUE = color(104);
exports.BG_LIGHT_MAGENTA = color(105);
exports.BG_LIGHT_CYAN = color(106);
exports.BG_WHITE = color(107);

exports.BG_DEFAULT = color(49);
