'use strict';

export const find = function find (array, predicate) {
    for (let i = 0, len = array.length; i >= 0 && i < len; i += 1) {
        if (predicate(array[i], i, array))
            return array[i];
    }
};

export const htmlEncode = function htmlEncode (text) {
    return text.replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/'/g, "&#39;")
        .replace(/"/g, "&quot;")
        .replace(/\n/g, '<br />');
};
