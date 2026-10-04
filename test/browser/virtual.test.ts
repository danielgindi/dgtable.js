import { describe, expect, it, vi } from 'vitest';
import type { RowClickEvent } from '../../src/index';
import { makeRows, mountTable } from '../helpers/table';
import { renderedRows, scrollContainer, scrollVertically } from '../helpers/dom';
import { checkInvariants, expectRowsMatchData, expectVirtualBound } from '../helpers/invariants';

const columns = [{ name: 'id', width: 80 }, { name: 'name', width: 150 }];

function vIndices(table: Parameters<typeof renderedRows>[0]) {
    return renderedRows(table).map(r => r.vIndex);
}

describe('virtual rendering', () => {
    it('VIRT-01: renders only the rows around the viewport', () => {
        const { table } = mountTable({ columns, height: 300 });
        table.setRows(makeRows(10_000));

        expectVirtualBound(table);
        expect(vIndices(table)[0]).toBe(0);

        scrollVertically(table, 5000 * 29);
        const indices = vIndices(table);
        expect(indices[0]).toBeLessThanOrEqual(5000);
        expect(indices.at(-1)).toBeGreaterThanOrEqual(5005);
        expectVirtualBound(table);
        checkInvariants(table);
    });

    it('VIRT-02: reaches the last row and balances rowcreate/rowdestroy', () => {
        const { table } = mountTable({ columns, height: 300 });
        let alive = 0;
        table.on('rowcreate', () => alive++);
        table.on('rowdestroy', () => alive--);
        table.setRows(makeRows(1000));

        for (const top of [1000, 9000, 20_000, 1e9]) {
            scrollVertically(table, top);
            expect(alive).toBe(renderedRows(table).length);
            expectRowsMatchData(table);
        }

        const last = renderedRows(table).at(-1)!;
        expect(last.vIndex).toBe(999);
        const container = scrollContainer(table).getBoundingClientRect();
        expect(last.getBoundingClientRect().bottom).toBeLessThanOrEqual(container.bottom + 0.5);
    });

    it('VIRT-03: rowsBufferSize changes how many rows are rendered', () => {
        const small = mountTable({ columns, height: 300, rowsBufferSize: 1 }).table;
        const large = mountTable({ columns, height: 300, rowsBufferSize: 10 }).table;
        small.setRows(makeRows(1000));
        large.setRows(makeRows(1000));
        scrollVertically(small, 10_000);
        scrollVertically(large, 10_000);

        expect(renderedRows(large).length).toBeGreaterThanOrEqual(renderedRows(small).length + 15);
        expectVirtualBound(small);
        expectVirtualBound(large);
    });

    it.each([10, 100])('VIRT-04: reaches the end with a wrong estimatedRowHeight (%i)', estimatedRowHeight => {
        const { table } = mountTable({ columns, height: 300, estimatedRowHeight });
        table.setRows(makeRows(500));

        for (let i = 0; i < 5; i++)
            scrollVertically(table, 1e9);

        expect(renderedRows(table).at(-1)!.vIndex).toBe(499);
        expectRowsMatchData(table);
    });

    it('VIRT-05: lays out rows of variable heights without overlap', () => {
        const { table } = mountTable({
            columns: [{ name: 'id', width: 80 }, { name: 'text', width: 200 }],
            height: 300,
            cellFormatter: (value, column) => column === 'text' ? Array.from({ length: Number(value) }, () => 'line').join('<br>') : String(value),
        });
        const style = document.createElement('style');
        style.textContent = '.variable .dgtable-row { height: auto; } .variable .dgtable-cell > div { white-space: normal; }';
        document.head.appendChild(style);
        table.el.classList.add('variable');
        table.setRows(makeRows(300, i => ({ id: i, text: 1 + (i % 5) })));

        try {
            for (const top of [0, 2000, 6000, 1e9]) {
                scrollVertically(table, top);
                scrollVertically(table, top);
                const rects = renderedRows(table).map(r => r.getBoundingClientRect());
                for (let i = 1; i < rects.length; i++) {
                    expect(rects[i].top).toBeGreaterThanOrEqual(rects[i - 1].bottom - 0.5);
                }
            }
            expect(renderedRows(table).at(-1)!.vIndex).toBe(299);
        } finally {
            style.remove();
        }
    });

    it('VIRT-06: non-virtual tables render every row', () => {
        const { table } = mountTable({ columns, height: 300, virtualTable: false });
        table.setRows(makeRows(300));

        expect(renderedRows(table)).toHaveLength(300);
        expect(scrollContainer(table).classList.contains('virtual')).toBe(false);
        expect(renderedRows(table).filter(r => r.classList.contains('dgtable-row-alt'))).toHaveLength(150);
        checkInvariants(table);
    });

    it('VIRT-07: rows and cells carry their indices and column names', () => {
        const { table } = mountTable({ columns });
        table.setRows(makeRows(3));
        const row = renderedRows(table)[1] as HTMLElement & { index: number; vIndex: number };
        const cell = row.firstElementChild as HTMLElement & { columnName: string };

        expect([row.index, row.vIndex]).toEqual([1, 1]);
        expect(cell.getAttribute('data-column')).toBe('id');
        expect(cell.columnName).toBe('id');
    });

    it('VIRT-08: emits rowclick with the full payload', () => {
        const { table } = mountTable({ columns });
        table.setRows(makeRows(3));
        const handler = vi.fn<(event: RowClickEvent) => void>();
        table.on('rowclick', handler);

        renderedRows(table)[2].firstElementChild!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(handler.mock.calls[0][0]).toMatchObject({ filteredRowIndex: 2, rowIndex: 2, rowData: { id: 2 } });
    });

    it.each([true, false])('VIRT-09 (D31): emits rowdestroy for every rendered row on clearAndRender and destroy (virtual=%s)', virtualTable => {
        const { table } = mountTable({ columns, virtualTable });
        let alive = 0;
        table.on('rowcreate', () => alive++);
        table.on('rowdestroy', () => alive--);
        table.setRows(makeRows(5));
        expect(alive).toBe(5);

        table.clearAndRender();
        expect(alive).toBe(5);

        table.destroy();
        expect(alive).toBe(0);
    });

    it('VIRT-10: clamps the scroll position when rows shrink while scrolled to the bottom', () => {
        const { table } = mountTable({ columns, height: 300 });
        table.setRows(makeRows(1000));
        scrollVertically(table, 1e9);

        table.setRows(makeRows(20));
        scrollVertically(table, scrollContainer(table).scrollTop);
        expect(renderedRows(table).length).toBeGreaterThan(0);
        expect(renderedRows(table).at(-1)!.vIndex).toBe(19);
        checkInvariants(table);
    });
});
