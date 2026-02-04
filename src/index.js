/* eslint-env browser */

'use strict';

import {  htmlEncode } from './util.js';
import RowCollection from './row_collection.js';
import ColumnCollection from './column_collection.js';
import {
    getScrollHorz,
    setScrollHorz,
} from '@danielgindi/dom-utils/lib/ScrollHelper.js';
import {
    getElementHeight,
} from '@danielgindi/dom-utils/lib/Css.js';
import { scopedSelectorAll } from '@danielgindi/dom-utils/lib/DomCompat.js';
import ByColumnFilter from './by_column_filter.js';
import DomEventsSink from '@danielgindi/dom-utils/lib/DomEventsSink.js';
import mitt from 'mitt';

// Constants
import {
    IsSafeSymbol,
    HoverInEventSymbol,
    HoverOutEventSymbol,
    PreviewCellSymbol,
    OriginalCellSymbol,
    ColumnWidthMode,
    Width,
} from './constants.js';

// Helpers
import {
    getTextWidth,
    calculateWidthAvailableForColumns,
    calculateTbodyWidth,
    serializeColumnWidth,
} from './helpers.js';

// Cell Preview
import {
    cellMouseOverEvent,
    cellMouseOutEvent,
    hideCellPreview,
} from './cell_preview.js';

// Column Resize
import {
    cancelColumnResize,
    onMouseDownColumnHeader as resizeOnMouseDownColumnHeader,
} from './column_resize.js';

// Header Events
import {
    onTouchStartColumnHeader,
    onMouseMoveColumnHeader,
    onMouseUpColumnHeader,
    onMouseLeaveColumnHeader,
    onSortOnColumnHeaderEvent,
    onStartDragColumnHeader,
    onDragEndColumnHeader,
    onDragEnterColumnHeader,
    onDragOverColumnHeader,
    onDragLeaveColumnHeader,
    onDropColumnHeader,
} from './header_events.js';

// Rendering
import {
    renderSkeletonBase,
    renderSkeletonBody,
    renderSkeletonHeaderCells,
    destroyHeaderCells,
    updateVirtualHeight,
    updateLastCellWidthFromScrollbar,
    updateTableWidth,
    syncHorizontalStickies,
    resizeColumnElements,
    clearSortArrows,
    showSortArrow,
} from './rendering.js';

