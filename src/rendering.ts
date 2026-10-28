/**
 * Rendering functionality for DGTable
 */

/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-ignore - No type declarations available for this module
import VirtualListHelper from '@danielgindi/virtual-list-helper';
// @ts-ignore - No type declarations available for this module
import { getElementWidth, getElementHeight, setElementWidth, setCssProps } from '@danielgindi/dom-utils/lib/Css.js';
// @ts-ignore - No type declarations available for this module
import { scopedSelectorAll } from '@danielgindi/dom-utils/lib/DomCompat.js';
import { ColumnWidthMode, Width } from './constants';
import {
    relativizeElement,
    webkitRenderBugfix,
    calculateTbodyWidth,
    getWidthAbsorbingColumnIndex,
    isTableRtl,
    disableCssSelect,
} from './helpers';
import {
    bindHeaderColumnEvents,
    unbindCellEventsForRow,
    getHtmlForCell,
    getHtmlForStickyEndRowCell,
    onTableScrolledHorizontally,
} from './internal';
import type { RowData } from './types';

import {
    DGTableInterface,
    InternalColumn,
    OriginalRowIndex,
    RowClickEventSymbol,
    StickyEndRowClickEventSymbol,
    StickyEndRowsFocusState,
} from './private_types';

const nativeIndexOf = Array.prototype.indexOf;
const createElement = document.createElement.bind(document);

interface CellElement extends HTMLDivElement {
    columnName?: string;
}

interface HeaderCellElement extends HTMLDivElement {
    columnName?: string;
}

interface StickyEndRowElement extends HTMLDivElement {
    stickyEndIndex?: number;
    [StickyEndRowClickEventSymbol]?: ((event: MouseEvent) => void) | null;
}

/**
 * Setup virtual table rendering
 */
export function setupVirtualTable(table: DGTableInterface): void {
    const p = table._p, o = table._o;

    const tableClassName = o.tableClassName;
    const rowClassName = tableClassName + '-row';
    const altRowClassName = tableClassName + '-row-alt';

    let visibleColumns = p.visibleColumns;

    p.notifyRendererOfColumnsConfig = () => {
        visibleColumns = p.visibleColumns;

        for (let colIndex = 0, colCount = visibleColumns.length; colIndex < colCount; colIndex++) {
            const column = visibleColumns[colIndex];
            column._finalWidth = (column.actualWidthConsideringScrollbarWidth || column.actualWidth);
        }
    };

    p.virtualListHelper = new VirtualListHelper({
        list: p.table,
        itemsParent: p.tbody,
        autoVirtualWrapperWidth: false,
        virtual: o.virtualTable,
        buffer: o.rowsBufferSize,
        estimatedItemHeight: o.estimatedRowHeight ? o.estimatedRowHeight : (p.virtualRowHeight || 40),
        itemElementCreatorFn: () => {
            return createElement('div');
        },
        onItemRender: (itemEl: Element, virtualIndex: number) => {
            const row = itemEl as HTMLElement;
            const rows = p.filteredRows || p.rows;
            const isDataFiltered = !!p.filteredRows;

            row.className = rowClassName;
            if ((virtualIndex % 2) === 1)
                row.className += ' ' + altRowClassName;

            const rowData = rows[virtualIndex] as RowData;
            const rowIndex = isDataFiltered ? (rowData as any)[OriginalRowIndex] : virtualIndex;

            (row as any).vIndex = virtualIndex;
            (row as any).index = rowIndex;

            appendRowCells(table, row, visibleColumns, column => getHtmlForCell(o, rowData, column));

            row.addEventListener('click', (row as any)[RowClickEventSymbol] = (event: MouseEvent) => {
                table.emit('rowclick', {
                    event: event,
                    filteredRowIndex: virtualIndex,
                    rowIndex: rowIndex,
                    rowEl: row,
                    rowData: rowData,
                });
            });

            table.emit('rowcreate', {
                filteredRowIndex: virtualIndex,
                rowIndex: rowIndex,
                rowEl: row,
                rowData: rowData,
            });
        },

        onItemUnrender: (itemEl: Element) => unrenderRow(table, itemEl as HTMLElement),

        onScrollHeightChange: (height: number) => {
            if (height > p._lastVirtualScrollHeight && !p.scrollbarWidth) {
                updateLastCellWidthFromScrollbar(table);
            }

            p._lastVirtualScrollHeight = height;
        },
    });

    p.virtualListHelper.setCount((p.filteredRows ?? p.rows).length);

    p.notifyRendererOfColumnsConfig();
}

/**
 * Create the cells of a body row or a sticky end row, and append them to the row element.
 */
function appendRowCells(
    table: DGTableInterface,
    row: HTMLElement,
    columns: InternalColumn[],
    getHtml: (column: InternalColumn) => string,
): void {
    const p = table._p, o = table._o;

    const tableClassName = o.tableClassName;
    const cellClassName = tableClassName + '-cell';

    for (let colIndex = 0, colCount = columns.length; colIndex < colCount; colIndex++) {
        const column = columns[colIndex];
        const cell = createElement('div') as CellElement;
        cell.columnName = column.name;
        cell.setAttribute('data-column', column.name);
        cell.className = cellClassName;
        cell.style.width = (column._finalWidth ?? 0) + 'px';
        if (column.cellClasses)
            cell.className += ' ' + column.cellClasses;

        if (column.stickyPos)
            applyCellStickyLayout(table, cell, column, colIndex);

        p._bindCellHoverIn(cell);

        const cellInner = cell.appendChild(createElement('div'));
        cellInner.innerHTML = getHtml(column);

        row.appendChild(cell);
    }
}

/**
 * Apply (or clear) a column's sticky position, and the sticky overlap markers, on a body cell.
 */
