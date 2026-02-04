'use strict';

/**
 * Column resize functionality for DGTable
 */

import {
    getElementWidth,
    getElementHeight,
    getElementOffset,
    setCssProps,
} from '@danielgindi/dom-utils/lib/Css.js';
import { ColumnWidthMode, RelatedTouch, OriginalCellSymbol } from './constants.js';
import { isTableRtl, horizontalPadding } from './helpers.js';

let createElement = document.createElement.bind(document);

/**
 * Reverse-calculate the column to resize from mouse position
 * @param {DGTable} table - The DGTable instance
 * @param {MouseEvent|TouchEvent} event
 * @returns {string|null} name of the column which the mouse is over
 */
export function getColumnByResizePosition(table, event) {
    let o = table._o,
        rtl = isTableRtl(table);

    let headerCell = event.target.closest(`div.${o.tableClassName}-header-cell,div.${o.cellPreviewClassName}`);
    if (headerCell[OriginalCellSymbol]) {
        headerCell = headerCell[OriginalCellSymbol];
    }

    let previousElementSibling = headerCell.previousSibling;
    while (previousElementSibling && previousElementSibling.nodeType !== 1) {
        previousElementSibling = previousElementSibling.previousSibling;
    }

    let firstCol = !previousElementSibling;

    const positionHost = event[RelatedTouch] ?? event.changedTouches?.[0] ?? event;
    let mouseX = (positionHost.pageX || positionHost.clientX) - getElementOffset(headerCell).left;

    if (rtl) {
        if (!firstCol && getElementWidth(headerCell, true, true, true) - mouseX <= o.resizeAreaWidth / 2) {
            return previousElementSibling['columnName'];
        } else if (mouseX <= o.resizeAreaWidth / 2) {
            return headerCell['columnName'];
        }
    } else {
        if (!firstCol && mouseX <= o.resizeAreaWidth / 2) {
            return previousElementSibling['columnName'];
        } else if (getElementWidth(headerCell, true, true, true) - mouseX <= o.resizeAreaWidth / 2) {
            return headerCell['columnName'];
        }
    }

    return null;
}

/**
 * Cancel a resize in progress
 * @param {DGTable} table - The DGTable instance
 * @returns {DGTable}
 */
export function cancelColumnResize(table) {
    const p = table._p;

    if (p.resizer) {
        p.resizer.remove();
        p.resizer = null;
        p.eventsSink.remove(document, '.colresize');
    }

    return table;
}

/**
 * Handle mouse down on column header for resize
 * @param {DGTable} table - The DGTable instance
 * @param {MouseEvent|TouchEvent} event
 */
