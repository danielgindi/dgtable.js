import { describe, expect, it, vi } from 'vitest';
import { mountTable } from '../helpers/table';
import { headerCell, resizeMarker } from '../helpers/dom';
import { resizeEdgeX, touch } from '../helpers/pointer';

const columns = [{ name: 'a', width: 100 }, { name: 'b', width: 100 }];

function centerX(cell: HTMLElement) {
    const rect = cell.getBoundingClientRect();
    return rect.left + rect.width / 2;
}

describe('header touch interactions', () => {
    it('HDR-02: a long press without movement opens the context menu', () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
        const { table } = mountTable({ columns });
        const menu = vi.fn();
        table.on('headercontextmenu', menu);
        const cell = headerCell(table, 'b');

        touch('touchstart', cell, centerX(cell), 10);
        vi.advanceTimersByTime(500);
        expect(menu).toHaveBeenCalledTimes(1);
        expect(menu.mock.calls[0][0].columnName).toBe('b');
        touch('touchend', cell, centerX(cell), 10);
        expect(table.getSortedColumns()).toEqual([]);
    });

    it('HDR-02: moving 9px or more cancels the long press', () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
        const { table } = mountTable({ columns });
        const menu = vi.fn();
        table.on('headercontextmenu', menu);
        const cell = headerCell(table, 'b');

        touch('touchstart', cell, centerX(cell), 10);
        touch('touchmove', cell, centerX(cell) + 20, 10);
        vi.advanceTimersByTime(500);
        expect(menu).not.toHaveBeenCalled();
        touch('touchend', cell, centerX(cell) + 20, 10);
    });

    it('HDR-03: a tap sorts', () => {
        const { table } = mountTable({ columns });
        table.setRows([{ a: 2, b: 1 }, { a: 1, b: 2 }]);
        const cell = headerCell(table, 'a');

        touch('touchstart', cell, centerX(cell), 10);
        touch('touchend', cell, centerX(cell), 10);
        expect(table.getSortedColumns()).toEqual([{ column: 'a', descending: false }]);
    });

    it('HDR-02: touchcancel does nothing', () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
        const { table } = mountTable({ columns });
        const menu = vi.fn();
        table.on('headercontextmenu', menu);
        const cell = headerCell(table, 'a');

        touch('touchstart', cell, centerX(cell), 10);
        touch('touchcancel', cell, centerX(cell), 10);
        vi.advanceTimersByTime(1000);
        expect(menu).not.toHaveBeenCalled();
        expect(table.getSortedColumns()).toEqual([]);
    });

    it('HDR-02 (D43): a slow touch resize is not turned into a long press', () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
        const { table } = mountTable({ columns });
        const menu = vi.fn();
        table.on('headercontextmenu', menu);
        const x = resizeEdgeX(table, 'a');

        touch('touchstart', headerCell(table, 'a'), x, 10);
        vi.advanceTimersByTime(table.getResizeAreaDoubleClickDuration());
        expect(resizeMarker(table)).not.toBeNull();

        // The drag happens on the document, and takes longer than the 500ms long-press delay
        touch('touchmove', document, x + 20, 10);
        vi.advanceTimersByTime(600);
        expect(menu).not.toHaveBeenCalled();
        expect(resizeMarker(table)).not.toBeNull();

        touch('touchend', document, x + 40, 10);
        expect(Math.abs(Number(table.getColumnWidth('a')) - 140)).toBeLessThanOrEqual(1);
    });

    it('HDR-02 (D43): a pending long press does nothing after destroy', () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
        const { table } = mountTable({ columns });
        const cell = headerCell(table, 'b');

        touch('touchstart', cell, centerX(cell), 10);
        table.destroy();
        expect(() => vi.advanceTimersByTime(1000)).not.toThrow();
    });

    it('HDR-04: a second touch while one is active is ignored', () => {
        const { table } = mountTable({ columns });
        const cell = headerCell(table, 'a');

        touch('touchstart', cell, centerX(cell), 10, 1);
        touch('touchstart', cell, centerX(cell), 10, 2);
        touch('touchend', cell, centerX(cell), 10, 2);
        expect(table.getSortedColumns()).toEqual([]);
        touch('touchend', cell, centerX(cell), 10, 1);
        expect(table.getSortedColumns()).toEqual([{ column: 'a', descending: false }]);
    });
});