function applyCellStickyLayout(table: DGTableInterface, cell: HTMLElement, column: InternalColumn, colIndex: number): void {
    const p = table._p;
    const stickyClassName = table._o.tableClassName + '-sticky';
    const stickyPos = column.stickyPos;

    cell.style.left = '';
    cell.style.right = '';

    if (!stickyPos) {
        cell.classList.remove(stickyClassName, 'is-sticky-left', 'is-sticky-right');
        cell.style.position = '';
        return;
    }

    cell.classList.add(stickyClassName);
    cell.style.position = 'sticky';
    cell.style[stickyPos.absDirection] = stickyPos.offset + 'px';

    const isStickySide = p.isStickyColumns?.get(colIndex);
    const isLeft = isStickySide === 'start' && !p.lastIsRtl || isStickySide === 'end' && p.lastIsRtl;
    const isRight = isStickySide === 'start' && p.lastIsRtl || isStickySide === 'end' && !p.lastIsRtl;
    cell.classList.toggle('is-sticky-left', isLeft);
    cell.classList.toggle('is-sticky-right', isRight);
}

/**
 * Call `callback` for every rendered row element: the body rows, then the sticky end rows.
 *
 * Sticky end rows are included only while they are in place and match the visible columns.
 * Otherwise (e.g. during a re-render after a column change) they still have the old cells,
 * and are re-created by `updateStickyEndRows()` anyway.
 */
export function forEachRenderedRow(table: DGTableInterface, callback: (rowEl: HTMLElement) => void): void {
    const p = table._p;

    for (let rowEl = p.tbody?.firstElementChild; rowEl; rowEl = rowEl.nextElementSibling) {
        callback(rowEl as HTMLElement);
    }

    if (isStickyEndRowsInSync(table))
        forEachStickyEndRow(table, callback);
}

/**
 * Call `callback` for every rendered sticky end row element
 */
export function forEachStickyEndRow(table: DGTableInterface, callback: (rowEl: HTMLElement) => void): void {
    for (let rowEl = table._p.stickyEndRowsEl?.firstElementChild; rowEl; rowEl = rowEl.nextElementSibling) {
        callback(rowEl as HTMLElement);
    }
}

/**
 * Whether the sticky end rows are in the scroll element and their cells match the visible columns
 */
export function isStickyEndRowsInSync(table: DGTableInterface): boolean {
    const p = table._p;
    const container = p.stickyEndRowsEl;

    return !!container && !!p.table && container.parentNode === p.table &&
        !p.stickyEndRowsNeedRendering &&
        p.stickyEndRowsColumnsKey === getStickyEndRowsColumnsKey(p.visibleColumns);
}

/**
 * After the sticky end rows changed height: the vertical scrollbar may have appeared or disappeared
 */
export function updateAfterStickyEndRowsResize(table: DGTableInterface): void {
    const p = table._p;

    const scrollbarWidth = p.scrollbarWidth;
    updateLastCellWidthFromScrollbar(table);
    if (p.scrollbarWidth !== scrollbarWidth)
        updateTableWidth(table, false);
}

/**
 * Bring the sticky end rows up to date with the table.
 *
 * The rows live in a container inside the scroll element, right after the body, which sticks
 * to its bottom. They are kept across renders, so controls in them keep their state and focus:
 * they are re-created only when their data, their formatter or the visible columns changed
 * (or when `force` is set), and otherwise only their cells' layout is updated in place.
 */
export function updateStickyEndRows(table: DGTableInterface, force = false): void {
    const p = table._p, o = table._o;

    if (!p.table || !p.tbody)
        return;

    const rows = p.stickyEndRows;

    if (!rows.length) {
        p.stickyEndRowsNeedRendering = false;
        unrenderStickyEndRows(table);
        p.stickyEndRowsEl?.remove();
        p.stickyEndRowsEl = null;
        p.stickyEndRowsFocus = null;
        applyStickyEndRowsMode(table);
        return;
    }

    let container = p.stickyEndRowsEl;
    if (!container) {
        container = p.stickyEndRowsEl = createElement('div');
        container.className = o.tableClassName + '-sticky-end-rows';
        setCssProps(container, {
            // A formatting context of its own: floating cells overflowing the last body row
            // can not push into it, and its own cells' overflow stays inside the pinned area.
            display: 'flow-root',
            position: 'sticky',
            bottom: '0',
        });
    }

    if (container.parentNode !== p.table || container.previousElementSibling !== p.tbody) {
        p.table.insertBefore(container, p.tbody.nextSibling);

        // Paint above the body rows and their sticky cells, unless the stylesheet says otherwise
        container.style.zIndex = '';
        if (getComputedStyle(container).zIndex === 'auto')
            container.style.zIndex = '1';
    }

    // Keep the numeric width: reading style.minWidth can shorten its decimal representation.
    container.style.minWidth = p.tbodyMinWidth === undefined ? '' : p.tbodyMinWidth + 'px';

    const columnsKey = getStickyEndRowsColumnsKey(p.visibleColumns);

    if (force || p.stickyEndRowsNeedRendering || columnsKey !== p.stickyEndRowsColumnsKey ||
        container.children.length !== rows.length) {
        renderStickyEndRowElements(table, container, columnsKey);
    } else {
        syncStickyEndRowsLayout(table, container);
    }

    applyStickyEndRowsMode(table);
    restoreStickyEndRowsFocus(table);
}

/**
 * Apply the sticky end rows placement mode.
 *
 * Both modes keep the rows at the bottom of the viewport while the body scrolls. In `'fixed'` mode
 * the body also gets a minimum height of "viewport height minus the rows' height", so the rows
 * stay at the bottom when the body rows do not fill the viewport. The percentage resolves against
 * the scroll element's content box, so it follows the horizontal scrollbar coming and going; only
 * the rows' own height needs tracking, which a ResizeObserver does.
 */
