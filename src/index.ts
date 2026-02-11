/* eslint-env browser */
/* eslint-disable @typescript-eslint/ban-ts-comment */

import { htmlEncode } from './util';
import RowCollection from './row_collection';
import ColumnCollection from './column_collection';
// @ts-ignore - No type declarations available for this module
import { getScrollHorz, setScrollHorz } from '@danielgindi/dom-utils/lib/ScrollHelper.js';
// @ts-ignore - No type declarations available for this module
import { getElementHeight } from '@danielgindi/dom-utils/lib/Css.js';
// @ts-ignore - No type declarations available for this module
import { scopedSelectorAll } from '@danielgindi/dom-utils/lib/DomCompat.js';
import ByColumnFilter from './by_column_filter';
// @ts-ignore - No type declarations available for this module
import DomEventsSink from '@danielgindi/dom-utils/lib/DomEventsSink.js';
import mitt from 'mitt';

// Constants
import {
    ColumnWidthMode,
    Width,
} from './constants';

// Helpers
import {
    getTextWidth,
    calculateWidthAvailableForColumns,
    calculateTbodyWidth,
    serializeColumnWidth,
} from './helpers';

// Cell Preview
import {
    hideCellPreview,
} from './cell_preview';

// Column Resize
import {
    cancelColumnResize,
} from './column_resize';

// Header Events
import {
    onDragEndColumnHeader,
} from './header_events';

// Rendering
import {
    renderSkeletonBase,
    renderSkeletonBody,
    renderSkeletonHeaderCells,
    destroyHeaderCells,
    updateVirtualHeight,
    updateLastCellWidthFromScrollbar,
    updateTableWidth,
    resizeColumnElements,
    clearSortArrows,
    showSortArrow,
} from './rendering';

// Internal helpers (not exposed on class)
import {
    setupHovers,
    parseColumnWidth,
    initColumnFromData,
    ensureVisibleColumns,
    refilter,
    getHtmlForCell,
} from './internal';

// Types
import {
    DGTableOptions,
    RowData,
    ColumnSortOptions,
    FilterFunction,
    ColumnOptions,
    CellFormatter,
    HeaderCellFormatter,
    OnComparatorRequired,
    CustomSortingProvider,
    SerializedColumnSort,
    DGTableEventMap,
} from './types';

// Private types
import {
    DGTableInternalOptions,
    DGTablePrivateState, IsDestroyedSymbol,
} from './private_types';
import {
    IsSafeSymbol,
} from './private_types';


const hasOwnProperty = Object.prototype.hasOwnProperty;

// noinspection JSUnusedGlobalSymbols
class DGTable {
    // Static properties
    static VERSION = '@@VERSION';
    static Width = Width;

    // Instance properties
    VERSION: string;
    el!: HTMLElement;
    readonly _o!: DGTableInternalOptions;
    readonly _p!: DGTablePrivateState;
    private [IsDestroyedSymbol]?: boolean;

    /**
     * @param options - initialization options
     */
    constructor(options?: DGTableOptions) {
        this.VERSION = DGTable.VERSION;

        const o = this._o = {} as DGTableInternalOptions;
        const p = this._p = {
            eventsSink: new DomEventsSink(),
            mitt: mitt(),
            tableSkeletonNeedsRendering: true,
        } as DGTablePrivateState;

        this.el = (options.el && options.el instanceof HTMLElement) ? options.el : document.createElement('div');

        if (this.el !== options.el) {
            this.el.classList.add(options.className || 'dgtable-wrapper');
        }

        p.eventsSink.add(this.el, 'dragend.colresize', (e: Event) => onDragEndColumnHeader(this, e as DragEvent));

        // Initialize options with defaults
        o.virtualTable = options.virtualTable === undefined ? true : !!options.virtualTable;
        o.estimatedRowHeight = options.estimatedRowHeight || undefined;
        o.rowsBufferSize = options.rowsBufferSize || 3;
        o.minColumnWidth = Math.max(options.minColumnWidth || 35, 0);
        o.resizeAreaWidth = options.resizeAreaWidth || 8;
        o.resizableColumns = options.resizableColumns === undefined ? true : !!options.resizableColumns;
        o.movableColumns = options.movableColumns === undefined ? true : !!options.movableColumns;

        const maxColumnsSortCount = options.maxColumnsSortCount
            ?? (options as any)['sortableColumns']; // backwards compatibility
        o.sortableColumns = maxColumnsSortCount === undefined ? 1 : Number(maxColumnsSortCount) || 1;

        o.adjustColumnWidthForSortArrow = options.adjustColumnWidthForSortArrow === undefined ? true : !!options.adjustColumnWidthForSortArrow;
        o.convertColumnWidthsToRelative = options.convertColumnWidthsToRelative === undefined ? false : !!options.convertColumnWidthsToRelative;
        o.autoFillTableWidth = options.autoFillTableWidth === undefined ? false : !!options.autoFillTableWidth;
        o.allowCancelSort = options.allowCancelSort === undefined ? true : !!options.allowCancelSort;
        o.cellClasses = options.cellClasses === undefined ? '' : options.cellClasses;
        o.resizerClassName = options.resizerClassName === undefined ? 'dgtable-resize' : options.resizerClassName;
        o.tableClassName = options.tableClassName === undefined ? 'dgtable' : options.tableClassName;
        o.allowCellPreview = options.allowCellPreview === undefined ? true : options.allowCellPreview;
        o.allowHeaderCellPreview = options.allowHeaderCellPreview === undefined ? true : options.allowHeaderCellPreview;
        o.cellPreviewClassName = options.cellPreviewClassName === undefined ? 'dgtable-cell-preview' : options.cellPreviewClassName;
        o.cellPreviewAutoBackground = options.cellPreviewAutoBackground === undefined ? true : options.cellPreviewAutoBackground;
        o.onComparatorRequired = options.onComparatorRequired === undefined ? null : options.onComparatorRequired;
        o.customSortingProvider = options.customSortingProvider === undefined ? null : options.customSortingProvider;
        o.width = options.width === undefined ? Width.NONE : options.width;
        o.relativeWidthGrowsToFillWidth = options.relativeWidthGrowsToFillWidth === undefined ? true : !!options.relativeWidthGrowsToFillWidth;
        o.relativeWidthShrinksToFillWidth = options.relativeWidthShrinksToFillWidth === undefined ? false : !!options.relativeWidthShrinksToFillWidth;

        this.setCellFormatter(options.cellFormatter);
        this.setHeaderCellFormatter(options.headerCellFormatter);
        this.setFilter(options.filter);

        o.height = options.height;

        // Prepare columns
        this.setColumns(options.columns || [], false);

        // Set sorting columns
        let sortColumns = [];

        const initialSortedColumns = options.sortedColumns ?? (options as any)['sortColumn'];
        if (initialSortedColumns) {
            let tmpSortColumns: (string | ColumnSortOptions)[] = Array.isArray(initialSortedColumns)
                ? initialSortedColumns
                : [initialSortedColumns];

            for (let i = 0, len = tmpSortColumns.length; i < len; i++) {
                let sortColumn = tmpSortColumns[i];
                if (typeof sortColumn === 'string') {
                    sortColumn = { column: sortColumn, descending: false };
                }
                let col = p.columns.get(sortColumn.column);
                if (!col) continue;

                sortColumns.push({
                    column: sortColumn.column,
                    comparePath: col.comparePath || col.dataPath,
                    descending: sortColumn.descending ?? false,
                });
            }
        }

        p.rows = new RowCollection({ sortColumn: sortColumns });
        p.rows.onComparatorRequired = (column, descending, defaultComparator) => {
            if (o.onComparatorRequired) {
                return o.onComparatorRequired(column, descending, defaultComparator);
            }
        };
        p.rows.customSortingProvider = (data, sort) => {
            if (o.customSortingProvider) {
                return o.customSortingProvider(data, sort);
            } else {
                return sort(data);
            }
        };

        p.filteredRows = null;

        p.scrollbarWidth = 0;
        p._lastVirtualScrollHeight = 0;

        setupHovers(this);
    }

