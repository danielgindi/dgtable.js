import { describe, expect, it, vi } from 'vitest';
import DGTable from '../../src/index';
import type { ColumnOptions, DGTableOptions, RowData, StickyEndRowsMode } from '../../src/index';
import { boxFormatter, layouts, makeRows, mountLayout, mountTable } from '../helpers/table';
import type { Layout } from '../helpers/table';
import {
    isRtl,
    nextFrame,
    previewCell,
    renderedRows,
    scrollContainer,
    scrollHorizontally,
    scrollVertically,
    stickyEndCell,
    stickyEndRows,
    stickyEndRowsContainer,
} from '../helpers/dom';
import { hover } from '../helpers/pointer';
import { headerCompensation } from '../helpers/internals';
import { checkInvariants, expectColumnsAligned } from '../helpers/invariants';
import { scrollbarWidth } from '../helpers/dom';

const columns: ColumnOptions[] = [
    { name: 's1', width: 60, sticky: 'start' },
    { name: 'a', width: 200 },
    { name: 'b', width: 200 },
    { name: 'c', width: 200 },
    { name: 'e1', width: 50, sticky: 'end' },
];

function makeData(count: number): RowData[] {
    return makeRows(count, i => Object.fromEntries(columns.map(c => [c.name, c.name + '-' + i])));
}

const totals: RowData[] = [
    { s1: 'sum', a: 'total-a', b: 'total-b', c: 'total-c', e1: 'T1' },
    { s1: 'avg', a: 'avg-a', b: 'avg-b', c: 'avg-c', e1: 'T2' },
];

/** The bottom edge of the scroll container's viewport (inside borders and the horizontal scrollbar). */
function viewportBottom(table: DGTable): number {
    const container = scrollContainer(table);
    return container.getBoundingClientRect().top + container.clientTop + container.clientHeight;
}

function expectStickyEndRowsAligned(table: DGTable, tolerance = 0.5): void {
    const rtl = isRtl(table);

    for (const row of stickyEndRows(table)) {
        for (const header of Array.from(table.getHeaderRowElement()!.children) as HTMLElement[]) {
            const column = header.getAttribute('data-column')!;
            const cell = row.querySelector<HTMLElement>(`[data-column="${column}"]`)!;
            const h = header.getBoundingClientRect();
            const c = cell.getBoundingClientRect();
            const startDelta = rtl ? h.right - c.right : h.left - c.left;
            const widthDelta = h.width - c.width - headerCompensation(table, column);

            expect(Math.abs(startDelta), `${column}: start edge`).toBeLessThanOrEqual(tolerance);
            expect(Math.abs(widthDelta), `${column}: width`).toBeLessThanOrEqual(tolerance);
        }
    }
}

const modeLayouts = layouts.flatMap(layout => (['sticky', 'fixed'] as StickyEndRowsMode[])
    .map(mode => ({ ...layout, mode })));

