import { describe, expect, it, vi } from 'vitest';
import type { ColumnResizeAreaDoubleClickEvent } from '../../src/index';
import { layouts, makeRows, mountLayout, mountTable } from '../helpers/table';
import { headerCell, isRtl, previewCell, resizeMarker } from '../helpers/dom';
import { hover, mouse, resizeBy, resizeEdgeX, touch } from '../helpers/pointer';
import { isResizePending } from '../helpers/internals';
import { checkInvariants } from '../helpers/invariants';

const columns = [{ name: 'a', width: 150 }, { name: 'b', width: 150 }, { name: 'c', width: 100 }];

function useFakeTime() {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
}

function mountResizable(options = {}) {
    const { table } = mountTable({ columns, ...options });
    table.setRows(makeRows(5, i => ({ a: 'a' + i, b: 'b' + i, c: 'c' + i })));
    return table;
}

describe('resize timing — legacy port', () => {
    it('RSZ-01/02/03: shows the marker only after the double-click window and removes it after the resize', () => {
        useFakeTime();
        const table = mountResizable();
        const x = resizeEdgeX(table, 'a');

        mouse('mousedown', headerCell(table, 'a'), x);
        expect(resizeMarker(table), 'marker must not appear immediately').toBeNull();

        vi.advanceTimersByTime(table.getResizeAreaDoubleClickDuration());
        expect(resizeMarker(table), 'marker must appear after the double-click window').not.toBeNull();

        mouse('mouseup', document, x);
        expect(resizeMarker(table), 'completed resize must remove the marker').toBeNull();
    });

    it('RSZ-04/05: ignores tiny jitter but starts immediately on real movement', () => {
        useFakeTime();
        const table = mountResizable();
        const x = resizeEdgeX(table, 'a');

        mouse('mousedown', headerCell(table, 'a'), x);
        mouse('mousemove', document, x + 2);
        expect(resizeMarker(table), 'minor pointer jitter must not start resizing').toBeNull();

        mouse('mousemove', document, x + 20);
        expect(resizeMarker(table), 'movement must start resizing immediately').not.toBeNull();
        mouse('mouseup', document, x + 20);
    });

    it('RSZ-06/07/08/09: quick click leaves nothing pending; a double click emits once and leaves no marker', () => {
        useFakeTime();
        const table = mountResizable();
        const x = resizeEdgeX(table, 'a');
        const doubleClicks = vi.fn();
        table.on('columnresizeareadoubleclick', doubleClicks);

        mouse('mousedown', headerCell(table, 'a'), x);
        mouse('mouseup', document, x);
        expect(resizeMarker(table), 'quick click must not create a marker').toBeNull();
        expect(isResizePending(table), 'quick release must cancel the pending resize').toBe(false);

        mouse('mousedown', headerCell(table, 'a'), x);
        mouse('mouseup', document, x);
        expect(resizeMarker(table), 'double click must not create a marker').toBeNull();
        expect(doubleClicks, 'double click must emit exactly once').toHaveBeenCalledTimes(1);
    });

    it('RSZ-02: real-timer smoke test', async () => {
        const table = mountResizable({ resizeAreaDoubleClickDuration: 50 });
        const x = resizeEdgeX(table, 'a');
        mouse('mousedown', headerCell(table, 'a'), x);
        await new Promise(resolve => setTimeout(resolve, 120));
        expect(resizeMarker(table)).not.toBeNull();
        mouse('mouseup', document, x);
        expect(resizeMarker(table)).toBeNull();
    });
});

describe.each(layouts)('column resize ($dir, $boxSizing, virtual=$virtualTable)', layout => {
    function mount(options = {}) {
        const { table } = mountLayout(layout, { columns, ...options });
        table.setRows(makeRows(5, i => ({ a: 'a' + i, b: 'b' + i, c: 'c' + i })));
        return table;
    }

    it('RSZ-10: resolves hotspots on both sides of a border, but not on the outer start edge', () => {
        const table = mount();
        const a = headerCell(table, 'a').getBoundingClientRect();
        const b = headerCell(table, 'b').getBoundingClientRect();
        const rtl = isRtl(table);
        const cursor = (cell: HTMLElement, x: number) => {
            mouse('mousemove', cell.firstElementChild!, x);
            return cell.style.cursor;
        };

        expect(cursor(headerCell(table, 'a'), rtl ? a.left + 2 : a.right - 2)).toBe('e-resize');
        expect(cursor(headerCell(table, 'b'), rtl ? b.right - 2 : b.left + 2)).toBe('e-resize');
        expect(cursor(headerCell(table, 'a'), rtl ? a.right - 2 : a.left + 2)).toBe('');
        expect(cursor(headerCell(table, 'a'), a.left + a.width / 2)).toBe('');
    });

    it('RSZ-11 (D35): changes the width by the drag distance and emits columnwidth', () => {
        const table = mount();
        const widths = vi.fn();
        table.on('columnwidth', widths);

        resizeBy(table, 'a', 50);
        expect(Math.abs(Number(table.getColumnWidth('a')) - 200)).toBeLessThanOrEqual(1);
        expect(widths).toHaveBeenCalledTimes(1);
        checkInvariants(table);

        resizeBy(table, 'a', -30);
        expect(Math.abs(Number(table.getColumnWidth('a')) - 170)).toBeLessThanOrEqual(1);
        checkInvariants(table);
    });

    it('RSZ-11 (D36): is accurate for sorted columns', () => {
        const table = mount();
        table.sort('a');
        resizeBy(table, 'a', 40);
        expect(Math.abs(Number(table.getColumnWidth('a')) - 190)).toBeLessThanOrEqual(1);
        checkInvariants(table);
    });

    it('RSZ-12: clamps to the minimum width, except for ignoreMin columns', () => {
        const table = mount({ columns: [{ name: 'a', width: 150 }, { name: 'b', width: 150, ignoreMin: true }, { name: 'c', width: 100 }] });

        resizeBy(table, 'a', -500);
        expect(table.getColumnWidth('a')).toBe(35);
        resizeBy(table, 'b', -140);
        expect(Number(table.getColumnWidth('b'))).toBeLessThan(35);
        checkInvariants(table);
    });

    it('RSZ-13: resizing a relative column keeps it relative', () => {
        const table = mount({ columns: [{ name: 'a', width: '30%' }, { name: 'b', width: '30%' }, { name: 'c', width: '40%' }] });
        resizeBy(table, 'a', 40);
        expect(String(table.getColumnWidth('a'))).toMatch(/%$/);
        checkInvariants(table);
    });
});

