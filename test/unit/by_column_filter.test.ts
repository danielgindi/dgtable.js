import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import ByColumnFilter from '../../src/by_column_filter';

describe('ByColumnFilter', () => {
    const row: Record<string, unknown> = { name: 'John Doe', age: 123, active: true, nested: { value: 'deep' }, empty: null };

    it('FLT-01: matches substrings case-insensitively by default', () => {
        expect(ByColumnFilter(row, { column: 'name', keyword: 'john' })).toBe(true);
        expect(ByColumnFilter(row, { column: 'name', keyword: 'DOE' })).toBe(true);
        expect(ByColumnFilter(row, { column: 'name', keyword: 'jane' })).toBe(false);
    });

    it('FLT-01: respects caseSensitive', () => {
        expect(ByColumnFilter(row, { column: 'name', keyword: 'john', caseSensitive: true })).toBe(false);
        expect(ByColumnFilter(row, { column: 'name', keyword: 'John', caseSensitive: true })).toBe(true);
    });

    it('FLT-02: lets every row pass for an empty keyword or a missing column', () => {
        expect(ByColumnFilter(row, { column: 'name', keyword: '' })).toBe(true);
        expect(ByColumnFilter(row, { column: 'name', keyword: null })).toBe(true);
        expect(ByColumnFilter(row, { column: 'name' })).toBe(true);
        expect(ByColumnFilter(row, { column: '', keyword: 'x' })).toBe(true);
    });

    it('FLT-03: rejects rows whose value is null or undefined', () => {
        expect(ByColumnFilter(row, { column: 'empty', keyword: 'x' })).toBe(false);
        expect(ByColumnFilter(row, { column: 'missing', keyword: 'x' })).toBe(false);
    });

    it('FLT-04: compares non-string values via toString()', () => {
        expect(ByColumnFilter(row, { column: 'age', keyword: '12' })).toBe(true);
        expect(ByColumnFilter(row, { column: 'active', keyword: 'tru' })).toBe(true);
        expect(ByColumnFilter(row, { column: 'age', keyword: 3 as unknown as string })).toBe(true);
    });

    it('FLT-05 (pin, D19): reads row[column] and ignores nested data paths', () => {
        expect(ByColumnFilter(row, { column: 'nested.value', keyword: 'deep' })).toBe(false);
    });

    it('FLT-06: matches a naive reference implementation', () => {
        fc.assert(fc.property(
            fc.oneof(fc.string(), fc.integer(), fc.constant(null)),
            fc.string(),
            fc.boolean(),
            (value, keyword, caseSensitive) => {
                const reference = !keyword
                    ? true
                    : value == null
                        ? false
                        : caseSensitive
                            ? String(value).includes(keyword)
                            : String(value).toLowerCase().includes(keyword.toLowerCase());

                return ByColumnFilter({ v: value }, { column: 'v', keyword, caseSensitive }) === reference;
            },
        ));
    });
});