export function applyStickyEndRowsMode(table: DGTableInterface): void {
    const p = table._p;
    const container = getFixedStickyEndRowsContainer(table);

    updateFixedStickyEndRowsMinHeight(table, container);

    if (!container || typeof ResizeObserver !== 'function') {
        disconnectStickyEndRowsResizeObserver(table);
        return;
    }

    let observer = p.stickyEndRowsResizeObserver;
    if (!observer) {
        // Only updates the body's minimum height: (re-)observing from here would notify again, endlessly
        observer = p.stickyEndRowsResizeObserver = new ResizeObserver(() => {
            if (p.stickyEndRowsResizeObserver === observer)
                updateFixedStickyEndRowsMinHeight(table, getFixedStickyEndRowsContainer(table));
        });
    }

    if (p.stickyEndRowsObservedEl !== container) {
        observer.disconnect();
        observer.observe(container);
        p.stickyEndRowsObservedEl = container;
    }
}

export function disconnectStickyEndRowsResizeObserver(table: DGTableInterface): void {
    const p = table._p;

    p.stickyEndRowsResizeObserver?.disconnect();
    p.stickyEndRowsResizeObserver = null;
    p.stickyEndRowsObservedEl = null;
}

/**
 * The sticky end rows container when it is placed in `'fixed'` mode, otherwise null
 */
function getFixedStickyEndRowsContainer(table: DGTableInterface): HTMLElement | null {
    const p = table._p, o = table._o;
    const container = p.stickyEndRowsEl;

    if (o.stickyEndRowsMode !== 'fixed' || !o.height || !container || !p.table || container.parentNode !== p.table)
        return null;

    return container;
}

function updateFixedStickyEndRowsMinHeight(table: DGTableInterface, container: HTMLElement | null): void {
    const tbody = table._p.tbody;
    if (!tbody)
        return;

    const minHeight = container
        ? `max(1px, calc(100% - ${getLayoutHeight(container)}px))`
        : '1px';

    if (tbody.style.minHeight !== minHeight)
        tbody.style.minHeight = minHeight;
}

/**
 * The border-box height in CSS pixels, unaffected by transforms (unlike getBoundingClientRect)
 * and not rounded (unlike offsetHeight)
 */
function getLayoutHeight(el: HTMLElement): number {
    const style = getComputedStyle(el);
    let height = parseFloat(style.height) || 0;

    if (style.boxSizing !== 'border-box') {
        height += (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0) +
            (parseFloat(style.borderTopWidth) || 0) + (parseFloat(style.borderBottomWidth) || 0);
    }

    return height;
}

/**
 * Identifies the visible columns (and their order) the sticky end rows were rendered with
 */
export function getStickyEndRowsColumnsKey(columns: InternalColumn[]): string {
    return columns.map(column => column.name).join('\u0000');
}

/**
 * Re-create the sticky end row elements
 */
function renderStickyEndRowElements(table: DGTableInterface, container: HTMLElement, columnsKey: string): void {
    const p = table._p;

    p.stickyEndRowsNeedRendering = false;
    p.stickyEndRowsColumnsKey = columnsKey;
    p.stickyEndRowsFocus = null;
    unrenderStickyEndRows(table);

    const rows = p.stickyEndRows;

    for (let stickyRowIndex = 0; stickyRowIndex < rows.length; stickyRowIndex++) {
        const row = createStickyEndRowElement(table, stickyRowIndex);
        container.appendChild(row);
        emitStickyEndRowCreate(table, row);
    }
}

/**
 * Re-create a single sticky end row element, leaving the others (and their controls) alone.
 * Returns false when the rows are not rendered in a way that allows it.
 */
export function rerenderStickyEndRow(table: DGTableInterface, stickyRowIndex: number): boolean {
    const p = table._p;
    const container = p.stickyEndRowsEl;

    if (!container || p.stickyEndRowsNeedRendering || container.children.length !== p.stickyEndRows.length)
        return false;

    const oldRow = container.children[stickyRowIndex] as StickyEndRowElement | undefined;
    if (!oldRow)
        return false;

    const row = createStickyEndRowElement(table, stickyRowIndex);
    releaseStickyEndRow(table, oldRow, row);
    emitStickyEndRowCreate(table, row);

    return true;
}

/**
 * Create the element of a sticky end row, with its cells and click handler
 */
function createStickyEndRowElement(table: DGTableInterface, stickyRowIndex: number): StickyEndRowElement {
    const p = table._p, o = table._o;

    const tableClassName = o.tableClassName;
    const rowData = p.stickyEndRows[stickyRowIndex];
    const row = createElement('div') as StickyEndRowElement;

    row.className = tableClassName + '-row ' + tableClassName + '-sticky-end-row';
    if ((stickyRowIndex % 2) === 1)
        row.className += ' ' + tableClassName + '-row-alt';

    row.stickyEndIndex = stickyRowIndex;

    appendRowCells(table, row, p.visibleColumns, column => getHtmlForStickyEndRowCell(o, rowData, column, stickyRowIndex));

    row.addEventListener('click', row[StickyEndRowClickEventSymbol] = (event: MouseEvent) => {
        table.emit('stickyendrowclick', {
            event: event,
            stickyRowIndex: stickyRowIndex,
            rowEl: row,
            rowData: rowData,
        });
    });

    return row;
}

function emitStickyEndRowCreate(table: DGTableInterface, row: StickyEndRowElement): void {
    const stickyRowIndex = row.stickyEndIndex!;

    table.emit('stickyendrowcreate', {
        stickyRowIndex: stickyRowIndex,
        rowEl: row,
        rowData: table._p.stickyEndRows[stickyRowIndex],
    });
}

/**
 * Unbind a sticky end row, remove it (or swap it with `replacement`), and emit 'stickyendrowdestroy'
 */
function releaseStickyEndRow(table: DGTableInterface, row: StickyEndRowElement, replacement?: HTMLElement): void {
    const clickHandler = row[StickyEndRowClickEventSymbol];
    if (clickHandler) {
        row.removeEventListener('click', clickHandler);
        row[StickyEndRowClickEventSymbol] = null;
    }

    unbindCellEventsForRow(table, row);

    if (replacement)
        row.replaceWith(replacement);
    else
        row.remove();

    table.emit('stickyendrowdestroy', row);
}