    // =========================================================================
    // PUBLIC API - Events
    // =========================================================================

    /**
     * Register an event handler.
     * Built-in events have typed handlers. Custom events use `unknown` data type.
     */
    on<K extends keyof DGTableEventMap>(event: K, handler: (value: DGTableEventMap[K]) => void): this;
    on<T = unknown>(event: string & {}, handler: (value: T) => void): this;
    on(event: string, handler: (value: unknown) => void) {
        if (this[IsDestroyedSymbol])
            return this;
        this._p.mitt.on(event, handler);
        return this;
    }

    /**
     * Register a one-time event handler.
     * Built-in events have typed handlers. Custom events use `unknown` data type.
     */
    once<K extends keyof DGTableEventMap>(event: K, handler: (value: DGTableEventMap[K]) => void): this;
    once<T = unknown>(event: string & {}, handler: (value: T) => void): this;
    once(event: string, handler: (value: unknown) => void) {
        if (this[IsDestroyedSymbol])
            return this;
        const wrapped = (value: unknown) => {
            this._p.mitt.off(event, wrapped);
            handler(value);
        };
        this._p.mitt.on(event, wrapped);
        return this;
    }

    /**
     * Remove a handler for an event, all handlers for an event, or all handlers completely.
     * Built-in events have typed handlers. Custom events use `unknown` data type.
     */
    off<K extends keyof DGTableEventMap>(event?: K, handler?: (value: DGTableEventMap[K]) => void): this;
    off<T = unknown>(event?: string & {}, handler?: (value: T) => void): this;
    off(event?: string, handler?: (value: unknown) => void) {
        if (this[IsDestroyedSymbol])
            return this;
        if (!event && !handler) {
            this._p.mitt.all.clear();
        } else {
            this._p.mitt.off(event, handler);
        }
        return this;
    }

    /**
     * Emit an event.
     * Built-in events have typed data. Custom events accept any data type.
     */
    emit<K extends keyof DGTableEventMap>(event: K, value?: DGTableEventMap[K]): this;
    emit<T = unknown>(event: string & {}, value?: T): this;
    emit(event: string, value?: unknown) {
        if (this[IsDestroyedSymbol])
            return this;
        this._p.mitt.emit(event, value);
        return this;
    }

    // =========================================================================
    // PUBLIC API - Lifecycle
    // =========================================================================

    /**
     * Destroy, releasing all memory, events and DOM elements
     */
    destroy() {
        const p = this._p;
        const el = this.el;

        if (this[IsDestroyedSymbol] || !p) {
            return this;
        }

        if (p.resizer) {
            p.resizer.remove();
            p.resizer = null;
        }

        p.virtualListHelper?.destroy();
        p.virtualListHelper = null;

        destroyHeaderCells(this);

        p.table?.remove();
        p.tbody?.remove();

        if (p.workerListeners) {
            for (let j = 0; j < p.workerListeners.length; j++) {
                let worker = p.workerListeners[j];
                worker.worker.removeEventListener('message', worker.listener, false);
            }
            p.workerListeners.length = 0;
        }

        p.rows.length = p.columns.length = 0;

        if (p._deferredRender) {
            clearTimeout(p._deferredRender);
        }

        // Cleanup
        for (let prop in this) {
            if (hasOwnProperty.call(this, prop)) {
                this[prop] = null;
            }
        }

        this[IsDestroyedSymbol] = true;

        if (el) {
            el.remove();
        }

        return this;
    }

    // Backwards compatibility
    close() {
        this.destroy();
    }

    // Backwards compatibility
    remove() {
        this.destroy();
    }

    // =========================================================================
    // PUBLIC API - Rendering
    // =========================================================================

