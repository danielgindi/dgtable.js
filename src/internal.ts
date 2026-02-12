/**
 * Internal helper functions for DGTable
 * These are extracted from the class to avoid exposing them on the public API
 */

import { ColumnWidthMode } from './constants';
import {
    HoverInEventSymbol,
    HoverOutEventSymbol,
    PreviewCellSymbol,
    OriginalCellSymbol,
    IsSafeSymbol,
} from './private_types';
import { cellMouseOverEvent, cellMouseOutEvent } from './cell_preview';
import {
    onMouseDownColumnHeader as resizeOnMouseDownColumnHeader,
} from './column_resize';
import {
    onTouchStartColumnHeader,
    onMouseMoveColumnHeader,
    onMouseUpColumnHeader,
    onMouseLeaveColumnHeader,
    onSortOnColumnHeaderEvent,
    onStartDragColumnHeader,
    onDragEnterColumnHeader,
    onDragOverColumnHeader,
    onDragLeaveColumnHeader,
    onDropColumnHeader,
} from './header_events';
import { syncHorizontalStickies } from './rendering';
import ByColumnFilter from './by_column_filter';
import type { ColumnOptions, FilterFunction, RowData } from './types';
import type { ColumnWidthModeType } from './constants';
import type { DGTablePrivateState, DGTableInternalOptions, InternalColumn } from './private_types';

/**
 * Interface for the table instance passed to internal functions
 */
export interface DGTableInternal {
    el: HTMLElement;
    _o: DGTableInternalOptions;
    _p: DGTablePrivateState;
    emit(event: string, value?: unknown): void;
}

/**
 * Setup cell hover event handlers
 */
export function setupHovers(table: DGTableInternal): void {
    const p = table._p;

    const hoverMouseOverHandler = (event: MouseEvent) => {
        let cell = event.currentTarget as HTMLElement;
        let target = event.relatedTarget as Node;
        if (target === cell || cell.contains(target))
            return;
        if ((cell as any)[PreviewCellSymbol] &&
            (target === (cell as any)[PreviewCellSymbol] || (cell as any)[PreviewCellSymbol].contains(target)))
            return;
        cellMouseOverEvent(table as any, cell);
    };

    const hoverMouseOutHandler = (event: MouseEvent) => {
        let cell = ((event.currentTarget as any)[OriginalCellSymbol] || event.currentTarget) as HTMLElement;
        let target = event.relatedTarget as Node;
        if (target === table.el || cell.contains(target))
            return;
        if ((cell as any)[PreviewCellSymbol] &&
            (target === (cell as any)[PreviewCellSymbol] || (cell as any)[PreviewCellSymbol].contains(target)))
            return;
        cellMouseOutEvent(table as any, cell);
    };

    p._bindCellHoverIn = (el: HTMLElement) => {
        if (!(el as any)[HoverInEventSymbol]) {
            el.addEventListener('mouseover', (el as any)[HoverInEventSymbol] = hoverMouseOverHandler);
        }
    };

    p._unbindCellHoverIn = (el: HTMLElement) => {
        if ((el as any)[HoverInEventSymbol]) {
            el.removeEventListener('mouseover', (el as any)[HoverInEventSymbol]);
            (el as any)[HoverInEventSymbol] = null;
        }
    };

    p._bindCellHoverOut = (el: HTMLElement) => {
        if (!(el as any)[HoverOutEventSymbol]) {
            el.addEventListener('mouseout', (el as any)[HoverOutEventSymbol] = hoverMouseOutHandler);
        }
    };

    p._unbindCellHoverOut = (el: HTMLElement) => {
        if ((el as any)[HoverOutEventSymbol]) {
            el.removeEventListener('mouseout', (el as any)[HoverOutEventSymbol]);
            (el as any)[HoverOutEventSymbol] = null;
        }
    };
}

/**
 * Handle horizontal scroll synchronization
 */
export function onTableScrolledHorizontally(table: DGTableInternal): void {
    const p = table._p;
    p.header!.scrollLeft = p.table!.scrollLeft;
    syncHorizontalStickies(table as any);
}

/**
 * Bind event handlers to a header column element
 */
export function bindHeaderColumnEvents(table: DGTableInternal, columnEl: HTMLElement): void {
    const inner = columnEl.firstChild as HTMLElement;

    columnEl.addEventListener('mousedown', (evt: MouseEvent) => resizeOnMouseDownColumnHeader(table as any, evt));
    columnEl.addEventListener('mousemove', (evt: MouseEvent) => onMouseMoveColumnHeader(table as any, evt));
    columnEl.addEventListener('mouseup', (evt: MouseEvent) => onMouseUpColumnHeader(table as any, evt));
    columnEl.addEventListener('mouseleave', (evt: MouseEvent) => onMouseLeaveColumnHeader(table as any, evt));
    columnEl.addEventListener('touchstart', (evt: TouchEvent) => onTouchStartColumnHeader(table as any, evt));
    columnEl.addEventListener('dragstart', (evt: DragEvent) => onStartDragColumnHeader(table as any, evt));
    columnEl.addEventListener('click', (evt: Event) => onSortOnColumnHeaderEvent(table as any, evt));
    columnEl.addEventListener('contextmenu', (evt: Event) => evt.preventDefault());
    inner.addEventListener('dragenter', (evt: DragEvent) => onDragEnterColumnHeader(table as any, evt));
    inner.addEventListener('dragover', (evt: DragEvent) => onDragOverColumnHeader(table as any, evt));
    inner.addEventListener('dragleave', (evt: DragEvent) => onDragLeaveColumnHeader(table as any, evt));
    inner.addEventListener('drop', (evt: DragEvent) => onDropColumnHeader(table as any, evt));
}