/**
 * Update the widths and sticky positions of the existing sticky end row cells, keeping their content
 */
function syncStickyEndRowsLayout(table: DGTableInterface, container: HTMLElement): void {
    const columns = table._p.visibleColumns;

    for (let rowEl = container.firstElementChild; rowEl; rowEl = rowEl.nextElementSibling) {
        const cells = rowEl.children;

        for (let colIndex = 0, colCount = columns.length; colIndex < colCount; colIndex++) {
            const column = columns[colIndex];
            const cell = cells[colIndex] as HTMLElement;

            cell.style.width = (column._finalWidth ?? 0) + 'px';
            applyCellStickyLayout(table, cell, column, colIndex);
        }
    }
}

/**
 * Detach the sticky end rows container from the scroll element, keeping its rows, so it can be
 * moved into a re-created scroll element. Remembers the focused control in it, if any.
 */
export function detachStickyEndRows(table: DGTableInterface): void {
    const p = table._p;
    const container = p.stickyEndRowsEl;

    if (!container || !container.parentNode)
        return;

    const active = document.activeElement as HTMLElement | null;
    if (active && active !== container && container.contains(active)) {
        const input = active as HTMLInputElement;
        let selectionStart: number | null = null;
        let selectionEnd: number | null = null;
        let selectionDirection: StickyEndRowsFocusState['selectionDirection'] = null;

        try {
            selectionStart = input.selectionStart ?? null;
            selectionEnd = input.selectionEnd ?? null;
            selectionDirection = input.selectionDirection ?? null;
        } catch {
            /* not a text control */
        }

        p.stickyEndRowsFocus = { el: active, selectionStart, selectionEnd, selectionDirection };
    }

    container.remove();
}

/**
 * Re-focus the control that was focused when the sticky end rows were detached
 */
function restoreStickyEndRowsFocus(table: DGTableInterface): void {
    const p = table._p;
    const focus = p.stickyEndRowsFocus;
    p.stickyEndRowsFocus = null;

    if (!focus || !focus.el.isConnected || !p.stickyEndRowsEl?.contains(focus.el))
        return;

    focus.el.focus({ preventScroll: true });

    if (focus.selectionStart !== null && focus.selectionEnd !== null) {
        try {
            (focus.el as HTMLInputElement).setSelectionRange(
                focus.selectionStart,
                focus.selectionEnd,
                focus.selectionDirection ?? undefined,
            );
        } catch {
            /* not a text control */
        }
    }
}

/**
 * Release the rendered sticky end rows, emitting 'stickyendrowdestroy' for each.
 * Keeps the (now empty) container in place.
 */
export function unrenderStickyEndRows(table: DGTableInterface): void {
    const container = table._p.stickyEndRowsEl;
    if (!container)
        return;

    for (let rowEl = container.firstElementChild; rowEl; rowEl = container.firstElementChild) {
        releaseStickyEndRow(table, rowEl as StickyEndRowElement);
    }
}

/**
 * Release a rendered row and emit 'rowdestroy'. Safe to call more than once per rendering.
 */
function unrenderRow(table: DGTableInterface, row: HTMLElement): void {
    const clickHandler = (row as any)[RowClickEventSymbol];
    if (!clickHandler)
        return;

    row.removeEventListener('click', clickHandler);
    (row as any)[RowClickEventSymbol] = null;

    unbindCellEventsForRow(table, row);

    table.emit('rowdestroy', row);
}

/**
 * Release all rendered rows before the list helper is destroyed.
 * The helper's destroy() does not report virtual rows as unrendered.
 */
export function unrenderAllRows(table: DGTableInterface): void {
    const tbody = table._p.tbody;
    if (!tbody)
        return;

    for (let row = tbody.firstElementChild; row; row = row.nextElementSibling) {
        unrenderRow(table, row as HTMLElement);
    }
}

/**
 * Render the skeleton base (header structure)
 */
export function renderSkeletonBase(table: DGTableInterface): DGTableInterface {
    const p = table._p;
    const o = table._o;

    // Clean up old elements
    unrenderAllRows(table);
    p.virtualListHelper?.destroy();
    p.virtualListHelper = null;

    if (p.table && o.virtualTable) {
        // Keep the sticky end rows (and the state of controls in them) for the new scroll element
        detachStickyEndRows(table);

        p.table.remove();
        p.table = undefined;
        p.tbody = undefined;
    }

    destroyHeaderCells(table);
    p.currentTouchId = null;
    if (p.header) {
        p.header.remove();
    }

    // Create new base elements
    const tableClassName = o.tableClassName;
    const header = createElement('div');
    const headerRow = createElement('div');

    header.className = `${tableClassName}-header`;
    headerRow.className = `${tableClassName}-header-row`;

    p.header = header;
    p.headerRow = headerRow;
    header.appendChild(headerRow);
    table.el.prepend(header);

    relativizeElement(table.el);

    if (o.width === Width.SCROLL) {
        table.el.style.overflow = 'hidden';
    } else {
        table.el.style.overflow = '';
    }

    if (!o.height && o.virtualTable) {
        o.height = getElementHeight(table.el, true);
    }

    return table;
}

/**
 * Render skeleton body
 */