    /** Render the table */
    render() {
        const o = this._o, p = this._p;

        if (!this.el.offsetParent) {
            if (!p._deferredRender) {
                p._deferredRender = setTimeout(() => {
                    p._deferredRender = null;
                    if (!this[IsDestroyedSymbol] && this.el.offsetParent) {
                        this.render();
                    }
                });
            }

            return this;
        }

        if (p.tableSkeletonNeedsRendering === true) {
            p.tableSkeletonNeedsRendering = false;

            if (o.width === Width.AUTO) {
                clearSortArrows(this);
            }

            let lastScrollTop = p.table && p.table.parentNode ? p.table.scrollTop : NaN,
                lastScrollHorz = p.table && p.table.parentNode ? getScrollHorz(p.table) : NaN;

            renderSkeletonBase(this);
            renderSkeletonBody(this);
            this.tableWidthChanged(true, false);
            renderSkeletonHeaderCells(this);

            p.virtualListHelper.setCount((p.filteredRows ?? p.rows).length);

            updateVirtualHeight(this);
            updateLastCellWidthFromScrollbar(this, true);
            updateTableWidth(this, true);

            // Show sort arrows
            for (let i = 0; i < p.rows.sortColumn.length; i++) {
                showSortArrow(this, p.rows.sortColumn[i].column, p.rows.sortColumn[i].descending);
            }
            if (o.adjustColumnWidthForSortArrow && p.rows.sortColumn.length) {
                this.tableWidthChanged(true);
            } else if (!o.virtualTable) {
                this.tableWidthChanged();
            }

            if (!isNaN(lastScrollTop))
                p.table.scrollTop = lastScrollTop;

            if (!isNaN(lastScrollHorz)) {
                setScrollHorz(p.table, lastScrollHorz);
                setScrollHorz(p.header, lastScrollHorz);
            }

            this.emit('renderskeleton');
        }

        p.virtualListHelper.render();

        this.emit('render');
        return this;
    }

    /** Forces a full render of the table */
    clearAndRender(render?: boolean) {
        let p = this._p;

        p.tableSkeletonNeedsRendering = true;
        p.notifyRendererOfColumnsConfig?.();

        if (render === undefined || render) {
            this.render();
        }

        return this;
    }

    // =========================================================================
    // PUBLIC API - Columns
    // =========================================================================

    /** Sets the columns of the table */
    setColumns(columns?: ColumnOptions[] | null, render?: boolean) {
        const p = this._p;

        columns = columns || [];

        let normalizedCols = new ColumnCollection();
        for (let i = 0, order = 0; i < columns.length; i++) {

            let columnData = columns[i];
            let normalizedColumn = initColumnFromData(this._o, columnData);

            if (columnData.order !== undefined) {
                if (columnData.order > order) {
                    order = columnData.order + 1;
                }
                normalizedColumn.order = columnData.order;
            } else {
                normalizedColumn.order = order++;
            }

            normalizedCols.push(normalizedColumn);
        }
        normalizedCols.normalizeOrder();

        p.columns = normalizedCols;
        p.visibleColumns = normalizedCols.getVisibleColumns();

        ensureVisibleColumns(this);
        this.clearAndRender(render);

        return this;
    }

    /** Add a column to the table */
    addColumn(columnData: ColumnOptions, before?: string | number, render?: boolean) {
        const p = this._p;
        let columns = p.columns;

        if (columnData && !columns.get(columnData.name)) {
            let beforeColumn = null;
            if (before !== undefined) {
                beforeColumn = typeof before === 'string'
                    ? columns.get(before)
                    : columns.getByOrder(before);
            }

            let column = initColumnFromData(this._o, columnData);
            column.order = beforeColumn ? beforeColumn.order : (columns.getMaxOrder() + 1);

            for (let i = columns.getMaxOrder(), to = column.order; i >= to; i--) {
                let col = columns.getByOrder(i);
                if (col) {
                    col.order++;
                }
            }

            columns.push(column);
            columns.normalizeOrder();

            p.visibleColumns = columns.getVisibleColumns();
            ensureVisibleColumns(this);
            this.clearAndRender(render);

            this.emit('addcolumn', column.name);
        }
        return this;
    }

    /** Remove a column from the table */
    removeColumn(column: string, render?: boolean) {
        const p = this._p;
        let columns = p.columns;

        let colIdx = columns.indexOf(column);
        if (colIdx > -1) {
            columns.splice(colIdx, 1);
            columns.normalizeOrder();

            p.visibleColumns = columns.getVisibleColumns();
            ensureVisibleColumns(this);
            this.clearAndRender(render);

            this.emit('removecolumn', column);
        }
        return this;
    }

    /** Set a new label to a column */
    setColumnLabel(column: string, label: string) {
        const p = this._p;

        let col = p.columns.get(column);
        if (col) {
            col.label = label === undefined ? col.name : label;

            if (col.element) {
                for (let i = 0; i < col.element.firstChild.childNodes.length; i++) {
                    let node = col.element.firstChild.childNodes[i];
                    if (node.nodeType === 3) {
                        node.textContent = col.label;
                        break;
                    }
                }
            }
        }
        return this;
    }

    /** Move a column to a new position */
    moveColumn(src: string | number, dest: string | number, visibleOnly = true) {
        const o = this._o, p = this._p;

        let columns = p.columns,
            col, destCol;

        let columnsArray = visibleOnly ? p.visibleColumns : columns.getColumns();

        if (typeof src === 'string') {
            col = columns.get(src);
        } else if (typeof src === 'number') {
            col = columnsArray[src];
        }
        if (typeof dest === 'string') {
            destCol = columns.get(dest);
        } else if (typeof dest === 'number') {
            destCol = columnsArray[dest];
        }

        if (col && destCol && src !== dest) {
            let srcOrder = col.order, destOrder = destCol.order;

            let visibleColumns = columns.moveColumn(col, destCol).getVisibleColumns();

            if (p.visibleColumns.length !== visibleColumns.length ||
                p.visibleColumns.some((x, i) => x !== visibleColumns[i])) {

                p.visibleColumns = visibleColumns;
                ensureVisibleColumns(this);

                if (o.virtualTable) {
                    this.clearAndRender();
                } else {
                    const headerCells = scopedSelectorAll(p.headerRow, `>div.${o.tableClassName}-header-cell`);
                    let beforePos = srcOrder < destOrder ? destOrder + 1 : destOrder,
                        fromPos = srcOrder;
                    headerCells[0].parentNode.insertBefore(headerCells[fromPos], headerCells[beforePos]);

                    let srcCol = p.visibleColumns[srcOrder];
                    let srcWidth = ((srcCol.actualWidthConsideringScrollbarWidth || srcCol.actualWidth) ?? 0) + 'px';
                    let destCol = p.visibleColumns[destOrder];
                    let destWidth = ((destCol.actualWidthConsideringScrollbarWidth || destCol.actualWidth) ?? 0) + 'px';

                    let tbodyChildren = p.tbody.childNodes;
                    for (let i = 0, count = tbodyChildren.length; i < count; i++) {
                        let row = tbodyChildren[i] as HTMLElement;
                        if (row.nodeType !== 1) continue;
                        row.insertBefore(row.childNodes[fromPos], row.childNodes[beforePos]);
                        ((row.childNodes[destOrder] as HTMLElement).firstChild as HTMLElement).style.width = destWidth;
                        ((row.childNodes[srcOrder] as HTMLElement).firstChild as HTMLElement).style.width = srcWidth;
                    }
                }
            }

            this.emit('movecolumn', { name: col.name, src: srcOrder, dest: destOrder });
        }
        return this;
    }

