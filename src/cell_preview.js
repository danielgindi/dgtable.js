'use strict';

/**
 * Cell preview functionality for DGTable
 */

import {
    getElementWidth,
    getElementHeight,
    getElementOffset,
    setCssProps,
} from '@danielgindi/dom-utils/lib/Css.js';
import SelectionHelper from './SelectionHelper.js';
import {
    OriginalCellSymbol,
    PreviewCellSymbol,
} from './constants.js';
import { disableCssSelect } from './helpers.js';

const nativeIndexOf = Array.prototype.indexOf;
let createElement = document.createElement.bind(document);

/**
 * Handle cell mouse over event - show preview if content overflows
 * @param {DGTable} table - The DGTable instance
 * @param {HTMLElement} el - The cell element
 */
export function cellMouseOverEvent(table, el) {
    const o = table._o, p = table._p;

    let elInner = el.firstElementChild;

    if (!((elInner.scrollWidth - elInner.clientWidth > 1) ||
        (elInner.scrollHeight - elInner.clientHeight > 1)))
        return;

    hideCellPreview(table);
    p.abortCellPreview = false;

    const rowEl = el.parentElement;
    const previewCell = createElement('div');
    previewCell.innerHTML = el.innerHTML;
    previewCell.className = o.cellPreviewClassName;

    let isHeaderCell = el.classList.contains(`${o.tableClassName}-header-cell`);
    if (isHeaderCell) {
        previewCell.classList.add('header');
        if (el.classList.contains('sortable')) {
            previewCell.classList.add('sortable');
        }

        previewCell.draggable = true;

        table._bindHeaderColumnEvents(previewCell);
    }

    const elStyle = getComputedStyle(el);
    const elInnerStyle = getComputedStyle(elInner);

    let rtl = elStyle.float === 'right';
    let prop = rtl ? 'right' : 'left';

    let paddingL = parseFloat(elStyle.paddingLeft) || 0,
        paddingR = parseFloat(elStyle.paddingRight) || 0,
        paddingT = parseFloat(elStyle.paddingTop) || 0,
        paddingB = parseFloat(elStyle.paddingBottom) || 0;

    let requiredWidth = elInner.scrollWidth + (el.clientWidth - elInner.offsetWidth);

    let borderBox = elStyle.boxSizing === 'border-box';
    if (borderBox) {
        previewCell.style.boxSizing = 'border-box';
    } else {
        requiredWidth -= paddingL + paddingR;
        previewCell.style.marginTop = (parseFloat(elStyle.borderTopWidth) || 0) + 'px';
    }

    if (!p.transparentBgColor1) {
        // Detect browser's transparent spec
        let tempDiv = document.createElement('div');
        document.body.appendChild(tempDiv);
        tempDiv.style.backgroundColor = 'transparent';
        p.transparentBgColor1 = getComputedStyle(tempDiv).backgroundColor;
        tempDiv.style.backgroundColor = 'rgba(0,0,0,0)';
        p.transparentBgColor2 = getComputedStyle(tempDiv).backgroundColor;
        tempDiv.remove();
    }

    let css = {
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
    setCssProps(previewCell.firstChild, {
        'direction': elInnerStyle.direction,
        'white-space': elInnerStyle.whiteSpace,
        'min-height': elInnerStyle.minHeight,
        'line-height': elInnerStyle.lineHeight,
        'font': elInnerStyle.font,
    });

    table.el.appendChild(previewCell);

    if (isHeaderCell) {
        disableCssSelect(previewCell);
    }

    previewCell['rowVIndex'] = rowEl['vIndex'];
    let rowIndex = previewCell['rowIndex'] = rowEl['index'];
    previewCell['columnName'] = p.visibleColumns[nativeIndexOf.call(rowEl.childNodes, el)].name;

    try {
        let selection = SelectionHelper.saveSelection(el);
        if (selection)
            SelectionHelper.restoreSelection(previewCell, selection);
    } catch (ignored) { /* we're ok with this */ }

    table.emit(
        'cellpreview', {
            el: previewCell.firstElementChild,
            name: previewCell['columnName'],
            rowIndex: rowIndex ?? null,
            rowData: rowIndex == null ? null : p.rows[rowIndex],
            cell: el,
            cellEl: elInner,
        },
    );

    if (p.abortCellPreview) {
        previewCell.remove();
        return;
    }

    if (rowIndex != null) {
        previewCell.addEventListener('click', event => {
            table.emit('rowclick', {
                event: event,
                filteredRowIndex: rowEl['vIndex'],
                rowIndex: rowIndex,
                rowEl: rowEl,
                rowData: p.rows[rowIndex],
            });
        });
    }

    let parent = table.el;
    let scrollParent = parent === window ? document : parent;

    const parentStyle = getComputedStyle(parent);

    let offset = getElementOffset(el);
    let parentOffset = getElementOffset(parent);

    // Handle RTL, go from the other side
    if (rtl) {
        let windowWidth = window.innerWidth;
        offset.right = windowWidth - (offset.left + getElementWidth(el, true, true, true));
        parentOffset.right = windowWidth - (parentOffset.left + getElementWidth(parent, true, true, true));
    }

    // If the parent has borders, then it would offset the offset...
    offset.left -= parseFloat(parentStyle.borderLeftWidth) || 0;
    if (prop === 'right')
        offset.right -= parseFloat(parentStyle.borderRightWidth) || 0;
    offset.top -= parseFloat(parentStyle.borderTopWidth) || 0;

    // Handle border widths of the element being offset
    offset[prop] += parseFloat(elStyle[`border-${prop}-width`]) || 0;
    offset.top += parseFloat(elStyle.borderTopWidth) || parseFloat(elStyle.borderBottomWidth) || 0;

    // Subtract offsets to get offset relative to parent
    offset.left -= parentOffset.left;
    if (prop === 'right')
        offset.right -= parentOffset.right;
    offset.top -= parentOffset.top;

    // Constrain horizontally
    let minHorz = 0,
        maxHorz = getElementWidth(parent, false, false, false) - getElementWidth(previewCell, true, true, true);
    offset[prop] = offset[prop] < minHorz ?
        minHorz :
        (offset[prop] > maxHorz ? maxHorz : offset[prop]);

    // Constrain vertically
    let totalHeight = getElementHeight(el, true, true, true);
    let maxTop = scrollParent.scrollTop + getElementHeight(parent, true) - totalHeight;
    if (offset.top > maxTop) {
        offset.top = Math.max(0, maxTop);
    }

    // Apply css to preview cell
    let previewCss = {
        'top': offset.top + 'px',
        'z-index': 9999,
    };
    previewCss[prop] = offset[prop] + 'px';
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
 * @param {DGTable} table - The DGTable instance
 * @param {HTMLElement} _el - The cell element (unused)
 */
export function cellMouseOutEvent(table, _el) {
    hideCellPreview(table);
}

/**
 * Hide the current cell preview
 * @param {DGTable} table - The DGTable instance
 * @returns {DGTable}
 */
export function hideCellPreview(table) {
    const p = table._p;

    if (p.cellPreviewCell) {
        let previewCell = p.cellPreviewCell;
        let origCell = previewCell[OriginalCellSymbol];
        let selection;

        try {
            selection = SelectionHelper.saveSelection(previewCell);
        } catch (ignored) { /* we're ok with this */ }

        p.cellPreviewCell.remove();
        p._unbindCellHoverOut(origCell);
        p._unbindCellHoverOut(previewCell);

        try {
            if (selection)
                SelectionHelper.restoreSelection(origCell, selection);
        } catch (ignored) { /* we're ok with this */ }

        table.emit('cellpreviewdestroy', {
            el: previewCell.firstChild,
            name: previewCell['columnName'],
            rowIndex: previewCell['rowIndex'] ?? null,
            rowData: previewCell['rowIndex'] == null ? null : p.rows[previewCell['rowIndex']],
            cell: origCell,
            cellEl: origCell.firstChild,
        });

        delete origCell[PreviewCellSymbol];
        delete previewCell[OriginalCellSymbol];

        p.cellPreviewCell = null;
        p.abortCellPreview = false;
    } else {
        p.abortCellPreview = true;
    }

    return table;
}

