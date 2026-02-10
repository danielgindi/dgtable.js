import type { WidthType } from './constants';

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
 * Row data type - can be any object with string keys
 */
export type RowData = Record<string, unknown>

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
    maxColumnsSortCount?: number | null;
    adjustColumnWidthForSortArrow?: boolean | null;
    relativeWidthGrowsToFillWidth?: boolean | null;
    relativeWidthShrinksToFillWidth?: boolean | null;
    convertColumnWidthsToRelative?: boolean | null;
    autoFillTableWidth?: boolean | null;
    allowCancelSort?: boolean | null;
    cellClasses?: string | null;
    sortedColumns?: string[] | ColumnSortOptions[];
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

// ============================================================================
// Event Types
// ============================================================================

/**
 * Event data for 'rowcreate' event
 */
export interface RowCreateEvent {
    filteredRowIndex: number;
    rowIndex: number;
    rowEl: HTMLElement;
    rowData: RowData;
}

/**
 * Event data for 'rowclick' event
 */
export interface RowClickEvent {
    event: MouseEvent;
    filteredRowIndex: number;
    rowIndex: number;
    rowEl: HTMLElement;
    rowData: RowData;
}

/**
 * Event data for 'cellpreview' event
 */
export interface CellPreviewEvent {
    el: Element | null;
    name: string;
    rowIndex: number | null;
    rowData: RowData | null;
    cell: HTMLElement;
    cellEl: HTMLElement;
}

/**
 * Event data for 'cellpreviewdestroy' event
 */
export interface CellPreviewDestroyEvent {
    el: ChildNode | null;
    name: string;
    rowIndex: number | null;
    rowData: RowData | null;
    cell: HTMLElement | null;
    cellEl: ChildNode | null;
}

/**
 * Event data for 'headercontextmenu' event
 */
export interface HeaderContextMenuEvent {
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

/**
 * Event data for 'movecolumn' event
 */
export interface MoveColumnEvent {
    name: string;
    src: number;
    dest: number;
}

/**
 * Event data for 'columnwidth' event
 */
export interface ColumnWidthEvent {
    name: string;
    width: number;
    oldWidth: number;
}

/**
 * Event data for 'addrows' event
 */
export interface AddRowsEvent {
    count: number;
    clear: boolean;
}

/**
 * Event data for 'sort' event
 */
export interface SortEvent {
    sorts: SerializedColumnSort[];
    resort?: boolean;
}

/**
 * Map of all DGTable events to their data types.
 * Used for type-safe event handlers with autocompletion.
 */
export interface DGTableEventMap {
    // Rendering events
    'render': undefined;
    'renderskeleton': undefined;

    // Row events
    'rowcreate': RowCreateEvent;
    'rowclick': RowClickEvent;
    'rowdestroy': HTMLElement;

    // Cell preview events
    'cellpreview': CellPreviewEvent;
    'cellpreviewdestroy': CellPreviewDestroyEvent;

    // Header events
    'headerrowcreate': HTMLElement;
    'headercontextmenu': HeaderContextMenuEvent;

    // Column events
    'addcolumn': string;
    'removecolumn': string;
    'movecolumn': MoveColumnEvent;
    'showcolumn': string;
    'hidecolumn': string;
    'columnwidth': ColumnWidthEvent;

    // Data events
    'addrows': AddRowsEvent;
    'sort': SortEvent;
    'filter': unknown;
    'filterclear': Record<string, never>;
}