    /** Show or hide a column */
    setColumnVisible(column: string, visible: boolean) {
        const p = this._p;

        let col = p.columns.get(column);

        visible = !!visible;

        if (col && !!col.visible !== visible) {
            col.visible = visible;
            p.visibleColumns = p.columns.getVisibleColumns();
            this.emit(visible ? 'showcolumn' : 'hidecolumn', column);
            ensureVisibleColumns(this);
            this.clearAndRender();
        }
        return this;
    }

    /** Get the visibility mode of a column */
    isColumnVisible(column: string): boolean {
        const p = this._p;
        let col = p.columns.get(column);
        if (col) {
            return col.visible;
        }
        return false;
    }

    /** Globally set the minimum column width */
    setMinColumnWidth(minColumnWidth: number) {
        let o = this._o;
        minColumnWidth = Math.max(minColumnWidth, 0);
        if (o.minColumnWidth !== minColumnWidth) {
            o.minColumnWidth = minColumnWidth;
            this.tableWidthChanged(true);
        }
        return this;
    }

    /** Get the current minimum column width */
    getMinColumnWidth(): number {
        return this._o.minColumnWidth;
    }

    /** Set a new width to a column */
    setColumnWidth(column: string, width: number | string) {
        const p = this._p;

        let col = p.columns.get(column);

        let parsedWidth = parseColumnWidth(width, col.ignoreMin ? 0 : this._o.minColumnWidth);

        if (col) {
            let oldWidth = serializeColumnWidth(col);

            col.width = parsedWidth.width;
            col.widthMode = parsedWidth.mode;

            let newWidth = serializeColumnWidth(col);

            if (oldWidth !== newWidth) {
                this.tableWidthChanged(true);
            }

            this.emit('columnwidth', { name: col.name, width: newWidth, oldWidth: oldWidth });
        }
        return this;
    }

    /** Get the serialized width of the specified column */
    getColumnWidth(column: string): string | number | null {
        const p = this._p;

        let col = p.columns.get(column);
        if (col) {
            return serializeColumnWidth(col);
        }
        return null;
    }

    /** Get configuration for a specific column */
    getColumnConfig(column: string): ColumnOptions | null {
        const p = this._p;
        let col = p.columns.get(column);
        if (col) {
            return {
                name: col.name,
                label: col.label,
                width: serializeColumnWidth(col),
                dataPath: col.dataPath,
                comparePath: col.comparePath,
                resizable: col.resizable,
                movable: col.movable,
                sortable: col.sortable,
                visible: col.visible,
                cellClasses: col.cellClasses,
                ignoreMin: col.ignoreMin,
                sticky: col.sticky,
                order: col.order,
            };
        }
        return null;
    }

    /** Returns a config object for all columns */
    getColumnsConfig() {
        const p = this._p;

        let config: Record<string, ReturnType<typeof this.getColumnConfig>> = {};
        for (let i = 0; i < p.columns.length; i++) {
            config[p.columns[i].name] = this.getColumnConfig(p.columns[i].name);
        }
        return config;
    }

    // =========================================================================
    // PUBLIC API - Sorting
    // =========================================================================

    /** Set the limit on concurrent columns sorted */
    setMaxColumnSortCount(sortableColumns: number) {
        const p = this._p, o = this._o;
        if (o.sortableColumns !== sortableColumns) {
            o.sortableColumns = sortableColumns;
            if (p.table) {
                const headerCells = scopedSelectorAll(p.headerRow, `>div.${o.tableClassName}-header-cell`);
                for (let i = 0, len = headerCells.length; i < len; i++) {
                    const cell = headerCells[i];
                    cell.classList[(o.sortableColumns > 0 && p.visibleColumns[i].sortable) ? 'add' : 'remove']('sortable');
                }
            }
        }
        return this;
    }

    /** Get the limit on concurrent columns sorted */
    getMaxColumnSortCount(): number {
        return this._o.sortableColumns;
    }

    /** Set the limit on concurrent columns sorted
     * @deprecated please use setMaxColumnSortCount()
     * */
    setSortableColumns(sortableColumns: number) {
        return this.setMaxColumnSortCount(sortableColumns);
    }

    /** Get the limit on concurrent columns sorted
     * @deprecated please use getMaxColumnSortCount()
     * */
    getSortableColumns(): number {
        return this.getMaxColumnSortCount();
    }

    /** Set whether columns are movable */
    setMovableColumns(movableColumns?: boolean) {
        let o = this._o;
        movableColumns = movableColumns === undefined ? true : !!movableColumns;
        if (o.movableColumns !== movableColumns) {
            o.movableColumns = movableColumns;
        }
        return this;
    }

    /** Get whether columns are movable */
    getMovableColumns(): boolean {
        return this._o.movableColumns;
    }

    /** Set whether columns are resizable */
    setResizableColumns(resizableColumns?: boolean) {
        let o = this._o;
        resizableColumns = resizableColumns === undefined ? true : !!resizableColumns;
        if (o.resizableColumns !== resizableColumns) {
            o.resizableColumns = resizableColumns;
        }
        return this;
    }

    /** Get whether columns are resizable */
    getResizableColumns(): boolean {
        return this._o.resizableColumns;
    }

    /**
     * Set whether column widths are converted to relative when calculating column widths to fill the table width.
     */
    getConvertColumnsWidthsToRelative(): boolean {
        return this._o.convertColumnWidthsToRelative;
    }

    /**
     * Set whether column widths are converted to relative when calculating column widths to fill the table width.
     */
    setConvertColumnsWidthsToRelative(convert: boolean, refreshNow = true) {
        let o = this._o;
        convert = !!convert;
        if (o.convertColumnWidthsToRelative !== convert) {
            o.convertColumnWidthsToRelative = convert;

            if (refreshNow)
                this.tableWidthChanged(true);
        }
        return this;
    }