export function renderSkeletonBody(table: DGTableInterface): DGTableInterface {
    const p = table._p;
    const o = table._o;

    const tableClassName = o.tableClassName;

    // Calculate virtual row heights
    if (o.virtualTable && !p.virtualRowHeight) {
        const createDummyRow = () => {
            const row = createElement('div');
            const cell = row.appendChild(createElement('div'));
            const cellInner = cell.appendChild(createElement('div'));
            row.className = `${tableClassName}-row`;
            cell.className = `${tableClassName}-cell`;
            cellInner.innerHTML = '0';
            row.style.visibility = 'hidden';
            row.style.position = 'absolute';
            return row;
        };

        const dummyWrapper = createElement('div');
        dummyWrapper.className = table.el.className;
        setCssProps(dummyWrapper, {
            'z-index': '-1',
            'position': 'absolute',
            'left': '0',
            'top': '-9999px',
            'width': '1px',
            'overflow': 'hidden',
        });

        const dummyTable = createElement('div');
        dummyTable.className = tableClassName;
        dummyWrapper.appendChild(dummyTable);

        const dummyTbody = createElement('div');
        dummyTbody.className = `${tableClassName}-body`;
        dummyTbody.style.width = '99999px';
        dummyTable.appendChild(dummyTbody);

        document.body.appendChild(dummyWrapper);

        const row1 = createDummyRow(), row2 = createDummyRow(), row3 = createDummyRow();
        dummyTbody.appendChild(row1);
        dummyTbody.appendChild(row2);
        dummyTbody.appendChild(row3);

        // Use the middle row for the virtual row height calculation
        p.virtualRowHeight = getElementHeight(row2, true, true, true);

        dummyWrapper.remove();
    }

    // Create inner table and tbody
    if (!p.table) {
        const fragment = document.createDocumentFragment();

        const tableEl = createElement('div');
        tableEl.className = tableClassName;

        if (o.virtualTable) {
            tableEl.className += ' virtual';
        }

        const tableStyle = getComputedStyle(tableEl);

        let tableHeight = ((o.height ?? 0) - getElementHeight(p.header!, true, true, true));
        if (tableStyle.boxSizing !== 'border-box') {
            tableHeight -= parseFloat(tableStyle.borderTopWidth) || 0;
            tableHeight -= parseFloat(tableStyle.borderBottomWidth) || 0;
            tableHeight -= parseFloat(tableStyle.paddingTop) || 0;
            tableHeight -= parseFloat(tableStyle.paddingBottom) || 0;
        }
        setCssProps(tableEl, {
            height: o.height ? tableHeight + 'px' : 'auto',
            display: 'block',
            overflowY: 'auto',
            overflowX: o.width === Width.SCROLL ? 'auto' : 'hidden',
        });
        fragment.appendChild(tableEl);

        const tbody = createElement('div');
        tbody.className = o.tableClassName + '-body';
        tbody.style.minHeight = '1px';
        p.table = tableEl;
        p.tbody = tbody;

        relativizeElement(tbody);
        relativizeElement(tableEl);

        tableEl.appendChild(tbody);
        table.el.appendChild(fragment);
    }

    // In non-virtual mode the table element survives a skeleton re-render,
    // but the list helper was destroyed by renderSkeletonBase(), so recreate it.
    if (!p.virtualListHelper) {
        setupVirtualTable(table);
    }

    return table;
}

/**
 * Size the scroll container so that header + body fill the table height.
 * Must run after the header cells exist, since they determine the header height.
 */
export function updateTableHeight(table: DGTableInterface): DGTableInterface {
    const p = table._p;
    const o = table._o;

    if (!p.table || !p.header)
        return table;

    if (!o.height) {
        p.table.style.height = 'auto';
        return table;
    }

    const tableStyle = getComputedStyle(p.table);

    let tableHeight = o.height - getElementHeight(p.header, true, true, true);
    if (tableStyle.boxSizing !== 'border-box') {
        tableHeight -= parseFloat(tableStyle.borderTopWidth) || 0;
        tableHeight -= parseFloat(tableStyle.borderBottomWidth) || 0;
        tableHeight -= parseFloat(tableStyle.paddingTop) || 0;
        tableHeight -= parseFloat(tableStyle.paddingBottom) || 0;
    }

    p.table.style.height = Math.max(tableHeight, 0) + 'px';

    return table;
}

/**
 * Render skeleton header cells
 */
export function renderSkeletonHeaderCells(table: DGTableInterface): DGTableInterface {
    const p = table._p;
    const o = table._o;

    const tableClassName = o.tableClassName;
    const headerCellClassName = tableClassName + '-header-cell';
    const headerRow = p.headerRow!;

    // Create header cells
    for (let i = 0; i < p.visibleColumns.length; i++) {
        const column = p.visibleColumns[i];
        if (column.visible) {
            const cell = createElement('div') as HeaderCellElement;
            cell.draggable = true;
            cell.className = headerCellClassName;
            cell.style.width = (column.actualWidth ?? 0) + 'px';
            if (o.sortableColumns && column.sortable) {
                cell.className += ' sortable';
            }
            cell.columnName = column.name;
            cell.setAttribute('data-column', column.name);

            const cellInside = createElement('div');
            cellInside.innerHTML = o.headerCellFormatter(column.label, column.name);
            cell.appendChild(cellInside);

            p._bindCellHoverIn(cell);

            headerRow.appendChild(cell);

            p.visibleColumns[i].element = cell;

            bindHeaderColumnEvents(table, cell);
            disableCssSelect(cell);
        }
    }

    updateStickyColumnPositions(table);

    table.emit('headerrowcreate', headerRow);

    return table;
}

/**
 * Destroy header cells
 */
export function destroyHeaderCells(table: DGTableInterface): DGTableInterface {
    const p = table._p;

    if (p.headerRow) {
        p.headerRow = undefined;
    }
    return table;
}

/**
 * Update virtual height
 */
export function updateVirtualHeight(table: DGTableInterface): DGTableInterface {
    const o = table._o, p = table._p;

    if (!p.tbody)
        return table;

    if (o.virtualTable && p.virtualListHelper) {
        const virtualHeight = p.virtualListHelper.estimateFullHeight();
        p._lastVirtualScrollHeight = virtualHeight;
        p.tbody.style.height = virtualHeight + 'px';
    } else {
        p.tbody.style.height = '';
    }

    return table;
}

