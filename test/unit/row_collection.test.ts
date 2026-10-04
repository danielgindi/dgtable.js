import { describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import RowCollection from '../../src/row_collection';
import { OriginalRowIndex } from '../../src/private_types';
import type { SortColumn } from '../../src/private_types';
import type { RowData } from '../../src/types';

function sortSpec(column: string, descending = false, comparePath: string[] = column.split('.')): SortColumn {
    return { column, comparePath, descending };
}

function sorted(rows: RowData[], ...sortColumn: SortColumn[]): RowCollection {
    const collection = new RowCollection({ sortColumn });
    collection.reset(rows);
    return collection.sort();
}

function values(rows: Iterable<RowData>, key: string): unknown[] {
    return Array.from(rows, row => row[key]);
}

describe('RowCollection', () => {
    it('ROWC-01: adds single rows and arrays at positions', () => {
        const rows = new RowCollection();
        rows.add({ v: 1 });
        rows.add([{ v: 2 }, { v: 3 }]);
        rows.add([{ v: 'a' }, { v: 'b' }], 1);
        rows.add({ v: 'x' }, 0);
        rows.add({ v: 'end' }, 100);

        expect(values(rows, 'v')).toEqual(['x', 1, 'a', 'b', 2, 3, 'end']);

        rows.add([{ v: 'n1' }, { v: 'n2' }], -1);
        expect(values(rows, 'v')).toEqual(['x', 1, 'a', 'b', 2, 3, 'n1', 'n2', 'end']);
    });

    it('ROWC-01 (D42): inserts large arrays in the middle in linear time', () => {
        const rows = new RowCollection();
        rows.add(Array.from({ length: 100_000 }, (_, i) => ({ v: i })));

        const start = performance.now();
        rows.add(Array.from({ length: 10_000 }, (_, i) => ({ v: 'new' + i })), 50_000);
        expect(performance.now() - start).toBeLessThan(500);

        expect(rows.length).toBe(110_000);
        expect(rows[49_999].v).toBe(49_999);
        expect(rows[50_000].v).toBe('new0');
        expect(rows[59_999].v).toBe('new9999');
        expect(rows[60_000].v).toBe(50_000);
    });

    it('ROWC-02: resets with and without rows', () => {
        const rows = new RowCollection();
        rows.add([{ v: 1 }, { v: 2 }]);
        rows.reset([{ v: 3 }]);
        expect(values(rows, 'v')).toEqual([3]);

        rows.reset();
        expect(rows.length).toBe(0);
    });

    it('ROWC-03: builds a filtered collection that shares the sort configuration and stamps source indices', () => {
        const comparator = vi.fn();
        const rows = new RowCollection({ sortColumn: [sortSpec('v')], onComparatorRequired: comparator });
        rows.add([{ v: 1 }, { v: 2 }, { v: 3 }]);

        const filtered = rows.filteredCollection(row => (row.v as number) > 1, {})!;
        expect(values(filtered, 'v')).toEqual([2, 3]);
        expect(filtered.sortColumn).toBe(rows.sortColumn);
        expect(filtered.onComparatorRequired).toBe(comparator);
        expect((filtered[0] as Record<symbol, unknown>)[OriginalRowIndex]).toBe(1);

        expect(rows.filteredCollection(null as never, {})).toBeNull();
        expect(rows.filteredCollection(() => true, null)).toBeNull();
    });

    it('ROWC-04: leaves rows untouched without sort columns, and passes native compare functions through', () => {
        const rows = new RowCollection();
        rows.add([{ v: 2 }, { v: 1 }]);
        expect(values(rows.sort(), 'v')).toEqual([2, 1]);
        expect(values(rows.sort((a, b) => (a.v as number) - (b.v as number)), 'v')).toEqual([1, 2]);
    });

    it('ROWC-05: sorts numbers and strings ascending and descending', () => {
        const rows = [{ v: 10 }, { v: 2 }, { v: 33 }];
        expect(values(sorted(rows, sortSpec('v')), 'v')).toEqual([2, 10, 33]);
        expect(values(sorted(rows, sortSpec('v', true)), 'v')).toEqual([33, 10, 2]);

        const strings = [{ v: 'b' }, { v: 'C' }, { v: 'a' }];
        expect(values(sorted(strings, sortSpec('v')), 'v')).toEqual(['C', 'a', 'b']);
    });

    it('ROWC-06: sorts nulls first ascending and last descending', () => {
        const rows = [{ v: 'b' }, { v: null }, { v: 'a' }, { v: null }];
        expect(values(sorted(rows, sortSpec('v')), 'v')).toEqual([null, null, 'a', 'b']);
        expect(values(sorted(rows, sortSpec('v', true)), 'v')).toEqual(['b', 'a', null, null]);
    });

    it('ROWC-06 (D25): treats null and undefined as equal, keeping their input order', () => {
        const rows = [{ v: undefined, id: 1 }, { v: null, id: 2 }, { v: 'a', id: 3 }, { v: undefined, id: 4 }, { v: null, id: 5 }];
        expect(values(sorted(rows, sortSpec('v')), 'id')).toEqual([1, 2, 4, 5, 3]);
        expect(values(sorted(rows, sortSpec('v', true)), 'id')).toEqual([3, 1, 2, 4, 5]);
    });

    it('ROWC-07: follows nested compare paths, treating missing intermediates as null', () => {
        const rows = [{ id: 1, a: { b: 3 } }, { id: 2, a: null }, { id: 3, a: { b: 1 } }];
        expect(values(sorted(rows, sortSpec('x', false, ['a', 'b'])), 'id')).toEqual([2, 3, 1]);
    });

    it('ROWC-08: breaks ties with later sort columns and keeps input order for full ties', () => {
        const rows = [
            { group: 1, name: 'b', tag: 'first' },
            { group: 0, name: 'z', tag: 'zero' },
            { group: 1, name: 'a', tag: 'a' },
            { group: 1, name: 'b', tag: 'second' },
        ];

        expect(values(sorted(rows, sortSpec('group'), sortSpec('name')), 'tag')).toEqual(['zero', 'a', 'first', 'second']);
        expect(values(sorted(rows, sortSpec('group', true), sortSpec('name')), 'tag')).toEqual(['a', 'first', 'second', 'zero']);
    });

    it('ROWC-09: asks onComparatorRequired and falls back to the default comparator', () => {
        const provider = vi.fn((column: string, descending: boolean, defaultComparator: (a: RowData, b: RowData) => number) => {
            if (column === 'custom')
                return (a: RowData, b: RowData) => String(a.v).length - String(b.v).length;
            return defaultComparator === null ? null : null;
        });

        const rows = new RowCollection({ sortColumn: [sortSpec('custom', false, ['v'])], onComparatorRequired: provider as never });
        rows.add([{ v: 'ccc' }, { v: 'a' }, { v: 'bb' }]);
        expect(values(rows.sort(), 'v')).toEqual(['a', 'bb', 'ccc']);
        expect(provider).toHaveBeenCalledWith('custom', false, expect.any(Function));

        rows.sortColumn = [sortSpec('v', true)];
        expect(values(rows.sort(), 'v')).toEqual(['ccc', 'bb', 'a']);
    });

    it('ROWC-10: supports custom sorting providers that sort in place or return a new array', () => {
        const inPlace = new RowCollection({
            sortColumn: [sortSpec('v')],
            customSortingProvider: (data, sort) => sort(data),
        });
        inPlace.add([{ v: 2 }, { v: 1 }]);
        expect(values(inPlace.sort(), 'v')).toEqual([1, 2]);

        const copying = new RowCollection({
            sortColumn: [sortSpec('v')],
            customSortingProvider: (data, sort) => sort(data.slice()).reverse(),
        });
        copying.add([{ v: 2 }, { v: 1 }, { v: 3 }]);
        expect(values(copying.sort(), 'v')).toEqual([3, 2, 1]);
    });

    it('ROWC-11 (D12): accepts a large new array from a custom sorting provider', () => {
        const rows = new RowCollection({
            sortColumn: [sortSpec('v')],
            customSortingProvider: (data, sort) => sort(data.slice()),
        });
        rows.add(Array.from({ length: 300_000 }, (_, i) => ({ v: 300_000 - i })));

        expect(() => rows.sort()).not.toThrow();
        expect(rows.length).toBe(300_000);
        expect(rows[0].v).toBe(1);
        expect(rows[299_999].v).toBe(300_000);
    });

    it('ROWC-12: produces an ordered permutation for random data and sort specs', () => {
        const value = fc.oneof(fc.integer({ min: -5, max: 5 }), fc.constant(null));
        fc.assert(fc.property(
            fc.array(fc.record({ a: value, b: value, id: fc.nat() }), { maxLength: 40 }),
            fc.boolean(),
            fc.boolean(),
            (rows, descA, descB) => {
                const result = Array.from(sorted(rows, sortSpec('a', descA), sortSpec('b', descB)));
                expect(result.slice().sort((x, y) => rows.indexOf(x as never) - rows.indexOf(y as never))).toEqual(rows);

                const rank = (v: unknown) => v == null ? -Infinity : v as number;
                for (let i = 1; i < result.length; i++) {
                    const prev = result[i - 1], next = result[i];
                    const cmpA = Math.sign(rank(prev.a) - rank(next.a) || 0) * (descA ? -1 : 1);
                    if (cmpA !== 0) {
                        expect(cmpA).toBeLessThan(0);
                        continue;
                    }

                    const cmpB = Math.sign(rank(prev.b) - rank(next.b) || 0) * (descB ? -1 : 1);
                    expect(cmpB).toBeLessThanOrEqual(0);
                }
            },
        ), { numRuns: 200 });
    });
});
