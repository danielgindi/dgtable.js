/**
 * Cell preview functionality for DGTable
 */

/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-ignore - No type declarations available for this module
import { getElementWidth, getElementHeight, getElementOffset, setCssProps } from '@danielgindi/dom-utils/lib/Css.js';
import SelectionHelper from './SelectionHelper';
import { disableCssSelect } from './helpers';
import type { RowData } from './types';
import type { DGTableInterface } from './private_types';
import {
    OriginalCellSymbol,
    PreviewCellSymbol,
} from './private_types';
import { bindHeaderColumnEvents } from "./internal";

const nativeIndexOf = Array.prototype.indexOf;
const createElement = document.createElement.bind(document);

// Extended element types for cell preview
interface PreviewCellElement extends HTMLDivElement {
    rowVIndex?: number;
    rowIndex?: number;
    columnName?: string;
    [OriginalCellSymbol]?: HTMLElement;
}

interface CellElement extends HTMLElement {
    [PreviewCellSymbol]?: PreviewCellElement;
}

interface RowElement extends HTMLElement {
    vIndex?: number;
    index?: number;
}

interface ElementOffset {
    left: number;
    top: number;
    right?: number;
}

/**
 * Handle cell mouse over event - show preview if content overflows
 */
export function cellMouseOverEvent(table: DGTableInterface, el: CellElement): void {
    const o = table._o, p = table._p;

    const elInner = el.firstElementChild as HTMLElement;
    if (!elInner) return;

    if (!((elInner.scrollWidth - elInner.clientWidth > 1) ||
        (elInner.scrollHeight - elInner.clientHeight > 1)))
        return;

    hideCellPreview(table);
    p.abortCellPreview = false;

    const rowEl = el.parentElement as RowElement;
    if (!rowEl) return;

    const previewCell = createElement('div') as PreviewCellElement;
    previewCell.innerHTML = el.innerHTML;
    previewCell.className = o.cellPreviewClassName;

    const isHeaderCell = el.classList.contains(`${o.tableClassName}-header-cell`);
    if (isHeaderCell) {
        previewCell.classList.add('header');
        if (el.classList.contains('sortable')) {
            previewCell.classList.add('sortable');
        }

        previewCell.draggable = true;

        bindHeaderColumnEvents(table, previewCell);
    }

    const elStyle = getComputedStyle(el);
    const elInnerStyle = getComputedStyle(elInner);

    const rtl = elStyle.float === 'right';
    const prop = rtl ? 'right' : 'left';

    const paddingL = parseFloat(elStyle.paddingLeft) || 0;
    const paddingR = parseFloat(elStyle.paddingRight) || 0;
    const paddingT = parseFloat(elStyle.paddingTop) || 0;
    const paddingB = parseFloat(elStyle.paddingBottom) || 0;

    let requiredWidth = elInner.scrollWidth + (el.clientWidth - elInner.offsetWidth);

    const borderBox = elStyle.boxSizing === 'border-box';
    if (borderBox) {
        previewCell.style.boxSizing = 'border-box';
    } else {
        requiredWidth -= paddingL + paddingR;
        previewCell.style.marginTop = (parseFloat(elStyle.borderTopWidth) || 0) + 'px';
    }

    if (!p.transparentBgColor1) {
        // Detect browser's transparent spec
        const tempDiv = document.createElement('div');
        document.body.appendChild(tempDiv);
        tempDiv.style.backgroundColor = 'transparent';
        p.transparentBgColor1 = getComputedStyle(tempDiv).backgroundColor;
        tempDiv.style.backgroundColor = 'rgba(0,0,0,0)';
        p.transparentBgColor2 = getComputedStyle(tempDiv).backgroundColor;
        tempDiv.remove();
    }

    const css: Record<string, string | number> = {
        'box-sizing': borderBox ? 'border-box' : 'content-box',
        'width': requiredWidth,
        'min-height': Math.max(getElementHeight(el), /%/.test(elStyle.minHeight) ? 0 : (parseFloat(elStyle.minHeight) || 0)) + 'px',
        'padding-left': paddingL,
        'padding-right': paddingR,
        'padding-top': paddingT,
        'padding-bottom': paddingB,
        'overflow': 'hidden',
        'position': 'absolute',
        'z-index': '-1',
        [prop]: '0',
        'top': '0',
        'cursor': elStyle.cursor,
    };

    let bgColor = elStyle.backgroundColor;
    if (bgColor === p.transparentBgColor1 || bgColor === p.transparentBgColor2) {
        bgColor = getComputedStyle(rowEl).backgroundColor;
    }
    if (bgColor === p.transparentBgColor1 || bgColor === p.transparentBgColor2) {
        bgColor = '#fff';
    }
    css['background-color'] = bgColor;

    setCssProps(previewCell, css);
    if (previewCell.firstChild) {
        setCssProps(previewCell.firstChild as HTMLElement, {
            'direction': elInnerStyle.direction,
            'white-space': elInnerStyle.whiteSpace,
            'min-height': elInnerStyle.minHeight,
            'line-height': elInnerStyle.lineHeight,
            'font': elInnerStyle.font,
        });
    }

    table.el.appendChild(previewCell);

    if (isHeaderCell) {
        disableCssSelect(previewCell);
    }

    previewCell.rowVIndex = rowEl.vIndex;
    const rowIndex = previewCell.rowIndex = rowEl.index;
    previewCell.columnName = p.visibleColumns[nativeIndexOf.call(rowEl.childNodes, el)]?.name;

    try {
        const selection = SelectionHelper.saveSelection(el);
        if (selection)
            SelectionHelper.restoreSelection(previewCell, selection);
    } catch {
        /* we're ok with this */
    }

    table.emit('cellpreview', {
        el: previewCell.firstElementChild,
        name: previewCell.columnName,
        rowIndex: rowIndex ?? null,
        rowData: rowIndex == null ? null : p.rows[rowIndex] as RowData,
        cell: el,
        cellEl: elInner,
    });

    if (p.abortCellPreview) {
        previewCell.remove();
        return;
    }

    if (rowIndex != null) {
        previewCell.addEventListener('click', (event: MouseEvent) => {
            table.emit('rowclick', {
                event: event,
                filteredRowIndex: rowEl.vIndex,
                rowIndex: rowIndex,
                rowEl: rowEl,
                rowData: p.rows[rowIndex] as RowData,
            });
        });
    }

    const parent = table.el;
    const scrollParent = parent === (window as unknown as HTMLElement) ? document : parent;

    const parentStyle = getComputedStyle(parent);

    const offset = getElementOffset(el) as ElementOffset;
    const parentOffset = getElementOffset(parent) as ElementOffset;

    // Handle RTL, go from the other side
    if (rtl) {
        const windowWidth = window.innerWidth;
        offset.right = windowWidth - (offset.left + getElementWidth(el, true, true, true));
        parentOffset.right = windowWidth - (parentOffset.left + getElementWidth(parent, true, true, true));
    }

    // If the parent has borders, then it would offset the offset...
    offset.left -= parseFloat(parentStyle.borderLeftWidth) || 0;
    if (prop === 'right' && offset.right !== undefined && parentOffset.right !== undefined)
        offset.right -= parseFloat(parentStyle.borderRightWidth) || 0;
    offset.top -= parseFloat(parentStyle.borderTopWidth) || 0;

    // Handle border widths of the element being offset
    const borderPropWidth = prop === 'left' ? 'borderLeftWidth' : 'borderRightWidth';
    if (prop === 'left') {
        offset.left += parseFloat(elStyle.borderLeftWidth) || 0;
    } else if (offset.right !== undefined) {
        offset.right += parseFloat(elStyle.borderRightWidth) || 0;
    }
    offset.top += parseFloat(elStyle.borderTopWidth) || parseFloat(elStyle.borderBottomWidth) || 0;

    // Subtract offsets to get offset relative to parent
    offset.left -= parentOffset.left;
    if (prop === 'right' && offset.right !== undefined && parentOffset.right !== undefined)
        offset.right -= parentOffset.right;
    offset.top -= parentOffset.top;

    // Constrain horizontally
    const minHorz = 0;
    const maxHorz = getElementWidth(parent, false, false, false) - getElementWidth(previewCell, true, true, true);
    const horzOffset = prop === 'left' ? offset.left : (offset.right ?? 0);
    const constrainedHorz = horzOffset < minHorz ? minHorz : (horzOffset > maxHorz ? maxHorz : horzOffset);
    if (prop === 'left') {
        offset.left = constrainedHorz;
    } else {
        offset.right = constrainedHorz;
    }

    // Constrain vertically
    const totalHeight = getElementHeight(el, true, true, true);
    const scrollTop = 'scrollTop' in scrollParent ? scrollParent.scrollTop : 0;
    const maxTop = scrollTop + getElementHeight(parent, true) - totalHeight;
    if (offset.top > maxTop) {
        offset.top = Math.max(0, maxTop);
    }

    // Apply css to preview cell
    const previewCss: Record<string, string | number> = {
        'top': offset.top + 'px',
        'z-index': 9999,
    };
    previewCss[prop] = (prop === 'left' ? offset.left : offset.right) + 'px';
    setCssProps(previewCell, previewCss);

    previewCell[OriginalCellSymbol] = el;
    p.cellPreviewCell = previewCell;
    el[PreviewCellSymbol] = previewCell;

    p._bindCellHoverOut(el);
    p._bindCellHoverOut(previewCell);

    // Avoid interfering with wheel scrolling the table
    previewCell.addEventListener('wheel', () => {
        // Let the table naturally scroll with the wheel
        hideCellPreview(table);
    });
}