export function onMouseDownColumnHeader(table, event) {
    if (event.type === 'mousedown' && event.button !== 0)
        return;

    let o = table._o,
        p = table._p,
        col = getColumnByResizePosition(table, event);

    if (col) {
        let column = p.columns.get(col);
        if (!o.resizableColumns || !column || !column.resizable) {
            return false;
        }

        let rtl = isTableRtl(table);

        if (p.resizer) {
            p.resizer.remove();
        }
        p.resizer = createElement('div');
        p.resizer.className = o.resizerClassName;
        setCssProps(p.resizer, {
            position: 'absolute',
            display: 'block',
            zIndex: -1,
            visibility: 'hidden',
            width: '2px',
            background: '#000',
            opacity: 0.7,
        });
        table.el.appendChild(p.resizer);

        let selectedHeaderCell = column.element,
            commonAncestor = p.resizer.parentNode;

        const commonAncestorStyle = getComputedStyle(commonAncestor);
        const selectedHeaderCellStyle = getComputedStyle(selectedHeaderCell);

        let posCol = getElementOffset(selectedHeaderCell),
            posRelative = getElementOffset(commonAncestor);
        posRelative.left += parseFloat(commonAncestorStyle.borderLeftWidth) || 0;
        posRelative.top += parseFloat(commonAncestorStyle.borderTopWidth) || 0;
        posCol.left -= posRelative.left;
        posCol.top -= posRelative.top;
        posCol.top -= parseFloat(selectedHeaderCellStyle.borderTopWidth) || 0;
        let resizerWidth = getElementWidth(p.resizer, true, true, true);
        if (rtl) {
            posCol.left -= Math.ceil((parseFloat(selectedHeaderCellStyle.borderLeftWidth) || 0) / 2);
            posCol.left -= Math.ceil(resizerWidth / 2);
        } else {
            posCol.left += getElementWidth(selectedHeaderCell, true, true, true);
            posCol.left += Math.ceil((parseFloat(selectedHeaderCellStyle.borderRightWidth) || 0) / 2);
            posCol.left -= Math.ceil(resizerWidth / 2);
        }

        setCssProps(p.resizer, {
            'z-index': '10',
            'visibility': 'visible',
            'left': posCol.left + 'px',
            'top': posCol.top + 'px',
            'height': getElementHeight(table.el, false, false, false) + 'px',
        });
        p.resizer['columnName'] = selectedHeaderCell['columnName'];

        try { p.resizer.style.zIndex = ''; }
        catch (ignored) { /* we're ok with this */ }

        p.eventsSink
            .add(document, 'mousemove.colresize', (e) => onMouseMoveResizeArea(table, e))
            .add(document, 'touchmove.colresize', (e) => onMouseMoveResizeArea(table, e))
            .add(document, 'mouseup.colresize', (e) => onResizerPointerUp(table, e))
            .add(document, 'touchend.colresize', (e) => onResizerPointerUp(table, e));

        event.preventDefault();
    }
}

/**
 * Handle mouse move during column resize
 * @param {DGTable} table - The DGTable instance
 * @param {MouseEvent|TouchEvent} event
 */
export function onMouseMoveResizeArea(table, event) {
    let p = table._p;

    let column = p.columns.get(p.resizer['columnName']);
    let rtl = isTableRtl(table);

    let selectedHeaderCell = column.element,
        commonAncestor = p.resizer.parentNode;

    const commonAncestorStyle = getComputedStyle(commonAncestor);
    const selectedHeaderCellStyle = getComputedStyle(selectedHeaderCell);

    let posCol = getElementOffset(selectedHeaderCell),
        posRelative = getElementOffset(commonAncestor);
    posRelative.left += parseFloat(commonAncestorStyle.borderLeftWidth) || 0;
    posCol.left -= posRelative.left;
    let resizerWidth = getElementWidth(p.resizer, true, true, true);

    let isBoxing = selectedHeaderCellStyle.boxSizing === 'border-box';

    const positionHost = event[RelatedTouch] ?? event.changedTouches?.[0] ?? event;
    let actualX = positionHost.pageX - posRelative.left;
    let minX = posCol.left;

    minX -= Math.ceil(resizerWidth / 2);

    if (rtl) {
        minX += getElementWidth(selectedHeaderCell, true, true, true);
        minX -= column.ignoreMin ? 0 : table._o.minColumnWidth;

        if (!isBoxing) {
            minX -= Math.ceil((parseFloat(selectedHeaderCellStyle.borderLeftWidth) || 0) / 2);
            minX -= horizontalPadding(selectedHeaderCell);
        }

        if (actualX > minX) {
            actualX = minX;
        }
    } else {
        minX += column.ignoreMin ? 0 : table._o.minColumnWidth;

        if (!isBoxing) {
            minX += Math.ceil((parseFloat(selectedHeaderCellStyle.borderRightWidth) || 0) / 2);
            minX += horizontalPadding(selectedHeaderCell);
        }

        if (actualX < minX) {
            actualX = minX;
        }
    }

    p.resizer.style.left = actualX + 'px';
}

/**
 * Handle pointer up after resize
 * @param {DGTable} table - The DGTable instance
 * @param {MouseEvent|TouchEvent} event
 */