    /** Sets a function that supplies comparators dynamically */
    setOnComparatorRequired(comparatorProvider: OnComparatorRequired | null) {
        let o = this._o;
        if (o.onComparatorRequired !== comparatorProvider) {
            o.onComparatorRequired = comparatorProvider;
        }
        return this;
    }

    /** Sets custom sorting function for a data set */
    setCustomSortingProvider(customSortingProvider: CustomSortingProvider | null) {
        let o = this._o;
        if (o.customSortingProvider !== customSortingProvider) {
            o.customSortingProvider = customSortingProvider;
        }
        return this;
    }

    /** Sort the table by column */
    sort(column?: string, descending?: boolean, add?: boolean) {
        const o = this._o,
            p = this._p;

        let columns = p.columns,
            col = columns.get(column);

        let currentSort = p.rows.sortColumn.map(x => ({ column: x.column, descending: x.descending }));

        if (col) {
            if (add) {
                for (let i = 0; i < currentSort.length; i++) {
                    if (currentSort[i].column === col.name) {
                        if (i < currentSort.length - 1) {
                            currentSort.length = 0;
                        } else {
                            descending = currentSort[currentSort.length - 1].descending;
                            currentSort.splice(currentSort.length - 1, 1);
                        }
                        break;
                    }
                }

                if ((o.sortableColumns > 0 && currentSort.length >= o.sortableColumns) ||
                    currentSort.length >= p.visibleColumns.length) {
                    currentSort.length = 0;
                }
            } else {
                currentSort.length = 0;
            }

            descending = descending === undefined ? false : descending;

            currentSort.push({
                column: col.name,
                descending: !!descending,
            });
        } else {
            currentSort.length = 0;
        }

        return this.setSortedColumns(currentSort);
    }

    /** Re-sort the table using current sort specifiers */
    resort() {
        const p = this._p;
        let columns = p.columns;

        let currentSort = p.rows.sortColumn;
        if (currentSort.length) {

            for (let i = 0; i < currentSort.length; i++) {
                if (!columns.get(currentSort[i].column)) {
                    currentSort.splice(i--, 1);
                }
            }

            p.rows.sortColumn = currentSort;
            if (currentSort.length) {
                p.rows.sort();
                if (p.filteredRows) {
                    p.filteredRows.sort();
                }
            }

            let sorts = [];
            for (let i = 0; i < currentSort.length; i++) {
                sorts.push({ 'column': currentSort[i].column, 'descending': currentSort[i].descending });
            }
            this.emit('sort', { sorts: sorts, resort: true });
        }

        return this;
    }

    setSortedColumns(sortedColumns: SerializedColumnSort[]) {
        const o = this._o, p = this._p;

        let columns = p.columns;

        let currentSort = sortedColumns.filter(x => columns.get(x.column)).map(x => {
            let col = columns.get(x.column);
            return {
                column: col.name,
                comparePath: col.comparePath || col.dataPath,
                descending: !!x.descending,
            };
        });

        if (o.sortableColumns > 0 && currentSort.length > o.sortableColumns)
            currentSort.length = o.sortableColumns;

        clearSortArrows(this);

        for (let i = 0; i < currentSort.length; i++) {
            showSortArrow(this, currentSort[i].column, currentSort[i].descending);
        }

        if (o.adjustColumnWidthForSortArrow && !p.tableSkeletonNeedsRendering) {
            this.tableWidthChanged(true);
        }

        p.rows.sortColumn = currentSort;

        if (currentSort.length) {
            p.rows.sort();
            if (p.filteredRows) {
                p.filteredRows.sort();
            }
        }

        if (p.virtualListHelper)
            p.virtualListHelper.invalidate().render();

        let sorts = [];
        for (let i = 0; i < currentSort.length; i++) {
            sorts.push({ 'column': currentSort[i].column, 'descending': currentSort[i].descending });
        }
        this.emit('sort', { sorts: sorts });

        return this;
    }

    /** Returns an array of the currently sorted columns */
    getSortedColumns(): SerializedColumnSort[] {
        const p = this._p;

        let sorted = [];
        for (let i = 0; i < p.rows.sortColumn.length; i++) {
            let sort = p.rows.sortColumn[i];
            sorted.push({ column: sort.column, descending: sort.descending });
        }
        return sorted;
    }

    // =========================================================================
    // PUBLIC API - Formatters & Filters
    // =========================================================================

    /** Sets a new cell formatter */
    setCellFormatter(formatter?: CellFormatter | null) {
        if (!formatter) {
            const defaultFormatter = (val: unknown) => (typeof val === 'string') ? htmlEncode(val) : val;
            (defaultFormatter as unknown as Record<symbol, boolean>)[IsSafeSymbol] = true;
            formatter = defaultFormatter as unknown as CellFormatter;
        }

        this._o.cellFormatter = formatter;

        return this;
    }

    /** Sets a new header cell formatter */
    setHeaderCellFormatter(formatter?: HeaderCellFormatter | null) {
        this._o.headerCellFormatter = formatter || function (val: string) {
            return (typeof val === 'string') ? htmlEncode(val) : val;
        };

        return this;
    }

    /** Set the filter function */
    setFilter(filterFunc?: FilterFunction | null) {
        this._o.filter = filterFunc;
        return this;
    }

    /** Filter the table rows */
    filter(args?: unknown) {
        const p = this._p;

        let filterFunc = (this._o.filter || ByColumnFilter) as FilterFunction;

        // Deprecated use of older by-column filter
        if (typeof arguments[0] === 'string' && typeof arguments[1] === 'string') {
            args = {
                column: arguments[0],
                keyword: arguments[1],
                caseSensitive: arguments[2],
            };
        }

        let hadFilter = !!p.filteredRows;
        if (p.filteredRows) {
            p.filteredRows = null;
        }

        p.filterArgs = args == null ? null : ((typeof args === 'object' && !Array.isArray(args)) ? Object.assign({}, args) : args);

        if (p.filterArgs !== null) {
            p.filteredRows = p.rows.filteredCollection(filterFunc, p.filterArgs);

            if (hadFilter || p.filteredRows) {
                this.clearAndRender();
                this.emit('filter', args);
            }
        }
        else {
            p.filterArgs = null;
            p.filteredRows = null;
            this.clearAndRender();
            this.emit('filterclear', {});
        }

        return this;
    }