/**
 * Update last cell width from scrollbar
 */
export function updateLastCellWidthFromScrollbar(table: DGTableInterface, force?: boolean): DGTableInterface {
    const p = table._p;

    if (!p.table) return table;

    const scrollbarWidth = p.table.offsetWidth - p.table.clientWidth;
    if (scrollbarWidth !== p.scrollbarWidth || force) {
        p.scrollbarWidth = scrollbarWidth;
        for (let i = 0; i < p.columns.length; i++) {
            p.columns[i].actualWidthConsideringScrollbarWidth = null;
        }

        if (p.visibleColumns.length > 0 && p.tbody && p.headerRow) {
            const absorbingColIndex = getWidthAbsorbingColumnIndex(table);
            const absorbingColumn = p.visibleColumns[absorbingColIndex];

            // When the scrollbar went away, this restores the full width
            absorbingColumn.actualWidthConsideringScrollbarWidth = p.scrollbarWidth > 0
                ? (absorbingColumn.actualWidth ?? 0) - p.scrollbarWidth
                : null;
            const absorbingColWidth = (absorbingColumn.actualWidthConsideringScrollbarWidth ?? absorbingColumn.actualWidth ?? 0) + 'px';
            forEachRenderedRow(table, row => {
                const cell = row.childNodes[absorbingColIndex] as HTMLElement | undefined;
                if (cell)
                    cell.style.width = absorbingColWidth;
            });

            (p.headerRow.childNodes[absorbingColIndex] as HTMLElement).style.width = absorbingColWidth;
        }

        updateStickyColumnPositions(table);

        p.notifyRendererOfColumnsConfig?.();
    }

    return table;
}

/**
 * Update table width
 */
export function updateTableWidth(table: DGTableInterface, parentSizeMayHaveChanged?: boolean): DGTableInterface {
    const o = table._o, p = table._p;

    if (!p.tbody || !p.table || !p.headerRow) return table;

    const width = calculateTbodyWidth(table);

    p.tbodyMinWidth = width;
    p.tbody.style.minWidth = width + 'px';
    if (p.stickyEndRowsEl)
        p.stickyEndRowsEl.style.minWidth = width + 'px';
    p.headerRow.style.minWidth = (width + (p.scrollbarWidth || 0)) + 'px';

    p.eventsSink.remove(p.table, 'scroll');

    if (o.width === Width.AUTO) {
        setElementWidth(p.table, getElementWidth(p.tbody, true, true, true));
        setElementWidth(table.el, getElementWidth(p.table, true, true, true));
    } else if (o.width === Width.SCROLL) {

        if (parentSizeMayHaveChanged) {
            const lastScrollTop = p.table ? p.table.scrollTop : 0;
            const lastScrollLeft = p.table ? p.table.scrollLeft : 0;

            webkitRenderBugfix(table.el);

            p.table.scrollTop = lastScrollTop;
            p.table.scrollLeft = lastScrollLeft;
            if (p.header) {
                p.header.scrollLeft = lastScrollLeft;
            }
        }

        const boundHandler = () => onTableScrolledHorizontally(table);
        p.eventsSink.add(p.table, 'scroll', boundHandler);
    }

    return table;
}

/**
 * Update sticky column positions
 */