describe.each(modeLayouts)('sticky end rows ($mode; $dir, $boxSizing, virtual=$virtualTable)', (layout: Layout & { mode: StickyEndRowsMode }) => {
    function mount(options: DGTableOptions = {}, rowCount = 40) {
        const { table } = mountLayout(layout, {
            columns,
            width: DGTable.Width.SCROLL,
            stickyEndRows: totals,
            stickyEndRowsMode: layout.mode,
            ...options,
        }, { width: 500 });

        table.setRows(makeData(rowCount));
        return table;
    }

    it('SER-01: renders the option rows after the body, outside the data rows', () => {
        const table = mount();
        const container = stickyEndRowsContainer(table)!;

        expect(container).not.toBeNull();
        expect(container.previousElementSibling!.classList.contains('dgtable-body')).toBe(true);
        expect(container.style.position).toBe('sticky');
        expect(container.style.bottom).toBe('0px');

        const rows = stickyEndRows(table);
        expect(rows).toHaveLength(2);
        expect(rows.every(row => row.classList.contains('dgtable-row') && row.classList.contains('dgtable-sticky-end-row'))).toBe(true);
        expect(rows[1].classList.contains('dgtable-row-alt')).toBe(true);
        expect(stickyEndCell(table, 0, 'a').textContent).toBe('total-a');
        expect(stickyEndCell(table, 1, 'e1').textContent).toBe('T2');

        expect(table.getRowCount()).toBe(40);
        expect(table.getStickyEndRowCount()).toBe(2);
        expect(table.getStickyEndRows()).toEqual(totals);
        expect(table.getStickyEndRowElement(1)).toBe(rows[1]);
        expect(table.getStickyEndRowElement(2)).toBeNull();
        expect(renderedRows(table).some(row => row.classList.contains('dgtable-sticky-end-row'))).toBe(false);
        checkInvariants(table);
    });

    it('SER-02: stays pinned to the viewport bottom, and follows the last row at the scroll end', () => {
        const table = mount();
        const container = stickyEndRowsContainer(table)!;
        const rows = stickyEndRows(table);

        expect(Math.abs(container.getBoundingClientRect().bottom - viewportBottom(table))).toBeLessThanOrEqual(1);

        scrollVertically(table, 200);
        expect(Math.abs(container.getBoundingClientRect().bottom - viewportBottom(table))).toBeLessThanOrEqual(1);

        scrollVertically(table, 100_000);
        expect(Math.abs(container.getBoundingClientRect().bottom - viewportBottom(table))).toBeLessThanOrEqual(1);

        const lastDataRow = renderedRows(table).find(row => row.vIndex === table.getFilteredRowCount() - 1)!;
        expect(lastDataRow).toBeDefined();

        // Cells may overflow their row (content-box cells with min-height: 100%). The virtual body has
        // an explicit height, so the footer follows the row; in flow, it is pushed below the overflowing cells.
        const lastDataRowBottom = layout.virtualTable
            ? lastDataRow.getBoundingClientRect().bottom
            : Math.max(
                lastDataRow.getBoundingClientRect().bottom,
                ...Array.from(lastDataRow.children, cell => cell.getBoundingClientRect().bottom),
            );
        expect(Math.abs(lastDataRowBottom - rows[0].getBoundingClientRect().top)).toBeLessThanOrEqual(1);
    });

    it('SER-03: cells align with the header, including after resizing and horizontal scrolling', () => {
        const table = mount();
        expectStickyEndRowsAligned(table);

        table.setColumnWidth('b', 260);
        expectStickyEndRowsAligned(table);

        scrollHorizontally(table, 150);
        expectStickyEndRowsAligned(table);

        scrollHorizontally(table, 100_000);
        expectStickyEndRowsAligned(table);
    });

    it('SER-36: fractional widths keep every sticky end cell on the same line', () => {
        const table = mount({
            columns: Array.from({ length: 50 }, (_, index) => ({ name: 'c' + index, width: 100.03 })),
            stickyEndRows: [{}],
            autoFillLastColumn: false,
        }, 1);

        const expectNoWrap = () => {
            const container = stickyEndRowsContainer(table)!;
            const body = container.previousElementSibling!;
            const cells = Array.from(stickyEndRows(table)[0].children);
            const top = cells[0].getBoundingClientRect().top;

            expect(container.getBoundingClientRect().width).toBe(body.getBoundingClientRect().width);
            for (const cell of cells)
                expect(cell.getBoundingClientRect().top).toBe(top);
        };

        expectNoWrap();
        table.render();
        expectNoWrap();
        table.setColumnWidth('c0', 100.13);
        table.refreshStickyEndRows();
        expectNoWrap();
        table.setStickyEndRows([]);
        table.setStickyEndRows([{}]);
        expectNoWrap();
    });

    it('SER-04: sticky columns stick and get the overlap markers in sticky end rows too', () => {
        const table = mount();
        const startClass = isRtl(table) ? 'is-sticky-right' : 'is-sticky-left';
        const edge = isRtl(table) ? 'right' : 'left';

        expect(stickyEndCell(table, 0, 's1').style.position).toBe('sticky');
        expect(stickyEndCell(table, 0, 's1').style[edge]).toBe('0px');
        expect(stickyEndCell(table, 0, 's1').classList.contains(startClass)).toBe(false);

        scrollHorizontally(table, 150);
        expect(stickyEndCell(table, 0, 's1').classList.contains(startClass)).toBe(true);
        expect(stickyEndCell(table, 1, 's1').classList.contains(startClass)).toBe(true);

        scrollHorizontally(table, 0);
        expect(stickyEndCell(table, 0, 's1').classList.contains(startClass)).toBe(false);
    });

    it('SER-05: sorting, filtering and replacing the data leave the sticky end rows alone', () => {
        const table = mount();

        table.sort('a', true);
        expect(stickyEndRows(table).map(row => row.querySelector('[data-column="s1"]')!.textContent)).toEqual(['sum', 'avg']);

        table.filter({ column: 'a', keyword: 'a-1' });
        expect(table.getFilteredRowCount()).toBeLessThan(40);
        expect(stickyEndRows(table)).toHaveLength(2);

        table.clearFilter();
        table.setRows(makeData(5));
        expect(stickyEndRows(table)).toHaveLength(2);

        table.setRows([]);
        expect(stickyEndRows(table)).toHaveLength(2);
        checkInvariants(table);
    });

    it('SER-06: setStickyEndRows replaces and removes the rows, with create/destroy events', () => {
        const table = mount();
        const created = vi.fn(), destroyed = vi.fn();
        table.on('stickyendrowcreate', created).on('stickyendrowdestroy', destroyed);

        table.setStickyEndRows([{ a: 'only' }]);
        expect(destroyed).toHaveBeenCalledTimes(2);
        expect(created).toHaveBeenCalledTimes(1);
        expect(created.mock.calls[0][0]).toMatchObject({ stickyRowIndex: 0, rowData: { a: 'only' } });
        expect(stickyEndCell(table, 0, 'a').textContent).toBe('only');

        table.setStickyEndRows(null);
        expect(destroyed).toHaveBeenCalledTimes(3);
        expect(stickyEndRowsContainer(table)).toBeNull();
        expect(table.getStickyEndRowCount()).toBe(0);

        table.setStickyEndRows(totals);
        expect(stickyEndRows(table)).toHaveLength(2);
        expectStickyEndRowsAligned(table);
    });

    it('SER-07: the input array is copied, and refreshStickyEndRows picks up mutated row objects', () => {
        const rows: RowData[] = [{ a: 'before' }];
        const table = mount({ stickyEndRows: rows });

        rows.push({ a: 'ignored' });
        expect(table.getStickyEndRowCount()).toBe(1);

        rows[0].a = 'after';
        expect(stickyEndCell(table, 0, 'a').textContent).toBe('before');
        table.refreshStickyEndRows();
        expect(stickyEndCell(table, 0, 'a').textContent).toBe('after');
    });

    it('SER-08: clicking a sticky end row emits stickyendrowclick, not rowclick', () => {
        const table = mount();
        const rowClick = vi.fn(), stickyClick = vi.fn();
        table.on('rowclick', rowClick).on('stickyendrowclick', stickyClick);

        stickyEndRows(table)[1].click();

        expect(rowClick).not.toHaveBeenCalled();
        expect(stickyClick).toHaveBeenCalledTimes(1);
        expect(stickyClick.mock.calls[0][0]).toMatchObject({ stickyRowIndex: 1, rowData: totals[1], rowEl: stickyEndRows(table)[1] });
    });

    it('SER-09: column changes re-render the sticky end rows in the new column order', () => {
        const table = mount();
        const names = () => Array.from(stickyEndRows(table)[0].children, cell => cell.getAttribute('data-column'));

        table.moveColumn('b', 'a');
        expect(names()).toEqual(['s1', 'b', 'a', 'c', 'e1']);
        expectStickyEndRowsAligned(table);

        table.setColumnVisible('c', false);
        expect(names()).toEqual(['s1', 'b', 'a', 'e1']);
        expectStickyEndRowsAligned(table);

        table.addColumn({ name: 'd', width: 80 }, 'e1');
        expect(names()).toEqual(['s1', 'b', 'a', 'd', 'e1']);
        expectStickyEndRowsAligned(table);
        checkInvariants(table);
    });

    it('SER-17: rows (and controls in them) are kept across data, filter and layout changes', () => {
        const table = mount({
            stickyEndRowFormatter: (value, column, _row, index) => column === 'a' && index === 0
                ? '<input class="filter-input" value="">'
                : String(value ?? ''),
        });
        const created = vi.fn(), destroyed = vi.fn();
        table.on('stickyendrowcreate', created).on('stickyendrowdestroy', destroyed);

        const rowEl = stickyEndRows(table)[0];
        const input = rowEl.querySelector<HTMLInputElement>('.filter-input')!;
        input.focus();
        input.value = 'a-1';
        input.setSelectionRange(1, 2);

        table.filter({ column: 'a', keyword: input.value });
        table.clearFilter();
        table.setRows(makeData(10));
        table.sort('b');
        table.setColumnWidth('b', 240);
        scrollHorizontally(table, 120);
        table.tableWidthChanged(true);
        table.clearAndRender();

        expect(created).not.toHaveBeenCalled();
        expect(destroyed).not.toHaveBeenCalled();
        expect(stickyEndRows(table)[0]).toBe(rowEl);
        expect(input.isConnected).toBe(true);
        expect(input.value).toBe('a-1');
        expect(document.activeElement).toBe(input);
        expect([input.selectionStart, input.selectionEnd]).toEqual([1, 2]);
        expectStickyEndRowsAligned(table);
    });

    it('SER-22: moving a column keeps the sticky end row elements in non-virtual mode', () => {
        const table = mount();
        const rowEl = stickyEndRows(table)[0];
        const created = vi.fn();
        table.on('stickyendrowcreate', created);

        // 'c' absorbs the scrollbar width until the move makes 'b' the last non-sticky column
        table.moveColumn('c', 'a');
        table.refreshAllVirtualRows();
        expectColumnsAligned(table);

        expect(Array.from(stickyEndRows(table)[0].children, cell => cell.getAttribute('data-column')))
            .toEqual(['s1', 'c', 'a', 'b', 'e1']);
        expectStickyEndRowsAligned(table);

        // The virtual table re-renders its skeleton on a column move, which re-creates the rows
        if (!layout.virtualTable) {
            expect(stickyEndRows(table)[0]).toBe(rowEl);
            expect(created).not.toHaveBeenCalled();
        }
    });

    it('SER-23: with few rows, sticky follows the last row and fixed stays at the viewport bottom', () => {
        for (const rowCount of [1, 0]) {
            const table = mount({}, rowCount);
            const container = stickyEndRowsContainer(table)!;
            const scroller = scrollContainer(table);

            if (layout.mode === 'fixed') {
                expect(Math.abs(container.getBoundingClientRect().bottom - viewportBottom(table)), `${rowCount} rows`).toBeLessThanOrEqual(1);
            } else {
                expect(container.getBoundingClientRect().bottom, `${rowCount} rows`).toBeLessThan(viewportBottom(table) - 20);

                const lastDataRow = renderedRows(table).find(row => row.vIndex === rowCount - 1);
                if (lastDataRow && layout.boxSizing === 'border-box')
                    expect(Math.abs(lastDataRow.getBoundingClientRect().bottom - container.getBoundingClientRect().top)).toBeLessThanOrEqual(1);
            }

            // Filling the viewport must not make it scroll vertically
            expect(scroller.scrollHeight - scroller.clientHeight, `${rowCount} rows: vertical overflow`).toBeLessThanOrEqual(1);
            expectStickyEndRowsAligned(table);
        }
    });

    it('SER-24: switching the mode at runtime moves the rows, and keeps them', () => {
        const table = mount({}, 1);
        const container = stickyEndRowsContainer(table)!;
        const rowEl = stickyEndRows(table)[0];
        const other: StickyEndRowsMode = layout.mode === 'fixed' ? 'sticky' : 'fixed';

        expect(table.getStickyEndRowsMode()).toBe(layout.mode);

        table.setStickyEndRowsMode(other);
        expect(table.getStickyEndRowsMode()).toBe(other);
        expect(stickyEndRows(table)[0]).toBe(rowEl);

        const atBottom = Math.abs(container.getBoundingClientRect().bottom - viewportBottom(table)) <= 1;
        expect(atBottom).toBe(other === 'fixed');

        table.setStickyEndRowsMode(layout.mode);
        expect(Math.abs(container.getBoundingClientRect().bottom - viewportBottom(table)) <= 1).toBe(layout.mode === 'fixed');
    });

    it('SER-28: adding, showing and removing columns re-creates the rows without errors', () => {
        const table = mount();
        const names = () => Array.from(stickyEndRows(table)[0].children, cell => cell.getAttribute('data-column'));

        // At the end: the new last column absorbs the scrollbar width, past the old rows' cell count
        table.addColumn({ name: 'd', width: 80 });
        expect(names()).toEqual(['s1', 'a', 'b', 'c', 'e1', 'd']);
        expectStickyEndRowsAligned(table);

        table.setColumnVisible('b', false);
        table.setColumnVisible('b', true);
        expect(names()).toEqual(['s1', 'a', 'b', 'c', 'e1', 'd']);

        table.removeColumn('d');
        expect(names()).toEqual(['s1', 'a', 'b', 'c', 'e1']);
        expectStickyEndRowsAligned(table);

        table.setColumns([...columns.slice(0, 4), { name: 'x', width: 90 }, { name: 'y', width: 90 }]);
        expect(names()).toEqual(['s1', 'a', 'b', 'c', 'x', 'y']);
        expectStickyEndRowsAligned(table);
        checkInvariants(table);
    });

    it('SER-29: a full re-render keeps the scroll position at the bottom', context => {
        context.skip(!layout.virtualTable, 'non-virtual tables lose their scroll position on a full re-render regardless');

        const table = mount();
        scrollVertically(table, 100_000);
        const bottom = scrollContainer(table).scrollTop;
        expect(bottom).toBeGreaterThan(0);

        table.clearAndRender();
        expect(scrollContainer(table).scrollTop).toBe(bottom);

        table.filter({ column: 'a', keyword: 'a-' });
        expect(scrollContainer(table).scrollTop).toBe(bottom);
    });

    it('SER-10: survives a full re-render and is released on destroy', () => {
        const table = mount();
        table.clearAndRender();
        expect(stickyEndRows(table)).toHaveLength(2);
        expectStickyEndRowsAligned(table);

        const destroyed = vi.fn();
        table.on('stickyendrowdestroy', destroyed);
        table.destroy();
        expect(destroyed).toHaveBeenCalledTimes(2);
    });
});