/**
 * Handle cell mouse out event
 */
export function cellMouseOutEvent(table: DGTableInterface, _el: HTMLElement): void {
    hideCellPreview(table);
}

/**
 * Hide the current cell preview
 */
export function hideCellPreview(table: DGTableInterface): DGTableInterface {
    const p = table._p;

    if (p.cellPreviewCell) {
        const previewCell = p.cellPreviewCell as PreviewCellElement;
        const origCell = previewCell[OriginalCellSymbol] as CellElement;
        let selection;

        try {
            selection = SelectionHelper.saveSelection(previewCell);
        } catch {
            /* we're ok with this */
        }

        p.cellPreviewCell.remove();
        if (origCell) p._unbindCellHoverOut(origCell);
        p._unbindCellHoverOut(previewCell);

        try {
            if (selection && origCell)
                SelectionHelper.restoreSelection(origCell, selection);
        } catch {
            /* we're ok with this */
        }

        table.emit('cellpreviewdestroy', {
            el: previewCell.firstChild,
            name: previewCell.columnName,
            rowIndex: previewCell.rowIndex ?? null,
            rowData: previewCell.rowIndex == null ? null : p.rows[previewCell.rowIndex] as RowData,
            cell: origCell,
            cellEl: origCell?.firstChild,
        });

        if (origCell) {
            delete origCell[PreviewCellSymbol];
        }
        delete previewCell[OriginalCellSymbol];

        p.cellPreviewCell = null;
        p.abortCellPreview = false;
    } else {
        p.abortCellPreview = true;
    }

    return table;
}

