/**
 * Column resize functionality for DGTable
 */

/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-ignore - No type declarations available for this module
import { getElementWidth, getElementHeight, getElementOffset, setCssProps } from '@danielgindi/dom-utils/lib/Css.js';
import { ColumnWidthMode, RelatedTouchSymbol, OriginalCellSymbol } from './constants';
import { isTableRtl, horizontalPadding } from './helpers';
import type { DGTableInterface, Column } from './types';

const createElement = document.createElement.bind(document);

// Extended element types
interface HeaderCellElement extends HTMLElement {
    columnName?: string;
    [OriginalCellSymbol]?: HTMLElement;
}

interface ResizerElement extends HTMLDivElement {
    columnName?: string;
}

type PositionHost = {
    pageX: number;
    clientX?: number;
};

type TouchOrMouseEvent = (MouseEvent | TouchEvent) & {
    [RelatedTouchSymbol]?: PositionHost;
};

/**
 * Reverse-calculate the column to resize from mouse position
 */
export function getColumnByResizePosition(table: DGTableInterface, event: Event): string | null {
    const o = table._o;
    const rtl = isTableRtl(table);

    let headerCell = (event.target as HTMLElement).closest(
        `div.${o.tableClassName}-header-cell,div.${o.cellPreviewClassName}`
    ) as HeaderCellElement | null;

    if (!headerCell) return null;

    if (headerCell[OriginalCellSymbol]) {
        headerCell = headerCell[OriginalCellSymbol] as HeaderCellElement;
    }

    let previousElementSibling = headerCell.previousSibling as HTMLElement | null;
    while (previousElementSibling && previousElementSibling.nodeType !== 1) {
        previousElementSibling = previousElementSibling.previousSibling as HTMLElement | null;
    }

    const firstCol = !previousElementSibling;

    const touchEvent = event as TouchEvent;
    const positionHost = (event as TouchOrMouseEvent)[RelatedTouchSymbol] ?? touchEvent.changedTouches?.[0] ?? event as unknown as PositionHost;
    const mouseX = (positionHost.pageX || positionHost.clientX || 0) - getElementOffset(headerCell).left;

    if (rtl) {
        if (!firstCol && getElementWidth(headerCell, true, true, true) - mouseX <= o.resizeAreaWidth / 2) {
            return (previousElementSibling as HeaderCellElement)?.columnName ?? null;
        } else if (mouseX <= o.resizeAreaWidth / 2) {
            return headerCell.columnName ?? null;
        }
    } else {
        if (!firstCol && mouseX <= o.resizeAreaWidth / 2) {
            return (previousElementSibling as HeaderCellElement)?.columnName ?? null;
        } else if (getElementWidth(headerCell, true, true, true) - mouseX <= o.resizeAreaWidth / 2) {
            return headerCell.columnName ?? null;
        }
    }

    return null;
}

/**
 * Cancel a resize in progress
 */
