import { describe, expect, it, vi } from 'vitest';
import type { DGTableEventMap } from '../../src/index';
import { mountTable } from '../helpers/table';
import { bodyCell, clickHeader, headerCell, renderedRows } from '../helpers/dom';
import { dragColumn, hover, mouse, resizeEdgeX, unhover } from '../helpers/pointer';

describe('events API', () => {
    it('EVT-01: delivers custom events and chains', () => {
        const { table } = mountTable({});
        const handler = vi.fn();

        expect(table.on('custom', handler)).toBe(table);
        expect(table.emit('custom', { a: 1 })).toBe(table);
        expect(handler).toHaveBeenCalledWith({ a: 1 });
    });

    it('EVT-02: once fires a single time', () => {
        const { table } = mountTable({});
        const handler = vi.fn();
        table.once('x', handler);
        table.emit('x', 1).emit('x', 2);
        expect(handler.mock.calls).toEqual([[1]]);
    });

    it('EVT-03: off removes one handler, all handlers of an event, or everything', () => {
        const { table } = mountTable({});
        const a = vi.fn(), b = vi.fn(), c = vi.fn();
        table.on('x', a).on('x', b).on('y', c);

        table.off('x', a);
        table.emit('x').emit('y');
        expect([a.mock.calls.length, b.mock.calls.length, c.mock.calls.length]).toEqual([0, 1, 1]);

        table.off('x');
        table.emit('x').emit('y');
        expect([b.mock.calls.length, c.mock.calls.length]).toEqual([1, 2]);

        table.off();
        table.emit('y');
        expect(c).toHaveBeenCalledTimes(2);
    });

    it('EVT-04 (D18): off(event, handler) removes a handler registered with once', () => {
        const { table } = mountTable({});
        const handler = vi.fn();
        table.once('x', handler);
        table.off('x', handler);
        table.emit('x');
        expect(handler).not.toHaveBeenCalled();
    });

    it('EVT-05 (pin): an exception in a rowcreate handler propagates out of render', () => {
        const { table } = mountTable({ columns: [{ name: 'a' }] });
        table.on('rowcreate', () => {
            throw new Error('handler failed');
        });
        // DECIDE: isolate user handler exceptions from rendering?
        expect(() => table.setRows([{ a: 1 }])).toThrow('handler failed');
    });

    it('EVT-06: every built-in event fires with its documented payload', () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });

        const { table } = mountTable({
            columns: [{ name: 'a', width: 60 }, { name: 'b', width: 100 }, { name: 'c', width: 100 }],
            maxColumnsSortCount: 2,
        });
        const seen = new Map<string, unknown>();
        const names: (keyof DGTableEventMap)[] = [
            'render', 'renderskeleton', 'rowcreate', 'rowclick', 'rowdestroy', 'cellpreview', 'cellpreviewdestroy',
            'cellhoveroverflow', 'headerrowcreate', 'headercontextmenu', 'addcolumn', 'removecolumn', 'movecolumn',
            'showcolumn', 'hidecolumn', 'columnwidth', 'columnresizeareadoubleclick', 'addrows', 'sort', 'filter', 'filterclear',
        ];
        for (const name of names) {
            table.on(name, (value: unknown) => {
                if (!seen.has(name))
                    seen.set(name, value);
            });
        }

        table.setRows([{ a: 'a long value that overflows', b: 1, c: 1 }, { a: 'x', b: 2, c: 2 }]);
        renderedRows(table)[0].click();
        hover(bodyCell(table, 0, 'a'));
        unhover(bodyCell(table, 0, 'a'));
        mouse('mouseup', headerCell(table, 'b'), 10, 10, 2);
        table.addColumn({ name: 'd' });
        table.removeColumn('d');
        table.moveColumn('a', 'b');
        table.setColumnVisible('c', false);
        table.setColumnVisible('c', true);
        table.setColumnWidth('b', 120);
        clickHeader(table, 'b');
        table.filter({ column: 'a', keyword: 'x' });
        table.clearFilter();
        table.setRows([]);

        const x = resizeEdgeX(table, 'b');
        mouse('mousedown', headerCell(table, 'b'), x);
        mouse('mouseup', document, x);
        mouse('mousedown', headerCell(table, 'b'), x);
        mouse('mouseup', document, x);

        expect([...seen.keys()].sort()).toEqual([...names].sort());
        expect(Object.keys(seen.get('rowcreate') as object).sort()).toEqual(['filteredRowIndex', 'rowData', 'rowEl', 'rowIndex']);
        expect(Object.keys(seen.get('rowclick') as object).sort()).toEqual(['event', 'filteredRowIndex', 'rowData', 'rowEl', 'rowIndex']);
        expect(seen.get('rowdestroy')).toBeInstanceOf(HTMLElement);
        expect(Object.keys(seen.get('cellpreview') as object).sort()).toEqual(['cell', 'cellEl', 'el', 'name', 'rowData', 'rowIndex']);
        expect(Object.keys(seen.get('cellpreviewdestroy') as object).sort()).toEqual(['cell', 'cellEl', 'el', 'name', 'rowData', 'rowIndex']);
        expect(Object.keys(seen.get('cellhoveroverflow') as object).sort()).toEqual(['cell', 'cellEl', 'name', 'rowData', 'rowIndex']);
        expect(seen.get('headerrowcreate')).toBeInstanceOf(HTMLElement);
        expect(Object.keys(seen.get('headercontextmenu') as object).sort()).toEqual(['bounds', 'columnName', 'pageX', 'pageY']);
        expect(Object.keys((seen.get('headercontextmenu') as { bounds: object }).bounds).sort()).toEqual(['height', 'left', 'top', 'width']);
        expect(seen.get('addcolumn')).toBe('d');
        expect(seen.get('removecolumn')).toBe('d');
        expect(seen.get('movecolumn')).toEqual({ name: 'a', src: 0, dest: 1 });
        expect(seen.get('hidecolumn')).toBe('c');
        expect(seen.get('showcolumn')).toBe('c');
        expect(seen.get('columnwidth')).toEqual({ name: 'b', width: 120, oldWidth: 100 });
        expect(Object.keys(seen.get('columnresizeareadoubleclick') as object).sort()).toEqual(['columnName', 'event', 'name']);
        expect(seen.get('addrows')).toEqual({ count: 2, clear: true });
        expect(seen.get('sort')).toEqual({ sorts: [{ column: 'b', descending: false }] });
        expect(seen.get('filter')).toEqual({ column: 'a', keyword: 'x' });
        expect(seen.get('filterclear')).toEqual({});
        expect(seen.get('render')).toBeUndefined();
    });

    it('EVT-07: event methods are no-ops after destroy', () => {
        const { table } = mountTable({});
        table.destroy();
        expect(table.on('x', () => {}).once('x', () => {}).emit('x').off('x')).toBe(table);
    });
});

