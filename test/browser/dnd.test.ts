import { describe, expect, it, vi } from 'vitest';
import { layouts, makeRows, mountLayout, mountTable } from '../helpers/table';
import { headerCell, headerNames } from '../helpers/dom';
import { dragColumn } from '../helpers/pointer';
import { checkInvariants } from '../helpers/invariants';

const columns = [{ name: 'a', width: 80 }, { name: 'b', width: 80 }, { name: 'c', width: 80 }, { name: 'd', width: 80 }];

function rows() {
    return makeRows(5, i => ({ a: 'a' + i, b: 'b' + i, c: 'c' + i, d: 'd' + i }));
}

describe.each(layouts)('column drag and drop ($dir, $boxSizing, virtual=$virtualTable)', layout => {
    it('DND-01: moves columns forward and backward', () => {
        const { table } = mountLayout(layout, { columns });
        table.setRows(rows());
        const moves = vi.fn();
        table.on('movecolumn', moves);

        dragColumn(table, 'a', 'c');
        expect(headerNames(table)).toEqual(['b', 'c', 'a', 'd']);
        checkInvariants(table);

        dragColumn(table, 'd', 'b');
        expect(headerNames(table)).toEqual(['d', 'b', 'c', 'a']);
        expect(moves).toHaveBeenCalledTimes(2);
        checkInvariants(table);
    });
});

describe('column drag and drop rules', () => {
    it('DND-02: prevents dragging non-movable columns and when moving is disabled', () => {
        const { table } = mountTable({ columns: [{ name: 'a', movable: false }, { name: 'b' }, { name: 'c' }] });
        table.setRows(rows());

        const start = new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() });
        headerCell(table, 'a').dispatchEvent(start);
        expect(start.defaultPrevented).toBe(true);

        table.setMovableColumns(false);
        dragColumn(table, 'b', 'c');
        expect(headerNames(table)).toEqual(['a', 'b', 'c']);
    });

    it('DND-03: rejects drops on non-movable columns outside the movable range', () => {
        const { table } = mountTable({
            columns: [{ name: 'pinned', movable: false }, { name: 'a' }, { name: 'locked', movable: false }, { name: 'b' }, { name: 'tail', movable: false }],
        });
        table.setRows(rows());

        dragColumn(table, 'a', 'pinned');
        dragColumn(table, 'b', 'tail');
        expect(headerNames(table)).toEqual(['pinned', 'a', 'locked', 'b', 'tail']);

        dragColumn(table, 'a', 'locked');
        expect(headerNames(table)).toEqual(['pinned', 'locked', 'a', 'b', 'tail']);
    });

    it('DND-04: toggles the drag-over class', () => {
        const { table } = mountTable({ columns });
        const dataTransfer = new DataTransfer();
        const target = headerCell(table, 'b');

        headerCell(table, 'a').dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer }));
        target.firstElementChild!.dispatchEvent(new DragEvent('dragenter', { bubbles: true, dataTransfer }));
        expect(target.classList.contains('drag-over')).toBe(true);

        target.dispatchEvent(new DragEvent('dragleave', { bubbles: true, dataTransfer, relatedTarget: target.firstElementChild }));
        expect(target.classList.contains('drag-over')).toBe(true);

        target.dispatchEvent(new DragEvent('dragleave', { bubbles: true, dataTransfer, relatedTarget: document.body }));
        expect(target.classList.contains('drag-over')).toBe(false);

        headerCell(table, 'a').firstElementChild!.dispatchEvent(new DragEvent('dragenter', { bubbles: true, dataTransfer }));
        expect(headerCell(table, 'a').classList.contains('drag-over')).toBe(false);
        headerCell(table, 'a').dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer }));
    });

    it('DND-05: ignores foreign or malformed drop payloads', () => {
        const { table } = mountTable({ columns });
        for (const payload of ['plain text', '{"dragId":1,"column":"a"}', '{not json', '']) {
            const dataTransfer = new DataTransfer();
            dataTransfer.setData('text', payload);
            expect(() => headerCell(table, 'b').dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }))).not.toThrow();
        }
        expect(headerNames(table)).toEqual(['a', 'b', 'c', 'd']);
    });

    it('DND-06: dims the dragged header and restores it on dragend', () => {
        const { table } = mountTable({ columns });
        const dataTransfer = new DataTransfer();
        headerCell(table, 'a').dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer }));
        expect(headerCell(table, 'a').style.opacity).toBe('0.35');
        headerCell(table, 'a').dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer }));
        expect(headerCell(table, 'a').style.opacity).toBe('');
    });

    it('DND-08: keeps the sort when dragging a sorted column', () => {
        const { table } = mountTable({ columns });
        table.setRows(rows());
        table.sort('a', true);
        dragColumn(table, 'a', 'c');
        expect(table.getSortedColumns()).toEqual([{ column: 'a', descending: true }]);
        expect(headerCell(table, 'a').classList.contains('desc')).toBe(true);
        checkInvariants(table);
    });
});