const hasOwnProperty = Object.prototype.hasOwnProperty;

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

        p.eventsSink.add(this.el, 'dragend.colresize', (e) => onDragEndColumnHeader(this, e));

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
        o.width = options.width === undefined ? Width.NONE : options.width;

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
            cellMouseOverEvent(this, cell);
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
            cellMouseOutEvent(this, cell);
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

    _onMouseDownColumnHeader(event) {
        return resizeOnMouseDownColumnHeader(this, event);
    }

    _onMouseMoveColumnHeader(event) {
        onMouseMoveColumnHeader(this, event);
    }

    _onMouseUpColumnHeader(event) {
        onMouseUpColumnHeader(this, event);
    }

    _onMouseLeaveColumnHeader(event) {
        onMouseLeaveColumnHeader(this, event);
    }

    _onTouchStartColumnHeader(event) {
        onTouchStartColumnHeader(this, event);
    }

    _onSortOnColumnHeaderEvent(event) {
        onSortOnColumnHeaderEvent(this, event);
    }

    _onStartDragColumnHeader(event) {
        return onStartDragColumnHeader(this, event);
    }

    _onDragEndColumnHeader(event) {
        onDragEndColumnHeader(this, event);
    }

    _onDragEnterColumnHeader(event) {
        onDragEnterColumnHeader(this, event);
    }

    _onDragOverColumnHeader(event) {
        onDragOverColumnHeader(this, event);
    }

    _onDragLeaveColumnHeader(event) {
        onDragLeaveColumnHeader(this, event);
    }

    _onDropColumnHeader(event) {
        onDropColumnHeader(this, event);
    }

    _onTableScrolledHorizontally() {
        const p = this._p;
        p.header.scrollLeft = p.table.scrollLeft;
        syncHorizontalStickies(this);
    }

    _bindHeaderColumnEvents(columnEl) {
        const inner = columnEl.firstChild;
        columnEl.addEventListener('mousedown', this._onMouseDownColumnHeader.bind(this));
        columnEl.addEventListener('mousemove', this._onMouseMoveColumnHeader.bind(this));
        columnEl.addEventListener('mouseup', this._onMouseUpColumnHeader.bind(this));
        columnEl.addEventListener('mouseleave', this._onMouseLeaveColumnHeader.bind(this));
        columnEl.addEventListener('touchstart', this._onTouchStartColumnHeader.bind(this));
        columnEl.addEventListener('dragstart', this._onStartDragColumnHeader.bind(this));
        columnEl.addEventListener('click', this._onSortOnColumnHeaderEvent.bind(this));
        columnEl.addEventListener('contextmenu', event => { event.preventDefault(); });
        inner.addEventListener('dragenter', this._onDragEnterColumnHeader.bind(this));
        inner.addEventListener('dragover', this._onDragOverColumnHeader.bind(this));
        inner.addEventListener('dragleave', this._onDragLeaveColumnHeader.bind(this));
        inner.addEventListener('drop', this._onDropColumnHeader.bind(this));
    }

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

    _unbindCellEventsForRow(rowToClean) {
        const p = this._p;
        for (let i = 0, cells = rowToClean.childNodes, cellCount = cells.length; i < cellCount; i++) {
            p._unbindCellHoverIn(cells[i]);
        }
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
            widthMode = ColumnWidthMode.AUTO;

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
            sticky: columnData.sticky === undefined ? null : columnData.sticky,
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
     * @private
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
     * Returns the HTML string for a specific cell.
     * @private
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

    // =========================================================================
    // PUBLIC API - Events
    // =========================================================================

    /**
     * Register an event handler
     * @param {(string|'*')?} event
     * @param {function(any)} handler
     * @returns {DGTable}
     */
    on(event, handler) {
        this._p.mitt.on(event, handler);
        return this;
    }

    /**
     * Register a one time event handler
     * @param {(string|'*')?} event
     * @param {function(any)} handler
     * @returns {DGTable}
     */
    once(event, handler) {
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
    off(event, handler) {
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
    emit(event, value) {
        this._p.mitt.emit(event, value);
        return this;
    }

    // =========================================================================
    // PUBLIC API - Lifecycle
    // =========================================================================

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

    // =========================================================================
    // PUBLIC API - Rendering
    // =========================================================================

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

    // =========================================================================
    // PUBLIC API - Columns
    // =========================================================================

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

            for (let i = columns.getMaxOrder(), to = column.order; i >= to; i--) {
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
            return serializeColumnWidth(col);
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
                'width': serializeColumnWidth(col),
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

    // =========================================================================
    // PUBLIC API - Sorting
    // =========================================================================

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
     * @param {{function(data: any[], sort: function(any[]):any[]):any[]}|null|undefined} customSortingProvider provides a custom sorting function
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
     * Sort the table
     * @public
     * @expose
     * @param {string?} column Name of the column to sort on (or null to remove sort arrow)
     * @param {boolean=} descending Sort in descending order
     * @param {boolean} [add=false] Should this sort be on top of the existing sort?
     * @returns {DGTable} self
     */
    sort(column, descending, add) {
        const o = this._o, p = this._p;

        let columns = p.columns,
            col = columns.get(column);

        let currentSort = p.rows.sortColumn;

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
                if ((o.sortableColumns > 0 && currentSort.length >= o.sortableColumns) || currentSort.length >= p.visibleColumns.length) {
                    currentSort.length = 0;
                }

            } else {
                currentSort.length = 0;
            }

            descending = descending === undefined ? false : descending;

            currentSort.push({
                column: col.name,
                comparePath: col.comparePath || col.dataPath,
                descending: !!descending,
            });
        } else {
            currentSort.length = 0;
        }

        clearSortArrows(this);

        for (let i = 0; i < currentSort.length; i++) {
            showSortArrow(this, currentSort[i].column, currentSort[i].descending);
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

            let sorts = [];
            for (let i = 0; i < currentSort.length; i++) {
                sorts.push({ 'column': currentSort[i].column, 'descending': currentSort[i].descending });
            }
            this.emit('sort', { sorts: sorts, resort: true, comparator: comparator });
        }

        return this;
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

    // =========================================================================
    // PUBLIC API - Formatters & Filters
    // =========================================================================

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
        this._o.headerCellFormatter = formatter || function (val) {
            return (typeof val === 'string') ? htmlEncode(val) : val;
        };

        return this;
    }

    /**
     * @public
     * @expose
     * @param {function(row:Object,args:Object):boolean|null} [filterFunc=null] - The filter function to work with filters.
     * @returns {DGTable} self
     */
    setFilter(filterFunc) {
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

    // =========================================================================
    // PUBLIC API - Row Operations
    // =========================================================================

    /**
     * Returns the HTML string for a specific cell.
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
     * Returns the HTML string for a specific cell.
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
     * Returns the actual row index for specific row
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

        p.rows.reset(data);

        if (resort && p.rows.sortColumn.length) {
            this.resort();
        } else {
            this._refilter();
        }

        this.clearAndRender().emit('addrows', { count: data.length, clear: true });

        return this;
    }

    // =========================================================================
    // PUBLIC API - Size Changes
    // =========================================================================

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

    /**
     * Hides the current cell preview,
     * or prevents the one that is currently trying to show (in the 'cellpreview' event)
     * @public
     * @expose
     * @returns {DGTable} self
     */
    hideCellPreview() {
        hideCellPreview(this);
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
        cancelColumnResize(this);
        return this;
    }

    // =========================================================================
    // PUBLIC API - Web Workers
    // =========================================================================

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
            let p = this._p;

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
}

// =========================================================================
// STATIC PROPERTIES
// =========================================================================

/**
 * @public
 * @expose
 * @type {string}
 */
DGTable.VERSION = '@@VERSION';

/**
 * @enum {DGTable.Width|string|undefined}
 * @const
 * @typedef {DGTable.Width}
 */
DGTable.Width = Width;

// =========================================================================
// TYPE DEFINITIONS
// =========================================================================

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
 * @property {'start'|'end'|false|null|undefined} [sticky=false]
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
