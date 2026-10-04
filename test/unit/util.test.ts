import { describe, expect, it, vi } from 'vitest';
import { find, htmlEncode } from '../../src/util';

describe('htmlEncode', () => {
    it('UTIL-01: encodes HTML special characters and newlines', () => {
        expect(htmlEncode('<a href="x">\'&\'</a>\nnext'))
            .toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;<br />next');
    });

    it('UTIL-01: encodes & before other entities (no double encoding of produced entities)', () => {
        expect(htmlEncode('&lt;')).toBe('&amp;lt;');
        expect(htmlEncode('<')).toBe('&lt;');
    });
});

describe('find', () => {
    it('UTIL-02: returns the first match and passes item, index and array', () => {
        const array = [1, 2, 3, 2];
        const predicate = vi.fn((item: number) => item === 2);

        expect(find(array, predicate)).toBe(2);
        expect(predicate).toHaveBeenCalledTimes(2);
        expect(predicate).toHaveBeenNthCalledWith(2, 2, 1, array);
    });

    it('UTIL-02: returns undefined when nothing matches', () => {
        expect(find([1, 2], item => item === 5)).toBeUndefined();
        expect(find([], () => true)).toBeUndefined();
    });
});
