import type { ColumnWidthModeType, WidthType, HoverInEventSymbol, HoverOutEventSymbol, PreviewCellSymbol, OriginalCellSymbol } from './constants';
import type RowCollection from './row_collection';
import type ColumnCollection from './column_collection';
import type { Emitter } from 'mitt';

// External untyped modules - use any
type DomEventsSink = any;
type VirtualListHelper = any;

/**
 * Extended HTMLElement with symbol properties for cell hover/preview tracking
 */
export interface CellElement extends HTMLElement {
    [HoverInEventSymbol]?: ((event: MouseEvent) => void) | null;
    [HoverOutEventSymbol]?: ((event: MouseEvent) => void) | null;
    [PreviewCellSymbol]?: HTMLDivElement | null;
    [OriginalCellSymbol]?: HTMLElement | null;
}

/**
 * Column sort specification
 */
export interface ColumnSortOptions {
    column: string;
    descending?: boolean;
}

/**
 * Serialized column sort for external use
 */
export interface SerializedColumnSort {
    column: string;
    descending: boolean;
}

/**
 * Serialized column configuration
 */
export interface SerializedColumn {
    order?: number | null;
    width?: string | null;
    visible?: boolean | null;
    label?: string;
}

/**
 * Column definition options
 */
export interface ColumnOptions {
    name: string;
    label?: string | null;
    width?: number | string | null;
    dataPath?: string | string[] | null;
    comparePath?: string | string[] | null;
    resizable?: boolean | null;
    movable?: boolean | null;
    sortable?: boolean | null;
    visible?: boolean | null;
    cellClasses?: string | null;
    ignoreMin?: boolean | null;
    sticky?: 'start' | 'end' | false | null;
    order?: number;
}

/**
 * Internal column representation
 */
export interface Column {
    name: string;
    label: string;
    width: number;
    widthMode: number; // ColumnWidthMode value (0, 1, or 2)
    resizable: boolean;
    sortable: boolean;
    movable: boolean;
    visible: boolean;
    cellClasses: string;
    ignoreMin: boolean;
    sticky: 'start' | 'end' | null;
    dataPath: string[];
    comparePath: string[];
    order: number;
    actualWidth?: number;
    actualWidthConsideringScrollbarWidth?: number | null;
    arrowProposedWidth?: number;
    element?: HTMLElement;
    stickyPos?: { direction: string; offset: number };
    _finalWidth?: number;
}

/**
 * Row data type - can be any object with string keys
 */
export type RowData = Record<string, unknown> & {
    __i?: number;
};

/**
 * Cell formatter function
 */
export type CellFormatter = ((value: unknown, columnName: string, rowData: RowData) => string) & {
    [key: symbol]: boolean;
};

/**
 * Header cell formatter function
 */
export type HeaderCellFormatter = (label: string, columnName: string) => string;

/**
 * Filter function
 */
export type FilterFunction = (row: RowData, args: unknown) => boolean;

/**
 * Comparator function
 */
export type ComparatorFunction = (a: RowData, b: RowData) => number;

/**
 * Comparator callback
 */
export type OnComparatorRequired = (
    columnName: string,
    descending: boolean,
    defaultComparator: ComparatorFunction
) => ComparatorFunction;

/**
 * Custom sorting provider
 */
export type CustomSortingProvider = (
    data: RowData[],
    sort: (data: RowData[]) => RowData[]
) => RowData[];

/**
 * DGTable initialization options
 */
export interface DGTableOptions {
    el?: Element | null;
    className?: string | null;
    columns?: ColumnOptions[];
    height?: number;
    width?: WidthType;
    virtualTable?: boolean | null;
    estimatedRowHeight?: number | null;
    resizableColumns?: boolean | null;
    movableColumns?: boolean | null;
    sortableColumns?: number | null;
    adjustColumnWidthForSortArrow?: boolean | null;
    relativeWidthGrowsToFillWidth?: boolean | null;
    relativeWidthShrinksToFillWidth?: boolean | null;
    convertColumnWidthsToRelative?: boolean | null;
    autoFillTableWidth?: boolean | null;
    allowCancelSort?: boolean | null;
    cellClasses?: string | null;
    sortColumn?: string | string[] | ColumnSortOptions | ColumnSortOptions[];
    cellFormatter?: CellFormatter | null;
    headerCellFormatter?: HeaderCellFormatter | null;
    rowsBufferSize?: number | null;
    minColumnWidth?: number | null;
    resizeAreaWidth?: number | null;
    onComparatorRequired?: OnComparatorRequired | null;
    comparatorCallback?: OnComparatorRequired | null; // deprecated
    customSortingProvider?: CustomSortingProvider | null;
    resizerClassName?: string | null;
    tableClassName?: string | null;
    allowCellPreview?: boolean | null;
    allowHeaderCellPreview?: boolean | null;
    cellPreviewClassName?: string | null;
    cellPreviewAutoBackground?: boolean | null;
    filter?: FilterFunction | null;
}

/**
 * Internal options (normalized)
 */
