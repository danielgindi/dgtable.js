/* eslint-env browser */

'use strict';

import { find, htmlEncode } from './util.js';
import RowCollection from './row_collection.js';
import ColumnCollection from './column_collection.js';
import SelectionHelper from './SelectionHelper.js';
import {
    getScrollHorz,
    setScrollHorz,
} from '@danielgindi/dom-utils/lib/ScrollHelper.js';
import {
    getElementWidth,
    getElementHeight,
    setElementWidth,
    getElementOffset,
    setCssProps,
} from '@danielgindi/dom-utils/lib/Css.js';
import {
    scopedSelector, scopedSelectorAll,
} from '@danielgindi/dom-utils/lib/DomCompat.js';
import VirtualListHelper from '@danielgindi/virtual-list-helper';
import ByColumnFilter from './by_column_filter.js';
import DomEventsSink from '@danielgindi/dom-utils/lib/DomEventsSink.js';
import mitt from 'mitt';

const nativeIndexOf = Array.prototype.indexOf;

let createElement = document.createElement.bind(document);
const hasOwnProperty = Object.prototype.hasOwnProperty;

const IsSafeSymbol = Symbol('safe');
const HoverInEventSymbol = Symbol('hover_in');
const HoverOutEventSymbol = Symbol('hover_out');
const RowClickEventSymbol = Symbol('row_click');
const PreviewCellSymbol = Symbol('preview_cell');
const OriginalCellSymbol = Symbol('cell');

function webkitRenderBugfix(el) {
    // BUGFIX: WebKit has a bug where it does not relayout, and this affects us because scrollbars
    //   are still calculated even though they are not there yet. This is the last resort.
    let oldDisplay = el.style.display;
    el.style.display = 'none';
    //noinspection BadExpressionStatementJS
    el.offsetHeight; // No need to store this anywhere, the reference is enough
    el.style.display = oldDisplay;
    return el;
}

function relativizeElement(el) {
    if (!['relative', 'absolute', 'fixed'].includes(getComputedStyle(el).position)) {
        el.style.position = 'relative';
    }
}

const isInputElementEvent = event => /^(?:INPUT|TEXTAREA|BUTTON|SELECT)$/.test(event.target.tagName);

// noinspection JSUnusedGlobalSymbols
class DGTable {
    /**
     * @param {DGTable.Options?} options - initialization options
     */
    constructor(options) {
        this._init(options);

        /**
         * @public
         * @expose
         * @type {string}
         */
        this.VERSION = DGTable.VERSION;
    }