describe('column resize options', () => {
    it('RSZ-14: does nothing for non-resizable columns or when resizing is disabled', () => {
        useFakeTime();
        const table = mountResizable({ columns: [{ name: 'a', width: 150, resizable: false }, { name: 'b', width: 150 }, { name: 'c', width: 100 }] });
        const x = resizeEdgeX(table, 'a');

        mouse('mousemove', headerCell(table, 'a').firstElementChild!, x);
        expect(headerCell(table, 'a').style.cursor).toBe('');
        mouse('mousedown', headerCell(table, 'a'), x);
        vi.advanceTimersByTime(1000);
        expect(resizeMarker(table)).toBeNull();

        table.setResizableColumns(false);
        mouse('mousedown', headerCell(table, 'b'), resizeEdgeX(table, 'b'));
        vi.advanceTimersByTime(1000);
        expect(resizeMarker(table)).toBeNull();
    });

    it('RSZ-15: ignores non-primary buttons', () => {
        useFakeTime();
        const table = mountResizable();
        mouse('mousedown', headerCell(table, 'a'), resizeEdgeX(table, 'a'), 0, 2);
        vi.advanceTimersByTime(1000);
        expect(resizeMarker(table)).toBeNull();
    });

    it('RSZ-16: only genuine double clicks emit, with the full payload', () => {
        useFakeTime();
        const table = mountResizable();
        const events: ColumnResizeAreaDoubleClickEvent[] = [];
        table.on('columnresizeareadoubleclick', event => events.push(event));
        const clickAt = (column: string, x: number) => {
            mouse('mousedown', headerCell(table, column), x);
            mouse('mouseup', document, x);
        };
        const xa = resizeEdgeX(table, 'a');
        const xb = resizeEdgeX(table, 'b');

        clickAt('a', xa);
        vi.advanceTimersByTime(table.getResizeAreaDoubleClickDuration() + 1);
        clickAt('a', xa);
        expect(events).toHaveLength(0);

        clickAt('b', xb);
        expect(events).toHaveLength(0);

        vi.advanceTimersByTime(1000);
        clickAt('a', xa);
        clickAt('a', xa);
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({ name: 'a', columnName: 'a' });
        expect(events[0].event).toBeInstanceOf(Event);

        vi.advanceTimersByTime(1000);
        touch('touchstart', headerCell(table, 'a'), xa);
        touch('touchend', document, xa);
        clickAt('a', xa);
        expect(events).toHaveLength(1);
    });

    it('RSZ-17: autoFitColumnOnResizeDoubleClick fits the column', () => {
        useFakeTime();
        const table = mountResizable({ autoFitColumnOnResizeDoubleClick: true });
        table.setRows([{ a: 'x', b: 'y', c: 'z' }]);
        const x = resizeEdgeX(table, 'a');

        mouse('mousedown', headerCell(table, 'a'), x);
        mouse('mouseup', document, x);
        mouse('mousedown', headerCell(table, 'a'), x);
        mouse('mouseup', document, x);
        expect(Number(table.getColumnWidth('a'))).toBeLessThan(150);
    });

    it('RSZ-18: cancelColumnResize aborts a drag without changing the width', () => {
        const table = mountResizable();
        const x = resizeEdgeX(table, 'a');
        mouse('mousedown', headerCell(table, 'a'), x);
        mouse('mousemove', document, x + 30);
        expect(resizeMarker(table)).not.toBeNull();

        table.cancelColumnResize();
        expect(resizeMarker(table)).toBeNull();
        mouse('mouseup', document, x + 30);
        expect(table.getColumnWidth('a')).toBe(150);
    });

    it('RSZ-19: resizes with touch', () => {
        const table = mountResizable();
        const x = resizeEdgeX(table, 'a');
        touch('touchstart', headerCell(table, 'a'), x);
        touch('touchmove', document, x + 10);
        touch('touchmove', document, x + 40);
        touch('touchend', document, x + 40);
        expect(Math.abs(Number(table.getColumnWidth('a')) - 190)).toBeLessThanOrEqual(1);
    });

    it('RSZ-20: resizes through a header preview', () => {
        useFakeTime();
        const { table } = mountTable({ columns: [{ name: 'a', width: 50, label: 'a very long header label' }, { name: 'b', width: 100 }] });
        table.setRows([{ a: 1, b: 2 }]);
        hover(headerCell(table, 'a'));
        const preview = previewCell(table)!;
        expect(preview).not.toBeNull();

        const x = resizeEdgeX(table, 'a');
        mouse('mousedown', preview.firstElementChild!, x);
        vi.advanceTimersByTime(table.getResizeAreaDoubleClickDuration());
        expect(resizeMarker(table)).not.toBeNull();
        mouse('mouseup', document, x + 30);
        expect(Math.abs(Number(table.getColumnWidth('a')) - 80)).toBeLessThanOrEqual(1);
    });
});