describe('sticky end rows', () => {
    it('SER-11: rows set before the first render are rendered by it', () => {
        const { table } = mountTable({ columns: [{ name: 'a' }] }, { render: false });
        table.setStickyEndRows([{ a: 'x' }]);
        expect(stickyEndRowsContainer(table)).toBeNull();

        table.render();
        expect(stickyEndRows(table)).toHaveLength(1);
    });

    it('SER-12: setStickyEndRows with render=false defers to the next render', () => {
        const { table } = mountTable({ columns: [{ name: 'a' }] });
        table.setStickyEndRows([{ a: 'x' }], false);
        expect(stickyEndRowsContainer(table)).toBeNull();

        table.render();
        expect(stickyEndRows(table)).toHaveLength(1);
    });

    it('SER-13: autoFitColumn measures the sticky end rows too', () => {
        const { table } = mountTable({
            columns: [{ name: 'a', width: 50 }, { name: 'b', width: 50 }],
            cellFormatter: boxFormatter,
            stickyEndRows: [{ a: 300, b: 1 }],
        });
        table.setRows([{ a: 100, b: 1 }]);

        table.autoFitColumn('a');
        expect(table.getColumnWidth('a') as number).toBeGreaterThanOrEqual(300);

        // With no body rows at all, the sticky end rows alone decide the width
        table.setRows([]);
        table.setStickyEndRows([{ a: 1, b: 250 }]);
        table.autoFitColumn('b');
        expect(table.getColumnWidth('b') as number).toBeGreaterThanOrEqual(250);
    });

    it('SER-14: hovering an overflowing sticky end cell reports its sticky row', () => {
        const { table } = mountTable({
            columns: [{ name: 'a', width: 60 }, { name: 'b', width: 100 }],
            stickyEndRows: [{ a: 'a long value that overflows the cell', b: 1 }],
        });
        table.setRows([{ a: 'x', b: 2 }]);

        const overflow = vi.fn(), preview = vi.fn(), stickyClick = vi.fn(), rowClick = vi.fn();
        table.on('cellhoveroverflow', overflow).on('cellpreview', preview)
            .on('stickyendrowclick', stickyClick).on('rowclick', rowClick);

        hover(stickyEndCell(table, 0, 'a'));

        const expected = { name: 'a', rowIndex: null as number | null, stickyEndRowIndex: 0, rowData: table.getStickyEndRows()[0] };
        expect(overflow.mock.calls[0][0]).toMatchObject(expected);
        expect(preview.mock.calls[0][0]).toMatchObject(expected);

        previewCell(table)!.click();
        expect(stickyClick).toHaveBeenCalledTimes(1);
        expect(rowClick).not.toHaveBeenCalled();
    });

    it('SER-18: stickyEndRowFormatter formats the sticky end rows only, with their index', () => {
        const formatter = vi.fn((value: unknown, column: string, _row: RowData, index: number) => `<b>${column}:${String(value)}:${index}</b>`);
        const { table } = mountTable({
            columns: [{ name: 'a' }, { name: 'b' }],
            cellFormatter: value => 'cell:' + String(value),
            stickyEndRowFormatter: formatter,
            stickyEndRows: [{ a: 1, b: 2 }, { a: 3, b: 4 }],
        });
        table.setRows([{ a: 'x', b: 'y' }]);

        expect(stickyEndCell(table, 1, 'b').innerHTML).toBe('<div><b>b:4:1</b></div>');
        expect(renderedRows(table)[0].querySelector('[data-column="a"]')!.textContent).toBe('cell:x');
        expect(formatter).toHaveBeenCalledWith(1, 'a', { a: 1, b: 2 }, 0);

        table.setStickyEndRowFormatter(value => 'new:' + String(value));
        expect(stickyEndCell(table, 0, 'a').textContent).toBe('new:1');

        table.setStickyEndRowFormatter(null);
        expect(stickyEndCell(table, 0, 'a').textContent).toBe('cell:1');
    });

    it('SER-19: a throwing stickyEndRowFormatter renders [ERROR] instead of breaking the table', () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const { table } = mountTable({
            columns: [{ name: 'a' }],
            stickyEndRowFormatter: () => {
                throw new Error('boom');
            },
            stickyEndRows: [{ a: 1 }],
        });

        expect(stickyEndCell(table, 0, 'a').textContent).toBe('[ERROR]');
        expect(error).toHaveBeenCalled();
    });

    it('SER-20: autoFitColumn measures sticky end rows through their formatter', () => {
        const { table } = mountTable({
            columns: [{ name: 'a', width: 50 }],
            cellFormatter: boxFormatter,
            stickyEndRowFormatter: () => boxFormatter(400),
            stickyEndRows: [{ a: 10 }],
        });
        table.setRows([{ a: 100 }]);

        table.autoFitColumn('a');
        expect(table.getColumnWidth('a') as number).toBeGreaterThanOrEqual(400);
    });

    it('SER-21: refreshStickyEndRow re-creates only that row', () => {
        const totalsRow = { a: 0 };
        const { table } = mountTable({
            columns: [{ name: 'a' }],
            stickyEndRows: [{ a: 'controls' }, totalsRow],
        });
        const [controlsEl, totalsEl] = stickyEndRows(table);
        const created = vi.fn(), destroyed = vi.fn();
        table.on('stickyendrowcreate', created).on('stickyendrowdestroy', destroyed);

        table.getStickyEndRows()[1].a = 42;
        table.refreshStickyEndRow(1);

        const [newControlsEl, newTotalsEl] = stickyEndRows(table);
        expect(newControlsEl).toBe(controlsEl);
        expect(newTotalsEl).not.toBe(totalsEl);
        expect(newTotalsEl.textContent).toBe('42');
        expect(newTotalsEl.classList.contains('dgtable-row-alt')).toBe(true);
        expect(destroyed.mock.calls).toEqual([[totalsEl]]);
        expect(created.mock.calls[0][0]).toMatchObject({ stickyRowIndex: 1, rowEl: newTotalsEl });

        newTotalsEl.click();
        table.refreshStickyEndRow(5);
        expect(stickyEndRows(table)).toHaveLength(2);
    });

    it('SER-25: fixed mode follows changes of the rows\' height and of the table height', async () => {
        const { table } = mountTable({
            columns: [{ name: 'a' }],
            stickyEndRows: [{ a: 1 }],
            stickyEndRowsMode: 'fixed',
        });
        table.setRows(makeRows(1, i => ({ a: i })));

        const atBottom = () => Math.abs(stickyEndRowsContainer(table)!.getBoundingClientRect().bottom - viewportBottom(table)) <= 1;
        expect(atBottom()).toBe(true);

        // Synchronously, when the rows change
        table.setStickyEndRows([{ a: 1 }, { a: 2 }]);
        expect(atBottom()).toBe(true);

        // Through the ResizeObserver, when something else changes their height
        stickyEndRows(table)[0].style.height = '45px';
        await nextFrame();
        await nextFrame();
        expect(atBottom()).toBe(true);
        expect(scrollContainer(table).scrollHeight - scrollContainer(table).clientHeight).toBeLessThanOrEqual(1);

        table.el.style.height = '320px';
        table.tableHeightChanged();
        expect(atBottom()).toBe(true);

        table.setStickyEndRows([]);
        expect(table.el.querySelector<HTMLElement>('.dgtable-body')!.style.minHeight).toBe('1px');
    });

    it('SER-26: fixed mode without a table height lays out like sticky mode', () => {
        const { table } = mountTable({
            columns: [{ name: 'a' }],
            height: undefined,
            virtualTable: false,
            stickyEndRows: [{ a: 1 }],
            stickyEndRowsMode: 'fixed',
        });
        table.setRows(makeRows(2, i => ({ a: i })));

        expect(table.el.querySelector<HTMLElement>('.dgtable-body')!.style.minHeight).toBe('1px');
        expect(stickyEndRows(table)).toHaveLength(1);
    });

    it('SER-27: an invalid mode falls back to sticky', () => {
        const { table } = mountTable({ columns: [{ name: 'a' }], stickyEndRowsMode: 'bottom' as never });
        expect(table.getStickyEndRowsMode()).toBe('sticky');

        table.setStickyEndRowsMode('fixed');
        table.setStickyEndRowsMode('nope' as never);
        expect(table.getStickyEndRowsMode()).toBe('sticky');
    });

    it('SER-30: fixed mode settles: no endless ResizeObserver notifications', async () => {
        const errors: string[] = [];
        const onError = (event: ErrorEvent) => errors.push(event.message);
        window.addEventListener('error', onError);

        try {
            const { table } = mountTable({
                columns: [{ name: 'a' }],
                stickyEndRows: [{ a: 1 }],
                stickyEndRowsMode: 'fixed',
            });
            table.setRows(makeRows(2, i => ({ a: i })));

            const body = table.el.querySelector<HTMLElement>('.dgtable-body')!;
            for (let i = 0; i < 3; i++)
                await nextFrame();

            let styleWrites = 0;
            const watcher = new MutationObserver(records => styleWrites += records.length);
            watcher.observe(body, { attributes: true, attributeFilter: ['style'] });

            for (let i = 0; i < 10; i++)
                await nextFrame();

            watcher.disconnect();
            expect(styleWrites).toBe(0);
            expect(errors.filter(message => /ResizeObserver/.test(message))).toEqual([]);
        } finally {
            window.removeEventListener('error', onError);
        }
    });

    it('SER-31: fixed mode measures the rows in CSS pixels under a transform', () => {
        const { table, host } = mountTable({
            columns: [{ name: 'a' }],
            stickyEndRows: [{ a: 1 }, { a: 2 }],
            stickyEndRowsMode: 'fixed',
        });
        host.style.transform = 'scale(0.5)';
        table.setStickyEndRows([{ a: 1 }, { a: 2 }]);
        table.setRows(makeRows(1, i => ({ a: i })));

        const scroller = scrollContainer(table);
        expect(scroller.scrollHeight - scroller.clientHeight).toBeLessThanOrEqual(1);
    });

    it('SER-32: a new cell formatter reaches the sticky end rows that fall back to it', () => {
        const { table } = mountTable({ columns: [{ name: 'a' }], stickyEndRows: [{ a: 1 }] });
        table.setRows([{ a: 2 }]);

        table.setCellFormatter(value => 'new:' + String(value));
        table.clearAndRender();
        expect(stickyEndCell(table, 0, 'a').textContent).toBe('new:1');

        // With their own formatter, a cell formatter change leaves them alone
        table.setStickyEndRowFormatter(value => 'own:' + String(value));
        const rowEl = stickyEndRows(table)[0];
        table.setCellFormatter(value => 'newer:' + String(value));
        table.clearAndRender();
        expect(stickyEndRows(table)[0]).toBe(rowEl);
        expect(stickyEndCell(table, 0, 'a').textContent).toBe('own:1');
    });

    it('SER-33: setColumns with the same names applies the new definitions to the sticky end rows', () => {
        const { table } = mountTable({
            columns: [{ name: 'a', dataPath: 'x' }],
            stickyEndRows: [{ x: 'X', y: 'Y' }],
        });

        table.setColumns([{ name: 'a', dataPath: 'y', cellClasses: 'foo' }]);
        expect(stickyEndCell(table, 0, 'a').textContent).toBe('Y');
        expect(stickyEndCell(table, 0, 'a').classList.contains('foo')).toBe(true);
    });

    it('SER-34: refreshing a sticky end row that makes the body scroll keeps the columns aligned', context => {
        let tall = false;
        const { table } = mountTable({
            columns: [{ name: 'a', width: 100 }, { name: 'b' }],
            stickyEndRows: [{ a: 1, b: 1 }],
            stickyEndRowFormatter: value => tall ? '<div style="height:150px">' + String(value) + '</div>' : String(value),
        });
        table.setRows(makeRows(2, i => ({ a: i, b: i })));
        expect(scrollbarWidth(table)).toBe(0);

        tall = true;
        stickyEndRows(table)[0].style.height = 'auto';
        table.on('stickyendrowcreate', ({ rowEl }) => rowEl.style.height = 'auto');
        table.refreshStickyEndRow(0);

        context.skip(scrollbarWidth(table) === 0, 'the engine uses overlay scrollbars');

        // The columns must have made room for the scrollbar that appeared, instead of overflowing behind it
        const scroller = scrollContainer(table);
        expect(scroller.scrollWidth - scroller.clientWidth).toBeLessThanOrEqual(1);
        expectColumnsAligned(table);
        expectStickyEndRowsAligned(table);
    });

    it('SER-35: sticky end row cells with controls get no preview, but still report the overflow', () => {
        const { table } = mountTable({
            columns: [{ name: 'a', width: 60 }, { name: 'b' }],
            stickyEndRows: [{ a: 1, b: 2 }],
            stickyEndRowFormatter: (value, column) => column === 'a' ? '<input style="width:300px">' : String(value),
        });
        const overflow = vi.fn();
        table.on('cellhoveroverflow', overflow);

        hover(stickyEndCell(table, 0, 'a'));

        expect(overflow).toHaveBeenCalledTimes(1);
        expect(previewCell(table)).toBeNull();
    });

    it('SER-15: a table without sticky end rows has no container', () => {
        const { table } = mountTable({ columns: [{ name: 'a' }] });
        table.setRows(makeRows(3));
        expect(stickyEndRowsContainer(table)).toBeNull();
        expect(table.getStickyEndRows()).toEqual([]);
        expect(table.getStickyEndRowElement(0)).toBeNull();
    });

    it('SER-16: a stylesheet z-index wins over the default one', () => {
        const style = document.createElement('style');
        style.textContent = '.dgtable-sticky-end-rows { z-index: 7; }';
        document.head.appendChild(style);

        try {
            const { table } = mountTable({ columns: [{ name: 'a' }], stickyEndRows: [{ a: 1 }] });
            expect(stickyEndRowsContainer(table)!.style.zIndex).toBe('');
            expect(getComputedStyle(stickyEndRowsContainer(table)!).zIndex).toBe('7');
        } finally {
            style.remove();
        }

        const { table } = mountTable({ columns: [{ name: 'a' }], stickyEndRows: [{ a: 1 }] });
        expect(stickyEndRowsContainer(table)!.style.zIndex).toBe('1');
    });
});
