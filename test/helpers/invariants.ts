import { expect } from 'vitest';
import type DGTable from '../../src/index';
import { headerNames, isRtl, normalizeHtml, renderedRows, scrollContainer } from './dom';
import { headerCompensation, rowsBufferSize } from './internals';

export function expectColumnsAligned(table: DGTable, tolerance = 0.5): void {
    const row = renderedRows(table)[0];
    if (!row)
        return;

    const rtl = isRtl(table);

    for (const header of Array.from(table.getHeaderRowElement()!.children) as HTMLElement[]) {
        const column = header.getAttribute('data-column')!;
        const body = row.querySelector<HTMLElement>(`[data-column="${column}"]`)!;
        const h = header.getBoundingClientRect();
        const b = body.getBoundingClientRect();
        const startDelta = rtl ? h.right - b.right : h.left - b.left;
        const widthDelta = h.width - b.width - headerCompensation(table, column);

        expect(Math.abs(startDelta), `${column}: start edge (header ${rtl ? h.right : h.left}, body ${rtl ? b.right : b.left})`).toBeLessThanOrEqual(tolerance);
        expect(Math.abs(widthDelta), `${column}: width (header ${h.width}, body ${b.width})`).toBeLessThanOrEqual(tolerance);
    }
}

export function expectConsistentColumnOrder(table: DGTable): void {
    const expected = Object.values(table.getColumnsConfig())
        .filter(column => column!.visible)
        .sort((a, b) => a!.order! - b!.order!)
        .map(column => column!.name);

    expect(headerNames(table)).toEqual(expected);
    for (const row of renderedRows(table)) {
        expect(Array.from(row.children, cell => cell.getAttribute('data-column'))).toEqual(expected);
    }
}

export function expectRowsMatchData(table: DGTable): void {
    for (const row of renderedRows(table)) {
        const data = table.getDataForFilteredRow(row.vIndex)!;
        expect(row.index, `row ${row.vIndex}: index`).toBe(table.getIndexForRow(data));

        for (const cell of Array.from(row.children) as HTMLElement[]) {
            const column = cell.getAttribute('data-column')!;
            const expected = normalizeHtml(table.getHtmlForRowDataCell(data, column));
            expect(cell.firstElementChild!.innerHTML, `row ${row.vIndex}/${column}`).toBe(expected);
        }
    }
}

export function expectVirtualBound(table: DGTable, minRowHeight = 29): void {
    if (!scrollContainer(table).classList.contains('virtual'))
        return;

    const viewport = scrollContainer(table).clientHeight;
    const max = Math.ceil(viewport / minRowHeight) + 2 * rowsBufferSize(table) + 2;
    expect(renderedRows(table).length).toBeLessThanOrEqual(max);
}

export function expectMinWidths(table: DGTable): void {
    const min = table.getMinColumnWidth();
    const configs = table.getColumnsConfig();
    const headers = Array.from(table.getHeaderRowElement()!.children) as HTMLElement[];

    // The last column has the scrollbar width deducted from its content width, so it is excluded.
    for (const header of headers.slice(0, -1)) {
        const config = configs[header.getAttribute('data-column')!]!;
        if (config.ignoreMin)
            continue;

        expect(parseFloat(header.style.width), `${config.name}: min width`).toBeGreaterThanOrEqual(min);
    }
}

export function expectNoGapAtEnd(table: DGTable, tolerance = 1): void {
    const row = renderedRows(table)[0];
    if (!row)
        return;

    const container = scrollContainer(table);
    if (container.scrollWidth > container.clientWidth)
        return;

    // The body element spans the scroll container's content box, whichever side the scrollbar is on.
    // (Computing it from clientLeft failed in WebKit RTL: engines differ in how they report a left-side scrollbar.)
    const cells = Array.from(row.children) as HTMLElement[];
    const bodyRect = container.querySelector<HTMLElement>(':scope > .dgtable-body')!.getBoundingClientRect();
    const rtl = isRtl(table);
    const contentEnd = rtl ? bodyRect.left : bodyRect.right;
    const lastEnd = rtl
        ? Math.min(...cells.map(c => c.getBoundingClientRect().left))
        : Math.max(...cells.map(c => c.getBoundingClientRect().right));

    expect(Math.abs(lastEnd - contentEnd), 'gap after the last column').toBeLessThanOrEqual(tolerance);
}

export function checkInvariants(table: DGTable): void {
    expectConsistentColumnOrder(table);
    expectRowsMatchData(table);
    expectColumnsAligned(table);
    expectVirtualBound(table);
    expectMinWidths(table);
}
