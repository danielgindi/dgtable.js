import { describe, expect, it, vi } from 'vitest';
import DGTable from '../../src/index';
import { makeRows, mountTable } from '../helpers/table';
import { clickHeader, headerCell, renderedRows, rowTexts, scrollContainer } from '../helpers/dom';
import { checkInvariants } from '../helpers/invariants';

const columns = [
    { name: 'id', width: 80 },
    { name: 'name', width: 150 },
];

describe('construction and options', () => {
    it('OPT-01 (D1): can be constructed without an options argument', () => {
        const table = new DGTable();
        expect(table.el).toBeInstanceOf(HTMLDivElement);
        expect(table.el.classList.contains('dgtable-wrapper')).toBe(true);
        table.destroy();
    });

    it('OPT-02: uses a provided element without adding a class', () => {
        const el = document.createElement('section');
        el.className = 'mine';
        const table = new DGTable({ el, className: 'ignored' });

        expect(table.el).toBe(el);
        expect(el.className).toBe('mine');
        table.destroy();
    });

    it('OPT-02: ignores an `el` that is not an HTMLElement', () => {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        const table = new DGTable({ el: svg });

        expect(table.el).not.toBe(svg);
        expect(table.el.tagName).toBe('DIV');
        table.destroy();
    });

    it('OPT-03: applies a custom wrapper class name', () => {
        const table = new DGTable({ className: 'custom-wrapper' });
        expect(table.el.className).toBe('custom-wrapper');
        table.destroy();
    });

    it('OPT-03: accepts several space-separated wrapper classes', () => {
        const table = new DGTable({ className: 'one  two' });
        expect(Array.from(table.el.classList)).toEqual(['one', 'two']);
        table.destroy();
    });

    it('OPT-04: exposes documented defaults through getters', () => {
        const table = new DGTable({});

        expect(table.getMinColumnWidth()).toBe(35);
        expect(table.getResizeAreaWidth()).toBe(8);
        expect(table.getResizeAreaDoubleClickDuration()).toBe(300);
        expect(table.getMaxColumnSortCount()).toBe(1);
        expect(table.getMovableColumns()).toBe(true);
        expect(table.getResizableColumns()).toBe(true);
        expect(table.getConvertColumnWidthsToRelative()).toBe(false);
        expect(table.getColumnAutoWidthExtraSize()).toBe(0);
        expect(table.getMaxStickyColumnRelativeWidth()).toBeNull();
        expect(DGTable.Width).toEqual({ NONE: 'none', AUTO: 'auto', SCROLL: 'scroll' });
        table.destroy();
    });

    it('OPT-05 (D8): honours explicit zero values', () => {
        const table = new DGTable({
            minColumnWidth: 0,
            rowsBufferSize: 0,
            resizeAreaWidth: 0,
            resizeAreaDoubleClickDuration: 0,
            maxColumnsSortCount: 0,
        });

        expect(table.getMinColumnWidth()).toBe(0);
        expect(table.getResizeAreaWidth()).toBe(0);
        expect(table.getResizeAreaDoubleClickDuration()).toBe(0);
        expect(table.getMaxColumnSortCount()).toBe(0);
        expect(table._o.rowsBufferSize).toBe(0);
        table.destroy();
    });

    it('OPT-06: accepts the legacy sortableColumns and sortColumn options', () => {
        const { table } = mountTable({
            columns,
            sortableColumns: 2,
            sortColumn: 'name',
        } as never);

        expect(table.getMaxColumnSortCount()).toBe(2);
        expect(table.getSortedColumns()).toEqual([{ column: 'name', descending: false }]);
    });

    it('OPT-06: accepts sortedColumns as strings, objects, and a single object (legacy)', () => {
        const { table: a } = mountTable({ columns, maxColumnsSortCount: 2, sortedColumns: ['name', { column: 'id', descending: true }] });
        expect(a.getSortedColumns()).toEqual([{ column: 'name', descending: false }, { column: 'id', descending: true }]);

        const { table: b } = mountTable({ columns, sortColumn: { column: 'id', descending: true } } as never);
        expect(b.getSortedColumns()).toEqual([{ column: 'id', descending: true }]);

        const { table: c } = mountTable({ columns, sortedColumns: ['unknown', 'id'] });
        expect(c.getSortedColumns()).toEqual([{ column: 'id', descending: false }]);
    });

    it('OPT-07: prefixes all generated classes with tableClassName', () => {
        const { table } = mountTable({
            columns: [{ name: 'id', width: 80, sticky: 'start' }, { name: 'name', width: 150 }],
            tableClassName: 'grid',
        });
        table.setRows(makeRows(3));

        expect(table.el.querySelector(':scope > .grid-header > .grid-header-row > .grid-header-cell')).not.toBeNull();
        expect(table.el.querySelector(':scope > .grid.virtual > .grid-body > .grid-row > .grid-cell')).not.toBeNull();
        expect(table.el.querySelector('.grid-row.grid-row-alt')).not.toBeNull();
        expect(table.el.querySelector('.grid-cell.grid-sticky')).not.toBeNull();
        expect(table.el.querySelector('.dgtable-row')).toBeNull();
    });

    it('OPT-08: applies table and column cellClasses to body cells only', () => {
        const { table } = mountTable({
            cellClasses: 'table-class',
            columns: [{ name: 'id', width: 80 }, { name: 'name', width: 150, cellClasses: 'column-class' }],
        });
        table.setRows(makeRows(2));
        const row = renderedRows(table)[0];

        expect(row.querySelector('[data-column="id"]')!.classList.contains('table-class')).toBe(true);
        expect(row.querySelector('[data-column="name"]')!.classList.contains('column-class')).toBe(true);
        expect(row.querySelector('[data-column="name"]')!.classList.contains('table-class')).toBe(false);
        expect(headerCell(table, 'name').classList.contains('column-class')).toBe(false);
    });

    it('OPT-09: sizes the scroll container to height minus the header', () => {
        for (const boxSizing of ['content-box', 'border-box'] as const) {
            const { table } = mountTable({ columns, height: 300 }, { boxSizing });
            table.setRows(makeRows(50));

            const header = table.el.querySelector<HTMLElement>('.dgtable-header')!;
            const total = header.offsetHeight + scrollContainer(table).offsetHeight;
            expect(total, boxSizing).toBe(300);
        }
    });

    it('OPT-10: clamps negative setter values to 0 and keeps the layout consistent', () => {
        const { table } = mountTable({ columns });
        table.setRows(makeRows(5));

        table.setMinColumnWidth(-5).setResizeAreaWidth(-1).setColumnAutoWidthExtraSize(-3).setResizeAreaDoubleClickDuration(-10);
        expect(table.getMinColumnWidth()).toBe(0);
        expect(table.getResizeAreaWidth()).toBe(0);
        expect(table.getColumnAutoWidthExtraSize()).toBe(0);
        expect(table.getResizeAreaDoubleClickDuration()).toBe(0);
        checkInvariants(table);
    });

    it('OPT-05 (D8): maxColumnsSortCount 0 disables header sorting', () => {
        const { table } = mountTable({ columns, maxColumnsSortCount: 0 });
        table.setRows(makeRows(3));

        expect(headerCell(table, 'id').classList.contains('sortable')).toBe(false);
        clickHeader(table, 'id');
        expect(table.getSortedColumns()).toEqual([]);
    });
});