export function updateStickyColumnPositions(table: DGTableInterface): void {
    const p = table._p;
    const o = table._o;

    if (!p.headerRow) return;

    const tableClassName = o.tableClassName;
    const stickyClassName = tableClassName + '-sticky';
    const headerRow = p.headerRow;

    const rtl = isTableRtl(table);
    p.lastIsRtl = rtl;
    const scrollbarWidth = p.scrollbarWidth ?? 0;
    const tableWidth = p.lastDetectedWidth;
    const maxStickyColumnRelativeWidth = o.maxStickyColumnRelativeWidth;
    const maxStickyColumnWidth = typeof maxStickyColumnRelativeWidth === 'number' && tableWidth ? (tableWidth * maxStickyColumnRelativeWidth) : null;

    let stickColLeft = 0;
    let stickColRight = 0;
    let boxSizing: string | null = null;

    const stickiesStart: [HTMLElement, ...HTMLElement[]][] = [];
    const stickiesEnd: [HTMLElement, ...HTMLElement[]][] = [];
    let stickyStartGroup: HTMLElement[] | null = null;
    let stickyEndGroup: HTMLElement[] = [];
    let lastEndStickyCell: HTMLElement | null = null;
    let sumStickyWidth = 0;
    let updatedStickyColumnIndices = [];

    for (let currentCellEl = headerRow.firstElementChild as HTMLElement | null; currentCellEl; currentCellEl = currentCellEl.nextElementSibling as HTMLElement | null) {
        const columnName = currentCellEl.getAttribute('data-column');
        if (!columnName)
            continue;
        const column = p.columns.get(columnName);
        if (!column)
            continue;

        column.headerScrollbarCompensation = 0;

        let isSticky = column.sticky === 'start' || column.sticky === 'end';
        if (isSticky && maxStickyColumnWidth !== null) {
            if ((sumStickyWidth + (column.actualWidth ?? 0)) > maxStickyColumnWidth)
                isSticky = false;
        }

        if (isSticky) {
            let colFullWidth = column.actualWidth ?? 0;
            sumStickyWidth += 0;

            currentCellEl.className += ' ' + stickyClassName;
            currentCellEl.style.position = 'sticky';

            let computedStyle: CSSStyleDeclaration | null = null;
            if (boxSizing === null) {
                computedStyle = getComputedStyle(currentCellEl);
                boxSizing = computedStyle.boxSizing;
            }

            if (boxSizing === 'content-box') {
                if (computedStyle === null)
                    computedStyle = getComputedStyle(currentCellEl);
                colFullWidth += (parseFloat(computedStyle.paddingLeft) || 0) +
                    (parseFloat(computedStyle.paddingRight) || 0) +
                    (parseFloat(computedStyle.borderLeftWidth) || 0) +
                    (parseFloat(computedStyle.borderRightWidth) || 0);
            }

            const isStart = column.sticky === 'start';

            let stickyPos: { direction: 'start' | 'end'; absDirection: 'left' | 'right'; offset: number };

            if (isStart) {
                stickyPos = { direction: 'start', absDirection: rtl ? 'right' : 'left', offset: stickColLeft };
                currentCellEl.style[stickyPos.absDirection] = stickColLeft + 'px';
                stickColLeft += colFullWidth;

                stickyEndGroup.length = 0;

                stickyStartGroup = [currentCellEl];
                stickiesStart.push(stickyStartGroup as [HTMLElement, ...HTMLElement[]]);
            } else {
                lastEndStickyCell = currentCellEl;
                stickyPos = { direction: 'end', absDirection: rtl ? 'left' : 'right', offset: stickColRight };
                currentCellEl.style[stickyPos.absDirection] = (stickColRight + scrollbarWidth) + 'px';
                currentCellEl.style.width = (column.actualWidth ?? 0) + 'px';
                stickColRight += colFullWidth;

                stickiesEnd.push([currentCellEl, ...stickyEndGroup] as [HTMLElement, ...HTMLElement[]]);
                stickyEndGroup.length = 0;
            }

            if (stickyPos.direction !== column.stickyPos?.direction ||
                stickyPos.offset !== column.stickyPos?.offset ||
                stickyPos.absDirection !== column.stickyPos?.absDirection) {
                updatedStickyColumnIndices.push(p.visibleColumns.indexOf(column));
            }
            column.stickyPos = stickyPos;
        } else {
            if (column.stickyPos)
                updatedStickyColumnIndices.push(p.visibleColumns.indexOf(column));

            delete column.stickyPos;
            stickyStartGroup?.push(currentCellEl);
            stickyEndGroup?.push(currentCellEl);

            if (currentCellEl.style.position === 'sticky') {
                currentCellEl.classList.remove(stickyClassName);
                currentCellEl.style.position = '';
                currentCellEl.style.left = '';
                currentCellEl.style.right = '';
            }
        }
    }

    if (lastEndStickyCell) {
        // No peeping behind this sticky
        lastEndStickyCell.style[rtl ? 'left' : 'right'] = '0px';
    }

    p.stickiesStart = stickiesStart;
    p.stickiesEnd = stickiesEnd;

    if (updatedStickyColumnIndices.length > 0) {
        table.refreshAllVirtualRows();
    }

    // Layout changes invalidate sticky geometry even when scrollLeft is unchanged.
    p.lastStickyScrollLeft = undefined;
    syncHorizontalStickies(table);
}

/**
 * Sync horizontal stickies
 */
export function syncHorizontalStickies(table: DGTableInterface): void {
    const p = table._p;

    if (!p.table || !p.headerRow || !p.tbody) return;

    const stickiesStart = p.stickiesStart;
    const stickiesEnd = p.stickiesEnd;

    const oldStickiesSetStart = p.stickiesSetStart;
    const oldStickiesSetEnd = p.stickiesSetEnd;
    const stickiesSetStart = p.stickiesSetStart = new Set<number>();
    const stickiesSetEnd = p.stickiesSetEnd = new Set<number>();

    if (stickiesStart?.length || stickiesEnd?.length) {
        const scrollLeft = p.table.scrollLeft;

        if (scrollLeft === p.lastStickyScrollLeft) return;
        p.lastStickyScrollLeft = scrollLeft;

        const allHeaderCells = p.headerRow.children;
        const tolerance = 1.5;
        const isRtl = p.lastIsRtl;

        let lastEndSticky: [HTMLElement, ...HTMLElement[]] | null = null;

        const processStickies = (stickies: [HTMLElement, ...HTMLElement[]][] | undefined, isStart: boolean, indicesSet: Set<number>) => {
            if (!stickies || !stickies.length) return;

            for (const sticky of stickies) {
                if (!isStart)
                    lastEndSticky = sticky;

                const el = sticky[0];
                const block = sticky.slice(1);

                const first = block[0];
                const last = block[block.length - 1];

                if (!el || !el.getBoundingClientRect) continue;

                const sRect = el.getBoundingClientRect();
                const isLeft = isStart !== isRtl;

                let overlapsFollowing = false;
                if (first && last) {
                    const fRect = first.getBoundingClientRect();
                    const lRect = last.getBoundingClientRect();

                    if (isStart) {
                        if (isRtl)
                            overlapsFollowing = (sRect.right - tolerance) > lRect.left && (sRect.left + tolerance) < fRect.right;
                        else overlapsFollowing = (sRect.right - tolerance) > fRect.left && (sRect.left + tolerance) < lRect.right;
                    } else {
                        if (isRtl)
                            overlapsFollowing = (sRect.left + tolerance) < fRect.right && (sRect.right - tolerance) > lRect.left;
                        else overlapsFollowing = (sRect.left + tolerance) < lRect.right && (sRect.right - tolerance) > fRect.left;
                    }
                }

                el.classList.toggle(isLeft ? 'is-sticky-left' : 'is-sticky-right', overlapsFollowing);

                if (overlapsFollowing) {
                    indicesSet.add(nativeIndexOf.call(allHeaderCells, el));
                }
            }

            if (lastEndSticky) {
                const cellEl = lastEndSticky[0];
                const column = p.columns.get(cellEl.getAttribute('data-column')!);
                const marginProp = isRtl ? 'marginRight' : 'marginLeft';
                const endMarginProp = isRtl ? 'marginLeft' : 'marginRight';

                // reset for proper calculations
                cellEl.style[marginProp] = '';
                cellEl.style[endMarginProp] = '';
                cellEl.style.width = ((column.actualWidthConsideringScrollbarWidth ?? column.actualWidth ?? 0)) + 'px';

                let headerScrollbarCompensation = 0;
                if (p.scrollbarWidth > 0) {
                    const rect = cellEl.getBoundingClientRect();
                    const parentRect = cellEl.offsetParent.getBoundingClientRect();

                    const delta = isRtl ? (rect.left - parentRect.left) : (parentRect.right - rect.right);
                    if (delta <= p.scrollbarWidth) {
                        headerScrollbarCompensation = Math.min(p.scrollbarWidth, Math.max(0, p.scrollbarWidth - delta + 1));

                        if (headerScrollbarCompensation < p.scrollbarWidth) {
                            cellEl.style[marginProp] = `${-headerScrollbarCompensation}px`;
                        } else if (cellEl.nextElementSibling) {
                            // Grows over the scrollbar gutter without pushing the header cells that follow it
                            cellEl.style[endMarginProp] = `${-headerScrollbarCompensation}px`;
                        }
                    }
                }

                column.headerScrollbarCompensation = headerScrollbarCompensation;
                cellEl.style.width = ((column.actualWidthConsideringScrollbarWidth ?? column.actualWidth ?? 0) + headerScrollbarCompensation) + 'px';
            }
        };

        processStickies(stickiesStart, true, stickiesSetStart);
        processStickies(stickiesEnd, false, stickiesSetEnd);
    }

    const newStickies: { index: number; start?: boolean }[] = [];
    const removeStickies: { index: number; start?: boolean }[] = [];

    for (const idx of stickiesSetStart)
        if (!oldStickiesSetStart?.has(idx))
            newStickies.push({ index: idx, start: true });

    for (const idx of stickiesSetEnd)
        if (!oldStickiesSetEnd?.has(idx))
            newStickies.push({ index: idx, start: false });

    if (oldStickiesSetStart) {
        for (const idx of oldStickiesSetStart)
            if (!stickiesSetStart.has(idx))
                removeStickies.push({ index: idx, start: true });
    }

    if (oldStickiesSetEnd) {
        for (const idx of oldStickiesSetEnd)
            if (!stickiesSetEnd.has(idx))
                removeStickies.push({ index: idx, start: false });
    }

    if (!newStickies.length && !removeStickies.length)
        return;

    forEachRenderedRow(table, rowEl => {
        const children = rowEl.children;

        for (const sticky of removeStickies)
            children[sticky.index]?.classList.remove(sticky.start !== p.lastIsRtl ? 'is-sticky-left' : 'is-sticky-right');

        for (const sticky of newStickies)
            children[sticky.index]?.classList.add(sticky.start !== p.lastIsRtl ? 'is-sticky-left' : 'is-sticky-right');
    });

    p.isStickyColumns = new Map();
    for (const idx of stickiesSetStart) p.isStickyColumns.set(idx, 'start');
    for (const idx of stickiesSetEnd) p.isStickyColumns.set(idx, 'end');
}

