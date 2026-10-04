import { describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import type { CellPreviewEvent, RowClickEvent } from '../../src/index';
import { layouts, mountLayout, mountTable } from '../helpers/table';
import { bodyCell, clickHeader, headerCell, isRtl, previewCell, renderedRows } from '../helpers/dom';
import { dragColumn, hover, mouse, unhover, wheel } from '../helpers/pointer';

const longText = 'a value that is much longer than the column is wide';
const columns = [{ name: 'a', width: 60 }, { name: 'b', width: 200 }];

function mountWithRows(options = {}) {
    const { table } = mountTable({ columns, ...options });
    table.setRows([{ a: longText, b: 'short' }, { a: 'x', b: longText }]);
    return table;
}

describe.each(layouts)('cell preview geometry ($dir, $boxSizing, virtual=$virtualTable)', layout => {
    it('PRV-01: shows a preview over an overflowing cell', () => {
        const { table } = mountLayout(layout, { columns, cellClasses: 'extra' });
        table.setRows([{ a: longText, b: 'short' }]);
        const cell = bodyCell(table, 0, 'a');

        hover(cell);
        const preview = previewCell(table)!;
        expect(preview).not.toBeNull();
        expect(preview.classList.contains('extra')).toBe(true);
        expect(preview.firstElementChild!.innerHTML).toBe(cell.firstElementChild!.innerHTML);
        expect(preview.style.zIndex).toBe('9999');

        const p = preview.getBoundingClientRect();
        const c = cell.getBoundingClientRect();
        expect(Math.abs(p.top - c.top)).toBeLessThanOrEqual(1);
        if (isRtl(table))
            expect(Math.abs(p.right - c.right)).toBeLessThanOrEqual(1);
        else
            expect(Math.abs(p.left - c.left)).toBeLessThanOrEqual(1);
        expect(preview.firstElementChild!.scrollWidth).toBeLessThanOrEqual(preview.firstElementChild!.clientWidth + 1);
    });

    it('PRV-10: keeps the preview inside the table', () => {
        const { table } = mountLayout(layout, { columns: [{ name: 'a', width: 300 }, { name: 'b', width: 100 }] });
        table.setRows([{ a: 'x', b: longText }]);

        hover(bodyCell(table, 0, 'b'));
        const preview = previewCell(table)!.getBoundingClientRect();
        const wrapper = table.el.getBoundingClientRect();
        expect(preview.width).toBeLessThan(wrapper.width);
        expect(preview.left).toBeGreaterThanOrEqual(wrapper.left - 1);
        expect(preview.right).toBeLessThanOrEqual(wrapper.right + 1);
    });

    it('PRV-10 (D34): aligns a preview wider than the table with the table start edge', () => {
        const { table } = mountLayout(layout, { columns: [{ name: 'a', width: 300 }, { name: 'b', width: 100 }] });
        table.setRows([{ a: 'x', b: longText + ' ' + longText + ' ' + longText }]);

        hover(bodyCell(table, 0, 'b'));
        const preview = previewCell(table)!.getBoundingClientRect();
        const wrapper = table.el.getBoundingClientRect();
        expect(preview.width).toBeGreaterThan(wrapper.width);
        if (isRtl(table))
            expect(Math.abs(preview.right - (wrapper.right - 1))).toBeLessThanOrEqual(1);
        else
            expect(Math.abs(preview.left - (wrapper.left + 1))).toBeLessThanOrEqual(1);
    });
});

describe('cell preview behaviour', () => {
    it('PRV-02: does nothing for cells that fit', () => {
        const table = mountWithRows();
        const events = vi.fn();
        table.on('cellhoveroverflow', events);
        hover(bodyCell(table, 0, 'b'));
        expect(previewCell(table)).toBeNull();
        expect(events).not.toHaveBeenCalled();
    });

    it('PRV-03: allowPreview false emits cellhoveroverflow only', () => {
        const table = mountWithRows({ columns: [{ name: 'a', width: 60, allowPreview: false }, { name: 'b', width: 200 }] });
        const overflow = vi.fn();
        const preview = vi.fn();
        table.on('cellhoveroverflow', overflow);
        table.on('cellpreview', preview);

        hover(bodyCell(table, 0, 'a'));
        expect(overflow).toHaveBeenCalledTimes(1);
        expect(preview).not.toHaveBeenCalled();
        expect(previewCell(table)).toBeNull();
    });

    it('PRV-04: emits overflow, preview and destroy events in order with payloads', () => {
        const table = mountWithRows();
        const events: [string, Record<string, unknown>][] = [];
        for (const name of ['cellhoveroverflow', 'cellpreview', 'cellpreviewdestroy'] as const)
            table.on(name, (event: unknown) => events.push([name, event as Record<string, unknown>]));

        const cell = bodyCell(table, 0, 'a');
        hover(cell);
        unhover(cell);
        expect(events.map(e => e[0])).toEqual(['cellhoveroverflow', 'cellpreview', 'cellpreviewdestroy']);
        expect(events[1][1]).toMatchObject({ name: 'a', rowIndex: 0, rowData: { a: longText, b: 'short' }, cell, cellEl: cell.firstElementChild });

        events.length = 0;
        const { table: headerTable } = mountTable({ columns: [{ name: 'a', width: 40, label: 'a long header label' }, { name: 'b' }] });
        headerTable.on('cellpreview', (event: CellPreviewEvent) => events.push(['cellpreview', event as never]));
        hover(headerCell(headerTable, 'a'));
        expect(events[0][1]).toMatchObject({ name: 'a', rowIndex: null, rowData: null });
    });

    it('PRV-05: hideCellPreview inside the cellpreview handler aborts the preview', () => {
        const table = mountWithRows();
        table.on('cellpreview', () => table.hideCellPreview());
        hover(bodyCell(table, 0, 'a'));
        expect(previewCell(table)).toBeNull();
    });

    it('PRV-06: survives moving between the cell and its preview, and hides on leaving', () => {
        const table = mountWithRows();
        const cell = bodyCell(table, 0, 'a');
        hover(cell);
        const preview = previewCell(table)!;

        unhover(cell, preview);
        expect(previewCell(table)).toBe(preview);
        unhover(preview, cell);
        expect(previewCell(table)).toBe(preview);
        unhover(preview, document.body);
        expect(previewCell(table)).toBeNull();
    });

    it('PRV-07: wheel scrolling hides the preview and suppresses new ones briefly', () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        const table = mountWithRows();
        const cell = bodyCell(table, 0, 'a');

        hover(cell);
        wheel(table.el);
        expect(previewCell(table)).toBeNull();

        hover(cell);
        expect(previewCell(table)).toBeNull();

        vi.advanceTimersByTime(150);
        hover(cell);
        expect(previewCell(table)).not.toBeNull();
    });

    it('PRV-07: wheel inside a scrollable element in the preview keeps it', () => {
        const table = mountWithRows({
            cellFormatter: (value: unknown, column: string) => column === 'a'
                ? `<div class="scroller" style="height:10px;overflow:auto;display:inline-block;width:500px"><div style="height:100px">${value}</div></div>`
                : String(value),
        });
        hover(bodyCell(table, 0, 'a'));
        const scroller = previewCell(table)!.querySelector('.scroller')!;
        wheel(scroller);
        expect(previewCell(table)).not.toBeNull();
    });

    it('PRV-08: clicking the preview emits rowclick for the row', () => {
        const table = mountWithRows();
        const clicks: RowClickEvent[] = [];
        table.on('rowclick', event => clicks.push(event));

        hover(bodyCell(table, 0, 'a'));
        previewCell(table)!.click();
        expect(clicks).toHaveLength(1);
        expect(clicks[0]).toMatchObject({ rowIndex: 0, filteredRowIndex: 0, rowEl: renderedRows(table)[0] });
    });

    it('PRV-09: header previews sort on click, drag, and open the context menu', () => {
        const { table } = mountTable({ columns: [{ name: 'a', width: 40, label: 'a long header label' }, { name: 'b' }, { name: 'c' }] });
        table.setRows([{ a: 2, b: 1, c: 1 }, { a: 1, b: 2, c: 2 }]);
        const menu = vi.fn();
        table.on('headercontextmenu', menu);

        hover(headerCell(table, 'a'));
        const preview = previewCell(table)!;
        expect(preview.classList.contains('header')).toBe(true);
        expect(preview.draggable).toBe(true);
        const rect = preview.getBoundingClientRect();

        preview.firstElementChild!.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: rect.left + 20 }));
        expect(table.getSortedColumns()).toEqual([{ column: 'a', descending: false }]);

        mouse('mouseup', preview.firstElementChild!, rect.left + 20, rect.top + 5, 2);
        expect(menu.mock.calls[0][0].columnName).toBe('a');
    });

    it('PRV-11: copies an opaque cell background, falls back to the row and then to white', () => {
        const table = mountWithRows();
        hover(bodyCell(table, 0, 'a'));
        expect(previewCell(table)!.style.backgroundColor).toBe('rgb(255, 255, 255)');
        table.hideCellPreview();

        bodyCell(table, 0, 'a').style.backgroundColor = 'rgb(1, 2, 3)';
        hover(bodyCell(table, 0, 'a'));
        expect(previewCell(table)!.style.backgroundColor).toBe('rgb(1, 2, 3)');
    });

    it('PRV-12 (D7): cellPreviewAutoBackground false leaves the background alone', () => {
        const table = mountWithRows({ cellPreviewAutoBackground: false });
        bodyCell(table, 0, 'a').style.backgroundColor = 'rgb(1, 2, 3)';
        hover(bodyCell(table, 0, 'a'));
        expect(previewCell(table)!.style.backgroundColor).toBe('');
    });

    it('PRV-12 (D7): allowCellPreview false disables body previews but keeps cellhoveroverflow', () => {
        const table = mountWithRows({ allowCellPreview: false });
        const overflow = vi.fn();
        table.on('cellhoveroverflow', overflow);
        hover(bodyCell(table, 0, 'a'));
        expect(previewCell(table)).toBeNull();
        expect(overflow).toHaveBeenCalledTimes(1);
    });

    it('PRV-12 (D7): allowHeaderCellPreview false disables header previews only', () => {
        const { table } = mountTable({ columns: [{ name: 'a', width: 40, label: 'a long header label' }, { name: 'b' }], allowHeaderCellPreview: false });
        table.setRows([{ a: longText, b: 1 }]);

        hover(headerCell(table, 'a'));
        expect(previewCell(table)).toBeNull();
        hover(bodyCell(table, 0, 'a'));
        expect(previewCell(table)).not.toBeNull();
    });

    it('PRV-13: preserves a text selection inside the cell', () => {
        const table = mountWithRows();
        const cell = bodyCell(table, 0, 'a');
        const range = document.createRange();
        range.setStart(cell.firstElementChild!.firstChild!, 2);
        range.setEnd(cell.firstElementChild!.firstChild!, 7);
        getSelection()!.removeAllRanges();
        getSelection()!.addRange(range);

        hover(cell);
        expect(getSelection()!.toString()).toBe(longText.slice(2, 7));
        unhover(cell);
        expect(getSelection()!.toString()).toBe(longText.slice(2, 7));
        getSelection()!.removeAllRanges();
    });

    it('PRV-15: real pointer hover shows and hides the preview', async () => {
        const table = mountWithRows();
        const outside = document.createElement('div');
        outside.style.cssText = 'width:50px;height:50px;margin-top:20px';
        document.body.appendChild(outside);

        try {
            // `force`: once shown, the preview covers the cell, which Playwright reports as an intercepting element.
            await userEvent.hover(bodyCell(table, 0, 'a'), { force: true });
            expect(previewCell(table)).not.toBeNull();

            await userEvent.hover(outside, { force: true });
            expect(previewCell(table)).toBeNull();
        } finally {
            outside.remove();
        }
    });

    it('DND: header preview can be dragged', () => {
        const { table } = mountTable({ columns: [{ name: 'a', width: 40, label: 'a long header label' }, { name: 'b' }, { name: 'c' }] });
        hover(headerCell(table, 'a'));
        expect(previewCell(table)).not.toBeNull();
        dragColumn(table, 'a', 'c');
        expect(table.getColumnConfig('a')!.order).toBe(2);
        clickHeader(table, 'b');
    });
});