    /**
     * @param {DGTable.Options?} options - initialization options
     */
    _init(options) {
        options = options || {};

        /**
         * @private
         * @type {DGTable.Options}
         * */
        let o = this._o = {};

        /**
         * @private
         * This is for encapsulating private data */
        let p = this._p = {
            eventsSink: new DomEventsSink(),
            mitt: mitt(),
            /** @type {boolean} */
            tableSkeletonNeedsRendering: true,
        };

        /**
         * @public
         * @expose
         * */
        this.el = (options.el && options.el instanceof Element) ? options.el : document.createElement('div');

        if (this.el !== options.el) {
            this.el.classList.add(options.className || 'dgtable-wrapper');
        }

        p.eventsSink.add(this.el, 'dragend.colresize', this._onEndDragColumnHeader.bind(this));

        /**
         * @private
         * @field {boolean} virtualTable */
        o.virtualTable = options.virtualTable === undefined ? true : !!options.virtualTable;

        /**
         * @private
         * @field {number} estimatedRowHeight */
        o.estimatedRowHeight = options.estimatedRowHeight || undefined;

        /**
         * @private
         * @field {number} rowsBufferSize */
        o.rowsBufferSize = options.rowsBufferSize || 3;

        /**
         * @private
         * @field {number} minColumnWidth */
        o.minColumnWidth = Math.max(options.minColumnWidth || 35, 0);

        /**
         * @private
         * @field {number} resizeAreaWidth */
        o.resizeAreaWidth = options.resizeAreaWidth || 8;

        /**
         * @private
         * @field {boolean} resizableColumns */
        o.resizableColumns = options.resizableColumns === undefined ? true : !!options.resizableColumns;

        /**
         * @private
         * @field {boolean} movableColumns */
        o.movableColumns = options.movableColumns === undefined ? true : !!options.movableColumns;

        /**
         * @private
         * @field {number} sortableColumns */
        o.sortableColumns = options.sortableColumns === undefined ? 1 : (parseInt(options.sortableColumns, 10) || 1);

        /**
         * @private
         * @field {boolean} adjustColumnWidthForSortArrow */
        o.adjustColumnWidthForSortArrow = options.adjustColumnWidthForSortArrow === undefined ? true : !!options.adjustColumnWidthForSortArrow;

        /**
         * @private
         * @field {boolean} convertColumnWidthsToRelative */
        o.convertColumnWidthsToRelative = options.convertColumnWidthsToRelative === undefined ? false : !!options.convertColumnWidthsToRelative;

        /**
         * @private
         * @field {boolean} autoFillTableWidth */
        o.autoFillTableWidth = options.autoFillTableWidth === undefined ? false : !!options.autoFillTableWidth;

        /**
         * @private
         * @field {boolean} allowCancelSort */
        o.allowCancelSort = options.allowCancelSort === undefined ? true : !!options.allowCancelSort;

        /**
         * @private
         * @field {string} cellClasses */
        o.cellClasses = options.cellClasses === undefined ? '' : options.cellClasses;

        /**
         * @private
         * @field {string} resizerClassName */
        o.resizerClassName = options.resizerClassName === undefined ? 'dgtable-resize' : options.resizerClassName;

        /**
         * @private
         * @field {string} tableClassName */
        o.tableClassName = options.tableClassName === undefined ? 'dgtable' : options.tableClassName;

        /**
         * @private
         * @field {boolean} allowCellPreview */
        o.allowCellPreview = options.allowCellPreview === undefined ? true : options.allowCellPreview;

        /**
         * @private
         * @field {boolean} allowHeaderCellPreview */
        o.allowHeaderCellPreview = options.allowHeaderCellPreview === undefined ? true : options.allowHeaderCellPreview;

        /**
         * @private
         * @field {string} cellPreviewClassName */
        o.cellPreviewClassName = options.cellPreviewClassName === undefined ? 'dgtable-cell-preview' : options.cellPreviewClassName;

        /**
         * @private
         * @field {boolean} cellPreviewAutoBackground */
        o.cellPreviewAutoBackground = options.cellPreviewAutoBackground === undefined ? true : options.cellPreviewAutoBackground;

        /**
         * @private
         * @field {function(columnName: string, descending: boolean, defaultComparator: function(a,b):number):(function(a,b):number)} onComparatorRequired */
        o.onComparatorRequired = options.onComparatorRequired === undefined ? null : options.onComparatorRequired;
        if (!o.onComparatorRequired && typeof options['comparatorCallback'] === 'function') {
            o.onComparatorRequired = options['comparatorCallback'];
        }

        o.customSortingProvider = options.customSortingProvider === undefined ? null : options.customSortingProvider;

        /**
         * @private
         * @field {boolean} width */
        o.width = options.width === undefined ? DGTable.Width.NONE : options.width;

        /**
         * @private
         * @field {boolean} relativeWidthGrowsToFillWidth */
        o.relativeWidthGrowsToFillWidth = options.relativeWidthGrowsToFillWidth === undefined ? true : !!options.relativeWidthGrowsToFillWidth;

        /**
         * @private
         * @field {boolean} relativeWidthShrinksToFillWidth */
        o.relativeWidthShrinksToFillWidth = options.relativeWidthShrinksToFillWidth === undefined ? false : !!options.relativeWidthShrinksToFillWidth;

        this.setCellFormatter(options.cellFormatter);
        this.setHeaderCellFormatter(options.headerCellFormatter);
        this.setFilter(options.filter);

        /** @private
         * @field {number} height */
        o.height = options.height;

        // Prepare columns
        this.setColumns(options.columns || [], false);

        // Set sorting columns
        let sortColumns = [];

        if (options.sortColumn) {

            let tmpSortColumns = options.sortColumn;

            if (tmpSortColumns && !Array.isArray(tmpSortColumns)) {
                tmpSortColumns = [tmpSortColumns];
            }

            if (tmpSortColumns) {
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
                        descending: sortColumn.descending,
                    });
                }
            }
        }

        /** @field {RowCollection} _rows */
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

        /** @private
         * @field {RowCollection} _filteredRows */
        p.filteredRows = null;

        p.scrollbarWidth = 0;
        p.lastVirtualScrollHeight = 0;

        this._setupHovers();
    }

    _setupHovers() {
        const p = this._p;

        /*
         Setup hover mechanism.
         We need this to be high performance, as there may be MANY cells to call this on, on creation and destruction.
         */

        /**
         * @param {MouseEvent} event
         * @this {HTMLElement}
         * */
        let hoverMouseOverHandler = (event) => {
            let cell = event.currentTarget;
            let target = event.relatedTarget;
            if (target === cell || cell.contains(target))
                return;
            if (cell[PreviewCellSymbol] &&
                (target === cell[PreviewCellSymbol] || cell[PreviewCellSymbol].contains(target)))
                return;
            this._cellMouseOverEvent(cell);
        };

        /**
         * @param {MouseEvent} event
         * @this {HTMLElement}
         * */
        let hoverMouseOutHandler = (event) => {
            let cell = event.currentTarget[OriginalCellSymbol] || event.currentTarget;
            let target = event.relatedTarget;
            if (target === this || cell.contains(target))
                return;
            if (cell[PreviewCellSymbol] &&
                (target === cell[PreviewCellSymbol] || cell[PreviewCellSymbol].contains(target)))
                return;
            this._cellMouseOutEvent(cell);
        };

        /**
         * @param {HTMLElement} el cell or header-cell
         * */
        p._bindCellHoverIn = el => {
            if (!el[HoverInEventSymbol]) {
                el.addEventListener('mouseover', el[HoverInEventSymbol] = hoverMouseOverHandler);
            }
        };

        /**
         * @param {HTMLElement} el cell or header-cell
         * */
        p._unbindCellHoverIn = el => {
            if (el[HoverInEventSymbol]) {
                el.removeEventListener('mouseover', el[HoverInEventSymbol]);
                el[HoverInEventSymbol] = null;
            }
        };

        /**
         * @param {HTMLElement} el cell or header-cell
         * @returns {DGTable} self
         * */
        p._bindCellHoverOut = (el) => {
            if (!el[HoverOutEventSymbol]) {
                el.addEventListener('mouseout', el[HoverOutEventSymbol] = hoverMouseOutHandler);
            }
        };

        /**
         * @param {HTMLElement} el cell or header-cell
         * @returns {DGTable} self
         * */
        p._unbindCellHoverOut = el => {
            if (el[HoverOutEventSymbol]) {
                el.removeEventListener('mouseout', el[HoverOutEventSymbol]);
                el[HoverOutEventSymbol] = null;
            }
        };
    }

    _setupVirtualTable() {
        const p = this._p, o = this._o;

        const tableClassName = o.tableClassName,
            rowClassName = tableClassName + '-row',
            altRowClassName = tableClassName + '-row-alt',
            cellClassName = tableClassName + '-cell';

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
                    if (column.cellClasses) cell.className += ' ' + column.cellClasses;
                    if (allowCellPreview) {
                        p._bindCellHoverIn(cell);
                    }

                    let cellInner = cell.appendChild(createElement('div'));
                    cellInner.innerHTML = this._getHtmlForCell(rowData, column);

                    row.appendChild(cell);
                }

                row.addEventListener('click', row[RowClickEventSymbol] = event => {
                    this.emit('rowclick', {
                        event: event,
                        filteredRowIndex: virtualIndex,
                        rowIndex: rowIndex,
                        rowEl: row,
                        rowData: rowData,
                    });
                });

                this.emit('rowcreate', {
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

                this._unbindCellEventsForRow(row);

                this.emit('rowdestroy', row);
            },

            onScrollHeightChange: height => {
                // only recalculate scrollbar width if height increased. we reset it in other situations.
                if (height > p._lastVirtualScrollHeight && !p.scrollbarWidth) {
                    this._updateLastCellWidthFromScrollbar();
                }

                p._lastVirtualScrollHeight = height;
            },
        });

        p.virtualListHelper.setCount((p.filteredRows ?? p.rows).length);

        p.notifyRendererOfColumnsConfig();
    }

    /**
     * Register an event handler
     * @param {(string|'*')?} event
     * @param {function(any)} handler
     * @returns {DGTable}
     */
    on(/**string|'*'*/event, /**Function?*/handler) {
        this._p.mitt.on(event, handler);
        return this;
    }

    /**
     * Register a one time event handler
     * @param {(string|'*')?} event
     * @param {function(any)} handler
     * @returns {DGTable}
     */
    once(/**string|'*'*/event, /**Function?*/handler) {
        let wrapped = (value) => {
            this._p.mitt.off(event, wrapped);
            handler(value);
        };
        this._p.mitt.on(event, wrapped);
        return this;
    }

    /**
     * Remove an `handler` for `event`, all events for `event`, or all events completely.
     * @param {(string|'*')?} event
     * @param {function(any)} handler
     * @returns {DGTable}
     */
    off(/**(string|'*')?*/event, /**Function?*/handler) {
        if (!event && !event) {
            this._p.mitt.all.clear();
        } else {
            this._p.mitt.off(event, handler);
        }
        return this;
    }

    /**
     * Emit an event
     * @param {string} event
     * @param {any?} value
     * @returns {DGTable}
     */
    emit(/**string|'*'*/event, /**any?*/value) {
        this._p.mitt.emit(event, value);
        return this;
    }

    /**
     * Detect column width mode
     * @private
     * @param {Number|string} width
     * @param {number} minWidth
     * @returns {Object} parsed width
     */
    _parseColumnWidth(width, minWidth) {

        let widthSize = Math.max(0, parseFloat(width)),
            widthMode = ColumnWidthMode.AUTO; // Default

        if (widthSize > 0) {
            // Well, it's sure is not AUTO, as we have a value

            if (width === widthSize + '%') {
                // It's a percentage!

                widthMode = ColumnWidthMode.RELATIVE;
                widthSize /= 100;
            } else if (widthSize > 0 && widthSize < 1) {
                // It's a decimal value, as a relative value!

                widthMode = ColumnWidthMode.RELATIVE;
            } else {
                // It's an absolute size!

                if (widthSize < minWidth) {
                    widthSize = minWidth;
                }
                widthMode = ColumnWidthMode.ABSOLUTE;
            }
        }

        return { width: widthSize, mode: widthMode };
    }

    /**
     * @private
     * @param {COLUMN_OPTIONS} columnData
     */
    _initColumnFromData(columnData) {

        let parsedWidth = this._parseColumnWidth(columnData.width, columnData.ignoreMin ? 0 : this._o.minColumnWidth);

        let col = {
            name: columnData.name,
            label: columnData.label === undefined ? columnData.name : columnData.label,
            width: parsedWidth.width,
            widthMode: parsedWidth.mode,
            resizable: columnData.resizable === undefined ? true : columnData.resizable,
            sortable: columnData.sortable === undefined ? true : columnData.sortable,
            movable: columnData.movable === undefined ? true : columnData.movable,
            visible: columnData.visible === undefined ? true : columnData.visible,
            cellClasses: columnData.cellClasses === undefined ? this._o.cellClasses : columnData.cellClasses,
            ignoreMin: columnData.ignoreMin === undefined ? false : !!columnData.ignoreMin,
        };

        col.dataPath = columnData.dataPath === undefined ? col.name : columnData.dataPath;
        col.comparePath = columnData.comparePath === undefined ? col.dataPath : columnData.comparePath;

        if (typeof col.dataPath === 'string') {
            col.dataPath = col.dataPath.split('.');
        }
        if (typeof col.comparePath === 'string') {
            col.comparePath = col.comparePath.split('.');
        }

        return col;
    }

    /**
     * Destroy, releasing all memory, events and DOM elements
     * @public
     * @expose
     */
    destroy() {
        let p = this._p || {},
            el = this.el;

        if (this.__removed) {
            return this;
        }

        if (p.resizer) {
            p.resizer.remove();
            p.resizer = null;
        }

        p.virtualListHelper?.destroy();
        p.virtualListHelper = null;

        // Using quotes for __super__ because Google Closure Compiler has a bug...

        this._destroyHeaderCells();

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

        this.__removed = true;

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

    /**
     * @private
     * @returns {DGTable} self
     */
    _unbindCellEventsForTable() {
        const p = this._p;

        if (p.headerRow) {
            for (let i = 0, rows = p.headerRow.childNodes, rowCount = rows.length; i < rowCount; i++) {
                let rowToClean = rows[i];
                for (let j = 0, cells = rowToClean.childNodes, cellCount = cells.length; j < cellCount; j++) {
                    p._unbindCellHoverIn(cells[j]);
                }
            }
        }

        return this;
    }

    /**
     * @private
     * @param {HTMLElement} rowToClean
     * @returns {DGTable} self
     */
    _unbindCellEventsForRow(rowToClean) {
        const p = this._p;
        for (let i = 0, cells = rowToClean.childNodes, cellCount = cells.length; i < cellCount; i++) {
            p._unbindCellHoverIn(cells[i]);
        }
        return this;
    }

    /**
     * @public
     * @expose
     * @returns {DGTable} self
     */
    render() {
        const o = this._o, p = this._p;

        if (!this.el.offsetParent) {
            if (!p._deferredRender) {
                p._deferredRender = setTimeout(() => {
                    p._deferredRender = null;
                    if (!this.__removed && this.el.offsetParent) {
                        this.render();
                    }
                });
            }

            return this;
        }

        if (p.tableSkeletonNeedsRendering === true) {
            p.tableSkeletonNeedsRendering = false;

            if (o.width === DGTable.Width.AUTO) {
                // We need to do this to return to the specified widths instead. The arrows added to the column widths...
                this._clearSortArrows();
            }

            let lastScrollTop = p.table && p.table.parentNode ? p.table.scrollTop : NaN,
                lastScrollHorz = p.table && p.table.parentNode ? getScrollHorz(p.table) : NaN;

            this._renderSkeletonBase()
                ._renderSkeletonBody()
                .tableWidthChanged(true, false) // Take this chance to calculate required column widths
                ._renderSkeletonHeaderCells();

            p.virtualListHelper.setCount((p.filteredRows ?? p.rows).length);

            this._updateVirtualHeight();
            this._updateLastCellWidthFromScrollbar(true);
            this._updateTableWidth(true);

            // Show sort arrows
            for (let i = 0; i < p.rows.sortColumn.length; i++) {
                this._showSortArrow(p.rows.sortColumn[i].column, p.rows.sortColumn[i].descending);
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

    /**
     * Forces a full render of the table
     * @public
     * @expose
     * @param {boolean=true} render - Should render now?
     * @returns {DGTable} self
     */
    clearAndRender(render) {
        let p = this._p;

        p.tableSkeletonNeedsRendering = true;
        p.notifyRendererOfColumnsConfig?.();

        if (render === undefined || render) {
            this.render();
        }

        return this;
    }

    /**
     * Calculate the size required for the table body width (which is the row's width)
     * @private
     * @returns {number} calculated width
     */
    _calculateTbodyWidth() {
        const p = this._p;

        let tableClassName = this._o.tableClassName,
            rowClassName = tableClassName + '-row',
            cellClassName = tableClassName + '-cell',
            visibleColumns = p.visibleColumns,
            colCount = visibleColumns.length;

        const row = createElement('div');
        row.className = rowClassName;
        row.style.float = 'left';

        let sumActualWidth = 0;

        for (let colIndex = 0; colIndex < colCount; colIndex++) {
            const column = visibleColumns[colIndex];
            const cell = createElement('div');
            cell.className = cellClassName;
            cell.style.width = column.actualWidth + 'px';
            if (column.cellClasses) cell.className += ' ' + column.cellClasses;
            cell.appendChild(createElement('div'));
            row.appendChild(cell);
            sumActualWidth += column.actualWidth;
        }

        const thisWrapper = createElement('div');
        thisWrapper.className = this.el.className;
        setCssProps(thisWrapper, {
            'z-index': -1,
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
        let fractionValue = parseFloat(getComputedStyle(fractionTest).borderWidth);
        let hasFractions = Math.round(fractionValue) !== fractionValue;
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
     * Sets the columns of the table
     * @public
     * @expose
     * @param {COLUMN_OPTIONS[]} columns - Column definitions array
     * @param {boolean=true} render - Should render now?
     * @returns {DGTable} self
     */
    setColumns(columns, render) {
        const p = this._p;

        columns = columns || [];

        let normalizedCols = new ColumnCollection();
        for (let i = 0, order = 0; i < columns.length; i++) {

            let columnData = columns[i];
            let normalizedColumn = this._initColumnFromData(columnData);

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

        this._ensureVisibleColumns().clearAndRender(render);

        return this;
    }

    /**
     * Add a column to the table
     * @public
     * @expose
     * @param {COLUMN_OPTIONS} columnData column properties
     * @param {string|number} [before=-1] column name or order to be inserted before
     * @param {boolean=true} render - Should render now?
     * @returns {DGTable} self
     */
    addColumn(columnData, before, render) {
        const p = this._p;
        let columns = p.columns;

        if (columnData && !columns.get(columnData.name)) {
            let beforeColumn = null;
            if (before !== undefined) {
                beforeColumn = columns.get(before) || columns.getByOrder(before);
            }

            let column = this._initColumnFromData(columnData);
            column.order = beforeColumn ? beforeColumn.order : (columns.getMaxOrder() + 1);

            for (let i = columns.getMaxOrder(), to = column.order; i >= to ; i--) {
                let col = columns.getByOrder(i);
                if (col) {
                    col.order++;
                }
            }

            columns.push(column);
            columns.normalizeOrder();

            p.visibleColumns = columns.getVisibleColumns();
            this._ensureVisibleColumns().clearAndRender(render);

            this.emit('addcolumn', column.name);
        }
        return this;
    }

    /**
     * Remove a column from the table
     * @public
     * @expose
     * @param {string} column column name
     * @param {boolean=true} render - Should render now?
     * @returns {DGTable} self
     */
    removeColumn(column, render) {
        const p = this._p;
        let columns = p.columns;

        let colIdx = columns.indexOf(column);
        if (colIdx > -1) {
            columns.splice(colIdx, 1);
            columns.normalizeOrder();

            p.visibleColumns = columns.getVisibleColumns();
            this._ensureVisibleColumns().clearAndRender(render);

            this.emit('removecolumn', column);
        }
        return this;
    }

    /**
     * Sets a new cell formatter.
     * @public
     * @expose
     * @param {function(value: *, columnName: string, row: Object):string|null} [formatter=null] - The cell formatter. Should return an HTML.
     * @returns {DGTable} self
     */
    setCellFormatter(formatter) {
        if (!formatter) {
            formatter = val => (typeof val === 'string') ? htmlEncode(val) : val;
            formatter[IsSafeSymbol] = true;
        }

        /**
         * @private
         * @field {Function} cellFormatter */
        this._o.cellFormatter = formatter;

        return this;
    }

    /**
     * Sets a new header cell formatter.
     * @public
     * @expose
     * @param {function(label: string, columnName: string):string|null} [formatter=null] - The cell formatter. Should return an HTML.
     * @returns {DGTable} self
     */
    setHeaderCellFormatter(formatter) {
        /**
         * @private
         * @field {Function} headerCellFormatter */
        this._o.headerCellFormatter = formatter || function (val) {
            return (typeof val === 'string') ? htmlEncode(val) : val;
        };

        return this;
    }

    /**
     * @public
     * @expose
     * @param {function(row:Object,args:Object):boolean|null} [filterFunc=null] - The filter function to work with filters. Default is a by-colum filter.
     * @returns {DGTable} self
     */
    setFilter(filterFunc) {
        /** @private
         * @field {Function} filter */
        this._o.filter = filterFunc;
        return this;
    }

    /**
     * @public
     * @expose
     * @param {Object|null} args - Options to pass to the filter function
     * @returns {DGTable} self
     */
    filter(args) {
        const p = this._p;

        let filterFunc = this._o.filter || ByColumnFilter;

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
            p.filteredRows = null; // Allow releasing array memory now
        }

        // Shallow-clone the args, as the filter function may want to modify it for keeping state
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

    /**
     * @public
     * @expose
     * @returns {DGTable} self
     */
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

    /**
     * @private
     * @returns {DGTable} self
     */
    _refilter() {
        const p = this._p;

        if (p.filteredRows && p.filterArgs) {
            let filterFunc = this._o.filter || ByColumnFilter;
            p.filteredRows = p.rows.filteredCollection(filterFunc, p.filterArgs);
        }
        return this;
    }

    /**
     * Set a new label to a column
     * @public
     * @expose
     * @param {string} column Name of the column
     * @param {string} label New label for the column
     * @returns {DGTable} self
     */
    setColumnLabel(column, label) {
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

    /**
     * Move a column to a new position
     * @public
     * @expose
     * @param {string|number} src Name or position of the column to be moved
     * @param {string|number} dest Name of the column currently in the desired position, or the position itself
     * @param {boolean} [visibleOnly=true] Should consider only visible columns and visible-relative indexes
     * @returns {DGTable} self
     */
    moveColumn(src, dest, visibleOnly = true) {
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
                this._ensureVisibleColumns();

                if (o.virtualTable) {
                    this.clearAndRender();
                } else {
                    const headerCells = scopedSelectorAll(p.headerRow, `>div.${o.tableClassName}-header-cell`);
                    let beforePos = srcOrder < destOrder ? destOrder + 1 : destOrder,
                        fromPos = srcOrder;
                    headerCells[0].parentNode.insertBefore(headerCells[fromPos], headerCells[beforePos]);

                    let srcWidth = p.visibleColumns[srcOrder];
                    srcWidth = (srcWidth.actualWidthConsideringScrollbarWidth || srcWidth.actualWidth) + 'px';
                    let destWidth = p.visibleColumns[destOrder];
                    destWidth = (destWidth.actualWidthConsideringScrollbarWidth || destWidth.actualWidth) + 'px';

                    let tbodyChildren = p.tbody.childNodes;
                    for (let i = 0, count = tbodyChildren.length; i < count; i++) {
                        let row = tbodyChildren[i];
                        if (row.nodeType !== 1) continue;
                        row.insertBefore(row.childNodes[fromPos], row.childNodes[beforePos]);
                        row.childNodes[destOrder].firstChild.style.width = destWidth;
                        row.childNodes[srcOrder].firstChild.style.width = srcWidth;
                    }
                }
            }

            this.emit('movecolumn', { name: col.name, src: srcOrder, dest: destOrder });
        }
        return this;
    }

    /**
     * Sort the table
     * @public
     * @expose
     * @param {string?} column Name of the column to sort on (or null to remove sort arrow)
     * @param {boolean=} descending Sort in descending order
     * @param {boolean} [add=false] Should this sort be on top of the existing sort? (For multiple column sort)
     * @returns {DGTable} self
     */
    sort(column, descending, add) {
        const o = this._o, p = this._p;

        let columns = p.columns,
            col = columns.get(column);

        let currentSort = p.rows.sortColumn;

        if (col) {
            if (add) { // Add the sort to current sort stack

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
                if ((o.sortableColumns > 0 /* allow manual sort when disabled */ && currentSort.length >= o.sortableColumns) || currentSort.length >= p.visibleColumns.length) {
                    currentSort.length = 0;
                }

            } else { // Sort only by this column
                currentSort.length = 0;
            }

            // Default to ascending
            descending = descending === undefined ? false : descending;

            // Set the required column in the front of the stack
            currentSort.push({
                column: col.name,
                comparePath: col.comparePath || col.dataPath,
                descending: !!descending,
            });
        } else {
            currentSort.length = 0;
        }

        this._clearSortArrows();

        for (let i = 0; i < currentSort.length; i++) {
            this._showSortArrow(currentSort[i].column, currentSort[i].descending);
        }

        if (o.adjustColumnWidthForSortArrow && !p.tableSkeletonNeedsRendering) {
            this.tableWidthChanged(true);
        }

        p.rows.sortColumn = currentSort;

        let comparator;
        if (currentSort.length) {
            comparator = p.rows.sort(!!p.filteredRows);
            if (p.filteredRows) {
                p.filteredRows.sort(!!p.filteredRows);
            }
        }

        if (p.virtualListHelper)
            p.virtualListHelper.invalidate().render();

        // Build output for event, with option names that will survive compilers
        let sorts = [];
        for (let i = 0; i < currentSort.length; i++) {
            sorts.push({ 'column': currentSort[i].column, 'descending': currentSort[i].descending });
        }
        this.emit('sort', { sorts: sorts, comparator: comparator });

        return this;
    }

    /**
     * Re-sort the table using current sort specifiers
     * @public
     * @expose
     * @returns {DGTable} self
     */
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

            let comparator;
            p.rows.sortColumn = currentSort;
            if (currentSort.length) {
                comparator = p.rows.sort(!!p.filteredRows);
                if (p.filteredRows) {
                    p.filteredRows.sort(!!p.filteredRows);
                }
            }

            // Build output for event, with option names that will survive compilers
            let sorts = [];
            for (let i = 0; i < currentSort.length; i++) {
                sorts.push({ 'column': currentSort[i].column, 'descending': currentSort[i].descending });
            }
            this.emit('sort', { sorts: sorts, resort: true, comparator: comparator });
        }

        return this;
    }

    /**
     * Make sure there's at least one column visible
     * @private
     * @expose
     * @returns {DGTable} self
     */
    _ensureVisibleColumns() {
        const p = this._p;

        if (p.visibleColumns.length === 0 && p.columns.length) {
            p.columns[0].visible = true;
            p.visibleColumns.push(p.columns[0]);
            this.emit('showcolumn', p.columns[0].name);
        }

        return this;
    }

    /**
     * Show or hide a column
     * @public
     * @expose
     * @param {string} column Unique column name
     * @param {boolean} visible New visibility mode for the column
     * @returns {DGTable} self
     */
    setColumnVisible(column, visible) {
        const p = this._p;

        let col = p.columns.get(column);

        //noinspection PointlessBooleanExpressionJS
        visible = !!visible;

        if (col && !!col.visible !== visible) {
            col.visible = visible;
            p.visibleColumns = p.columns.getVisibleColumns();
            this.emit(visible ? 'showcolumn' : 'hidecolumn', column);
            this._ensureVisibleColumns();
            this.clearAndRender();
        }
        return this;
    }

    /**
     * Get the visibility mode of a column
     * @public
     * @expose
     * @returns {boolean} true if visible
     */
    isColumnVisible(column) {
        const p = this._p;
        let col = p.columns.get(column);
        if (col) {
            return col.visible;
        }
        return false;
    }

    /**
     * Globally set the minimum column width
     * @public
     * @expose
     * @param {number} minColumnWidth Minimum column width
     * @returns {DGTable} self
     */
    setMinColumnWidth(minColumnWidth) {
        let o = this._o;
        minColumnWidth = Math.max(minColumnWidth, 0);
        if (o.minColumnWidth !== minColumnWidth) {
            o.minColumnWidth = minColumnWidth;
            this.tableWidthChanged(true);
        }
        return this;
    }

    /**
     * Get the current minimum column width
     * @public
     * @expose
     * @returns {number} Minimum column width
     */
    getMinColumnWidth() {
        return this._o.minColumnWidth;
    }

    /**
     * Set the limit on concurrent columns sorted
     * @public
     * @expose
     * @param {number} sortableColumns How many sortable columns to allow?
     * @returns {DGTable} self
     */
    setSortableColumns(sortableColumns) {
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

    /**
     * Get the limit on concurrent columns sorted
     * @public
     * @expose
     * @returns {number} How many sortable columns are allowed?
     */
    getSortableColumns() {
        return this._o.sortableColumns;
    }

    /**
     * @public
     * @expose
     * @param {boolean?} movableColumns=true are the columns movable?
     * @returns {DGTable} self
     */
    setMovableColumns(movableColumns) {
        let o = this._o;
        //noinspection PointlessBooleanExpressionJS
        movableColumns = movableColumns === undefined ? true : !!movableColumns;
        if (o.movableColumns !== movableColumns) {
            o.movableColumns = movableColumns;
        }
        return this;
    }

    /**
     * @public
     * @expose
     * @returns {boolean} are the columns movable?
     */
    getMovableColumns() {
        return this._o.movableColumns;
    }

    /**
     * @public
     * @expose
     * @param {boolean} resizableColumns=true are the columns resizable?
     * @returns {DGTable} self
     */
    setResizableColumns(resizableColumns) {
        let o = this._o;
        //noinspection PointlessBooleanExpressionJS
        resizableColumns = resizableColumns === undefined ? true : !!resizableColumns;
        if (o.resizableColumns !== resizableColumns) {
            o.resizableColumns = resizableColumns;
        }
        return this;
    }

    /**
     * @public
     * @expose
     * @returns {boolean} are the columns resizable?
     */
    getResizableColumns() {
        return this._o.resizableColumns;
    }

    /**
     * Sets a functions that supplies comparators dynamically
     * @public
     * @expose
     * @param {{function(columnName: string, descending: boolean, defaultComparator: {function(a:any,b:any):number}):{function(a:any,b:any):number}}|null|undefined} comparatorCallback a function that returns the comparator for a specific column
     * @returns {DGTable} self
     */
    setOnComparatorRequired(comparatorCallback) {
        let o = this._o;
        if (o.onComparatorRequired !== comparatorCallback) {
            o.onComparatorRequired = comparatorCallback;
        }
        return this;
    }

// Backwards compatibility
    setComparatorCallback(comparatorCallback) {
        return this.setOnComparatorRequired(comparatorCallback);
    }

    /**
     * sets custom sorting function for a data set
     * @public
     * @expose
     * @param {{function(data: any[], sort: function(any[]):any[]):any[]}|null|undefined} customSortingProvider provides a custom sorting function (not the comparator, but a sort() alternative) for a data set
     * @returns {DGTable} self
     */
    setCustomSortingProvider(customSortingProvider) {
        let o = this._o;
        if (o.customSortingProvider !== customSortingProvider) {
            o.customSortingProvider = customSortingProvider;
        }
        return this;
    }

    /**
     * Set a new width to a column
     * @public
     * @expose
     * @param {string} column name of the column to resize
     * @param {number|string} width new column as pixels, or relative size (0.5, 50%)
     * @returns {DGTable} self
     */
    setColumnWidth(column, width) {

        const p = this._p;

        let col = p.columns.get(column);

        let parsedWidth = this._parseColumnWidth(width, col.ignoreMin ? 0 : this._o.minColumnWidth);

        if (col) {
            let oldWidth = this._serializeColumnWidth(col);

            col.width = parsedWidth.width;
            col.widthMode = parsedWidth.mode;

            let newWidth = this._serializeColumnWidth(col);

            if (oldWidth !== newWidth) {
                this.tableWidthChanged(true); // Calculate actual sizes
            }

            this.emit('columnwidth', { name: col.name, width: newWidth, oldWidth: oldWidth });
        }
        return this;
    }

    /**
     * @public
     * @expose
     * @param {string} column name of the column
     * @returns {string|null} the serialized width of the specified column, or null if column not found
     */
    getColumnWidth(column) {
        const p = this._p;

        let col = p.columns.get(column);
        if (col) {
            return this._serializeColumnWidth(col);
        }
        return null;
    }

    /**
     * @public
     * @expose
     * @param {string} column name of the column
     * @returns {SERIALIZED_COLUMN|null} configuration for all columns
     */
    getColumnConfig(column) {
        const p = this._p;
        let col = p.columns.get(column);
        if (col) {
            return {
                'order': col.order,
                'width': this._serializeColumnWidth(col),
                'visible': col.visible,
                'label': col.label,
            };
        }
        return null;
    }

    /**
     * Returns a config object for the columns, to allow saving configurations for next time...
     * @public
     * @expose
     * @returns {Object} configuration for all columns
     */
    getColumnsConfig() {
        const p = this._p;

        let config = {};
        for (let i = 0; i < p.columns.length; i++) {
            config[p.columns[i].name] = this.getColumnConfig(p.columns[i].name);
        }
        return config;
    }

    /**
     * Returns an array of the currently sorted columns
     * @public
     * @expose
     * @returns {Array.<SERIALIZED_COLUMN_SORT>} configuration for all columns
     */
    getSortedColumns() {
        const p = this._p;

        let sorted = [];
        for (let i = 0; i < p.rows.sortColumn.length; i++) {
            let sort = p.rows.sortColumn[i];
            sorted.push({ column: sort.column, descending: sort.descending });
        }
        return sorted;
    }

    /**
     * Returns the HTML string for a specific cell. Can be used externally for special cases (i.e. when setting a fresh HTML in the cell preview through the callback).
     * @public
     * @expose
     * @param {number} rowIndex - index of the row
     * @param {string} columnName - name of the column
     * @returns {string|null} HTML string for the specified cell
     */
    getHtmlForRowCell(rowIndex, columnName) {
        const p = this._p;

        if (rowIndex < 0 || rowIndex > p.rows.length - 1) return null;
        let column = p.columns.get(columnName);
        if (!column) return null;
        let rowData = p.rows[rowIndex];

        return this._getHtmlForCell(rowData, column);
    }

    /**
     * Returns the HTML string for a specific cell. Can be used externally for special cases (i.e. when setting a fresh HTML in the cell preview through the callback).
     * @public
     * @expose
     * @param {Object} rowData - row data
     * @param {Object} columnName - column data
     * @returns {string|null} HTML string for the specified cell
     */
    getHtmlForRowDataCell(rowData, columnName) {
        const p = this._p;

        let column = p.columns.get(columnName);
        if (!column) return null;

        return this._getHtmlForCell(rowData, column);
    }

    /**
     * Returns the HTML string for a specific cell. Can be used externally for special cases (i.e. when setting a fresh HTML in the cell preview through the callback).
     * @private
     * @expose
     * @param {Object} rowData - row data
     * @param {Object} column - column data
     * @returns {string} HTML string for the specified cell
     */
    _getHtmlForCell(rowData, column) {
        let dataPath = column.dataPath;
        let colValue = rowData[dataPath[0]];
        for (let dataPathIndex = 1; dataPathIndex < dataPath.length; dataPathIndex++) {
            if (colValue == null) break;
            colValue = colValue && colValue[dataPath[dataPathIndex]];
        }

        const formatter = this._o.cellFormatter;
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

    /**
     * Returns the y pos of a row by index
     * @public
     * @expose
     * @param {number} rowIndex - index of the row
     * @returns {number|null} Y pos
     */
    getRowYPos(rowIndex) {
        const p = this._p;

        return p.virtualListHelper.getItemPosition(rowIndex) || null;
    }

    /**
     * Returns the row data for a specific row
     * @public
     * @expose
     * @param {number} row index of the row
     * @returns {Object} Row data
     */
    getDataForRow(row) {
        const p = this._p;

        if (row < 0 || row > p.rows.length - 1) return null;
        return p.rows[row];
    }

    /**
     * Gets the number of rows
     * @public
     * @expose
     * @returns {number} Row count
     */
    getRowCount() {
        const p = this._p;
        return p.rows ? p.rows.length : 0;
    }

    /**
     * Returns the actual row index for specific row (out of the full data set, not filtered)
     * @public
     * @expose
     * @param {Object} rowData - Row data to find
     * @returns {number} Row index
     */
    getIndexForRow(rowData) {
        const p = this._p;
        return p.rows.indexOf(rowData);
    }

    /**
     * Gets the number of filtered rows
     * @public
     * @expose
     * @returns {number} Filtered row count
     */
    getFilteredRowCount() {
        const p = this._p;
        return (p.filteredRows || p.rows).length;
    }

    /**
     * Returns the filtered row index for specific row
     * @public
     * @expose
     * @param {Object} rowData - Row data to find
     * @returns {number} Row index
     */
    getIndexForFilteredRow(rowData) {
        const p = this._p;
        return (p.filteredRows || p.rows).indexOf(rowData);
    }

    /**
     * Returns the row data for a specific row
     * @public
     * @expose
     * @param {number} row index of the filtered row
     * @returns {Object} Row data
     */
    getDataForFilteredRow(row) {
        const p = this._p;
        if (row < 0 || row > (p.filteredRows || p.rows).length - 1) return null;
        return (p.filteredRows || p.rows)[row];
    }

    /**
     * Returns DOM element of the header row
     * @public
     * @expose
     * @returns {Element} Row element
     */
    getHeaderRowElement() {
        return this._p.headerRow;
    }

    /**
     * @private
     * @param {Element} el
     * @returns {number} width
     */
    _horizontalPadding(el) {
        const style = getComputedStyle(el);
        return ((parseFloat(style.paddingLeft) || 0) +
            (parseFloat(style.paddingRight) || 0));
    }

    /**
     * @private
     * @param {Element} el
     * @returns {number} width
     */
    _horizontalBorderWidth(el) {
        const style = getComputedStyle(el);
        return ((parseFloat(style.borderLeftWidth) || 0) +
        (parseFloat(style.borderRightWidth) || 0));
    }

    /**
     * @private
     * @returns {number} width
     */
    _calculateWidthAvailableForColumns() {
        const o = this._o, p = this._p;

        // Changing display mode briefly, to prevent taking in account the  parent's scrollbar width when we are the cause for it
        let oldDisplay, lastScrollTop, lastScrollLeft;
        if (p.table) {
            lastScrollTop = p.table ? p.table.scrollTop : 0;
            lastScrollLeft = p.table ? p.table.scrollLeft : 0;

            if (o.virtualTable) {
                oldDisplay = p.table.style.display;
                p.table.style.display = 'none';
            }
        }

        let detectedWidth = getElementWidth(this.el);

        if (p.table) {
            if (o.virtualTable) {
                p.table.style.display = oldDisplay;
            }

            p.table.scrollTop = lastScrollTop;
            p.table.scrollLeft = lastScrollLeft;
            p.header.scrollLeft = lastScrollLeft;
        }

        let tableClassName = o.tableClassName;

        const thisWrapper = createElement('div');
        thisWrapper.className = this.el.className;
        setCssProps(thisWrapper, {
            'z-index': -1,
            'position': 'absolute',
            left: '0',
            top: '-9999px',
        });
        let header = createElement('div');
        header.className = `${tableClassName}-header`;
        thisWrapper.appendChild(header);
        let headerRow = createElement('div');
        headerRow.index = null;
        headerRow.vIndex = null;
        headerRow.className = `${tableClassName}-header-row`;
        header.appendChild(headerRow);
        for (let i = 0; i < p.visibleColumns.length; i++) {
            const column = p.visibleColumns[i];
            const cell = createElement('div');
            cell.className = `${tableClassName}-header-cell ${column.cellClasses || ''}`;
            cell['columnName'] = column.name;
            cell.appendChild(createElement('div'));
            headerRow.appendChild(cell);
        }
        document.body.appendChild(thisWrapper);

        detectedWidth -= this._horizontalBorderWidth(headerRow);

        let cells = scopedSelectorAll(headerRow, `>div.${tableClassName}-header-cell`);
        for (const cell of cells) {
            const cellStyle = getComputedStyle(cell);
            let isBoxing = cellStyle.boxSizing === 'border-box';
            if (!isBoxing) {
                detectedWidth -=
                    (parseFloat(cellStyle.borderRightWidth) || 0) +
                    (parseFloat(cellStyle.borderLeftWidth) || 0) +
                    (this._horizontalPadding(cell)); // CELL's padding

                const colName = cell['columnName'];
                const column = p.columns.get(colName);
                if (column)
                    detectedWidth -= column.arrowProposedWidth || 0;
            }
        }

        thisWrapper.remove();

        return Math.max(0, detectedWidth);
    }

    _getTextWidth(text) {
        let tableClassName = this._o.tableClassName;

        const tableWrapper = createElement('div');
        tableWrapper.className = this.el.className;
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

        let width = getElementWidth(cell);

        tableWrapper.remove();

        return width;
    }

    /**
     * Notify the table that its width has changed
     * @public
     * @expose
     * @param {boolean} [forceUpdate=false]
     * @param {boolean} [renderColumns=true]
     * @returns {DGTable} self
     */
    tableWidthChanged(forceUpdate, renderColumns) {

        let o = this._o,
            p = this._p,
            detectedWidth = this._calculateWidthAvailableForColumns(),
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
                    width += col.arrowProposedWidth || 0; // Sort-arrow width
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
                    let width = this._getTextWidth(col.label) + 20;
                    width += col.arrowProposedWidth || 0; // Sort-arrow width
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
                    if (relatives === 0 && sizeLeft === 1) { // Take care of rounding errors
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
                let tableWidth = this._calculateTbodyWidth();

                if (tableWidthBeforeCalculations < tableWidth) {
                    this._updateTableWidth(false);
                }

                for (let i = 0; i < changedColumnIndexes.length; i++) {
                    this._resizeColumnElements(changedColumnIndexes[i]);
                }

                if (tableWidthBeforeCalculations > tableWidth) {
                    this._updateTableWidth(false);
                }
            }
        }

        return this;
    }

    /**
     * Notify the table that its height has changed
     * @public
     * @expose
     * @returns {DGTable} self
     */
    tableHeightChanged() {
        let o = this._o,
            p = this._p;

        if (!p.table) {
            return this;
        }

        const tableStyle = getComputedStyle(p.table);

        let height = getElementHeight(this.el, true)
            - (parseFloat(tableStyle.borderTopWidth) || 0) // Subtract top border of inner element
            - (parseFloat(tableStyle.borderBottomWidth) || 0); // Subtract bottom border of inner element

        if (height !== o.height) {

            o.height = height;

            if (p.tbody) {
                // At least 1 pixel - to show scrollbars correctly.
                p.tbody.style.height = Math.max(o.height - getElementHeight(p.header, true, true, true), 1) + 'px';
            }

            if (o.virtualTable) {
                this.clearAndRender();
            }
        }

        return this;
    }

    /**
     * Add rows to the table
     * @public
     * @expose
     * @param {Object[]} data - array of rows to add to the table
     * @param {number} [at=-1] - where to add the rows at
     * @param {boolean} [resort=false] - should resort all rows?
     * @param {boolean} [render=true]
     * @returns {DGTable} self
     */
    addRows(data, at, resort, render) {
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

        if (data) {
            p.rows.add(data, at);

            if (p.filteredRows || (resort && p.rows.sortColumn.length)) {

                if (resort && p.rows.sortColumn.length) {
                    this.resort();
                } else {
                    this._refilter();
                }

                p.tableSkeletonNeedsRendering = true;

                if (render) {
                    // Render the skeleton with all rows from scratch
                    this.render();
                }

            } else if (render) {
                p.virtualListHelper.addItemsAt(data.length, at);

                if (this._o.virtualTable) {
                    this._updateVirtualHeight()
                        ._updateLastCellWidthFromScrollbar() // Detect vertical scrollbar height
                        .render()
                        ._updateTableWidth(false); // Update table width to suit the required width considering vertical scrollbar

                } else if (p.tbody) {
                    this.render()
                        ._updateLastCellWidthFromScrollbar() // Detect vertical scrollbar height, and update existing last cells
                        ._updateTableWidth(true); // Update table width to suit the required width considering vertical scrollbar
                }
            }

            this.emit('addrows', { count: data.length, clear: false });
        }
        return this;
    }

    /**
     * Removes a row from the table
     * @public
     * @expose
     * @param {number} rowIndex - index
     * @param {number} count - how many rows to remove
     * @param {boolean=true} render
     * @returns {DGTable} self
     */
    removeRows(rowIndex, count, render) {
        let p = this._p;

        if (typeof count !== 'number' || count <= 0) return this;

        if (rowIndex < 0 || rowIndex > p.rows.length - 1) return this;

        p.rows.splice(rowIndex, count);
        render = (render === undefined) ? true : !!render;

        if (p.filteredRows) {
            this._refilter();

            p.tableSkeletonNeedsRendering = true;

            if (render) {
                // Render the skeleton with all rows from scratch
                this.render();
            }

        } else if (render) {
            p.virtualListHelper.removeItemsAt(count, rowIndex);

            if (this._o.virtualTable) {
                this._updateVirtualHeight()
                    ._updateLastCellWidthFromScrollbar()
                    .render()
                    ._updateTableWidth(false); // Update table width to suit the required width considering vertical scrollbar
            } else {
                this.render()
                    ._updateLastCellWidthFromScrollbar()
                    ._updateTableWidth(true); // Update table width to suit the required width considering vertical scrollbar
            }
        }

        return this;
    }

    /**
     * Removes a row from the table
     * @public
     * @expose
     * @param {number} rowIndex - index
     * @param {boolean=true} render
     * @returns {DGTable} self
     */
    removeRow(rowIndex, render) {
        return this.removeRows(rowIndex, 1, render);
    }

    /**
     * Refreshes the row specified
     * @public
     * @expose
     * @param {number} rowIndex index
     * @param {boolean} render should render the changes immediately?
     * @returns {DGTable} self
     */
    refreshRow(rowIndex, render = true) {
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

    /**
     * Get the DOM element for the specified row, if it exists
     * @public
     * @expose
     * @param {number} rowIndex index
     * @returns {Element|null} row or null
     */
    getRowElement(rowIndex) {
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

    /**
     * Refreshes all virtual rows
     * @public
     * @expose
     * @returns {DGTable} self
     */
    refreshAllVirtualRows() {
        const p = this._p;
        p.virtualListHelper.invalidate().render();
        return this;
    }

    /**
     * Replace the whole dataset
     * @public
     * @expose
     * @param {Object[]} data array of rows to add to the table
     * @param {boolean} [resort=false] should resort all rows?
     * @returns {DGTable} self
     */
    setRows(data, resort) {
        let p = this._p;

        // this.scrollTop = this.$el.find('.table').scrollTop();
        p.rows.reset(data);

        if (resort && p.rows.sortColumn.length) {
            this.resort();
        } else {
            this._refilter();
        }

        this.clearAndRender().emit('addrows', { count: data.length, clear: true });

        return this;
    }

    /**
     * Creates a URL representing the data in the specified element.
     * This uses the Blob or BlobBuilder of the modern browsers.
     * The url can be used for a Web Worker.
     * @public
     * @expose
     * @param {string} id Id of the element containing your data
     * @returns {string|null} the url, or null if not supported
     */
    getUrlForElementContent(id) {
        let blob,
            el = document.getElementById(id);
        if (el) {
            let data = el.textContent;
            if (typeof Blob === 'function') {
                blob = new Blob([data]);
            } else {
                let BlobBuilder = window.BlobBuilder || window.WebKitBlobBuilder || window.MozBlobBuilder || window.MSBlobBuilder;
                if (!BlobBuilder) {
                    return null;
                }
                let builder = new BlobBuilder();
                builder.append(data);
                blob = builder.getBlob();
            }
            return (window.URL || window.webkitURL).createObjectURL(blob);
        }
        return null;
    }

    /**
     * @public
     * @expose
     * @returns {boolean} A value indicating whether Web Workers are supported
     */
    isWorkerSupported() {
        return window['Worker'] instanceof Function;
    }

    /**
     * Creates a Web Worker for updating the table.
     * @public
     * @expose
     * @param {string} url Url to the script for the Web Worker
     * @param {boolean} [start=true] if true, starts the Worker immediately
     * @param {boolean} [resort=false]
     * @returns {Worker|null} the Web Worker, or null if not supported
     */
    createWebWorker(url, start, resort) {
        if (this.isWorkerSupported()) {
            let     p = this._p;

            let worker = new Worker(url);
            let listener = (evt) => {
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

    /**
     * Unbinds a Web Worker from the table, stopping updates.
     * @public
     * @expose
     * @param {Worker} worker the Web Worker
     * @returns {DGTable} self
     */
    unbindWebWorker(worker) {
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

    /**
     * A synonym for hideCellPreview()
     * @public
     * @expose
     * @returns {DGTable} self
     */
    abortCellPreview() {
        this.hideCellPreview();
        return this;
    }

    /**
     * Cancel a resize in progress
     * @expose
     * @private
     * @returns {DGTable} self
     */
    cancelColumnResize() {
        const p = this._p;

        if (p.resizer) {
            p.resizer.remove();
            p.resizer = null;
            p.eventsSink.remove(document, '.colresize');
        }

        return this;
    }

    _onTableScrolledHorizontally() {
        const p = this._p;

        p.header.scrollLeft = p.table.scrollLeft;
    }

    /**previousElementSibling
     * Reverse-calculate the column to resize from mouse position
     * @private
     * @param {MouseEvent} event mouse event
     * @returns {string|null} name of the column which the mouse is over, or null if the mouse is not in resize position
     */
    _getColumnByResizePosition(event) {
        let o = this._o,
            rtl = this._isTableRtl();

        let headerCell = event.target.closest(`div.${o.tableClassName}-header-cell,div.${o.cellPreviewClassName}`);
        if (headerCell[OriginalCellSymbol]) {
            headerCell = headerCell[OriginalCellSymbol];
        }

        let previousElementSibling = headerCell.previousSibling;
        while (previousElementSibling && previousElementSibling.nodeType !== 1) {
            previousElementSibling = previousElementSibling.previousSibling;
        }

        let firstCol = !previousElementSibling;

        let mouseX = (event.pageX || event.clientX) - getElementOffset(headerCell).left;

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
     * @param {TouchEvent} event
     */
    _onTouchStartColumnHeader(event) {
        const p = this._p;

        if (p.currentTouchId) return;

        let startTouch = event.changedTouches[0];
        p.currentTouchId = startTouch.identifier;

        let cellEl = event.currentTarget;

        let startPos = { x: startTouch.pageX, y: startTouch.pageY },
            currentPos = startPos,
            distanceTreshold = 9;

        let tapAndHoldTimeout;

        let unbind = function () {
            p.currentTouchId = null;
            p.eventsSink.remove(cellEl, '.colheader');
            clearTimeout(tapAndHoldTimeout);
        };

        let fakeMouseEvent = (name, ...args) => {
            const dict = {};
            for (const k of event)
                dict[k] = event[k];

            for (const obj of args) {
                for (const key of ['target', 'clientX', 'clientY', 'offsetX', 'offsetY', 'screenX', 'screenY', 'pageX', 'pageY', 'which']) {
                    if (obj[key] != null)
                        dict[key] = obj[key];
                }
            }

            return new MouseEvent(name, event);
        };

        cellEl.dispatchEvent(
            fakeMouseEvent('mousedown', event.changedTouches[0], { button: 0, target: event.target }),
        );

        tapAndHoldTimeout = setTimeout(() => {
            unbind();

            p.eventsSink
                .add(cellEl, 'touchend.colheader', (event) => {
                    // Prevent simulated mouse events after touchend
                    if (!isInputElementEvent(event))
                        event.preventDefault();

                    p.eventsSink.remove(cellEl, '.colheader');
                }, { once: true })
                .add(cellEl, 'touchcancel.colheader', (_event) => {
                    p.eventsSink.remove(cellEl, '.colheader');
                }, { once: true });

            let distanceTravelled = Math.sqrt(Math.pow(Math.abs(currentPos.x - startPos.x), 2) + Math.pow(Math.abs(currentPos.y - startPos.y), 2));

            if (distanceTravelled < distanceTreshold) {
                this.cancelColumnResize();

                cellEl.dispatchEvent(
                    fakeMouseEvent('mouseup', event.changedTouches[0], { button: 2, target: event.target }),
                );
            }

        }, 500);

        p.eventsSink
            .add(cellEl, 'touchend.colheader', (event) => {
                let touch = find(event.changedTouches, (touch) => touch.identifier === p.currentTouchId);
                if (!touch) return;

                unbind();

                // Prevent simulated mouse events after touchend
                if (!isInputElementEvent(event))
                    event.preventDefault();

                currentPos = { x: touch.pageX, y: touch.pageY };
                let distanceTravelled = Math.sqrt(Math.pow(Math.abs(currentPos.x - startPos.x), 2) + Math.pow(Math.abs(currentPos.y - startPos.y), 2));

                if (distanceTravelled < distanceTreshold || p.resizer) {
                    cellEl.dispatchEvent(
                        fakeMouseEvent('mouseup', touch, { 0: 2, target: event.target }),
                    );

                    cellEl.dispatchEvent(
                        fakeMouseEvent('click', touch, { button: 0, target: event.target }),
                    );
                }

            })
            .add(cellEl, 'touchcancel.colheader', unbind)
            .add(cellEl, 'touchmove.colheader', (event) => {
                let touch = find(event.changedTouches, (touch) => touch.identifier === p.currentTouchId);
                if (!touch) return;

                // Keep track of current position, so we know if we need to cancel the tap-and-hold
                currentPos = { x: touch.pageX, y: touch.pageY };

                if (p.resizer) {
                    event.preventDefault();

                    cellEl.dispatchEvent(
                        fakeMouseEvent('mousemove', touch, { target: event.target }),
                    );
                }
            });
    }

    /**
     * @param {MouseEvent} event
     */
    _onMouseDownColumnHeader(event) {
        if (event.button !== 0) return this; // Only treat left-clicks

        let o = this._o,
            p = this._p,
            col = this._getColumnByResizePosition(event);

        if (col) {
            let column = p.columns.get(col);
            if (!o.resizableColumns || !column || !column.resizable) {
                return false;
            }

            let rtl = this._isTableRtl();

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
            this.el.appendChild(p.resizer);

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
                'height': getElementHeight(this.el, false, false, false) + 'px',
            });
            p.resizer['columnName'] = selectedHeaderCell['columnName'];

            try { p.resizer.style.zIndex = ''; }
            catch (ignored) { /* we're ok with this */ }

            p.eventsSink
                .add(document, 'mousemove.colresize', this._onMouseMoveResizeArea.bind(this))
                .add(document, 'mouseup.colresize', this._onEndDragColumnHeader.bind(this));

            event.preventDefault();
        }
    }

    /**
     * @param {MouseEvent} event event
     */
    _onMouseMoveColumnHeader(event) {
        let o = this._o,
            p = this._p;

        if (o.resizableColumns) {
            let col = this._getColumnByResizePosition(event);
            let headerCell = event.target.closest(`div.${o.tableClassName}-header-cell,div.${o.cellPreviewClassName}`);
            if (!col || !p.columns.get(col).resizable) {
                headerCell.style.cursor = '';
            } else {
                headerCell.style.cursor = 'e-resize';
            }
        }
    }

    /**
     * @param {MouseEvent} event
     */
    _onMouseUpColumnHeader(event) {
        if (event.button === 2) {
            let o = this._o;
            let headerCell = event.target.closest(`div.${o.tableClassName}-header-cell,div.${o.cellPreviewClassName}`);
            let bounds = getElementOffset(headerCell);
            bounds['width'] = getElementWidth(headerCell, true, true, true);
            bounds['height'] = getElementHeight(headerCell, true, true, true);
            this.emit('headercontextmenu', {
                columnName: headerCell['columnName'],
                pageX: event.pageX,
                pageY: event.pageY,
                bounds: bounds,
            });
        }
        return this;
    }

    /**
     * @private
     * @param {MouseEvent} event event
     */
    _onMouseLeaveColumnHeader(event) {
        let o = this._o;
        let headerCell = event.target.closest(`div.${o.tableClassName}-header-cell,div.${o.cellPreviewClassName}`);
        headerCell.style.cursor = '';
    }

    /**
     * @private
     * @param {MouseEvent} event event
     */
    _onClickColumnHeader(event) {
        if (isInputElementEvent(event))
            return;

        if (!this._getColumnByResizePosition(event)) {
            let o = this._o,
                p = this._p;

            let headerCell = event.target.closest(`div.${o.tableClassName}-header-cell,div.${o.cellPreviewClassName}`);
            if (o.sortableColumns) {
                let column = p.columns.get(headerCell['columnName']);
                let currentSort = p.rows.sortColumn;
                if (column && column.sortable) {
                    let shouldAdd = true;

                    let lastSort = currentSort.length ? currentSort[currentSort.length - 1] : null;

                    if (lastSort && lastSort.column === column.name) {
                        if (!lastSort.descending || !o.allowCancelSort) {
                            lastSort.descending = !lastSort.descending;
                        } else {
                            shouldAdd = false;
                            currentSort.splice(currentSort.length - 1, 1);
                        }
                    }

                    if (shouldAdd) {
                        this.sort(column.name, undefined, true).render();
                    } else {
                        this.sort(); // just refresh current situation
                    }
                }
            }
        }
    }

    /**
     * @private
     * @param {DragEvent} event event
     */
    _onStartDragColumnHeader(event) {
        let o = this._o,
            p = this._p;

        if (o.movableColumns) {
            let headerCell = event.target.closest(`div.${o.tableClassName}-header-cell,div.${o.cellPreviewClassName}`);
            let column = p.columns.get(headerCell['columnName']);
            if (column && column.movable) {
                headerCell.style.opacity = 0.35;
                p.dragId = Math.random() * 0x9999999; // Recognize this ID on drop
                event.dataTransfer.setData('text', JSON.stringify({ dragId: p.dragId, column: column.name }));
            } else {
                event.preventDefault();
            }
        } else {
            event.preventDefault();
        }

        return undefined;
    }

    /**
     * @private
     * @param {MouseEvent} event event
     */
    _onMouseMoveResizeArea(event) {

        let p = this._p;

        let column = p.columns.get(p.resizer['columnName']);
        let rtl = this._isTableRtl();

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

        let actualX = event.pageX - posRelative.left;
        let minX = posCol.left;

        minX -= Math.ceil(resizerWidth / 2);

        if (rtl) {
            minX += getElementWidth(selectedHeaderCell, true, true, true);
            minX -= column.ignoreMin ? 0 : this._o.minColumnWidth;

            if (!isBoxing) {
                minX -= Math.ceil((parseFloat(selectedHeaderCellStyle.borderLeftWidth) || 0) / 2);
                minX -= this._horizontalPadding(selectedHeaderCell);
            }

            if (actualX > minX) {
                actualX = minX;
            }
        } else {
            minX += column.ignoreMin ? 0 : this._o.minColumnWidth;

            if (!isBoxing) {
                minX += Math.ceil((parseFloat(selectedHeaderCellStyle.borderRightWidth) || 0) / 2);
                minX += this._horizontalPadding(selectedHeaderCell);
            }

            if (actualX < minX) {
                actualX = minX;
            }
        }

        p.resizer.style.left = actualX + 'px';
    }

    /**
     * @private
     * @param {DragEvent} event event
     */
    _onEndDragColumnHeader(event) {

        let o = this._o,
            p = this._p;

        if (!p.resizer) {
            event.target.style.opacity = null;
        } else {
            p.eventsSink.remove(document, '.colresize');

            let column = p.columns.get(p.resizer['columnName']);
            let rtl = this._isTableRtl();

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

            let actualX = event.pageX - posRelative.left;
            let baseX = posCol.left, minX = posCol.left;
            let width = 0;

            baseX -= Math.ceil(resizerWidth / 2);

            if (rtl) {
                if (!isBoxing) {
                    actualX += this._horizontalPadding(selectedHeaderCell);
                    const innerComputedStyle = getComputedStyle(selectedHeaderCellInner || selectedHeaderCell);
                    actualX += parseFloat(innerComputedStyle.borderLeftWidth) || 0;
                    actualX += parseFloat(innerComputedStyle.borderRightWidth) || 0;
                    actualX += column.arrowProposedWidth || 0; // Sort-arrow width
                }

                baseX += getElementWidth(selectedHeaderCell, true, true, true);

                minX = baseX - (column.ignoreMin ? 0 : this._o.minColumnWidth);
                if (actualX > minX) {
                    actualX = minX;
                }

                width = baseX - actualX;
            } else {
                if (!isBoxing) {
                    actualX -= this._horizontalPadding(selectedHeaderCell);
                    const innerComputedStyle = getComputedStyle(selectedHeaderCellInner || selectedHeaderCell);
                    actualX -= parseFloat(innerComputedStyle.borderLeftWidth) || 0;
                    actualX -= parseFloat(innerComputedStyle.borderRightWidth) || 0;
                    actualX -= column.arrowProposedWidth || 0; // Sort-arrow width
                }

                minX = baseX + (column.ignoreMin ? 0 : this._o.minColumnWidth);
                if (actualX < minX) {
                    actualX = minX;
                }

                width = actualX - baseX;
            }

            p.resizer.remove();
            p.resizer = null;

            let sizeToSet = width;

            if (column.widthMode === ColumnWidthMode.RELATIVE) {
                let sizeLeft = this._calculateWidthAvailableForColumns();
                //sizeLeft -= p.table.offsetWidth - p.table.clientWidth;

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
                    // When there's more than one relative overall,
                    //   we can do relative enlarging/shrinking.
                    // Otherwise, we can end up having a 0 width.

                    let unNormalizedSizeToSet = sizeToSet / ((1 - sizeToSet) / totalRelativePercentage);

                    totalRelativePercentage += sizeToSet;

                    // Account for relative widths scaling later
                    if ((totalRelativePercentage < 1 && o.relativeWidthGrowsToFillWidth) ||
                        (totalRelativePercentage > 1 && o.relativeWidthShrinksToFillWidth)) {
                        sizeToSet = unNormalizedSizeToSet;
                    }
                }

                sizeToSet *= 100;
                sizeToSet += '%';
            }

            this.setColumnWidth(column.name, sizeToSet);
        }
    }

    /**
     * @private
     * @param {DragEvent} event event
     */
    _onDragEnterColumnHeader(event) {
        let o = this._o,
            p = this._p;

        if (o.movableColumns) {
            let dataTransferred = event.dataTransfer.getData('text');
            if (dataTransferred) {
                dataTransferred = JSON.parse(dataTransferred);
            }
            else {
                dataTransferred = null; // WebKit does not provide the dataTransfer on dragenter?..
            }

            let headerCell = event.target.closest(`div.${o.tableClassName}-header-cell,div.${o.cellPreviewClassName}`);
            if (!dataTransferred ||
                (p.dragId === dataTransferred.dragId && headerCell['columnName'] !== dataTransferred.column)) {

                let column = p.columns.get(headerCell['columnName']);
                if (column && (column.movable || column !== p.visibleColumns[0])) {
                    headerCell.classList.add('drag-over');
                }
            }
        }
    }

    /**
     * @private
     * @param {DragEvent} event event
     */
    _onDragOverColumnHeader(event) {
        event.preventDefault();
    }

    /**
     * @private
     * @param {DragEvent} event event
     */
    _onDragLeaveColumnHeader(event) {
        let o = this._o;
        let headerCell = event.target.closest(`div.${o.tableClassName}-header-cell,div.${o.cellPreviewClassName}`);
        if (!event.relatedTarget.contains(headerCell.firstChild)) {
            headerCell.classList.remove('drag-over');
        }
    }

    /**
     * @private
     * @param {DragEvent} event event
     */
    _onDropColumnHeader(event) {
        event.preventDefault();

        let o = this._o,
            p = this._p;

        let dataTransferred = JSON.parse(event.dataTransfer.getData('text'));
        let headerCell = event.target.closest(`div.${o.tableClassName}-header-cell,div.${o.cellPreviewClassName}`);
        if (o.movableColumns && dataTransferred.dragId === p.dragId) {
            let srcColName = dataTransferred.column,
                destColName = headerCell['columnName'],
                srcCol = p.columns.get(srcColName),
                destCol = p.columns.get(destColName);
            if (srcCol && destCol && srcCol.movable && (destCol.movable || destCol !== p.visibleColumns[0])) {
                this.moveColumn(srcColName, destColName);
            }
        }
        headerCell.classList.remove('drag-over');
    }

    /**
     * @private
     * @returns {DGTable} self
     */
    _clearSortArrows() {
        let p = this._p;

        if (p.table) {
            let tableClassName = this._o.tableClassName;
            let sortedColumns = scopedSelectorAll(p.headerRow, `>div.${tableClassName}-header-cell.sorted`);
            let arrows = Array.prototype.slice.call(sortedColumns, 0).map((el) => scopedSelector(el, '>div>.sort-arrow')).filter((el) => !!el);
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
        return this;
    }

    /**
     * @private
     * @param {string} column the name of the sort column
     * @param {boolean} descending table is sorted descending
     * @returns {boolean} self
     */
    _showSortArrow(column, descending) {
        let p = this._p;

        let col = p.columns.get(column);
        if (!col) return false;

        let arrow = createElement('span');
        arrow.className = 'sort-arrow';

        if (col.element) {
            col.element.className += descending ? ' sorted desc' : ' sorted';
            col.element.firstChild.insertBefore(arrow, col.element.firstChild.firstChild);
        }

        if (col.widthMode !== ColumnWidthMode.RELATIVE && this._o.adjustColumnWidthForSortArrow) {
            col.arrowProposedWidth = arrow.scrollWidth +
                (parseFloat(getComputedStyle(arrow).marginRight) || 0) +
                (parseFloat(getComputedStyle(arrow).marginLeft) || 0);
        }

        return true;
    }

    /**
     * @private
     * @param {number} cellIndex index of the column in the DOM
     * @returns {DGTable} self
     */
    _resizeColumnElements(cellIndex) {
        let p = this._p;

        const headerCells = p.headerRow.querySelectorAll(`div.${this._o.tableClassName}-header-cell`);
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

        return this;
    }

    /**
     * @returns {DGTable} self
     * */
    _destroyHeaderCells() {
        let p = this._p;

        if (p.headerRow) {
            p.headerRow = null;
        }
        return this;
    }

    /**
     * @private
     * @returns {DGTable} self
     */
    _renderSkeletonBase() {
        let p = this._p,
            o = this._o;

        // Clean up old elements

        p.virtualListHelper?.destroy();
        p.virtualListHelper = null;

        if (p.table && o.virtualTable) {
            p.table.remove();
            p.table = p.tbody = null;
        }

        this._destroyHeaderCells();
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
        this.el.prepend(header);

        relativizeElement(this.el);

        if (o.width === DGTable.Width.SCROLL) {
            this.el.style.overflow = 'hidden';
        } else {
            this.el.style.overflow = '';
        }

        if (!o.height && o.virtualTable) {
            o.height = getElementHeight(this.el, true);
        }

        return this;
    }

    _bindHeaderColumnEvents(columnEl) {
        const inner = columnEl.firstChild;
        columnEl.addEventListener('mousedown', this._onMouseDownColumnHeader.bind(this));
        columnEl.addEventListener('mousemove', this._onMouseMoveColumnHeader.bind(this));
        columnEl.addEventListener('mouseup', this._onMouseUpColumnHeader.bind(this));
        columnEl.addEventListener('mouseleave', this._onMouseLeaveColumnHeader.bind(this));
        columnEl.addEventListener('touchstart', this._onTouchStartColumnHeader.bind(this));
        columnEl.addEventListener('dragstart', this._onStartDragColumnHeader.bind(this));
        columnEl.addEventListener('click', this._onClickColumnHeader.bind(this));
        columnEl.addEventListener('contextmenu', event => { event.preventDefault(); });
        inner.addEventListener('dragenter', this._onDragEnterColumnHeader.bind(this));
        inner.addEventListener('dragover', this._onDragOverColumnHeader.bind(this));
        inner.addEventListener('dragleave', this._onDragLeaveColumnHeader.bind(this));
        inner.addEventListener('drop', this._onDropColumnHeader.bind(this));
    }

    /**
     * @private
     * @returns {DGTable} self
     */
    _renderSkeletonHeaderCells() {
        let p = this._p,
            o = this._o;

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

                this._bindHeaderColumnEvents(cell);
                this._disableCssSelect(cell);
            }
        }

        this.emit('headerrowcreate', headerRow);

        return this;
    }

    /**
     * @private
     * @returns {DGTable} self
     */
    _renderSkeletonBody() {
        let p = this._p,
            o = this._o;

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
            dummyWrapper.className = this.el.className;
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

            // Create the inner table element
            let table = createElement('div');
            table.className = tableClassName;

            if (o.virtualTable) {
                table.className += ' virtual';
            }

            const tableStyle = getComputedStyle(table);

            let tableHeight = (o.height - getElementHeight(p.header, true, true, true));
            if (tableStyle.boxSizing !== 'border-box') {
                tableHeight -= parseFloat(tableStyle.borderTopWidth) || 0;
                tableHeight -= parseFloat(tableStyle.borderBottomWidth) || 0;
                tableHeight -= parseFloat(tableStyle.paddingTop) || 0;
                tableHeight -= parseFloat(tableStyle.paddingBottom) || 0;
            }
            p.visibleHeight = tableHeight;
            setCssProps(table, {
                height: o.height ? tableHeight + 'px' : 'auto',
                display: 'block',
                overflowY: 'auto',
                overflowX: o.width === DGTable.Width.SCROLL ? 'auto' : 'hidden',
            });
            fragment.appendChild(table);

            // Create the "tbody" element
            let tbody = createElement('div');
            tbody.className = o.tableClassName + '-body';
            tbody.style.minHeight = '1px';
            p.table = table;
            p.tbody = tbody;

            relativizeElement(tbody);
            relativizeElement(table);

            table.appendChild(tbody);
            this.el.appendChild(fragment);

            this._setupVirtualTable();
        }

        return this;
    }

    /**
     * @private
     * @returns {DGTable} self
     * @deprecated
     */
    _renderSkeleton() {
        return this;
    }

    /**
     * @private
     * @returns {DGTable} self
     */
    _updateVirtualHeight() {
        const o = this._o, p = this._p;

        if (!p.tbody)
            return this;

        if (o.virtualTable) {
            const virtualHeight =  p.virtualListHelper.estimateFullHeight();
            p.lastVirtualScrollHeight = virtualHeight;
            p.tbody.style.height = virtualHeight + 'px';
        } else {
            p.tbody.style.height = '';
        }

        return this;
    }

    /**
     * @private
     * @returns {DGTable} self
     */
    _updateLastCellWidthFromScrollbar(force) {

        const p = this._p;

        // Calculate scrollbar's width and reduce from lat column's width
        let scrollbarWidth = p.table.offsetWidth - p.table.clientWidth;
        if (scrollbarWidth !== p.scrollbarWidth || force) {
            p.scrollbarWidth = scrollbarWidth;
            for (let i = 0; i < p.columns.length; i++) {
                p.columns[i].actualWidthConsideringScrollbarWidth = null;
            }

            if (p.scrollbarWidth > 0 && p.visibleColumns.length > 0) {
                // (There should always be at least 1 column visible, but just in case)
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

            p.notifyRendererOfColumnsConfig?.();
        }

        return this;
    }

    /**
     * Explicitly set the width of the table based on the sum of the column widths
     * @private
     * @param {boolean} parentSizeMayHaveChanged Parent size may have changed, treat rendering accordingly
     * @returns {DGTable} self
     */
    _updateTableWidth(parentSizeMayHaveChanged) {
        const o = this._o, p = this._p;
        let width = this._calculateTbodyWidth();

        p.tbody.style.minWidth = width + 'px';
        p.headerRow.style.minWidth = (width + (p.scrollbarWidth || 0)) + 'px';

        p.eventsSink.remove(p.table, 'scroll');

        if (o.width === DGTable.Width.AUTO) {
            // Update wrapper element's size to fully contain the table body

            setElementWidth(p.table, getElementWidth(p.tbody, true, true, true));
            setElementWidth(this.el, getElementWidth(p.table, true, true, true));

        } else if (o.width === DGTable.Width.SCROLL) {

            if (parentSizeMayHaveChanged) {
                let lastScrollTop = p.table ? p.table.scrollTop : 0,
                    lastScrollLeft = p.table ? p.table.scrollLeft : 0;

                // BUGFIX: Relayout before recording the widths
                webkitRenderBugfix(this.el);

                p.table.crollTop = lastScrollTop;
                p.table.scrollLeft = lastScrollLeft;
                p.header.scrollLeft = lastScrollLeft;
            }

            p.eventsSink.add(p.table, 'scroll', this._onTableScrolledHorizontally.bind(this));
        }

        return this;
    }

    /**
     * @private
     * @returns {boolean}
     */
    _isTableRtl() {
        return getComputedStyle(this._p.table).direction === 'rtl';
    }

    /**
     * @private
     * @param {Object} column column object
     * @returns {string}
     */
    _serializeColumnWidth(column) {
        return column.widthMode === ColumnWidthMode.AUTO ? 'auto' :
            column.widthMode === ColumnWidthMode.RELATIVE ? column.width * 100 + '%' :
                column.width;
    }

    /**
     * @private
     * @param {HTMLElement} el
     */
    _disableCssSelect(el) {
        const style = el.style;
        // Disable these to allow our own context menu events without interruption
        style['-webkit-touch-callout'] = 'none';
        style['-webkit-user-select'] = 'none';
        style['-moz-user-select'] = 'none';
        style['-ms-user-select'] = 'none';
        style['-o-user-select'] = 'none';
        style['user-select'] = 'none';
    }

    /**
     * @private
     * @param {HTMLElement} el
     */
    _cellMouseOverEvent(el) {
        const o = this._o, p = this._p;

        let elInner = el.firstElementChild;

        if (!((elInner.scrollWidth - elInner.clientWidth > 1) ||
            (elInner.scrollHeight - elInner.clientHeight > 1)))
            return;

        this.hideCellPreview();
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

            this._bindHeaderColumnEvents(previewCell);
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

        this.el.appendChild(previewCell);

        if (isHeaderCell) {
            this._disableCssSelect(previewCell);
        }

        previewCell['rowVIndex'] = rowEl['vIndex'];
        let rowIndex = previewCell['rowIndex'] = rowEl['index'];
        previewCell['columnName'] = p.visibleColumns[nativeIndexOf.call(rowEl.childNodes, el)].name;

        try {
            let selection = SelectionHelper.saveSelection(el);
            if (selection)
                SelectionHelper.restoreSelection(previewCell, selection);
        } catch (ignored) { /* we're ok with this */ }

        this.emit(
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
                this.emit('rowclick', {
                    event: event,
                    filteredRowIndex: rowEl['vIndex'],
                    rowIndex: rowIndex,
                    rowEl: rowEl,
                    rowData: p.rows[rowIndex],
                });
            });
        }

        let parent = this.el;
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
            this.hideCellPreview();
        });
    }

    /**
     * @private
     * @param {HTMLElement} _el
     */
    _cellMouseOutEvent(_el) {
        this.hideCellPreview();
    }

    /**
     * Hides the current cell preview,
     * or prevents the one that is currently trying to show (in the 'cellpreview' event)
     * @public
     * @expose
     * @returns {DGTable} self
     */
    hideCellPreview() {
        const p = this._p;

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

            this.emit('cellpreviewdestroy', {
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

        return this;
    }
}

/**
 * @public
 * @expose
 * @type {string}
 */
DGTable.VERSION = '@@VERSION';

// It's a shame the Google Closure Compiler does not support exposing a nested @param

/**
 * @typedef {Object} SERIALIZED_COLUMN
 * @property {number|null|undefined} [order=0]
 * @property {string|null|undefined} [width='auto']
 * @property {boolean|null|undefined} [visible=true]
 * */

/**
 * @typedef {Object} SERIALIZED_COLUMN_SORT
 * @property {string|null|undefined} [column='']
 * @property {boolean|null|undefined} [descending=false]
 * */

/**
 * @enum {ColumnWidthMode|number|undefined}
 * @const
 * @typedef {ColumnWidthMode}
 */
const ColumnWidthMode = {
    /** @const*/ AUTO: 0,
    /** @const*/ ABSOLUTE: 1,
    /** @const*/ RELATIVE: 2,
};

/**
 * @enum {DGTable.Width|string|undefined}
 * @const
 * @typedef {DGTable.Width}
 */
DGTable.Width = {
    /** @const*/ NONE: 'none',
    /** @const*/ AUTO: 'auto',
    /** @const*/ SCROLL: 'scroll',
};

/**
 * @expose
 * @typedef {Object} COLUMN_SORT_OPTIONS
 * @property {string|null|undefined} column
 * @property {boolean|null|undefined} [descending=false]
 * */

/**
 * @expose
 * @typedef {Object} COLUMN_OPTIONS
 * @property {string|null|undefined} width
 * @property {string|null|undefined} name
 * @property {string|null|undefined} label
 * @property {string|null|undefined} dataPath - defaults to `name`
 * @property {string|null|undefined} comparePath - defaults to `dataPath`
 * @property {number|string|null|undefined} comparePath
 * @property {boolean|null|undefined} [resizable=true]
 * @property {boolean|null|undefined} [movable=true]
 * @property {boolean|null|undefined} [sortable=true]
 * @property {boolean|null|undefined} [visible=true]
 * @property {string|null|undefined} [cellClasses]
 * @property {boolean|null|undefined} [ignoreMin=false]
 * */

/**
 * @typedef {Object} DGTable.Options
 * @property {COLUMN_OPTIONS[]} [columns]
 * @property {number} [height]
 * @property {DGTable.Width} [width]
 * @property {boolean|null|undefined} [virtualTable=true]
 * @property {number|null|undefined} [estimatedRowHeight=40]
 * @property {boolean|null|undefined} [resizableColumns=true]
 * @property {boolean|null|undefined} [movableColumns=true]
 * @property {number|null|undefined} [sortableColumns=1]
 * @property {boolean|null|undefined} [adjustColumnWidthForSortArrow=true]
 * @property {boolean|null|undefined} [relativeWidthGrowsToFillWidth=true]
 * @property {boolean|null|undefined} [relativeWidthShrinksToFillWidth=false]
 * @property {boolean|null|undefined} [convertColumnWidthsToRelative=false]
 * @property {boolean|null|undefined} [autoFillTableWidth=false]
 * @property {boolean|null|undefined} [allowCancelSort=true]
 * @property {string|null|undefined} [cellClasses]
 * @property {string|string[]|COLUMN_SORT_OPTIONS|COLUMN_SORT_OPTIONS[]} [sortColumn]
 * @property {Function|null|undefined} [cellFormatter=null]
 * @property {Function|null|undefined} [headerCellFormatter=null]
 * @property {number|null|undefined} [rowsBufferSize=10]
 * @property {number|null|undefined} [minColumnWidth=35]
 * @property {number|null|undefined} [resizeAreaWidth=8]
 * @property {function(columnName: string, descending: boolean, defaultComparator: function(a,b):number):{function(a,b):number}} [onComparatorRequired]
 * @property {function(data: any[], sort: function(any[]):any[]):any[]} [customSortingProvider]
 * @property {string|null|undefined} [resizerClassName=undefined]
 * @property {string|null|undefined} [tableClassName=undefined]
 * @property {boolean|null|undefined} [allowCellPreview=true]
 * @property {boolean|null|undefined} [allowHeaderCellPreview=true]
 * @property {string|null|undefined} [cellPreviewClassName=undefined]
 * @property {boolean|null|undefined} [cellPreviewAutoBackground=true]
 * @property {Element|null|undefined} [el=undefined]
 * @property {string|null|undefined} [className=undefined]
 * @property {Function|null|undefined} [filter=undefined]
 * */

export default DGTable;
