import { describe, expect, it, vi } from 'vitest';
import type { RowClickEvent, RowCreateEvent, SerializedColumnSort } from '../../src/index';
import { mountTable } from '../helpers/table';
import { bodyCell, clickHeader, headerCell, renderedRows, rowTexts } from '../helpers/dom';
import { hover, resizeEdgeX } from '../helpers/pointer';
import { checkInvariants } from '../helpers/invariants';

const columns = [
    { name: 'group', width: 80 },
    { name: 'name', width: 150 },
    { name: 'n', width: 80 },
];

const data = () => [
    { group: 2, name: 'b', n: 1 },
    { group: 1, name: 'd', n: 2 },
    { group: 2, name: 'a', n: 3 },
    { group: 1, name: 'c', n: 4 },
];

function sortState(table: { getSortedColumns(): SerializedColumnSort[] }) {
    return table.getSortedColumns().map(s => s.column + (s.descending ? ' desc' : ''));
}

describe('sorting', () => {
    it('SORT-01: header clicks cycle ascending, descending and unsorted', () => {
        const { table } = mountTable({ columns });
        table.setRows(data());
        const sorts: SerializedColumnSort[][] = [];
        table.on('sort', event => sorts.push(event.sorts));

        clickHeader(table, 'name');
        expect(rowTexts(table, 'name')).toEqual(['a', 'b', 'c', 'd']);
        expect(headerCell(table, 'name').classList.contains('sorted')).toBe(true);
        expect(headerCell(table, 'name').querySelector('.sort-arrow')).not.toBeNull();

        clickHeader(table, 'name');
        expect(rowTexts(table, 'name')).toEqual(['d', 'c', 'b', 'a']);
        expect(headerCell(table, 'name').classList.contains('desc')).toBe(true);

        clickHeader(table, 'name');
        expect(table.getSortedColumns()).toEqual([]);
        expect(headerCell(table, 'name').classList.contains('sorted')).toBe(false);
        expect(headerCell(table, 'name').querySelector('.sort-arrow')).toBeNull();

        expect(sorts).toEqual([
            [{ column: 'name', descending: false }],
            [{ column: 'name', descending: true }],
            [],
        ]);
        checkInvariants(table);
    });

    it('SORT-02: toggles between ascending and descending when cancelling is not allowed', () => {
        const { table } = mountTable({ columns, allowCancelSort: false });
        table.setRows(data());

        clickHeader(table, 'name');
        clickHeader(table, 'name');
        clickHeader(table, 'name');
        expect(sortState(table)).toEqual(['name']);
        expect(rowTexts(table, 'name')).toEqual(['a', 'b', 'c', 'd']);
    });

    it('SORT-03: replaces the sort when only one column may be sorted', () => {
        const { table } = mountTable({ columns });
        table.setRows(data());

        clickHeader(table, 'name');
        clickHeader(table, 'n');
        expect(sortState(table)).toEqual(['n']);
        expect(headerCell(table, 'name').classList.contains('sorted')).toBe(false);
    });

    it('SORT-04: stacks sorts up to maxColumnsSortCount and then starts over', () => {
        const { table } = mountTable({
            columns: [...columns, { name: 'extra', width: 50 }],
            maxColumnsSortCount: 3,
        });
        table.setRows(data().map((row, i) => ({ ...row, extra: i })));

        clickHeader(table, 'group');
        clickHeader(table, 'name');
        expect(sortState(table)).toEqual(['group', 'name']);
        expect(rowTexts(table, 'name')).toEqual(['c', 'd', 'a', 'b']);
        expect(headerCell(table, 'group').classList.contains('sorted')).toBe(true);
        expect(headerCell(table, 'name').classList.contains('sorted')).toBe(true);

        clickHeader(table, 'n');
        expect(sortState(table)).toEqual(['group', 'name', 'n']);

        clickHeader(table, 'extra');
        expect(sortState(table)).toEqual(['extra']);
        checkInvariants(table);
    });

    it('SORT-05 (pin): clicking an earlier column of a sort stack restarts the sort from it', () => {
        const { table } = mountTable({ columns, maxColumnsSortCount: 3 });
        table.setRows(data());

        clickHeader(table, 'group');
        clickHeader(table, 'name');
        clickHeader(table, 'group');
        expect(sortState(table)).toEqual(['group']);
    });

    it('SORT-06 (D6): cancelling the last column of a stack keeps the others', () => {
        const { table } = mountTable({ columns, maxColumnsSortCount: 3 });
        table.setRows(data());

        clickHeader(table, 'group');
        clickHeader(table, 'name');
        clickHeader(table, 'name');
        expect(sortState(table)).toEqual(['group', 'name desc']);

        clickHeader(table, 'name');
        expect(sortState(table)).toEqual(['group']);
        expect(headerCell(table, 'group').classList.contains('sorted')).toBe(true);
        expect(headerCell(table, 'name').classList.contains('sorted')).toBe(false);
        expect(rowTexts(table, 'group')).toEqual(['1', '1', '2', '2']);
    });

    it('SORT-06 (pin): cancelling the sort keeps rows in their last sorted order', () => {
        const { table } = mountTable({ columns });
        table.setRows(data());

        clickHeader(table, 'name');
        clickHeader(table, 'name');
        clickHeader(table, 'name');
        // DECIDE: restore insertion order?
        expect(rowTexts(table, 'name')).toEqual(['d', 'c', 'b', 'a']);
    });

    it('SORT-07: ignores clicks on unsortable columns and when sorting is disabled', () => {
        const { table } = mountTable({ columns: [{ name: 'name', sortable: false }, { name: 'n' }] });
        table.setRows(data());

        clickHeader(table, 'name');
        expect(table.getSortedColumns()).toEqual([]);
        expect(headerCell(table, 'name').classList.contains('sortable')).toBe(false);

        table.setMaxColumnSortCount(0);
        expect(headerCell(table, 'n').classList.contains('sortable')).toBe(false);
        clickHeader(table, 'n');
        expect(table.getSortedColumns()).toEqual([]);

        table.setMaxColumnSortCount(1);
        expect(headerCell(table, 'n').classList.contains('sortable')).toBe(true);
        clickHeader(table, 'n');
        expect(sortState(table)).toEqual(['n']);
    });

    it('SORT-08: does not sort when clicking a resize hotspot or a form control in the header', () => {
        const { table } = mountTable({
            columns,
            headerCellFormatter: (label, name) => name === 'n' ? `<input value="${label}">` : label,
        });
        table.setRows(data());

        const cell = headerCell(table, 'name');
        cell.firstElementChild!.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: resizeEdgeX(table, 'name') }));
        expect(table.getSortedColumns()).toEqual([]);

        headerCell(table, 'n').querySelector('input')!.click();
        expect(table.getSortedColumns()).toEqual([]);
    });

    it('SORT-09: sort() API semantics', () => {
        const { table } = mountTable({ columns, maxColumnsSortCount: 2 });
        table.setRows(data());

        table.sort('group', true);
        expect(sortState(table)).toEqual(['group desc']);
        table.sort('name', false, true);
        expect(sortState(table)).toEqual(['group desc', 'name']);
        expect(rowTexts(table, 'name')).toEqual(['a', 'b', 'c', 'd']);

        table.sort('n', false, true);
        expect(sortState(table)).toEqual(['n']);

        table.sort('unknown');
        expect(table.getSortedColumns()).toEqual([]);
        table.sort('n');
        table.sort();
        expect(table.getSortedColumns()).toEqual([]);
    });

    it('SORT-10: setSortedColumns filters, truncates and honours immediate/render options', () => {
        const { table } = mountTable({ columns, maxColumnsSortCount: 2 });
        table.setRows(data());

        table.setSortedColumns([{ column: 'unknown', descending: false }, { column: 'n', descending: true }, { column: 'name', descending: false }, { column: 'group', descending: false }]);
        expect(sortState(table)).toEqual(['n desc', 'name']);
        expect(rowTexts(table, 'n')).toEqual(['4', '3', '2', '1']);

        table.setSortedColumns([{ column: 'name', descending: false }], { immediate: false, render: true });
        expect(sortState(table)).toEqual(['name']);
        expect(headerCell(table, 'name').classList.contains('sorted')).toBe(true);
        expect(rowTexts(table, 'n')).toEqual(['4', '3', '2', '1']);

        table.setSortedColumns([{ column: 'group', descending: false }], { immediate: true, render: false });
        table.render();
        expect(rowTexts(table, 'group')).toEqual(['1', '1', '2', '2']);
    });

    it('SORT-11: getSortedColumns returns copies', () => {
        const { table } = mountTable({ columns });
        table.sort('name');
        table.getSortedColumns()[0].descending = true;
        expect(sortState(table)).toEqual(['name']);
    });

    it('SORT-12: resort() re-applies the current sort after data changes', () => {
        const { table } = mountTable({ columns });
        const rows = data();
        table.setRows(rows);
        table.sort('n');
        const events = vi.fn();
        table.on('sort', events);

        rows[0].n = 100;
        table.resort();
        table.render();
        expect(rowTexts(table, 'n')).toEqual(['2', '3', '4', '100']);
        expect(events).toHaveBeenCalledWith({ sorts: [{ column: 'n', descending: false }], resort: true });

        table.sort();
        events.mockClear();
        table.resort();
        expect(events).not.toHaveBeenCalled();
    });

    it('SORT-13: sorts by comparePath, also nested', () => {
        const { table } = mountTable({
            columns: [{ name: 'label', dataPath: 'info.label', comparePath: 'info.rank' }, { name: 'x' }],
        });
        table.setRows([
            { info: { label: 'low', rank: 1 }, x: 1 },
            { info: { label: 'high', rank: 3 }, x: 2 },
            { info: { label: 'mid', rank: 2 }, x: 3 },
        ]);

        table.sort('label');
        expect(rowTexts(table, 'label')).toEqual(['low', 'mid', 'high']);
    });

    it('SORT-14: setOnComparatorRequired applies at runtime and falls back to the default', () => {
        const { table } = mountTable({ columns });
        table.setRows(data());
        const provider = vi.fn((column: string) => column === 'name'
            ? (a: Record<string, unknown>, b: Record<string, unknown>) => (a.n as number) - (b.n as number)
            : null);
        table.setOnComparatorRequired(provider as never);

        table.sort('name');
        expect(rowTexts(table, 'n')).toEqual(['1', '2', '3', '4']);
        table.sort('group', true);
        expect(rowTexts(table, 'group')).toEqual(['2', '2', '1', '1']);
        expect(provider).toHaveBeenCalledWith('group', true, expect.any(Function));
    });

    it('SORT-15: setCustomSortingProvider wraps the sort', () => {
        const { table } = mountTable({ columns });
        table.setRows(data());
        table.setCustomSortingProvider((rows, sort) => sort(rows).reverse());

        table.sort('n');
        expect(rowTexts(table, 'n')).toEqual(['4', '3', '2', '1']);
    });

    it('SORT-16 (pin, D23): initial sortedColumns do not sort rows given to setRows() without resort', () => {
        const { table } = mountTable({ columns, sortedColumns: ['name'] });
        table.setRows(data());
        expect(headerCell(table, 'name').classList.contains('sorted')).toBe(true);
        // DECIDE: should initial sortedColumns sort the first setRows() automatically?
        expect(rowTexts(table, 'name')).toEqual(['b', 'd', 'a', 'c']);

        table.setRows(data(), true);
        expect(rowTexts(table, 'name')).toEqual(['a', 'b', 'c', 'd']);
    });

    it('SORT-17 (D4): reports the right rows in events after sorting a filtered table', () => {
        const { table } = mountTable({ columns: [{ name: 'name', width: 60 }, { name: 'n', width: 80 }] });
        table.setRows([{ name: 'b1', n: 1 }, { name: 'a', n: 2 }, { name: 'b2 with a long overflowing value', n: 3 }, { name: 'b0', n: 4 }]);
        table.filter({ column: 'name', keyword: 'b' });

        const created: RowCreateEvent[] = [];
        table.on('rowcreate', event => created.push(event));
        table.sort('name');

        expect(rowTexts(table, 'name')).toEqual(['b0', 'b1', 'b2 with a long overflowing value']);
        for (const event of created) {
            expect(table.getDataForRow(event.rowIndex)).toBe(event.rowData);
        }
        checkInvariants(table);

        const clicks: RowClickEvent[] = [];
        table.on('rowclick', event => clicks.push(event));
        renderedRows(table)[0].click();
        expect(clicks[0].rowData).toMatchObject({ name: 'b0', n: 4 });
        expect(table.getDataForRow(clicks[0].rowIndex)).toBe(clicks[0].rowData);

        const overflow = vi.fn();
        table.on('cellhoveroverflow', overflow);
        hover(bodyCell(table, 2, 'name'));
        expect(overflow.mock.calls[0][0].rowData).toMatchObject({ name: 'b2 with a long overflowing value', n: 3 });

        table.clearFilter();
        expect(rowTexts(table, 'name')).toEqual(['a', 'b0', 'b1', 'b2 with a long overflowing value']);
        checkInvariants(table);
    });

    it('SORT-18: addRows with resort re-sorts, without resort appends', () => {
        const { table } = mountTable({ columns });
        table.setRows(data());
        table.sort('n');

        table.addRows([{ group: 0, name: 'z', n: 0 }]);
        expect(rowTexts(table, 'n')).toEqual(['1', '2', '3', '4', '0']);

        table.addRows([{ group: 0, name: 'y', n: 2.5 }], true);
        expect(rowTexts(table, 'n')).toEqual(['0', '1', '2', '2.5', '3', '4']);
        checkInvariants(table);
    });

    it('WID-14: widens absolute columns by the sort arrow, but not relative ones', () => {
        const { table } = mountTable({ columns: [{ name: 'a', width: 100 }, { name: 'b', width: '30%' }, { name: 'c', width: 100 }] });
        table.setRows([{ a: 1, b: 2, c: 3 }]);
        const before = parseFloat(headerCell(table, 'a').style.width);
        const relativeBefore = parseFloat(headerCell(table, 'b').style.width);

        table.sort('a');
        expect(parseFloat(headerCell(table, 'a').style.width)).toBe(before + 15);
        checkInvariants(table);

        table.sort('b');
        expect(parseFloat(headerCell(table, 'a').style.width)).toBe(before);
        expect(parseFloat(headerCell(table, 'b').style.width)).toBe(relativeBefore);
        checkInvariants(table);
    });

    it('WID-14: does not widen columns when adjustColumnWidthForSortArrow is off', () => {
        const { table } = mountTable({
            columns: [{ name: 'a', width: 100 }, { name: 'c', width: 100 }],
            adjustColumnWidthForSortArrow: false,
        });
        table.setRows([{ a: 1, c: 3 }]);
        table.sort('a');
        expect(parseFloat(headerCell(table, 'a').style.width)).toBe(100);
    });
});