export interface DGTableInternalOptions {
    virtualTable: boolean;
    estimatedRowHeight?: number;
    rowsBufferSize: number;
    minColumnWidth: number;
    resizeAreaWidth: number;
    resizableColumns: boolean;
    movableColumns: boolean;
    sortableColumns: number;
    adjustColumnWidthForSortArrow: boolean;
    convertColumnWidthsToRelative: boolean;
    autoFillTableWidth: boolean;
    allowCancelSort: boolean;
    cellClasses: string;
    resizerClassName: string;
    tableClassName: string;
    allowCellPreview: boolean;
    allowHeaderCellPreview: boolean;
    cellPreviewClassName: string;
    cellPreviewAutoBackground: boolean;
    onComparatorRequired: OnComparatorRequired | null;
    customSortingProvider: CustomSortingProvider | null;
    width: WidthType;
    relativeWidthGrowsToFillWidth: boolean;
    relativeWidthShrinksToFillWidth: boolean;
    cellFormatter: CellFormatter;
    headerCellFormatter: HeaderCellFormatter;
    filter: FilterFunction | null;
    height?: number;
}

/**
 * Internal sort column specification
 */
export interface SortColumn {
    column: string;
    comparePath: string[];
    descending: boolean;
}

/**
 * Worker listener entry
 */
export interface WorkerListener {
    worker: Worker;
    listener: (evt: MessageEvent) => void;
}

/**
 * Internal private state
 */
export interface DGTablePrivateState {
    eventsSink: DomEventsSink;
    mitt: Emitter<Record<string, unknown>>;
    tableSkeletonNeedsRendering: boolean;
    columns: ColumnCollection;
    visibleColumns: Column[];
    rows: RowCollection;
    filteredRows: RowCollection | null;
    filterArgs: unknown;
    scrollbarWidth: number;
    _lastVirtualScrollHeight: number;
    lastDetectedWidth?: number;
    virtualListHelper?: VirtualListHelper | null;
    header?: HTMLElement;
    headerRow?: HTMLElement;
    table?: HTMLElement;
    tbody?: HTMLElement;
    resizer?: HTMLElement | null;
    currentTouchId?: number | null;
    transparentBgColor1?: string;
    transparentBgColor2?: string;
    cellPreviewCell?: HTMLElement | null;
    abortCellPreview?: boolean;
    dragId?: number;
    stickiesLeft?: [HTMLElement, ...HTMLElement[]][];
    stickiesRight?: [HTMLElement, ...HTMLElement[]][];
    stickiesSetLeft?: Set<number>;
    stickiesSetRight?: Set<number>;
    lastStickyScrollLeft?: number;
    isStickyColumns?: Map<number, 'left' | 'right'>;
    virtualRowHeight?: number;
    workerListeners?: WorkerListener[];
    notifyRendererOfColumnsConfig?: () => void;
    _deferredRender?: ReturnType<typeof setTimeout>;
    _bindCellHoverIn: (el: CellElement) => void;
    _unbindCellHoverIn: (el: CellElement) => void;
    _bindCellHoverOut: (el: CellElement) => void;
    _unbindCellHoverOut: (el: CellElement) => void;
}

/**
 * DGTable interface for use by helper modules
 */
export interface DGTableInterface {
    el: HTMLElement;
    _o: DGTableInternalOptions;
    _p: DGTablePrivateState;
    emit(event: string, data?: unknown): void;
    _bindHeaderColumnEvents(columnEl: HTMLElement): void;
    _unbindCellEventsForRow(row: HTMLElement): void;
    _getHtmlForCell(rowData: RowData, column: Column): string;
    _initColumnFromData(columnData: ColumnOptions): Column;
    tableWidthChanged(forceUpdate?: boolean, renderColumns?: boolean): void;
}

/**
 * Event data types
 */
export interface RowCreateEventData {
    filteredRowIndex: number;
    rowIndex: number;
    rowEl: HTMLElement;
    rowData: RowData;
}

export interface RowClickEventData {
    event: MouseEvent;
    filteredRowIndex: number;
    rowIndex: number;
    rowEl: HTMLElement;
    rowData: RowData;
}

export interface CellPreviewEventData {
    el: Element;
    name: string;
    rowIndex: number | null;
    rowData: RowData | null;
    cell: HTMLElement;
    cellEl: Element;
}

export interface CellPreviewDestroyEventData {
    el: Element;
    name: string;
    filteredRowIndex: number | null;
    rowIndex: number | null;
    rowData: RowData | null;
    cell: HTMLElement;
    cellEl: Element;
}

export interface HeaderContextMenuEventData {
    columnName: string;
    pageX: number;
    pageY: number;
    bounds: {
        left: number;
        top: number;
        width: number;
        height: number;
    };
}

export interface MoveColumnEventData {
    name: string;
    src: number;
    dest: number;
}

export interface ColumnWidthEventData {
    name: string;
    width: string;
    oldWidth: string;
}

export interface SortEventData {
    sorts: SerializedColumnSort[];
    resort?: boolean;
    comparator?: ComparatorFunction;
}

export interface AddRowsEventData {
    count: number;
    clear: boolean;
}