describe('header interactions', () => {
    it('HDR-01: right mouse button opens the header context menu', () => {
        const { table } = mountTable({ columns: [{ name: 'a', width: 100 }, { name: 'b', width: 100 }] });
        const menu = vi.fn();
        table.on('headercontextmenu', menu);
        const cell = headerCell(table, 'b');
        const rect = cell.getBoundingClientRect();

        mouse('mouseup', cell.firstElementChild!, rect.left + 20, rect.top + 5, 2);
        expect(menu).toHaveBeenCalledTimes(1);
        const event = menu.mock.calls[0][0];
        expect(event.columnName).toBe('b');
        expect(event.pageX).toBe(rect.left + 20 + window.scrollX);
        expect(event.bounds.width).toBe(cell.offsetWidth);
        expect(event.bounds.height).toBe(cell.offsetHeight);

        mouse('mouseup', cell, rect.left + 20, rect.top + 5, 0);
        expect(menu).toHaveBeenCalledTimes(1);

        const contextmenu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
        cell.dispatchEvent(contextmenu);
        expect(contextmenu.defaultPrevented).toBe(true);
    });

    it('HDR-05: headerrowcreate fires on each skeleton render', () => {
        const { table } = mountTable({ columns: [{ name: 'a' }] }, { render: false });
        const created = vi.fn();
        table.on('headerrowcreate', created);
        table.render();
        table.clearAndRender();
        expect(created).toHaveBeenCalledTimes(2);
        expect(created.mock.calls[1][0]).toBe(table.getHeaderRowElement());
    });

    it('DND-07: dragging between two tables moves nothing', () => {
        const { table: a } = mountTable({ columns: [{ name: 'x' }, { name: 'y' }] });
        const { table: b } = mountTable({ columns: [{ name: 'x' }, { name: 'y' }] });
        const moved = vi.fn();
        a.on('movecolumn', moved);
        b.on('movecolumn', moved);

        dragColumn(a, 'x', 'y', b);
        expect(moved).not.toHaveBeenCalled();
    });
});
