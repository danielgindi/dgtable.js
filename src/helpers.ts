/**
 * Helper functions for DGTable
 * These are extracted to keep the main class focused on public API
 */

/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-ignore - No type declarations available for this module
import { getElementWidth, setCssProps } from '@danielgindi/dom-utils/lib/Css.js';

import { ColumnWidthMode } from './constants';
import type { Column, DGTableInterface } from './types';

const createElement = document.createElement.bind(document);

/**
 * BUGFIX: WebKit has a bug where it does not relayout
 */
export function webkitRenderBugfix(el: HTMLElement): HTMLElement {
    const oldDisplay = el.style.display;
    el.style.display = 'none';
    // No need to store this anywhere, the reference is enough
    void el.offsetHeight;
    el.style.display = oldDisplay;
    return el;
}

/**
 * Make element relative if not already positioned
 */
export function relativizeElement(el: HTMLElement): void {
    if (!['relative', 'absolute', 'fixed'].includes(getComputedStyle(el).position)) {
        el.style.position = 'relative';
    }
}

/**
 * Check if event target is an input element
 */
export function isInputElementEvent(event: Event): boolean {
    const target = event.target as HTMLElement;
    return /^(?:INPUT|TEXTAREA|BUTTON|SELECT)$/.test(target.tagName);
}

/**
 * Calculate horizontal padding of an element
 */
export function horizontalPadding(el: Element): number {
    const style = getComputedStyle(el);
    return ((parseFloat(style.paddingLeft) || 0) +
        (parseFloat(style.paddingRight) || 0));
}

/**
 * Calculate horizontal border width of an element
 */
export function horizontalBorderWidth(el: Element): number {
    const style = getComputedStyle(el);
    return ((parseFloat(style.borderLeftWidth) || 0) +
        (parseFloat(style.borderRightWidth) || 0));
}

/**
 * Disable CSS text selection on an element
 */
export function disableCssSelect(el: HTMLElement): void {
    const style = el.style as CSSStyleDeclaration & Record<string, string>;
    style['-webkit-touch-callout'] = 'none';
    style['-webkit-user-select'] = 'none';
    style['-moz-user-select'] = 'none';
    style['-ms-user-select'] = 'none';
    style['-o-user-select'] = 'none';
    style['user-select'] = 'none';
}

/**
 * Get text width by measuring in a temporary element
 */
export function getTextWidth(table: DGTableInterface, text: string): number {
    const tableClassName = table._o.tableClassName;

    const tableWrapper = createElement('div');
    tableWrapper.className = table.el.className;
    const header = createElement('div');
    header.className = tableClassName + '-header';
    const headerRow = createElement('div');
    headerRow.className = tableClassName + '-header-row';
    const cell = createElement('div');
    cell.className = tableClassName + '-header-cell';
    const cellContent = createElement('div');
    cellContent.textContent = text;

    cell.appendChild(cellContent);
    headerRow.appendChild(cell);
    header.appendChild(headerRow);
    tableWrapper.appendChild(header);
    setCssProps(tableWrapper, {
        position: 'absolute',
        top: '-9999px',
        visibility: 'hidden',
    });

    document.body.appendChild(tableWrapper);

    const width = getElementWidth(cell);

    tableWrapper.remove();

    return width;
}

/**
 * Calculate width available for columns
 */