/**
 * Resize column elements
 */
export function resizeColumnElements(table: DGTableInterface, cellIndex: number): DGTableInterface {
    const p = table._p;
    const o = table._o;

    if (!p.headerRow || !p.tbody) return table;

    const headerCells = p.headerRow.querySelectorAll(`div.${o.tableClassName}-header-cell`) as NodeListOf<HeaderCellElement>;
    const headerCell = headerCells[cellIndex];
    if (!headerCell) return table;

    const col = p.columns.get(headerCell.columnName!);

    if (col) {
        const headerScrollbarCompensation = col.headerScrollbarCompensation ?? 0;
        headerCell.style.width = ((col.actualWidthConsideringScrollbarWidth ?? col.actualWidth ?? 0) + headerScrollbarCompensation) + 'px';

        const width = (col.actualWidthConsideringScrollbarWidth || col.actualWidth || 0) + 'px';
        forEachRenderedRow(table, rowEl => {
            const cell = rowEl.childNodes[cellIndex] as HTMLElement | undefined;
            if (cell)
                cell.style.width = width;
        });
    }

    return table;
}

/**
 * Clear sort arrows
 */
export function clearSortArrows(table: DGTableInterface): DGTableInterface {
    const p = table._p;
    const o = table._o;

    if (p.table && p.headerRow) {
        const tableClassName = o.tableClassName;
        const sortedColumns = scopedSelectorAll(p.headerRow, `>div.${tableClassName}-header-cell.sorted`);
        const arrows = Array.prototype.slice.call(sortedColumns, 0)
            .map((el: HTMLElement) => el.querySelector(':scope>div>.sort-arrow'))
            .filter((el): el is HTMLElement => !!el);
        for (const arrow of arrows) {
            const colEl = arrow.parentNode?.parentNode as HeaderCellElement | null;
            if (colEl) {
                const col = p.columns.get(colEl.columnName!);
                if (col) {
                    col.arrowProposedWidth = 0;
                }
            }
            arrow.remove();
        }
        for (const sortedColumn of sortedColumns) {
            sortedColumn.classList.remove('sorted', 'desc');
        }
    }
    return table;
}

/**
 * Show sort arrow
 */
export function showSortArrow(table: DGTableInterface, column: string, descending: boolean): boolean {
    const p = table._p;
    const o = table._o;

    const col = p.columns.get(column);
    if (!col) return false;

    const arrow = createElement('span');
    arrow.className = 'sort-arrow';

    if (col.element) {
        col.element.className += descending ? ' sorted desc' : ' sorted';
        col.element.firstChild?.insertBefore(arrow, col.element.firstChild.firstChild);
    }

    if (col.widthMode !== ColumnWidthMode.RELATIVE && o.adjustColumnWidthForSortArrow) {
        col.arrowProposedWidth = arrow.scrollWidth +
            (parseFloat(getComputedStyle(arrow).marginRight) || 0) +
            (parseFloat(getComputedStyle(arrow).marginLeft) || 0);
    }

    return true;
}

