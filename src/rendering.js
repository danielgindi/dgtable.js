'use strict';

/**
 * Rendering functionality for DGTable
 */

import VirtualListHelper from '@danielgindi/virtual-list-helper';
import {
    getElementWidth,
    getElementHeight,
    setElementWidth,
    setCssProps,
} from '@danielgindi/dom-utils/lib/Css.js';
import { scopedSelectorAll } from '@danielgindi/dom-utils/lib/DomCompat.js';
import { RowClickEventSymbol, ColumnWidthMode } from './constants.js';
import { Width } from './constants.js';
import {
    relativizeElement,
    webkitRenderBugfix,
    calculateTbodyWidth,
    isTableRtl,
    disableCssSelect,
} from './helpers.js';

const nativeIndexOf = Array.prototype.indexOf;
let createElement = document.createElement.bind(document);

/**
 * Setup virtual table rendering
 * @param {DGTable} table - The DGTable instance
 */
export function setupVirtualTable(table) {
    const p = table._p, o = table._o;

    const tableClassName = o.tableClassName,
        rowClassName = tableClassName + '-row',
        altRowClassName = tableClassName + '-row-alt',
        cellClassName = tableClassName + '-cell',
        stickyClassName = tableClassName + '-sticky';

    let visibleColumns = p.visibleColumns,
        colCount = visibleColumns.length;

    p.notifyRendererOfColumnsConfig = () => {
        visibleColumns = p.visibleColumns;
        colCount = visibleColumns.length;

        for (let colIndex = 0, column; colIndex < colCount; colIndex++) {
            column = visibleColumns[colIndex];
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
        onItemRender: (row, virtualIndex) => {
            const rows = p.filteredRows || p.rows,
                isDataFiltered = !!p.filteredRows,
                allowCellPreview = o.allowCellPreview;

            const isStickyColumns = p.isStickyColumns;

            row.className = rowClassName;
            if ((virtualIndex % 2) === 1)
                row.className += ' ' + altRowClassName;

            let rowData = rows[virtualIndex];
            let rowIndex = isDataFiltered ? rowData['__i'] : virtualIndex;

            row['vIndex'] = virtualIndex;
            row['index'] = rowIndex;

            for (let colIndex = 0; colIndex < colCount; colIndex++) {
                let column = visibleColumns[colIndex];
                let cell = createElement('div');
                cell['columnName'] = column.name;
                cell.setAttribute('data-column', column.name);
                cell.className = cellClassName;
                cell.style.width = column._finalWidth + 'px';
                if (column.cellClasses)
                    cell.className += ' ' + column.cellClasses;

                if (column.stickyPos) {
                    cell.className += ' ' + stickyClassName;
                    cell.style.position = 'sticky';
                    cell.style[column.stickyPos.direction] = column.stickyPos.offset + 'px';

                    const isStickySide = isStickyColumns?.get(colIndex);
                    if (isStickySide === 'left')
                        cell.classList.add('is-sticky-left');
                    else if (isStickySide === 'right')
                        cell.classList.add('is-sticky-right');
                }

                if (allowCellPreview) {
                    p._bindCellHoverIn(cell);
                }

                let cellInner = cell.appendChild(createElement('div'));
                cellInner.innerHTML = table._getHtmlForCell(rowData, column);

                row.appendChild(cell);
            }

            row.addEventListener('click', row[RowClickEventSymbol] = event => {
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

        onItemUnrender: (row) => {
            if (row[RowClickEventSymbol]) {
                row.removeEventListener('click', row[RowClickEventSymbol]);
            }

            table._unbindCellEventsForRow(row);

            table.emit('rowdestroy', row);
        },

        onScrollHeightChange: height => {
            if (height > p._lastVirtualScrollHeight && !p.scrollbarWidth) {
                table._updateLastCellWidthFromScrollbar();
            }

            p._lastVirtualScrollHeight = height;
        },
    });

    p.virtualListHelper.setCount((p.filteredRows ?? p.rows).length);

    p.notifyRendererOfColumnsConfig();
}

/**
 * Render the skeleton base (header structure)
 * @param {DGTable} table - The DGTable instance
 * @returns {DGTable}
 */
export function renderSkeletonBase(table) {
    let p = table._p,
        o = table._o;

    // Clean up old elements
    p.virtualListHelper?.destroy();
    p.virtualListHelper = null;

    if (p.table && o.virtualTable) {
        p.table.remove();
        p.table = p.tbody = null;
    }

    destroyHeaderCells(table);
    p.currentTouchId = null;
    if (p.header) {
        p.header.remove();
    }

    // Create new base elements
    let tableClassName = o.tableClassName,
        header = createElement('div'),
        headerRow = createElement('div');

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
 * @param {DGTable} table - The DGTable instance
 * @returns {DGTable}
 */
export function renderSkeletonBody(table) {
    let p = table._p,
        o = table._o;

    let tableClassName = o.tableClassName;

    // Calculate virtual row heights
    if (o.virtualTable && !p.virtualRowHeight) {
        let createDummyRow = () => {
            let row = createElement('div'),
                cell = row.appendChild(createElement('div')),
                cellInner = cell.appendChild(createElement('div'));
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
            'z-index': -1,
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

        let row1 = createDummyRow(), row2 = createDummyRow(), row3 = createDummyRow();
        dummyTbody.appendChild(row1);
        dummyTbody.appendChild(row2);
        dummyTbody.appendChild(row3);

        p.virtualRowHeightFirst = getElementHeight(row1, true, true, true);
        p.virtualRowHeight = getElementHeight(row2, true, true, true);
        p.virtualRowHeightLast = getElementHeight(row3, true, true, true);

        dummyWrapper.remove();
    }

    // Create inner table and tbody
    if (!p.table) {
        let fragment = document.createDocumentFragment();

        let tableEl = createElement('div');
        tableEl.className = tableClassName;

        if (o.virtualTable) {
            tableEl.className += ' virtual';
        }

        const tableStyle = getComputedStyle(tableEl);

        let tableHeight = (o.height - getElementHeight(p.header, true, true, true));
        if (tableStyle.boxSizing !== 'border-box') {
            tableHeight -= parseFloat(tableStyle.borderTopWidth) || 0;
            tableHeight -= parseFloat(tableStyle.borderBottomWidth) || 0;
            tableHeight -= parseFloat(tableStyle.paddingTop) || 0;
            tableHeight -= parseFloat(tableStyle.paddingBottom) || 0;
        }
        p.visibleHeight = tableHeight;
        setCssProps(tableEl, {
            height: o.height ? tableHeight + 'px' : 'auto',
            display: 'block',
            overflowY: 'auto',
            overflowX: o.width === Width.SCROLL ? 'auto' : 'hidden',
        });
        fragment.appendChild(tableEl);

        let tbody = createElement('div');
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
 * @param {DGTable} table - The DGTable instance
 * @returns {DGTable}
 */
export function renderSkeletonHeaderCells(table) {
    let p = table._p,
        o = table._o;

    let allowCellPreview = o.allowCellPreview,
        allowHeaderCellPreview = o.allowHeaderCellPreview;

    let tableClassName = o.tableClassName,
        headerCellClassName = tableClassName + '-header-cell',
        headerRow = p.headerRow;

    // Create header cells
    for (let i = 0; i < p.visibleColumns.length; i++) {
        let column = p.visibleColumns[i];
        if (column.visible) {
            let cell = createElement('div');
            cell.draggable = true;
            cell.className = headerCellClassName;
            cell.style.width = column.actualWidth + 'px';
            if (o.sortableColumns && column.sortable) {
                cell.className += ' sortable';
            }
            cell['columnName'] = column.name;
            cell.setAttribute('data-column', column.name);

            let cellInside = createElement('div');
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
 * @param {DGTable} table - The DGTable instance
 * @returns {DGTable}
 */
export function destroyHeaderCells(table) {
    let p = table._p;

    if (p.headerRow) {
        p.headerRow = null;
    }
    return table;
}

/**
 * Update virtual height
 * @param {DGTable} table - The DGTable instance
 * @returns {DGTable}
 */
export function updateVirtualHeight(table) {
    const o = table._o, p = table._p;

    if (!p.tbody)
        return table;

    if (o.virtualTable) {
        const virtualHeight = p.virtualListHelper.estimateFullHeight();
        p.lastVirtualScrollHeight = virtualHeight;
        p.tbody.style.height = virtualHeight + 'px';
    } else {
        p.tbody.style.height = '';
    }

    return table;
}

/**
 * Update last cell width from scrollbar
 * @param {DGTable} table - The DGTable instance
 * @param {boolean} [force]
 * @returns {DGTable}
 */
export function updateLastCellWidthFromScrollbar(table, force) {
    const p = table._p;

    let scrollbarWidth = p.table.offsetWidth - p.table.clientWidth;
    if (scrollbarWidth !== p.scrollbarWidth || force) {
        p.scrollbarWidth = scrollbarWidth;
        for (let i = 0; i < p.columns.length; i++) {
            p.columns[i].actualWidthConsideringScrollbarWidth = null;
        }

        if (p.scrollbarWidth > 0 && p.visibleColumns.length > 0) {
            let lastColIndex = p.visibleColumns.length - 1;

            p.visibleColumns[lastColIndex].actualWidthConsideringScrollbarWidth = p.visibleColumns[lastColIndex].actualWidth - p.scrollbarWidth;
            let lastColWidth = p.visibleColumns[lastColIndex].actualWidthConsideringScrollbarWidth + 'px';
            let tbodyChildren = p.tbody.childNodes;
            for (let i = 0, count = tbodyChildren.length; i < count; i++) {
                let row = tbodyChildren[i];
                if (row.nodeType !== 1) continue;
                row.childNodes[lastColIndex].style.width = lastColWidth;
            }

            p.headerRow.childNodes[lastColIndex].style.width = lastColWidth;
        }

        updateStickyColumnPositions(table);

        p.notifyRendererOfColumnsConfig?.();
    }

    return table;
}

/**
 * Update table width
 * @param {DGTable} table - The DGTable instance
 * @param {boolean} parentSizeMayHaveChanged
 * @returns {DGTable}
 */
export function updateTableWidth(table, parentSizeMayHaveChanged) {
    const o = table._o, p = table._p;
    let width = calculateTbodyWidth(table);

    p.tbody.style.minWidth = width + 'px';
    p.headerRow.style.minWidth = (width + (p.scrollbarWidth || 0)) + 'px';

    p.eventsSink.remove(p.table, 'scroll');

    if (o.width === Width.AUTO) {
        setElementWidth(p.table, getElementWidth(p.tbody, true, true, true));
        setElementWidth(table.el, getElementWidth(p.table, true, true, true));

    } else if (o.width === Width.SCROLL) {

        if (parentSizeMayHaveChanged) {
            let lastScrollTop = p.table ? p.table.scrollTop : 0,
                lastScrollLeft = p.table ? p.table.scrollLeft : 0;

            webkitRenderBugfix(table.el);

            p.table.scrollTop = lastScrollTop;
            p.table.scrollLeft = lastScrollLeft;
            p.header.scrollLeft = lastScrollLeft;
        }

        p.eventsSink.add(p.table, 'scroll', table._onTableScrolledHorizontally.bind(table));
    }

    return table;
}

/**
 * Update sticky column positions
 * @param {DGTable} table - The DGTable instance
 */
export function updateStickyColumnPositions(table) {
    const p = table._p,
        o = table._o;

    const tableClassName = o.tableClassName,
        stickyClassName = tableClassName + '-sticky',
        headerRow = p.headerRow;

    const rtl = isTableRtl(table);
    const scrollbarWidth = p.scrollbarWidth ?? 0;

    let stickColLeft = 0;
    let stickColRight = 0;
    let boxSizing = null;

    const stickiesLeft = [];
    const stickiesRight = [];
    let stickyLeftGroup = null;
    let stickyRightGroup = [];

    for (let currentCellEl = headerRow.firstElementChild; currentCellEl; currentCellEl = currentCellEl.nextElementSibling) {
        const columnName = currentCellEl.getAttribute('data-column');
        if (!columnName)
            continue;
        const column = p.columns.get(columnName);
        if (!column)
            continue;

        if (column.sticky === 'start' || column.sticky === 'end') {
            currentCellEl.className += ' ' + stickyClassName;
            currentCellEl.style.position = 'sticky';

            let colFullWidth = column.actualWidth;

            let computedStyle = null;
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

            const isLeft = column.sticky === 'start' && !rtl || column.sticky === 'end' && rtl;

            if (isLeft) {
                column.stickyPos = { direction: 'left', offset: stickColLeft };
                currentCellEl.style.left = stickColLeft + 'px';
                stickColLeft += colFullWidth;

                stickyRightGroup.length = 0;

                stickyLeftGroup = [currentCellEl];
                stickiesLeft.push(stickyLeftGroup);
            } else {
                column.stickyPos = { direction: 'right', offset: stickColRight };
                currentCellEl.style.right = (stickColRight + scrollbarWidth) + 'px';
                stickColRight += colFullWidth;

                stickiesRight.push([currentCellEl, ...stickyRightGroup]);
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
 * @param {DGTable} table - The DGTable instance
 */
export function syncHorizontalStickies(table) {
    const p = table._p;

    const stickiesLeft = p.stickiesLeft;
    const stickiesRight = p.stickiesRight;

    const oldStickiesSetLeft = p.stickiesSetLeft;
    const oldStickiesSetRight = p.stickiesSetRight;
    const stickiesSetLeft = p.stickiesSetLeft = new Set();
    const stickiesSetRight = p.stickiesSetRight = new Set();

    if (stickiesLeft?.length || !stickiesRight?.length) {
        const scrollLeft = p.table.scrollLeft;

        if (scrollLeft === p.lastStickyScrollLeft) return;
        p.lastStickyScrollLeft = scrollLeft;

        const allHeaderCells = p.headerRow.children;
        const tolerance = 1.5;

        const processStickies = (stickies, isLeft, indicesSet) => {
            if (!stickies || !stickies.length) return;

            let stackSize = 0;

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

                stackSize += sRect.width || el.offsetWidth || 0;
            }
        };

        processStickies(stickiesLeft, true, stickiesSetLeft);
        processStickies(stickiesRight, false, stickiesSetRight);
    }

    const newStickies = [];
    const removeStickies = [];

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

    let rowEl = p.tbody.firstElementChild;
    while (rowEl) {
        const children = rowEl.children;

        for (const sticky of removeStickies)
            children[sticky.index]?.classList.remove(sticky.left ? 'is-sticky-left' : 'is-sticky-right');

        for (const sticky of newStickies)
            children[sticky.index]?.classList.add(sticky.left ? 'is-sticky-left' : 'is-sticky-right');

        rowEl = rowEl.nextElementSibling;
    }

    p.isStickyColumns = new Map();
    for (const idx of stickiesSetLeft) p.isStickyColumns.set(idx, 'left');
    for (const idx of stickiesSetRight) p.isStickyColumns.set(idx, 'right');
}

/**
 * Resize column elements
 * @param {DGTable} table - The DGTable instance
 * @param {number} cellIndex
 * @returns {DGTable}
 */
export function resizeColumnElements(table, cellIndex) {
    let p = table._p;
    const o = table._o;

    const headerCells = p.headerRow.querySelectorAll(`div.${o.tableClassName}-header-cell`);
    const headerCell = headerCells[cellIndex];
    let col = p.columns.get(headerCell['columnName']);

    if (col) {
        headerCell.style.width = (col.actualWidthConsideringScrollbarWidth || col.actualWidth) + 'px';

        let width = (col.actualWidthConsideringScrollbarWidth || col.actualWidth) + 'px';
        let tbodyChildren = p.tbody.childNodes;
        for (let i = 0, count = tbodyChildren.length; i < count; i++) {
            let rowEl = tbodyChildren[i];
            if (rowEl.nodeType !== 1) continue;
            rowEl.childNodes[cellIndex].style.width = width;
        }
    }

    return table;
}

/**
 * Clear sort arrows
 * @param {DGTable} table - The DGTable instance
 * @returns {DGTable}
 */
export function clearSortArrows(table) {
    let p = table._p;
    const o = table._o;

    if (p.table) {
        let tableClassName = o.tableClassName;
        let sortedColumns = scopedSelectorAll(p.headerRow, `>div.${tableClassName}-header-cell.sorted`);
        let arrows = Array.prototype.slice.call(sortedColumns, 0).map((el) => el.querySelector(':scope>div>.sort-arrow')).filter((el) => !!el);
        for (const arrow of arrows) {
            let col = p.columns.get(arrow.parentNode.parentNode['columnName']);
            if (col) {
                col.arrowProposedWidth = 0;
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
 * @param {DGTable} table - The DGTable instance
 * @param {string} column
 * @param {boolean} descending
 * @returns {boolean}
 */
export function showSortArrow(table, column, descending) {
    let p = table._p;
    const o = table._o;

    let col = p.columns.get(column);
    if (!col) return false;

    let arrow = createElement('span');
    arrow.className = 'sort-arrow';

    if (col.element) {
        col.element.className += descending ? ' sorted desc' : ' sorted';
        col.element.firstChild.insertBefore(arrow, col.element.firstChild.firstChild);
    }

    if (col.widthMode !== ColumnWidthMode.RELATIVE && o.adjustColumnWidthForSortArrow) {
        col.arrowProposedWidth = arrow.scrollWidth +
            (parseFloat(getComputedStyle(arrow).marginRight) || 0) +
            (parseFloat(getComputedStyle(arrow).marginLeft) || 0);
    }

    return true;
}