    /** Clear the current filter */
    clearFilter() {
        const p = this._p;

        if (p.filteredRows) {
            p.filterArgs = null;
            p.filteredRows = null;
            this.clearAndRender();
            this.emit('filterclear', {});
        }

        return this;
    }

    // =========================================================================
    // PUBLIC API - Row Operations
    // =========================================================================

    /** Returns the HTML string for a specific cell by row index */
    getHtmlForRowCell(rowIndex: number, columnName: string): string | null {
        const p = this._p;

        if (rowIndex < 0 || rowIndex > p.rows.length - 1) return null;
        let column = p.columns.get(columnName);
        if (!column) return null;
        let rowData = p.rows[rowIndex];

        return getHtmlForCell(this._o, rowData, column);
    }

    /** Returns the HTML string for a specific cell by row data */
    getHtmlForRowDataCell(rowData: RowData, columnName: string): string | null {
        const p = this._p;

        let column = p.columns.get(columnName);
        if (!column) return null;

        return getHtmlForCell(this._o, rowData, column);
    }

    /** Returns the y position of a row by index */
    getRowYPos(rowIndex: number): number | null {
        const p = this._p;

        return p.virtualListHelper.getItemPosition(rowIndex) || null;
    }

    /** Returns the row data for a specific row */
    getDataForRow(row: number): RowData | null {
        const p = this._p;

        if (row < 0 || row > p.rows.length - 1) return null;
        return p.rows[row];
    }

    /** Gets the number of rows */
    getRowCount(): number {
        const p = this._p;
        return p.rows ? p.rows.length : 0;
    }

    /** Returns the actual row index for specific row data */
    getIndexForRow(rowData: RowData): number {
        const p = this._p;
        return p.rows.indexOf(rowData);
    }

    /** Gets the number of filtered rows */
    getFilteredRowCount(): number {
        const p = this._p;
        return (p.filteredRows || p.rows).length;
    }

    /** Returns the filtered row index for specific row data */
    getIndexForFilteredRow(rowData: RowData): number {
        const p = this._p;
        return (p.filteredRows || p.rows).indexOf(rowData);
    }

    /** Returns the row data for a specific filtered row */
    getDataForFilteredRow(row: number): RowData | null {
        const p = this._p;
        if (row < 0 || row > (p.filteredRows || p.rows).length - 1) return null;
        return (p.filteredRows || p.rows)[row];
    }

    /** Returns DOM element of the header row */
    getHeaderRowElement(): HTMLElement | undefined {
        return this._p.headerRow;
    }

    /** Add rows to the table */
    addRows(data: RowData | RowData[], at?: number | boolean, resort?: boolean, render?: boolean) {
        let p = this._p;

        if (typeof at === 'boolean') {
            render = resort;
            resort = at;
            at = -1;
        }

        if (typeof at !== 'number')
            at = -1;

        if (at < 0 || at > p.rows.length)
            at = p.rows.length;

        render = (render === undefined) ? true : !!render;

        const dataArray = Array.isArray(data) ? data : [data];
        const dataCount = dataArray.length;

        if (data) {
            p.rows.add(data, at);

            if (p.filteredRows || (resort && p.rows.sortColumn.length)) {

                if (resort && p.rows.sortColumn.length) {
                    this.resort();
                } else {
                    refilter(this);
                }

                p.tableSkeletonNeedsRendering = true;

                if (render) {
                    // Render the skeleton with all rows from scratch
                    this.render();
                }

            } else if (render) {
                p.virtualListHelper.addItemsAt(dataCount, at);

                if (this._o.virtualTable) {
                    updateVirtualHeight(this);
                    updateLastCellWidthFromScrollbar(this);
                    this.render();
                    updateTableWidth(this, false);

                } else if (p.tbody) {
                    this.render();
                    updateLastCellWidthFromScrollbar(this);
                    updateTableWidth(this, true);
                }
            }

            this.emit('addrows', { count: dataCount, clear: false });
        }
        return this;
    }

    /** Removes rows from the table */
    removeRows(rowIndex: number, count: number, render?: boolean) {
        let p = this._p;

        if (typeof count !== 'number' || count <= 0) return this;

        if (rowIndex < 0 || rowIndex > p.rows.length - 1) return this;

        p.rows.splice(rowIndex, count);
        render = (render === undefined) ? true : !!render;

        if (p.filteredRows) {
            refilter(this);

            p.tableSkeletonNeedsRendering = true;

            if (render) {
                // Render the skeleton with all rows from scratch
                this.render();
            }

        } else if (render) {
            p.virtualListHelper.removeItemsAt(count, rowIndex);

            if (this._o.virtualTable) {
                updateVirtualHeight(this);
                updateLastCellWidthFromScrollbar(this);
                this.render();
                updateTableWidth(this, false);
            } else {
                this.render();
                updateLastCellWidthFromScrollbar(this);
                updateTableWidth(this, true);
            }
        }

        return this;
    }

    /** Removes a single row from the table */
    removeRow(rowIndex: number, render?: boolean) {
        return this.removeRows(rowIndex, 1, render);
    }

    /** Refreshes the row specified */
    refreshRow(rowIndex: number, render = true) {
        let p = this._p;

        if (rowIndex < 0 || rowIndex > p.rows.length - 1)
            return this;

        // Find out if the row is in the rendered dataset
        let filteredRowIndex = -1;
        if (p.filteredRows && (filteredRowIndex = p.filteredRows.indexOf(p.rows[rowIndex])) === -1)
            return this;

        if (filteredRowIndex === -1) {
            filteredRowIndex = rowIndex;
        }

        p.virtualListHelper.refreshItemAt(filteredRowIndex);

        if (render)
            p.virtualListHelper.render();

        return this;
    }

    /** Get the DOM element for the specified row, if it exists */
    getRowElement(rowIndex: number): HTMLElement | null {
        let p = this._p;

        if (rowIndex < 0 || rowIndex > p.rows.length - 1)
            return null;

        // Find out if the row is in the rendered dataset
        let filteredRowIndex = -1;
        if (p.filteredRows && (filteredRowIndex = p.filteredRows.indexOf(p.rows[rowIndex])) === -1)
            return null;

        if (filteredRowIndex === -1) {
            filteredRowIndex = rowIndex;
        }

        return p.virtualListHelper.getItemElementAt(filteredRowIndex) || null;
    }