/**
 * Unbind cell events for a single row
 */
export function unbindCellEventsForRow(table: DGTableInternal, rowToClean: HTMLElement): void {
    const p = table._p;
    for (let i = 0, cells = rowToClean.childNodes, cellCount = cells.length; i < cellCount; i++) {
        p._unbindCellHoverIn(cells[i] as HTMLElement);
    }
}

/**
 * Parse column width and determine width mode
 */
export function parseColumnWidth(
    width: number | string | null | undefined,
    minWidth: number
): { width: number; mode: ColumnWidthModeType } {
    let widthSize = Math.max(0, parseFloat(width as string) || 0),
        widthMode: ColumnWidthModeType = ColumnWidthMode.AUTO;

    if (widthSize > 0) {
        if (width === widthSize + '%') {
            widthMode = ColumnWidthMode.RELATIVE;
            widthSize /= 100;
        } else if (widthSize > 0 && widthSize < 1) {
            widthMode = ColumnWidthMode.RELATIVE;
        } else {
            if (widthSize < minWidth) {
                widthSize = minWidth;
            }
            widthMode = ColumnWidthMode.ABSOLUTE;
        }
    }

    return { width: widthSize, mode: widthMode };
}

/**
 * Initialize a column from column options data
 */
export function initColumnFromData(
    options: DGTableInternalOptions,
    columnData: ColumnOptions
): InternalColumn {
    let parsedWidth = parseColumnWidth(columnData.width, columnData.ignoreMin ? 0 : options.minColumnWidth);

    let col: InternalColumn = {
        name: columnData.name,
        label: columnData.label === undefined ? columnData.name : columnData.label,
        width: parsedWidth.width,
        widthMode: parsedWidth.mode,
        resizable: columnData.resizable === undefined ? true : columnData.resizable,
        sortable: columnData.sortable === undefined ? true : columnData.sortable,
        movable: columnData.movable === undefined ? true : columnData.movable,
        visible: columnData.visible === undefined ? true : columnData.visible,
        cellClasses: columnData.cellClasses === undefined ? options.cellClasses : columnData.cellClasses,
        ignoreMin: columnData.ignoreMin === undefined ? false : !!columnData.ignoreMin,
        sticky: columnData.sticky === undefined ? null : (columnData.sticky || null),
        allowPreview: !!(columnData.allowPreview ?? true),
        dataPath: [],
        comparePath: [],
        order: 0,
    };

    const rawDataPath = columnData.dataPath === undefined ? col.name : columnData.dataPath;
    const rawComparePath = columnData.comparePath === undefined ? rawDataPath : columnData.comparePath;
    col.dataPath = typeof rawDataPath === 'string' ? rawDataPath.split('.') : rawDataPath;
    col.comparePath = typeof rawComparePath === 'string' ? rawComparePath.split('.') : rawComparePath;

    return col;
}

/**
 * Ensure at least one column is visible
 */
export function ensureVisibleColumns(table: DGTableInternal): void {
    const p = table._p;

    if (p.visibleColumns.length === 0 && p.columns.length) {
        p.columns[0].visible = true;
        p.visibleColumns.push(p.columns[0]);
        table.emit('showcolumn', p.columns[0].name);
    }
}

/**
 * Refilter the rows using current filter
 */
export function refilter(table: DGTableInternal): void {
    const p = table._p;

    if (p.filteredRows && p.filterArgs) {
        let filterFunc = (table._o.filter || ByColumnFilter) as FilterFunction;
        p.filteredRows = p.rows.filteredCollection(filterFunc, p.filterArgs);
    }
}

/**
 * Get HTML content for a cell
 */
export function getHtmlForCell(
    options: DGTableInternalOptions,
    rowData: RowData,
    column: InternalColumn
): string {
    let dataPath = column.dataPath;
    let colValue: unknown = rowData[dataPath[0]];
    for (let dataPathIndex = 1; dataPathIndex < dataPath.length; dataPathIndex++) {
        if (colValue == null) break;
        colValue = colValue && (colValue as Record<string, unknown>)[dataPath[dataPathIndex]];
    }

    const formatter = options.cellFormatter;
    let content;

    if (formatter[IsSafeSymbol]) {
        content = formatter(colValue, column.name, rowData);
    } else {
        try {
            content = formatter(colValue, column.name, rowData);
        } catch (err) {
            content = '[ERROR]';
            // eslint-disable-next-line no-console
            console.error('Failed to generate content for cell ' + column.name, err);
        }
    }

    if (content === undefined || content === null) {
        content = '';
    }

    return content;
}