export function cancelColumnResize(table: DGTableInterface): DGTableInterface {
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
 */
export function onMouseDownColumnHeader(table: DGTableInterface, event: Event): boolean | void {
    const mouseEvent = event as MouseEvent;
    if (event.type === 'mousedown' && mouseEvent.button !== 0)
        return;

    const o = table._o;
    const p = table._p;
    const col = getColumnByResizePosition(table, event);

    if (col) {
        const column = p.columns.get(col);
        if (!o.resizableColumns || !column || !column.resizable) {
            return false;
        }

        const rtl = isTableRtl(table);

        if (p.resizer) {
            p.resizer.remove();
        }
        p.resizer = createElement('div') as ResizerElement;
        p.resizer.className = o.resizerClassName;
        setCssProps(p.resizer, {
            position: 'absolute',
            display: 'block',
            zIndex: '-1',
            visibility: 'hidden',
            width: '2px',
            background: '#000',
            opacity: '0.7',
        });
        table.el.appendChild(p.resizer);

        const selectedHeaderCell = column.element!;
        const commonAncestor = p.resizer.parentNode as HTMLElement;

        const commonAncestorStyle = getComputedStyle(commonAncestor);
        const selectedHeaderCellStyle = getComputedStyle(selectedHeaderCell);

        const posCol = getElementOffset(selectedHeaderCell);
        const posRelative = getElementOffset(commonAncestor);
        posRelative.left += parseFloat(commonAncestorStyle.borderLeftWidth) || 0;
        posRelative.top += parseFloat(commonAncestorStyle.borderTopWidth) || 0;
        posCol.left -= posRelative.left;
        posCol.top -= posRelative.top;
        posCol.top -= parseFloat(selectedHeaderCellStyle.borderTopWidth) || 0;
        const resizerWidth = getElementWidth(p.resizer, true, true, true);
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
        (p.resizer as ResizerElement).columnName = (selectedHeaderCell as HeaderCellElement).columnName;

        try { p.resizer.style.zIndex = ''; }
        catch { /* we're ok with this */ }

        p.eventsSink
            .add(document, 'mousemove.colresize', (e: Event) => onMouseMoveResizeArea(table, e))
            .add(document, 'touchmove.colresize', (e: Event) => onMouseMoveResizeArea(table, e))
            .add(document, 'mouseup.colresize', (e: Event) => onResizerPointerUp(table, e))
            .add(document, 'touchend.colresize', (e: Event) => onResizerPointerUp(table, e));

        event.preventDefault();
    }
}

/**
 * Handle mouse move during column resize
 */
export function onMouseMoveResizeArea(table: DGTableInterface, event: Event): void {
    const p = table._p;

    if (!p.resizer) return;

    const column = p.columns.get((p.resizer as ResizerElement).columnName!);
    if (!column) return;

    const rtl = isTableRtl(table);

    const selectedHeaderCell = column.element!;
    const commonAncestor = p.resizer.parentNode as HTMLElement;

    const commonAncestorStyle = getComputedStyle(commonAncestor);
    const selectedHeaderCellStyle = getComputedStyle(selectedHeaderCell);

    const posCol = getElementOffset(selectedHeaderCell);
    const posRelative = getElementOffset(commonAncestor);
    posRelative.left += parseFloat(commonAncestorStyle.borderLeftWidth) || 0;
    posCol.left -= posRelative.left;
    const resizerWidth = getElementWidth(p.resizer, true, true, true);

    const isBoxing = selectedHeaderCellStyle.boxSizing === 'border-box';

    const touchEvent = event as TouchEvent;
    const positionHost = (event as TouchOrMouseEvent)[RelatedTouchSymbol] ?? touchEvent.changedTouches?.[0] ?? event as unknown as PositionHost;
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
 */
export function onResizerPointerUp(table: DGTableInterface, event: Event): void {
    const o = table._o;
    const p = table._p;

    if (!p.resizer)
        return;

    p.eventsSink.remove(document, '.colresize');

    const column = p.columns.get((p.resizer as ResizerElement).columnName!);
    if (!column) {
        p.resizer.remove();
        p.resizer = null;
        return;
    }

    const rtl = isTableRtl(table);

    const selectedHeaderCell = column.element!;
    const selectedHeaderCellInner = selectedHeaderCell.firstChild as HTMLElement | null;
    const commonAncestor = p.resizer.parentNode as HTMLElement;

    const commonAncestorStyle = getComputedStyle(commonAncestor);
    const selectedHeaderCellStyle = getComputedStyle(selectedHeaderCell);

    const posCol = getElementOffset(selectedHeaderCell);
    const posRelative = getElementOffset(commonAncestor);
    posRelative.left += parseFloat(commonAncestorStyle.borderLeftWidth) || 0;
    posCol.left -= posRelative.left;
    const resizerWidth = getElementWidth(p.resizer, true, true, true);

    const isBoxing = selectedHeaderCellStyle.boxSizing === 'border-box';

    const touchEvent = event as TouchEvent;
    const positionHost = (event as any)[RelatedTouchSymbol] as PositionHost ?? touchEvent.changedTouches?.[0] as PositionHost ?? event as any as PositionHost;
    let actualX = positionHost.pageX - posRelative.left;
    let baseX = posCol.left;
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

        const minX = baseX - (column.ignoreMin ? 0 : table._o.minColumnWidth);
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

        const minX = baseX + (column.ignoreMin ? 0 : table._o.minColumnWidth);
        if (actualX < minX) {
            actualX = minX;
        }

        width = actualX - baseX;
    }

    p.resizer.remove();
    p.resizer = null;

    let sizeToSet: number | string = width;

    if (column.widthMode === ColumnWidthMode.RELATIVE) {
        let sizeLeft = calculateWidthAvailableForColumns(table);

        let totalRelativePercentage = 0;
        let relatives = 0;

        for (let i = 0; i < p.visibleColumns.length; i++) {
            const col = p.visibleColumns[i];
            if (col.name === column.name) continue;

            if (col.widthMode === ColumnWidthMode.RELATIVE) {
                totalRelativePercentage += col.width;
                relatives++;
            } else {
                sizeLeft -= col.actualWidth ?? 0;
            }
        }

        sizeLeft = Math.max(1, sizeLeft);
        if (sizeLeft === 1 && p.table)
            sizeLeft = p.table.clientWidth;
        sizeToSet = width / sizeLeft;

        if (relatives > 0) {
            const unNormalizedSizeToSet = sizeToSet / ((1 - sizeToSet) / totalRelativePercentage);

            totalRelativePercentage += sizeToSet;

            if ((totalRelativePercentage < 1 && o.relativeWidthGrowsToFillWidth) ||
                (totalRelativePercentage > 1 && o.relativeWidthShrinksToFillWidth)) {
                sizeToSet = unNormalizedSizeToSet;
            }
        }

        sizeToSet *= 100;
        sizeToSet = sizeToSet + '%';
    }

    (table as unknown as { setColumnWidth(name: string, width: number | string): void }).setColumnWidth(column.name, sizeToSet);
}

// Import helper function for resize calculations
import { calculateWidthAvailableForColumns } from './helpers';