    /** Refreshes all virtual rows */
    refreshAllVirtualRows() {
        const p = this._p;
        p.virtualListHelper.invalidate().render();
        return this;
    }

    /** Replace the whole dataset */
    setRows(data: RowData[], resort?: boolean) {
        let p = this._p;

        p.rows.reset(data);

        if (resort && p.rows.sortColumn.length) {
            this.resort();
        } else {
            refilter(this);
        }

        this.clearAndRender().emit('addrows', { count: data.length, clear: true });

        return this;
    }

    // =========================================================================
    // PUBLIC API - Size Changes
    // =========================================================================

    /** Notify the table that its width has changed */
    tableWidthChanged(forceUpdate?: boolean, renderColumns?: boolean) {
        let o = this._o,
            p = this._p,
            detectedWidth = calculateWidthAvailableForColumns(this),
            sizeLeft = detectedWidth,
            relatives = 0;

        if (!p.table) return this;

        renderColumns = renderColumns === undefined || renderColumns;

        let tableWidthBeforeCalculations = 0;

        if (!p.tbody) {
            renderColumns = false;
        }

        if (renderColumns) {
            tableWidthBeforeCalculations = parseFloat(p.tbody.style.minWidth) || 0;
        }

        if (sizeLeft !== p.lastDetectedWidth || forceUpdate) {
            p.lastDetectedWidth = detectedWidth;

            let absWidthTotal = 0, changedColumnIndexes = [], totalRelativePercentage = 0;

            for (let i = 0; i < p.columns.length; i++) {
                p.columns[i].actualWidthConsideringScrollbarWidth = null;
            }

            for (let i = 0; i < p.visibleColumns.length; i++) {
                let col = p.visibleColumns[i];
                if (col.widthMode === ColumnWidthMode.ABSOLUTE) {
                    let width = col.width;
                    width += col.arrowProposedWidth || 0;
                    if (!col.ignoreMin && width < o.minColumnWidth) {
                        width = o.minColumnWidth;
                    }
                    sizeLeft -= width;
                    absWidthTotal += width;

                    // Update actualWidth
                    if (width !== col.actualWidth) {
                        col.actualWidth = width;
                        changedColumnIndexes.push(i);
                    }
                } else if (col.widthMode === ColumnWidthMode.AUTO) {
                    let width = getTextWidth(this, col.label) + 20;
                    width += col.arrowProposedWidth || 0;
                    if (!col.ignoreMin && width < o.minColumnWidth) {
                        width = o.minColumnWidth;
                    }
                    sizeLeft -= width;
                    absWidthTotal += width;

                    // Update actualWidth
                    if (width !== col.actualWidth) {
                        col.actualWidth = width;
                        if (!o.convertColumnWidthsToRelative) {
                            changedColumnIndexes.push(i);
                        }
                    }
                } else if (col.widthMode === ColumnWidthMode.RELATIVE) {
                    totalRelativePercentage += col.width;
                    relatives++;
                }
            }

            // Normalize relative sizes if needed
            if (o.convertColumnWidthsToRelative) {
                for (let i = 0; i < p.visibleColumns.length; i++) {
                    let col = p.visibleColumns[i];
                    if (col.widthMode === ColumnWidthMode.AUTO) {
                        col.widthMode = ColumnWidthMode.RELATIVE;
                        sizeLeft += col.actualWidth;
                        col.width = col.actualWidth / absWidthTotal;
                        totalRelativePercentage += col.width;
                        relatives++;
                    }
                }
            }

            // Normalize relative sizes if needed
            if (relatives && ((totalRelativePercentage < 1 && o.relativeWidthGrowsToFillWidth) ||
                (totalRelativePercentage > 1 && o.relativeWidthShrinksToFillWidth))) {
                for (let i = 0; i < p.visibleColumns.length; i++) {
                    let col = p.visibleColumns[i];
                    if (col.widthMode === ColumnWidthMode.RELATIVE) {
                        col.width /= totalRelativePercentage;
                    }
                }
            }

            let sizeLeftForRelative = Math.max(0, sizeLeft); // Use this as the space to take the relative widths out of
            if (sizeLeftForRelative === 0) {
                sizeLeftForRelative = p.table.clientWidth;
            }

            let minColumnWidthRelative = (o.minColumnWidth / sizeLeftForRelative);
            if (isNaN(minColumnWidthRelative)) {
                minColumnWidthRelative = 0;
            }
            if (minColumnWidthRelative > 0) {
                let extraRelative = 0, delta;

                // First pass - make sure they are all constrained to the minimum width
                for (let i = 0; i < p.visibleColumns.length; i++) {
                    let col = p.visibleColumns[i];
                    if (col.widthMode === ColumnWidthMode.RELATIVE) {
                        if (!col.ignoreMin && col.width < minColumnWidthRelative) {
                            extraRelative += minColumnWidthRelative - col.width;
                            col.width = minColumnWidthRelative;
                        }
                    }
                }

                // Second pass - try to take the extra width out of the other columns to compensate
                for (let i = 0; i < p.visibleColumns.length; i++) {
                    let col = p.visibleColumns[i];
                    if (col.widthMode === ColumnWidthMode.RELATIVE) {
                        if (!col.ignoreMin && col.width > minColumnWidthRelative) {
                            if (extraRelative > 0) {
                                delta = Math.min(extraRelative, col.width - minColumnWidthRelative);
                                col.width -= delta;
                                extraRelative -= delta;
                            }
                        }
                    }
                }
            }

            // Try to fill width
            if (o.autoFillTableWidth && sizeLeft > 0) {
                let nonResizableTotal = 0;
                let sizeLeftToFill = sizeLeft;

                for (let i = 0; i < p.visibleColumns.length; i++) {
                    let col = p.visibleColumns[i];
                    if (!col.resizable && col.widthMode === ColumnWidthMode.ABSOLUTE)
                        nonResizableTotal += col.width;

                    if (col.widthMode === ColumnWidthMode.RELATIVE)
                        sizeLeftToFill -= Math.round(sizeLeftForRelative * col.width);
                }

                let conv = ((detectedWidth - nonResizableTotal) / (detectedWidth - sizeLeftToFill - nonResizableTotal)) || NaN;
                for (let i = 0; i < p.visibleColumns.length && sizeLeftToFill > 0; i++) {
                    let col = p.visibleColumns[i];
                    if (!col.resizable && col.widthMode === ColumnWidthMode.ABSOLUTE)
                        continue;

                    if (col.widthMode === ColumnWidthMode.RELATIVE) {
                        col.width *= conv;
                    } else {
                        let width = col.actualWidth * conv;
                        if (col.actualWidth !== width) {
                            col.actualWidth = width;
                            if (changedColumnIndexes.indexOf(i) === -1)
                                changedColumnIndexes.push(i);
                        }
                    }
                }
            }

            // Materialize relative sizes
            for (let i = 0; i < p.visibleColumns.length; i++) {
                let col = p.visibleColumns[i];
                if (col.widthMode === ColumnWidthMode.RELATIVE) {
                    let width = Math.round(sizeLeftForRelative * col.width);
                    sizeLeft -= width;
                    relatives--;

                    // Take care of rounding errors
                    if (relatives === 0 && sizeLeft === 1) {
                        width++;
                        sizeLeft--;
                    }
                    if (sizeLeft === -1) {
                        width--;
                        sizeLeft++;
                    }

                    // Update actualWidth
                    if (width !== col.actualWidth) {
                        col.actualWidth = width;
                        changedColumnIndexes.push(i);
                    }
                }
            }

            if (p.visibleColumns.length) {
                // (There should always be at least 1 column visible, but just in case)
                p.visibleColumns[p.visibleColumns.length - 1].actualWidthConsideringScrollbarWidth =
                    p.visibleColumns[p.visibleColumns.length - 1].actualWidth - (p.scrollbarWidth || 0);
            }

            p.notifyRendererOfColumnsConfig?.();

            if (renderColumns) {
                let tableWidth = calculateTbodyWidth(this);

                if (tableWidthBeforeCalculations < tableWidth) {
                    updateTableWidth(this, false);
                }

                for (let i = 0; i < changedColumnIndexes.length; i++) {
                    resizeColumnElements(this, changedColumnIndexes[i]);
                }

                if (tableWidthBeforeCalculations > tableWidth) {
                    updateTableWidth(this, false);
                }
            }
        }

        return this;
    }

