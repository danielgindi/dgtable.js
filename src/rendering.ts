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
import { RowClickEventSymbol, ColumnWidthMode, Width } from './constants';
import {
    relativizeElement,
    webkitRenderBugfix,
    calculateTbodyWidth,
    isTableRtl,
    disableCssSelect,
} from './helpers';
import type { DGTableInterface, RowData } from './types';

const nativeIndexOf = Array.prototype.indexOf;
const createElement = document.createElement.bind(document);

interface CellElement extends HTMLDivElement {
    columnName?: string;
}

interface HeaderCellElement extends HTMLDivElement {
    columnName?: string;
}

/**
 * Setup virtual table rendering
 */
export function setupVirtualTable(table: DGTableInterface): void {
    const p = table._p, o = table._o;

    const tableClassName = o.tableClassName;
    const rowClassName = tableClassName + '-row';
    const altRowClassName = tableClassName + '-row-alt';
    const cellClassName = tableClassName + '-cell';
    const stickyClassName = tableClassName + '-sticky';

    let visibleColumns = p.visibleColumns;
    let colCount = visibleColumns.length;

    p.notifyRendererOfColumnsConfig = () => {
        visibleColumns = p.visibleColumns;
        colCount = visibleColumns.length;

        for (let colIndex = 0; colIndex < colCount; colIndex++) {
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
        onItemRender: (row: HTMLElement, virtualIndex: number) => {
            const rows = p.filteredRows || p.rows;
            const isDataFiltered = !!p.filteredRows;
            const allowCellPreview = o.allowCellPreview;

            const isStickyColumns = p.isStickyColumns;

            row.className = rowClassName;
            if ((virtualIndex % 2) === 1)
                row.className += ' ' + altRowClassName;

            const rowData = rows[virtualIndex] as RowData;
            const rowIndex = isDataFiltered ? rowData['__i'] : virtualIndex;

            (row as any).vIndex = virtualIndex;
            (row as any).index = rowIndex;

            for (let colIndex = 0; colIndex < colCount; colIndex++) {
                const column = visibleColumns[colIndex];
                const cell = createElement('div') as CellElement;
                cell.columnName = column.name;
                cell.setAttribute('data-column', column.name);
                cell.className = cellClassName;
                cell.style.width = (column._finalWidth ?? 0) + 'px';
                if (column.cellClasses)
                    cell.className += ' ' + column.cellClasses;

                if (column.stickyPos) {
                    cell.className += ' ' + stickyClassName;
                    cell.style.position = 'sticky';
                    (cell.style as any)[column.stickyPos.direction] = column.stickyPos.offset + 'px';

                    const isStickySide = isStickyColumns?.get(colIndex);
                    if (isStickySide === 'left')
                        cell.classList.add('is-sticky-left');
                    else if (isStickySide === 'right')
                        cell.classList.add('is-sticky-right');
                }

                if (allowCellPreview) {
                    p._bindCellHoverIn(cell);
                }

                const cellInner = cell.appendChild(createElement('div'));
                cellInner.innerHTML = table._getHtmlForCell(rowData, column);

                row.appendChild(cell);
            }

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

        onItemUnrender: (row: HTMLElement) => {
            if ((row as any)[RowClickEventSymbol]) {
                row.removeEventListener('click', (row as any)[RowClickEventSymbol]!);
            }

            table._unbindCellEventsForRow(row);

            table.emit('rowdestroy', row);
        },

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
 * Render the skeleton base (header structure)
 */
export function renderSkeletonBase(table: DGTableInterface): DGTableInterface {
    const p = table._p;
    const o = table._o;

    // Clean up old elements
    p.virtualListHelper?.destroy();
    p.virtualListHelper = null;

    if (p.table && o.virtualTable) {
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

        setupVirtualTable(table);
    }

    return table;
}

/**
 * Render skeleton header cells
 */
export function renderSkeletonHeaderCells(table: DGTableInterface): DGTableInterface {
    const p = table._p;
    const o = table._o;

    const allowCellPreview = o.allowCellPreview;
    const allowHeaderCellPreview = o.allowHeaderCellPreview;

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
            if (allowCellPreview && allowHeaderCellPreview) {
                p._bindCellHoverIn(cell);
            }

            headerRow.appendChild(cell);

            p.visibleColumns[i].element = cell;

            table._bindHeaderColumnEvents(cell);
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

        if (p.scrollbarWidth > 0 && p.visibleColumns.length > 0 && p.tbody && p.headerRow) {
            const lastColIndex = p.visibleColumns.length - 1;

            p.visibleColumns[lastColIndex].actualWidthConsideringScrollbarWidth =
                (p.visibleColumns[lastColIndex].actualWidth ?? 0) - p.scrollbarWidth;
            const lastColWidth = p.visibleColumns[lastColIndex].actualWidthConsideringScrollbarWidth + 'px';
            const tbodyChildren = p.tbody.childNodes;
            for (let i = 0, count = tbodyChildren.length; i < count; i++) {
                const row = tbodyChildren[i] as HTMLElement;
                if (row.nodeType !== 1) continue;
                (row.childNodes[lastColIndex] as HTMLElement).style.width = lastColWidth;
            }

            (p.headerRow.childNodes[lastColIndex] as HTMLElement).style.width = lastColWidth;
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

    p.tbody.style.minWidth = width + 'px';
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

        const boundHandler = (table as unknown as { _onTableScrolledHorizontally(): void })._onTableScrolledHorizontally.bind(table);
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
    const scrollbarWidth = p.scrollbarWidth ?? 0;

    let stickColLeft = 0;
    let stickColRight = 0;
    let boxSizing: string | null = null;

    const stickiesLeft: [HTMLElement, ...HTMLElement[]][] = [];
    const stickiesRight: [HTMLElement, ...HTMLElement[]][] = [];
    let stickyLeftGroup: HTMLElement[] | null = null;
    let stickyRightGroup: HTMLElement[] = [];

    for (let currentCellEl = headerRow.firstElementChild as HTMLElement | null; currentCellEl; currentCellEl = currentCellEl.nextElementSibling as HTMLElement | null) {
        const columnName = currentCellEl.getAttribute('data-column');
        if (!columnName)
            continue;
        const column = p.columns.get(columnName);
        if (!column)
            continue;

        if (column.sticky === 'start' || column.sticky === 'end') {
            currentCellEl.className += ' ' + stickyClassName;
            currentCellEl.style.position = 'sticky';

            let colFullWidth = column.actualWidth ?? 0;

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

            const isLeft = (column.sticky === 'start' && !rtl) || (column.sticky === 'end' && rtl);

            if (isLeft) {
                column.stickyPos = { direction: 'left', offset: stickColLeft };
                currentCellEl.style.left = stickColLeft + 'px';
                stickColLeft += colFullWidth;

                stickyRightGroup.length = 0;

                stickyLeftGroup = [currentCellEl];
                stickiesLeft.push(stickyLeftGroup as [HTMLElement, ...HTMLElement[]]);
            } else {
                column.stickyPos = { direction: 'right', offset: stickColRight };
                currentCellEl.style.right = (stickColRight + scrollbarWidth) + 'px';
                stickColRight += colFullWidth;

                stickiesRight.push([currentCellEl, ...stickyRightGroup] as [HTMLElement, ...HTMLElement[]]);
                stickyRightGroup.length = 0;
            }
        } else {
            delete column.stickyPos;
            stickyLeftGroup?.push(currentCellEl);
            stickyRightGroup?.push(currentCellEl);

            if (currentCellEl.style.position === 'sticky') {
                currentCellEl.classList.remove(stickyClassName);
                currentCellEl.style.position = '';
                currentCellEl.style.left = '';
                currentCellEl.style.right = '';
            }
        }
    }

    p.stickiesLeft = stickiesLeft;
    p.stickiesRight = stickiesRight;

    syncHorizontalStickies(table);
}

/**
 * Sync horizontal stickies
 */
export function syncHorizontalStickies(table: DGTableInterface): void {
    const p = table._p;

    if (!p.table || !p.headerRow || !p.tbody) return;

    const stickiesLeft = p.stickiesLeft;
    const stickiesRight = p.stickiesRight;

    const oldStickiesSetLeft = p.stickiesSetLeft;
    const oldStickiesSetRight = p.stickiesSetRight;
    const stickiesSetLeft = p.stickiesSetLeft = new Set<number>();
    const stickiesSetRight = p.stickiesSetRight = new Set<number>();

    if (stickiesLeft?.length || !stickiesRight?.length) {
        const scrollLeft = p.table.scrollLeft;

        if (scrollLeft === p.lastStickyScrollLeft) return;
        p.lastStickyScrollLeft = scrollLeft;

        const allHeaderCells = p.headerRow.children;
        const tolerance = 1.5;

        const processStickies = (stickies: [HTMLElement, ...HTMLElement[]][] | undefined, isLeft: boolean, indicesSet: Set<number>) => {
            if (!stickies || !stickies.length) return;

            for (const sticky of stickies) {
                const el = sticky[0];
                const block = sticky.slice(1);

                const first = block[0];
                const last = block[block.length - 1];

                if (!el || !el.getBoundingClientRect) continue;

                const sRect = el.getBoundingClientRect();

                let overlapsFollowing = false;
                if (first && last) {
                    const fRect = first.getBoundingClientRect();
                    const lRect = last.getBoundingClientRect();

                    if (isLeft) {
                        overlapsFollowing = (sRect.right - tolerance) > fRect.left && (sRect.left + tolerance) < lRect.right;
                    } else {
                        overlapsFollowing = (sRect.left + tolerance) < lRect.right && (sRect.right - tolerance) > fRect.left;
                    }
                }

                el.classList.toggle(isLeft ? 'is-sticky-left' : 'is-sticky-right', overlapsFollowing);

                if (overlapsFollowing) {
                    indicesSet.add(nativeIndexOf.call(allHeaderCells, el));
                }
            }
        };

        processStickies(stickiesLeft, true, stickiesSetLeft);
        processStickies(stickiesRight, false, stickiesSetRight);
    }

    const newStickies: { index: number; left?: boolean; right?: boolean }[] = [];
    const removeStickies: { index: number; left?: boolean; right?: boolean }[] = [];

    for (const idx of stickiesSetLeft)
        if (!oldStickiesSetLeft?.has(idx))
            newStickies.push({ index: idx, left: true });

    for (const idx of stickiesSetRight)
        if (!oldStickiesSetRight?.has(idx))
            newStickies.push({ index: idx, right: true });

    if (oldStickiesSetLeft) {
        for (const idx of oldStickiesSetLeft)
            if (!stickiesSetLeft.has(idx))
                removeStickies.push({ index: idx, left: true });
    }

    if (oldStickiesSetRight) {
        for (const idx of oldStickiesSetRight)
            if (!stickiesSetRight.has(idx))
                removeStickies.push({ index: idx, right: true });
    }

    if (!newStickies.length && !removeStickies.length)
        return;

    let rowEl = p.tbody.firstElementChild as HTMLElement | null;
    while (rowEl) {
        const children = rowEl.children;

        for (const sticky of removeStickies)
            children[sticky.index]?.classList.remove(sticky.left ? 'is-sticky-left' : 'is-sticky-right');

        for (const sticky of newStickies)
            children[sticky.index]?.classList.add(sticky.left ? 'is-sticky-left' : 'is-sticky-right');

        rowEl = rowEl.nextElementSibling as HTMLElement | null;
    }

    p.isStickyColumns = new Map();
    for (const idx of stickiesSetLeft) p.isStickyColumns.set(idx, 'left');
    for (const idx of stickiesSetRight) p.isStickyColumns.set(idx, 'right');
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
        headerCell.style.width = (col.actualWidthConsideringScrollbarWidth || col.actualWidth || 0) + 'px';

        const width = (col.actualWidthConsideringScrollbarWidth || col.actualWidth || 0) + 'px';
        const tbodyChildren = p.tbody.childNodes;
        for (let i = 0, count = tbodyChildren.length; i < count; i++) {
            const rowEl = tbodyChildren[i] as HTMLElement;
            if (rowEl.nodeType !== 1) continue;
            (rowEl.childNodes[cellIndex] as HTMLElement).style.width = width;
        }
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

