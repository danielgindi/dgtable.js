import type DGTable from '../../src/index';

export type RowElement = HTMLElement & { vIndex: number; index: number };

export function headerCell(table: DGTable, column: string): HTMLElement {
    const cell = table.getHeaderRowElement()?.querySelector<HTMLElement>(`[data-column="${column}"]`);
    if (!cell)
        throw new Error(`No header cell for column "${column}"`);

    return cell;
}

export function headerNames(table: DGTable): string[] {
    return Array.from(table.getHeaderRowElement()!.children, cell => cell.getAttribute('data-column')!);
}

export function scrollContainer(table: DGTable): HTMLElement {
    return table.el.querySelector<HTMLElement>(':scope > .dgtable')!;
}

export function scrollbarWidth(table: DGTable): number {
    const container = scrollContainer(table);
    return container.offsetWidth - container.clientWidth;
}

export function renderedRows(table: DGTable): RowElement[] {
    const rows = Array.from(table.el.querySelectorAll<RowElement>('.dgtable-body > .dgtable-row'));
    return rows.sort((a, b) => a.vIndex - b.vIndex);
}

export function bodyCell(table: DGTable, vIndex: number, column: string): HTMLElement {
    const row = renderedRows(table).find(r => r.vIndex === vIndex);
    const cell = row?.querySelector<HTMLElement>(`[data-column="${column}"]`);
    if (!cell)
        throw new Error(`No rendered cell for row ${vIndex}, column "${column}"`);

    return cell;
}

export function rowTexts(table: DGTable, column: string): string[] {
    return renderedRows(table).map(row => row.querySelector(`[data-column="${column}"]`)!.textContent!);
}

export function resizeMarker(table: DGTable): HTMLElement | null {
    return table.el.querySelector<HTMLElement>(':scope > .dgtable-resize');
}

export function previewCell(table: DGTable): HTMLElement | null {
    return table.el.querySelector<HTMLElement>(':scope > .dgtable-cell-preview');
}

export function normalizeHtml(html: unknown): string {
    const template = document.createElement('div');
    template.innerHTML = html == null ? '' : String(html);
    return template.innerHTML;
}

export function isRtl(table: DGTable): boolean {
    return getComputedStyle(table.el).direction === 'rtl';
}

export function clickHeader(table: DGTable, column: string): void {
    const cell = headerCell(table, column);
    const rect = cell.getBoundingClientRect();
    cell.firstElementChild!.dispatchEvent(new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
    }));
}

/** Set the horizontal scroll offset in "distance from the start edge" terms, for both LTR and RTL. */
export function scrollHorizontally(table: DGTable, distanceFromStart: number): void {
    const container = scrollContainer(table);
    container.scrollLeft = isRtl(table) ? -distanceFromStart : distanceFromStart;
    container.dispatchEvent(new Event('scroll'));
}

export function scrollVertically(table: DGTable, top: number): void {
    const container = scrollContainer(table);
    container.scrollTop = top;
    container.dispatchEvent(new Event('scroll'));
}

export function nextFrame(): Promise<void> {
    return new Promise(resolve => requestAnimationFrame(() => resolve()));
}