    /** Notify the table that its height has changed */
    tableHeightChanged() {
        let o = this._o,
            p = this._p;

        if (!p.table) {
            return this;
        }

        const tableStyle = getComputedStyle(p.table);

        let height = getElementHeight(this.el, true)
            - (parseFloat(tableStyle.borderTopWidth) || 0)
            - (parseFloat(tableStyle.borderBottomWidth) || 0);

        if (height !== o.height) {

            o.height = height;

            if (p.tbody) {
                p.tbody.style.height = Math.max(o.height - getElementHeight(p.header, true, true, true), 1) + 'px';
            }

            if (o.virtualTable) {
                this.clearAndRender();
            }
        }

        return this;
    }

    // =========================================================================
    // PUBLIC API - Cell Preview
    // =========================================================================

    /** Hides the current cell preview */
    hideCellPreview() {
        hideCellPreview(this);
        return this;
    }

    /** A synonym for hideCellPreview() */
    abortCellPreview() {
        this.hideCellPreview();
        return this;
    }

    /** Cancel a resize in progress */
    cancelColumnResize() {
        cancelColumnResize(this);
        return this;
    }

    // =========================================================================
    // PUBLIC API - Web Workers
    // =========================================================================

    /** Creates a URL representing the data in the specified element (for Web Workers) */
    getUrlForElementContent(id: string): string | null {
        let blob,
            el = document.getElementById(id);
        if (el) {
            let data = el.textContent;
            if (typeof Blob === 'function') {
                blob = new Blob([data || '']);
            } else {
                // Legacy BlobBuilder support (deprecated)
                const win = window as unknown as Record<string, unknown>;
                const BlobBuilder = win.BlobBuilder || win.WebKitBlobBuilder || win.MozBlobBuilder || win.MSBlobBuilder;
                if (!BlobBuilder) {
                    return null;
                }
                const builder = new (BlobBuilder as new () => { append(data: string): void; getBlob(): Blob })();
                builder.append(data || '');
                blob = builder.getBlob();
            }
            return (window.URL || (window as unknown as { webkitURL: typeof URL }).webkitURL).createObjectURL(blob);
        }
        return null;
    }

    /** Check if Web Workers are supported */
    isWorkerSupported(): boolean {
        return window['Worker'] instanceof Function;
    }

    /** Creates a Web Worker for updating the table */
    createWebWorker(url: string, start?: boolean, resort?: boolean): Worker | null {
        if (this.isWorkerSupported()) {
            let p = this._p;

            let worker = new Worker(url);
            let listener = (evt: MessageEvent) => {
                if (evt.data.append) {
                    this.addRows(evt.data.rows, resort);
                } else {
                    this.setRows(evt.data.rows, resort);
                }
            };
            worker.addEventListener('message', listener, false);
            if (!p.workerListeners) {
                p.workerListeners = [];
            }
            p.workerListeners.push({ worker: worker, listener: listener });
            if (start || start === undefined) {
                worker.postMessage(null);
            }
            return worker;
        }
        return null;
    }

    /** Unbinds a Web Worker from the table, stopping updates */
    unbindWebWorker(worker: Worker) {
        let p = this._p;

        if (p.workerListeners) {
            for (let j = 0; j < p.workerListeners.length; j++) {
                if (p.workerListeners[j].worker === worker) {
                    worker.removeEventListener('message', p.workerListeners[j].listener, false);
                    p.workerListeners.splice(j, 1);
                    j--;
                }
            }
        }

        return this;
    }
}

export default DGTable;

// Re-export types for TypeScript users
export type {
    // Configuration types
    DGTableOptions,
    ColumnOptions,
    ColumnSortOptions,
    SerializedColumnSort,
    RowData,
    // Function types
    CellFormatter,
    HeaderCellFormatter,
    FilterFunction,
    ComparatorFunction,
    OnComparatorRequired,
    CustomSortingProvider,
    // Event types
    RowCreateEvent,
    RowClickEvent,
    CellPreviewEvent,
    CellPreviewDestroyEvent,
    HeaderContextMenuEvent,
    MoveColumnEvent,
    ColumnWidthEvent,
    AddRowsEvent,
    SortEvent,
    // Event map for typed handlers
    DGTableEventMap,
} from './types';



















