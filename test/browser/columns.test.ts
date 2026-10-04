import { describe, expect, it, vi } from 'vitest';
import type { ColumnOptions } from '../../src/index';
import { boxFormatter, layoutName, layouts, makeRows, mountLayout, mountTable } from '../helpers/table';
import { bodyCell, headerCell, headerNames, renderedRows, scrollVertically } from '../helpers/dom';
import { checkInvariants } from '../helpers/invariants';

const columns: ColumnOptions[] = [
    { name: 'id', width: 80 },
    { name: 'name', width: 150 },
    { name: 'value', width: 100 },
];

function rows(count = 5) {
    return makeRows(count);
}

describe('columns API', () => {
    it('COLS-01: orders columns by explicit and implicit order', () => {
        const { table } = mountTable({
            columns: [
                { name: 'a', order: 2 },
                { name: 'b' },
                { name: 'c', order: 0 },
            ],
        });
        table.setRows([{ a: 1, b: 2, c: 3 }]);

        expect(headerNames(table)).toEqual(['c', 'a', 'b']);
        checkInvariants(table);
    });

    it('COLS-01: setColumns(columns, false) defers rendering', () => {
        const { table } = mountTable({ columns });
        table.setRows(rows());
        table.setColumns([{ name: 'name' }], false);
        expect(headerNames(table)).toEqual(['id', 'name', 'value']);

        table.render();
        expect(headerNames(table)).toEqual(['name']);
        checkInvariants(table);
    });

    it('COLS-02: renders an empty column set without throwing', () => {
        const { table } = mountTable({ columns: [] });
        expect(() => table.setRows(rows())).not.toThrow();
        expect(headerNames(table)).toEqual([]);
    });

    it('COLS-03: forces the first column visible when all are hidden', () => {
        const { table } = mountTable({ columns });
        const shown = vi.fn();
        table.on('showcolumn', shown);

        table.setColumns(columns.map(c => ({ ...c, visible: false })));
        expect(headerNames(table)).toEqual(['id']);
        expect(shown).toHaveBeenCalledWith('id');
    });

    it('COLS-04 (pin): resolves duplicate column names to the first column', () => {
        const { table } = mountTable({ columns: [{ name: 'x', label: 'first' }, { name: 'x', label: 'second' }] });
        expect(table.getColumnConfig('x')!.label).toBe('first');
    });

    it('COLS-05: adds columns at the end, before a name, and before an order index', () => {
        const { table } = mountTable({ columns });
        table.setRows(rows());
        const added = vi.fn();
        table.on('addcolumn', added);

        table.addColumn({ name: 'end' });
        table.addColumn({ name: 'beforeName' }, 'name');
        table.addColumn({ name: 'first' }, 0);
        expect(headerNames(table)).toEqual(['first', 'id', 'beforeName', 'name', 'value', 'end']);
        expect(added.mock.calls.map(c => c[0])).toEqual(['end', 'beforeName', 'first']);

        table.addColumn({ name: 'id' });
        expect(added).toHaveBeenCalledTimes(3);
        checkInvariants(table);
    });

    it('COLS-06: removes columns and emits removecolumn', () => {
        const { table } = mountTable({ columns });
        table.setRows(rows());
        const removed = vi.fn();
        table.on('removecolumn', removed);

        table.removeColumn('name');
        table.removeColumn('unknown');
        expect(headerNames(table)).toEqual(['id', 'value']);
        expect(removed.mock.calls).toEqual([['name']]);
        checkInvariants(table);
    });

    it('COLS-06 (pin): keeps a removed column in the sort state until the next sort', () => {
        const { table } = mountTable({ columns });
        table.setRows(rows());
        table.sort('name');
        table.removeColumn('name');

        // DECIDE: should removeColumn drop the column from the sort state?
        expect(table.getSortedColumns()).toEqual([{ column: 'name', descending: false }]);
        table.resort();
        expect(table.getSortedColumns()).toEqual([]);
    });

    it('COLS-07: updates the label as text and keeps the sort arrow', () => {
        const { table } = mountTable({ columns });
        table.setRows(rows());
        table.sort('name');

        table.setColumnLabel('name', '<b>bold</b>');
        expect(headerCell(table, 'name').textContent).toBe('<b>bold</b>');
        expect(headerCell(table, 'name').querySelector('b')).toBeNull();
        expect(headerCell(table, 'name').querySelector('.sort-arrow')).not.toBeNull();
        expect(table.getColumnConfig('name')!.label).toBe('<b>bold</b>');

        table.setColumnLabel('name', undefined as never);
        expect(headerCell(table, 'name').textContent).toBe('name');
        expect(() => table.setColumnLabel('unknown', 'x')).not.toThrow();
    });

    it('COLS-08 (D14): updates the label through a custom header formatter', () => {
        const { table } = mountTable({
            columns,
            headerCellFormatter: (label, name) => `<span class="label" data-name="${name}">${label}</span>`,
        });
        table.setRows(rows());
        table.sort('name');

        table.setColumnLabel('name', 'Renamed');
        expect(headerCell(table, 'name').querySelector('.label')?.textContent).toBe('Renamed');
        expect(headerCell(table, 'name').querySelector('.sort-arrow')).not.toBeNull();
    });

    describe.each(layouts)('moveColumn ($dir, $boxSizing, virtual=$virtualTable)', layout => {
        it('COLS-09: moves by name, visible index and absolute index', () => {
            const { table } = mountLayout(layout, { columns });
            table.setRows(rows());
            const moves = vi.fn();
            table.on('movecolumn', moves);

            table.moveColumn('id', 'value');
            expect(headerNames(table)).toEqual(['name', 'value', 'id']);
            expect(moves).toHaveBeenLastCalledWith({ name: 'id', src: 0, dest: 2 });
            checkInvariants(table);

            table.moveColumn(2, 0);
            expect(headerNames(table)).toEqual(['id', 'name', 'value']);
            checkInvariants(table);

            table.moveColumn('name', 'name');
            expect(moves).toHaveBeenCalledTimes(2);
        });

        it('COLS-10 (D11): moves the right cells when a hidden column precedes the source', () => {
            const { table } = mountLayout(layout, {
                columns: [{ name: 'hidden', visible: false, width: 50 }, ...columns],
            });
            table.setRows(rows());

            table.moveColumn('id', 'value');
            expect(headerNames(table)).toEqual(['name', 'value', 'id']);
            checkInvariants(table);

            table.moveColumn('value', 'name');
            expect(headerNames(table)).toEqual(['value', 'name', 'id']);
            checkInvariants(table);
        });
    });

    it('COLS-09: moves across hidden columns with visibleOnly=false', () => {
        const { table } = mountTable({ columns: [{ name: 'hidden', visible: false }, ...columns] });
        table.setRows(rows());

        table.moveColumn(0, 3, false);
        table.setColumnVisible('hidden', true);
        expect(headerNames(table)).toEqual(['id', 'name', 'value', 'hidden']);
        checkInvariants(table);
    });

    it('COLS-11: shows and hides columns with events only on change', () => {
        const { table } = mountTable({ columns });
        table.setRows(rows());
        const events: string[] = [];
        table.on('showcolumn', name => events.push('show:' + name));
        table.on('hidecolumn', name => events.push('hide:' + name));

        table.setColumnVisible('name', false);
        table.setColumnVisible('name', false);
        expect(table.isColumnVisible('name')).toBe(false);
        expect(renderedRows(table)[0].querySelector('[data-column="name"]')).toBeNull();
        checkInvariants(table);

        table.setColumnVisible('name', true);
        expect(events).toEqual(['hide:name', 'show:name']);
        expect(table.isColumnVisible('unknown')).toBe(false);
        checkInvariants(table);
    });

    it('COLS-12: sets widths in every supported format', () => {
        const { table } = mountTable({ columns: [...columns, { name: 'free', ignoreMin: true }] });
        table.setRows(rows());
        const widths = vi.fn();
        table.on('columnwidth', widths);

        const cases: [string, number | string, number | string][] = [
            ['id', 120, 120],
            ['id', '30%', '30%'],
            ['id', 0.25, '25%'],
            ['id', 'auto', 'auto'],
            ['id', 'rest', 'rest'],
            ['id', 10, 35],
            ['free', 10, 10],
        ];

        for (const [column, width, expected] of cases) {
            table.setColumnWidth(column, width);
            expect(table.getColumnWidth(column), `${column} = ${width}`).toBe(expected);
            checkInvariants(table);
        }

        expect(widths).toHaveBeenCalledWith({ name: 'id', width: 120, oldWidth: 80 });
        expect(table.getColumnWidth('unknown')).toBeNull();
        expect(() => table.setColumnWidth('unknown', 10)).not.toThrow();
    });

    it('COLS-13 (pin, D20): emits columnwidth even when the width did not change', () => {
        const { table } = mountTable({ columns });
        const widths = vi.fn();
        table.on('columnwidth', widths);

        table.setColumnWidth('id', 80);
        // DECIDE: should an unchanged width emit?
        expect(widths).toHaveBeenCalledWith({ name: 'id', width: 80, oldWidth: 80 });
    });

    it('COLS-14 (D16): round-trips the full column configuration', () => {
        const original: ColumnOptions[] = [
            { name: 'id', label: 'ID', width: 80, sortable: false, movable: false, resizable: false, cellClasses: 'c', ignoreMin: true, sticky: 'start', allowPreview: false },
            { name: 'name', width: '30%', dataPath: 'a.b', comparePath: 'a.c', visible: false },
            { name: 'value', width: 'rest' },
        ];
        const { table } = mountTable({ columns: original });
        const config = table.getColumnsConfig();

        expect(config.id).toEqual({
            name: 'id', label: 'ID', width: 80, dataPath: 'id', comparePath: 'id', resizable: false, movable: false,
            sortable: false, visible: true, cellClasses: 'c', ignoreMin: true, sticky: 'start', order: 0, allowPreview: false,
        });

        const { table: copy } = mountTable({ columns: Object.values(config) as ColumnOptions[] });
        expect(copy.getColumnsConfig()).toEqual(config);
    });

    it('COLS-15: getColumnsConfig returns an object keyed by column name', () => {
        const { table } = mountTable({ columns });
        expect(Object.keys(table.getColumnsConfig())).toEqual(['id', 'name', 'value']);
        expect(table.getColumnConfig('unknown')).toBeNull();
    });

    it.each(layouts)('COLS-16: autoFitColumn fits all (also off-screen) rows of the filtered set ($dir, $boxSizing, virtual=$virtualTable)', layout => {
        const { table } = mountLayout(layout, {
            columns: [{ name: 'w', width: 50 }, { name: 'tag', width: 100 }],
            cellFormatter: (value, column) => column === 'w' ? boxFormatter(value) : String(value),
        });
        const data = makeRows(200, i => ({ w: i === 150 ? 300 : 40 + (i % 7), tag: i === 150 ? 'big' : 'small' }));
        table.setRows(data);

        table.autoFitColumn('w');
        const fitted = Number(table.getColumnWidth('w'));
        expect(fitted).toBeGreaterThanOrEqual(300);

        scrollVertically(table, 150 * 29);
        const cell = bodyCell(table, 150, 'w');
        expect(cell.firstElementChild!.scrollWidth).toBeLessThanOrEqual(cell.firstElementChild!.clientWidth);
        checkInvariants(table);

        table.filter({ column: 'tag', keyword: 'small' });
        table.autoFitColumn('w');
        expect(Number(table.getColumnWidth('w'))).toBeLessThan(fitted);
        expect(Number(table.getColumnWidth('w'))).toBeGreaterThanOrEqual(46);
    }, 20_000);

    it('COLS-16: autoFitColumn adds columnAutoWidthExtraSize to the header measurement and leaves empty tables alone', () => {
        const { table } = mountTable({
            columns: [{ name: 'w', width: 50 }, { name: 'x', width: 50 }],
            cellFormatter: value => boxFormatter(value),
            headerCellFormatter: label => label === 'w' ? boxFormatter(100) : String(label),
        });

        table.autoFitColumn('w');
        expect(table.getColumnWidth('w')).toBe(50);

        table.setRows([{ w: 10, x: 1 }]);
        table.autoFitColumn('w');
        const base = Number(table.getColumnWidth('w'));
        expect(base).toBeGreaterThanOrEqual(100);

        table.setColumnAutoWidthExtraSize(20);
        table.autoFitColumn('w');
        expect(Number(table.getColumnWidth('w'))).toBe(base + 20);
        expect(() => table.autoFitColumn('unknown')).not.toThrow();
    });

    it('COLS-17: sizes "auto" columns from the header', () => {
        const { table } = mountTable({
            columns: [{ name: 'a', width: 'auto' }, { name: 'b', width: 100 }],
            headerCellFormatter: label => boxFormatter(label === 'a' ? 120 : 30),
        });
        table.setRows([{ a: 'x', b: 'y' }]);

        expect(parseFloat(headerCell(table, 'a').style.width)).toBeGreaterThanOrEqual(120);
        expect(table.getColumnWidth('a')).toBe('auto');
        checkInvariants(table);
    });

    it('COLS-18: setters update getters and behaviour', () => {
        const { table } = mountTable({ columns });
        table.setRows(rows());

        table.setMovableColumns(false).setResizableColumns(false);
        expect(table.getMovableColumns()).toBe(false);
        expect(table.getResizableColumns()).toBe(false);
        table.setMovableColumns().setResizableColumns();
        expect(table.getMovableColumns()).toBe(true);
        expect(table.getResizableColumns()).toBe(true);

        table.setMinColumnWidth(90);
        expect(parseFloat(headerCell(table, 'id').style.width)).toBe(90);
        checkInvariants(table);

        table.setMaxStickyColumnRelativeWidth(0.5);
        expect(table.getMaxStickyColumnRelativeWidth()).toBe(0.5);
        table.setConvertColumnWidthsToRelative(true, false);
        expect(table.getConvertColumnWidthsToRelative()).toBe(true);
        table.setMaxColumnSortCount(3);
        expect(table.getMaxColumnSortCount()).toBe(3);
        expect(table.getSortableColumns()).toBe(3);
        table.setSortableColumns(2);
        expect(table.getMaxColumnSortCount()).toBe(2);
    });
});

describe('header DOM contract', () => {
    it.each(layouts.slice(0, 1))('HDR-06: header cells are draggable and carry data-column and sortable', layout => {
        const { table } = mountLayout(layout, { columns: [{ name: 'a', sortable: false }, { name: 'b' }] });
        expect(headerCell(table, 'a').draggable).toBe(true);
        expect(headerCell(table, 'a').classList.contains('sortable')).toBe(false);
        expect(headerCell(table, 'b').classList.contains('sortable')).toBe(true);
        expect(layoutName(layout)).toContain('ltr');
    });
});