export function calculateWidthAvailableForColumns(table: DGTableInterface): number {
    const o = table._o, p = table._p;

    // Changing display mode briefly, to prevent taking in account the parent's scrollbar width when we are the cause for it
    let oldDisplay: string | undefined;
    let lastScrollTop = 0;
    let lastScrollLeft = 0;
    if (p.table) {
        lastScrollTop = p.table ? p.table.scrollTop : 0;
        lastScrollLeft = p.table ? p.table.scrollLeft : 0;

        if (o.virtualTable) {
            oldDisplay = p.table.style.display;
            p.table.style.display = 'none';
        }
    }

    let detectedWidth = getElementWidth(table.el);

    if (p.table) {
        if (o.virtualTable && oldDisplay !== undefined) {
            p.table.style.display = oldDisplay;
        }

        p.table.scrollTop = lastScrollTop;
        p.table.scrollLeft = lastScrollLeft;
        if (p.header) {
            p.header.scrollLeft = lastScrollLeft;
        }
    }

    const tableClassName = o.tableClassName;

    const thisWrapper = createElement('div');
    thisWrapper.className = table.el.className;
    setCssProps(thisWrapper, {
        'z-index': '-1',
        'position': 'absolute',
        left: '0',
        top: '-9999px',
    });
    const header = createElement('div');
    header.className = `${tableClassName}-header`;
    thisWrapper.appendChild(header);
    const headerRow = createElement('div') as HTMLDivElement & { index: null; vIndex: null };
    headerRow.index = null;
    headerRow.vIndex = null;
    headerRow.className = `${tableClassName}-header-row`;
    header.appendChild(headerRow);
    for (let i = 0; i < p.visibleColumns.length; i++) {
        const column = p.visibleColumns[i];
        const cell = createElement('div') as HTMLDivElement & { columnName: string };
        cell.className = `${tableClassName}-header-cell ${column.cellClasses || ''}`;
        cell.columnName = column.name;
        cell.appendChild(createElement('div'));
        headerRow.appendChild(cell);
    }
    document.body.appendChild(thisWrapper);

    detectedWidth -= horizontalBorderWidth(headerRow);

    const cells = headerRow.querySelectorAll(`div.${tableClassName}-header-cell`) as NodeListOf<HTMLDivElement & { columnName: string }>;
    for (const cell of cells) {
        const cellStyle = getComputedStyle(cell);
        const isBoxing = cellStyle.boxSizing === 'border-box';
        if (!isBoxing) {
            detectedWidth -=
                (parseFloat(cellStyle.borderRightWidth) || 0) +
                (parseFloat(cellStyle.borderLeftWidth) || 0) +
                (horizontalPadding(cell)); // CELL's padding

            const colName = cell.columnName;
            const column = p.columns.get(colName);
            if (column)
                detectedWidth -= column.arrowProposedWidth || 0;
        }
    }

    thisWrapper.remove();

    return Math.max(0, detectedWidth);
}

/**
 * Calculate the size required for the table body width
 */
export function calculateTbodyWidth(table: DGTableInterface): number {
    const p = table._p;
    const o = table._o;

    const tableClassName = o.tableClassName;
    const rowClassName = tableClassName + '-row';
    const cellClassName = tableClassName + '-cell';
    const visibleColumns = p.visibleColumns;
    const colCount = visibleColumns.length;

    const row = createElement('div');
    row.className = rowClassName;
    row.style.float = 'left';

    let sumActualWidth = 0;

    for (let colIndex = 0; colIndex < colCount; colIndex++) {
        const column = visibleColumns[colIndex];
        const cell = createElement('div');
        cell.className = cellClassName;
        cell.style.width = (column.actualWidth ?? 0) + 'px';
        if (column.cellClasses) cell.className += ' ' + column.cellClasses;
        cell.appendChild(createElement('div'));
        row.appendChild(cell);
        sumActualWidth += column.actualWidth ?? 0;
    }

    const thisWrapper = createElement('div');
    thisWrapper.className = table.el.className;
    setCssProps(thisWrapper, {
        'z-index': '-1',
        'position': 'absolute',
        'left': '0',
        'top': '-9999px',
        'float': 'left',
        'width': '1px',
        'overflow': 'hidden',
    });

    const tableDiv = createElement('div');
    tableDiv.className = tableClassName;
    thisWrapper.appendChild(tableDiv);
    const tableBodyDiv = createElement('div');
    tableBodyDiv.className = tableClassName + '-body';
    tableBodyDiv.style.width = (sumActualWidth + 10000) + 'px';
    tableDiv.appendChild(tableBodyDiv);
    tableBodyDiv.appendChild(row);

    document.body.appendChild(thisWrapper);

    const fractionTest = createElement('div');
    setCssProps(fractionTest, {
        border: '1.5px solid #000',
        width: '0',
        height: '0',
        position: 'absolute',
        left: '0',
        top: '-9999px',
    });
    document.body.appendChild(fractionTest);
    const fractionValue = parseFloat(getComputedStyle(fractionTest).borderWidth);
    const hasFractions = Math.round(fractionValue) !== fractionValue;
    fractionTest.remove();

    let width = getElementWidth(row, true, true, true);
    width -= p.scrollbarWidth || 0;

    if (hasFractions) {
        width++;
    }

    thisWrapper.remove();
    return width;
}

/**
 * Check if table is RTL
 */
export function isTableRtl(table: DGTableInterface): boolean {
    const p = table._p;
    return p.table ? getComputedStyle(p.table).direction === 'rtl' : false;
}

/**
 * Serialize column width to string
 */
export function serializeColumnWidth(column: Column): string | number {
    return column.widthMode === ColumnWidthMode.AUTO ? 'auto' :
        column.widthMode === ColumnWidthMode.RELATIVE ? column.width * 100 + '%' :
            column.width;
}