export function onResizerPointerUp(table, event) {
    let o = table._o,
        p = table._p;

    if (!p.resizer)
        return;

    p.eventsSink.remove(document, '.colresize');

    let column = p.columns.get(p.resizer['columnName']);
    let rtl = isTableRtl(table);

    let selectedHeaderCell = column.element,
        selectedHeaderCellInner = selectedHeaderCell.firstChild,
        commonAncestor = p.resizer.parentNode;

    const commonAncestorStyle = getComputedStyle(commonAncestor);
    const selectedHeaderCellStyle = getComputedStyle(selectedHeaderCell);

    let posCol = getElementOffset(selectedHeaderCell),
        posRelative = getElementOffset(commonAncestor);
    posRelative.left += parseFloat(commonAncestorStyle.borderLeftWidth) || 0;
    posCol.left -= posRelative.left;
    let resizerWidth = getElementWidth(p.resizer, true, true, true);

    let isBoxing = selectedHeaderCellStyle.boxSizing === 'border-box';

    const positionHost = event[RelatedTouch] ?? event.changedTouches?.[0] ?? event;
    let actualX = positionHost.pageX - posRelative.left;
    let baseX = posCol.left, minX = posCol.left;
    let width = 0;

    baseX -= Math.ceil(resizerWidth / 2);

    if (rtl) {
        if (!isBoxing) {
            actualX += horizontalPadding(selectedHeaderCell);
            const innerComputedStyle = getComputedStyle(selectedHeaderCellInner || selectedHeaderCell);
            actualX += parseFloat(innerComputedStyle.borderLeftWidth) || 0;
            actualX += parseFloat(innerComputedStyle.borderRightWidth) || 0;
            actualX += column.arrowProposedWidth || 0;
        }

        baseX += getElementWidth(selectedHeaderCell, true, true, true);

        minX = baseX - (column.ignoreMin ? 0 : table._o.minColumnWidth);
        if (actualX > minX) {
            actualX = minX;
        }

        width = baseX - actualX;
    } else {
        if (!isBoxing) {
            actualX -= horizontalPadding(selectedHeaderCell);
            const innerComputedStyle = getComputedStyle(selectedHeaderCellInner || selectedHeaderCell);
            actualX -= parseFloat(innerComputedStyle.borderLeftWidth) || 0;
            actualX -= parseFloat(innerComputedStyle.borderRightWidth) || 0;
            actualX -= column.arrowProposedWidth || 0;
        }

        minX = baseX + (column.ignoreMin ? 0 : table._o.minColumnWidth);
        if (actualX < minX) {
            actualX = minX;
        }

        width = actualX - baseX;
    }

    p.resizer.remove();
    p.resizer = null;

    let sizeToSet = width;

    if (column.widthMode === ColumnWidthMode.RELATIVE) {
        let sizeLeft = table._calculateWidthAvailableForColumns();

        let totalRelativePercentage = 0;
        let relatives = 0;

        for (let i = 0; i < p.visibleColumns.length; i++) {
            let col = p.visibleColumns[i];
            if (col.name === column.name) continue;

            if (col.widthMode === ColumnWidthMode.RELATIVE) {
                totalRelativePercentage += col.width;
                relatives++;
            } else {
                sizeLeft -= col.actualWidth;
            }
        }

        sizeLeft = Math.max(1, sizeLeft);
        if (sizeLeft === 1)
            sizeLeft = p.table.clientWidth;
        sizeToSet = width / sizeLeft;

        if (relatives > 0) {
            let unNormalizedSizeToSet = sizeToSet / ((1 - sizeToSet) / totalRelativePercentage);

            totalRelativePercentage += sizeToSet;

            if ((totalRelativePercentage < 1 && o.relativeWidthGrowsToFillWidth) ||
                (totalRelativePercentage > 1 && o.relativeWidthShrinksToFillWidth)) {
                sizeToSet = unNormalizedSizeToSet;
            }
        }

        sizeToSet *= 100;
        sizeToSet += '%';
    }

    table.setColumnWidth(column.name, sizeToSet);
}

