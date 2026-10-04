import { describe, expect, it, vi } from 'vitest';
import type { AddRowsEvent, RowClickEvent } from '../../src/index';
import { layouts, makeRows, mountLayout, mountTable } from '../helpers/table';
import { renderedRows, rowTexts, scrollVertically } from '../helpers/dom';
import { checkInvariants } from '../helpers/invariants';

const columns = [{ name: 'id', width: 80 }, { name: 'name', width: 150 }];

function ids(count: number, start = 0) {
    return Array.from({ length: count }, (_, i) => String(start + i));
}

describe.each(layouts.filter(l => l.dir === 'ltr' && l.boxSizing === 'content-box'))('rows (virtual=$virtualTable)', layout => {
    it('ROW-01: setRows renders rows and emits addrows with clear', () => {
        const { table } = mountLayout(layout, { columns });
        const added: AddRowsEvent[] = [];
        table.on('addrows', event => added.push(event));

        table.setRows(makeRows(5));
        expect(rowTexts(table, 'id')).toEqual(ids(5));
        expect(added).toEqual([{ count: 5, clear: true }]);
        checkInvariants(table);

        table.setRows([]);
        expect(renderedRows(table)).toHaveLength(0);
        expect(table.getRowCount()).toBe(0);
    });

    it('ROW-02: addRows inserts single rows and arrays at positions', () => {
        const { table } = mountLayout(layout, { columns });
        const added: AddRowsEvent[] = [];
        table.setRows(makeRows(3));
        table.on('addrows', event => added.push(event));

        table.addRows({ id: 'a', name: 'x' });
        table.addRows([{ id: 'b', name: 'x' }, { id: 'c', name: 'x' }], 0);
        table.addRows({ id: 'd', name: 'x' }, 2);
        table.addRows({ id: 'e', name: 'x' }, -1);
        table.addRows({ id: 'f', name: 'x' }, 1000);
        expect(rowTexts(table, 'id')).toEqual(['b', 'c', 'd', '0', '1', '2', 'a', 'e', 'f']);
        expect(added[1]).toEqual({ count: 2, clear: false });
        checkInvariants(table);
    });

    it('ROW-03 (D3): rows added with render=false appear after render()', () => {
        const { table } = mountLayout(layout, { columns });
        table.setRows(makeRows(3));

        table.addRows(makeRows(2, i => ({ id: 'new' + i, name: 'x' })), -1, false, false);
        table.addRows({ id: 'first', name: 'x' }, 0, false, false);
        table.render();
        expect(rowTexts(table, 'id')).toEqual(['first', '0', '1', '2', 'new0', 'new1']);
        checkInvariants(table);
    });

    it('ROW-04: adding rows until a scrollbar appears keeps columns aligned', () => {
        const { table } = mountLayout(layout, { columns });
        table.setRows(makeRows(2));
        table.addRows(makeRows(30, i => ({ id: 'x' + i, name: 'y' })));
        checkInvariants(table);
    });

    it('ROW-05: removeRows handles bounds and counts', () => {
        const { table } = mountLayout(layout, { columns });
        table.setRows(makeRows(6));

        table.removeRows(-1, 1);
        table.removeRows(6, 1);
        table.removeRows(0, 0);
        expect(rowTexts(table, 'id')).toEqual(ids(6));

        table.removeRows(1, 2);
        expect(rowTexts(table, 'id')).toEqual(['0', '3', '4', '5']);
        table.removeRow(0);
        expect(rowTexts(table, 'id')).toEqual(['3', '4', '5']);
        table.removeRows(1, 100);
        expect(rowTexts(table, 'id')).toEqual(['3']);
        expect(table.getRowCount()).toBe(1);
        checkInvariants(table);
    });

    it('ROW-05 (D3): rows removed with render=false disappear after render()', () => {
        const { table } = mountLayout(layout, { columns });
        table.setRows(makeRows(6));

        table.removeRows(0, 2, false);
        table.removeRow(0, false);
        table.render();
        expect(rowTexts(table, 'id')).toEqual(['3', '4', '5']);
        checkInvariants(table);
    });

    it('ROW-06: refreshRow re-renders the changed row, not the whole table', () => {
        const { table } = mountLayout(layout, { columns });
        const rows = makeRows(50);
        table.setRows(rows);
        const created: number[] = [];
        table.on('rowcreate', event => created.push(event.rowIndex));

        rows[2].name = 'changed';
        table.refreshRow(2);
        expect(rowTexts(table, 'name')[2]).toBe('changed');
        expect(created).toContain(2);
        expect(created.length).toBeLessThan(renderedRows(table).length);

        created.length = 0;
        table.refreshRow(-1);
        table.refreshRow(99);
        expect(created).toEqual([]);
        checkInvariants(table);
    });

    it('ROW-02: rows inserted or removed in the middle keep indices and alternation correct', () => {
        const { table } = mountLayout(layout, { columns });
        const rows = makeRows(4);
        table.setRows(rows);
        const clicks: RowClickEvent[] = [];
        table.on('rowclick', event => clicks.push(event));

        table.addRows({ id: 'x', name: 'x' }, 1);
        expect(renderedRows(table).map(r => r.classList.contains('dgtable-row-alt'))).toEqual([false, true, false, true, false]);
        renderedRows(table)[3].click();
        expect(clicks[0].rowIndex).toBe(3);
        expect(clicks[0].rowData).toBe(rows[2]);
        checkInvariants(table);

        table.removeRow(0);
        expect(renderedRows(table).map(r => r.classList.contains('dgtable-row-alt'))).toEqual([false, true, false, true]);
        renderedRows(table)[0].click();
        expect(clicks[1].rowData).toEqual({ id: 'x', name: 'x' });
        expect(clicks[1].rowIndex).toBe(0);
        checkInvariants(table);
    });

    it('ROW-07: refreshAllVirtualRows re-renders with a new formatter', () => {
        const { table } = mountLayout(layout, { columns });
        table.setRows(makeRows(3));
        table.setCellFormatter(value => '[' + value + ']');
        table.refreshAllVirtualRows();
        expect(rowTexts(table, 'id')).toEqual(['[0]', '[1]', '[2]']);
    });

    it('ROW-09 (D5): getRowYPos returns row positions, including 0 for the first row', () => {
        const { table } = mountLayout(layout, { columns });
        table.setRows(makeRows(10));

        expect(table.getRowYPos(0)).toBe(0);
        const rowHeight = renderedRows(table)[1].getBoundingClientRect().top - renderedRows(table)[0].getBoundingClientRect().top;
        expect(table.getRowYPos(3)).toBe(3 * rowHeight);
        expect(table.getRowYPos(99)).toBeNull();

        table.filter({ column: 'id', keyword: '5' });
        expect(table.getRowYPos(5)).toBe(0);
        expect(table.getRowYPos(4)).toBeNull();
    });
});

