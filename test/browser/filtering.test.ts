import { describe, expect, it, vi } from 'vitest';
import type { RowCreateEvent } from '../../src/index';
import { mountTable } from '../helpers/table';
import { renderedRows, rowTexts } from '../helpers/dom';
import { checkInvariants } from '../helpers/invariants';

const columns = [{ name: 'name', width: 150 }, { name: 'n', width: 80 }];

const data = () => [
    { name: 'Alice', n: 1 },
    { name: 'Bob', n: 2 },
    { name: 'alfred', n: 3 },
    { name: 'Carl', n: 4 },
];

describe('filtering', () => {
    it('FILT-01: shows only matching rows and emits filter with the original args', () => {
        const { table } = mountTable({ columns });
        table.setRows(data());
        const filtered = vi.fn();
        table.on('filter', filtered);

        const args = { column: 'name', keyword: 'al' };
        table.filter(args);
        expect(rowTexts(table, 'name')).toEqual(['Alice', 'alfred']);
        expect(table.getFilteredRowCount()).toBe(2);
        expect(table.getRowCount()).toBe(4);
        expect(filtered).toHaveBeenCalledWith(args);
        checkInvariants(table);
    });

    it('FILT-02 (pin): an empty keyword shows every row but keeps the filter active', () => {
        const { table } = mountTable({ columns });
        table.setRows(data());
        const cleared = vi.fn();
        table.on('filterclear', cleared);

        table.filter({ column: 'name', keyword: '' });
        expect(rowTexts(table, 'name')).toHaveLength(4);
        table.clearFilter();
        expect(cleared).toHaveBeenCalledTimes(1);
    });

    it('FILT-03 (pin): filter(null) clears and emits filterclear even with no active filter', () => {
        const { table } = mountTable({ columns });
        table.setRows(data());
        const cleared = vi.fn();
        table.on('filterclear', cleared);

        table.filter(null);
        expect(cleared).toHaveBeenCalledTimes(1);

        table.filter({ column: 'name', keyword: 'bob' });
        table.filter();
        expect(rowTexts(table, 'name')).toHaveLength(4);
        expect(cleared).toHaveBeenCalledTimes(2);
    });

    it('FILT-04 (pin): falsy non-null args', () => {
        const { table } = mountTable({ columns });
        table.setRows(data());
        const events: string[] = [];
        table.on('filter', () => events.push('filter'));
        table.on('filterclear', () => events.push('filterclear'));

        table.filter(0);
        expect(events).toEqual([]);

        table.filter({ column: 'name', keyword: 'bob' });
        table.filter('');
        // DECIDE: today the filter is dropped but a `filter` event (not `filterclear`) fires.
        expect(rowTexts(table, 'name')).toHaveLength(4);
        expect(events).toEqual(['filter', 'filter']);
    });

    it('FILT-05: passes args to a custom filter, shallow-copying object args', () => {
        const filter = vi.fn((row: Record<string, unknown>, args: { min: number }) => (row.n as number) >= args.min);
        const { table } = mountTable({ columns, filter: filter as never });
        table.setRows(data());

        const args = { min: 3 };
        table.filter(args);
        expect(rowTexts(table, 'n')).toEqual(['3', '4']);
        expect(filter.mock.calls[0][1]).not.toBe(args);
        expect(filter.mock.calls[0][1]).toEqual(args);

        args.min = 0;
        table.addRows([{ name: 'Dan', n: 1 }]);
        expect(rowTexts(table, 'n')).toEqual(['3', '4']);

        const arrayFilter = vi.fn(() => true);
        table.setFilter(arrayFilter);
        const arrayArgs = [1, 2];
        table.filter(arrayArgs);
        expect((arrayFilter.mock.calls[0] as unknown[])[1]).toBe(arrayArgs);
    });

    it('FILT-06: setFilter switches between custom and built-in filters', () => {
        const { table } = mountTable({ columns });
        table.setRows(data());

        table.setFilter(row => row.n === 2);
        table.filter({});
        expect(rowTexts(table, 'name')).toEqual(['Bob']);

        table.setFilter(null);
        table.filter({ column: 'name', keyword: 'carl' });
        expect(rowTexts(table, 'name')).toEqual(['Carl']);
    });

    it('FILT-07: clearFilter without an active filter does nothing', () => {
        const { table } = mountTable({ columns });
        table.setRows(data());
        const events = vi.fn();
        table.on('filterclear', events);
        table.on('renderskeleton', events);

        table.clearFilter();
        expect(events).not.toHaveBeenCalled();
    });

    it('FILT-08: re-filters after addRows, removeRows and setRows', () => {
        const { table } = mountTable({ columns });
        table.setRows(data());
        table.filter({ column: 'name', keyword: 'a' });
        expect(rowTexts(table, 'name')).toEqual(['Alice', 'alfred', 'Carl']);

        table.addRows([{ name: 'Zara', n: 5 }, { name: 'Tom', n: 6 }], 0);
        expect(rowTexts(table, 'name')).toEqual(['Zara', 'Alice', 'alfred', 'Carl']);
        checkInvariants(table);

        table.removeRows(1, 2);
        expect(rowTexts(table, 'name')).toEqual(['Zara', 'alfred', 'Carl']);
        checkInvariants(table);

        table.setRows([{ name: 'Anna', n: 1 }, { name: 'Ed', n: 2 }]);
        expect(rowTexts(table, 'name')).toEqual(['Anna']);
        checkInvariants(table);
    });

    it('FILT-08 (D39): re-filters when rows are added or replaced with resort', () => {
        const { table } = mountTable({ columns });
        table.setRows(data());
        table.sort('n', true);
        table.filter({ column: 'name', keyword: 'a' });

        table.addRows([{ name: 'Zara', n: 10 }, { name: 'Tom', n: 11 }], true);
        expect(rowTexts(table, 'name')).toEqual(['Zara', 'Carl', 'alfred', 'Alice']);
        checkInvariants(table);

        table.setRows([{ name: 'Anna', n: 1 }, { name: 'Ed', n: 2 }, { name: 'Dana', n: 3 }], true);
        expect(rowTexts(table, 'name')).toEqual(['Dana', 'Anna']);
        checkInvariants(table);
    });

    it('FILT-09: maps between data and filtered indices', () => {
        const { table } = mountTable({ columns });
        const rows = data();
        table.setRows(rows);
        table.filter({ column: 'name', keyword: 'b' });

        expect(table.getDataForFilteredRow(0)).toBe(rows[1]);
        expect(table.getDataForFilteredRow(1)).toBeNull();
        expect(table.getIndexForFilteredRow(rows[1])).toBe(0);
        expect(table.getIndexForFilteredRow(rows[0])).toBe(-1);
        expect(table.getRowElement(0)).toBeNull();
        expect(table.getRowElement(1)).toBe(renderedRows(table)[0]);
    });

    it('FILT-10: rowcreate maps filtered and data indices; alternate rows follow the filtered index', () => {
        const { table } = mountTable({ columns });
        const created: RowCreateEvent[] = [];
        table.on('rowcreate', event => created.push(event));
        table.setRows(data());
        created.length = 0;

        table.filter({ column: 'name', keyword: 'al' });
        expect(created.map(e => [e.filteredRowIndex, e.rowIndex])).toEqual([[0, 0], [1, 2]]);
        expect(renderedRows(table).map(row => row.classList.contains('dgtable-row-alt'))).toEqual([false, true]);
    });

    it('FILT-11 (pin, D19): the built-in filter ignores nested data paths', () => {
        const { table } = mountTable({ columns: [{ name: 'city', dataPath: 'address.city' }] });
        table.setRows([{ address: { city: 'Haifa' } }]);
        table.filter({ column: 'city', keyword: 'hai' });
        expect(table.getFilteredRowCount()).toBe(0);
    });

    it('FILT-12: filtering and sorting commute', () => {
        const a = mountTable({ columns }).table;
        a.setRows(data());
        a.filter({ column: 'name', keyword: 'a' });
        a.sort('name', true);

        const b = mountTable({ columns }).table;
        b.setRows(data());
        b.sort('name', true);
        b.filter({ column: 'name', keyword: 'a' });

        expect(rowTexts(a, 'name')).toEqual(rowTexts(b, 'name'));
        checkInvariants(a);
        checkInvariants(b);
    });
});