describe('rows', () => {
    it('ROW-01 (pin): setRows(null) throws', () => {
        const { table } = mountTable({ columns });
        // DECIDE: treat null as [] ?
        expect(() => table.setRows(null as never)).toThrow(TypeError);
    });

    it('ROW-01: setRows(data, true) re-sorts', () => {
        const { table } = mountTable({ columns });
        table.sort('id', true);
        table.setRows(makeRows(3), true);
        expect(rowTexts(table, 'id')).toEqual(['2', '1', '0']);
    });

    it('ROW-02: addRows(data, true) is the resort overload', () => {
        const { table } = mountTable({ columns });
        table.setRows(makeRows(3));
        table.sort('id', true);
        table.addRows([{ id: 5, name: 'x' }], true);
        expect(rowTexts(table, 'id')).toEqual(['5', '2', '1', '0']);
    });

    it('ROW-08: getRowElement returns rendered rows only', () => {
        const { table } = mountTable({ columns });
        table.setRows(makeRows(500));

        expect(table.getRowElement(0)).toBe(renderedRows(table)[0]);
        expect((table.getRowElement(0) as HTMLElement & { index: number }).index).toBe(0);
        expect(table.getRowElement(400)).toBeNull();
        expect(table.getRowElement(-1)).toBeNull();

        scrollVertically(table, 400 * 29);
        table.render();
        expect(table.getRowElement(400)).not.toBeNull();
    });

    it('ROW-10: data accessors handle bounds and unknown columns', () => {
        const { table } = mountTable({ columns });
        const rows = makeRows(3);
        table.setRows(rows);

        expect(table.getDataForRow(1)).toBe(rows[1]);
        expect(table.getDataForRow(3)).toBeNull();
        expect(table.getDataForRow(-1)).toBeNull();
        expect(table.getIndexForRow(rows[2])).toBe(2);
        expect(table.getIndexForRow({})).toBe(-1);
        expect(table.getHtmlForRowCell(1, 'name')).toBe('name-1');
        expect(table.getHtmlForRowCell(5, 'name')).toBeNull();
        expect(table.getHtmlForRowCell(1, 'unknown')).toBeNull();
        expect(table.getHtmlForRowDataCell({ name: 'x' }, 'name')).toBe('x');
        expect(table.getHtmlForRowDataCell({ name: 'x' }, 'unknown')).toBeNull();
    });

    it('ROW-11: rowclick passes the caller\'s row object', () => {
        const { table } = mountTable({ columns });
        const rows = makeRows(3);
        table.setRows(rows);
        const clicks: RowClickEvent[] = [];
        table.on('rowclick', event => clicks.push(event));

        renderedRows(table)[1].click();
        expect(clicks[0].rowData).toBe(rows[1]);
        expect(clicks[0].rowIndex).toBe(1);
        expect(clicks[0].filteredRowIndex).toBe(1);
        expect(clicks[0].rowEl).toBe(renderedRows(table)[1]);
        expect(clicks[0].event).toBeInstanceOf(MouseEvent);
    });

    it('ROW-11 (pin): filtering stamps a symbol property onto caller row objects', () => {
        const { table } = mountTable({ columns });
        const rows = makeRows(3);
        table.setRows(rows);
        table.filter({ column: 'name', keyword: '1' });
        // DECIDE: acceptable, or keep a side index instead?
        expect(Object.getOwnPropertySymbols(rows[1])).toHaveLength(1);
        expect(Object.keys(rows[1])).toEqual(['id', 'name', 'value']);
    });
});
