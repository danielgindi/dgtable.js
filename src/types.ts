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
    /**
     * Column width. Use a number for pixels, a percentage string/decimal for
     * relative width, "auto" for header-based automatic width, or "rest" to
     * consume the remaining table width after other columns are measured.
     */
    width?: number | string | null;
    dataPath?: string | null;
    comparePath?: string | null;
    resizable?: boolean | null;
    movable?: boolean | null;
    sortable?: boolean | null;
    visible?: boolean | null;
    cellClasses?: string | null;
    ignoreMin?: boolean | null;
    sticky?: 'start' | 'end' | false | null;
    order?: number;
    /** @default true */
    allowPreview?: boolean | null;
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
    /**
     * Existing wrapper element to render the table into.
     * @default A new `<div>` element.
     */
    el?: Element | null;

    /**
     * CSS class added to the auto-created wrapper element.
     * Ignored when `el` is provided.
     * @default "dgtable-wrapper" when `el` is not provided.
     */
    className?: string | null;

    /**
     * Initial column definitions.
     * @default []
     */
    columns?: ColumnOptions[];

    /**
     * Suggested table height in pixels.
     * @default undefined
     */
    height?: number;

    /**
     * Table width handling mode.
     * @default "none"
     */
    width?: WidthType;

    /**
     * Render only the visible rows for better performance with large datasets.
     * Rows should have a stable height when this is enabled.
     * @default true
     */
    virtualTable?: boolean | null;

    /**
     * Estimated row height used to calculate virtual scroll size before rows are measured.
     * @default undefined (auto-calculated)
     */
    estimatedRowHeight?: number | null;

    /**
     * Enable column resizing globally.
     * @default true
     */
    resizableColumns?: boolean | null;

    /**
     * Enable column drag-and-drop reordering globally.
     * @default true
     */
    movableColumns?: boolean | null;

    /**
     * Maximum number of columns kept in the active sort stack.
     * @default 1
     */
    maxColumnsSortCount?: number | null;

    /**
     * Automatically reserve header space for the sort arrow indicator.
     * @default true
     */
    adjustColumnWidthForSortArrow?: boolean | null;

    /**
     * Let relative-width columns grow to consume unused table width.
     * @default true
     */
    relativeWidthGrowsToFillWidth?: boolean | null;

    /**
     * Let relative-width columns shrink when their total width exceeds the table width.
     * @default false
     */
    relativeWidthShrinksToFillWidth?: boolean | null;

    /**
     * Convert auto-sized columns to relative widths during width calculations.
     * @default false
     */
    convertColumnWidthsToRelative?: boolean | null;

    /**
     * Stretch columns proportionally to fill any remaining table width when possible.
     * @default false
     */
    autoFillTableWidth?: boolean | null;

    /**
     * Expand the last visible column to fill any remaining table width without
     * changing its configured or serialized width.
     * @default true
     */
    autoFillLastColumn?: boolean | null;

    /**
     * Allow the sort state to cycle back to "unsorted".
     * @default true
     */
    allowCancelSort?: boolean | null;

    /**
     * CSS classes applied to every body cell.
     * @default ""
     */
    cellClasses?: string | null;

    /**
     * Initial sorting configuration.
     * String entries are treated as ascending sorts.
     * @default []
     */
    sortedColumns?: string[] | ColumnSortOptions[];

    /**
     * Formatter used to produce body cell HTML.
     * @default Built-in HTML-encoding formatter.
     */
    cellFormatter?: CellFormatter | null;

    /**
     * Formatter used to produce header cell HTML.
     * @default Built-in HTML-encoding formatter.
     */
    headerCellFormatter?: HeaderCellFormatter | null;

    /**
     * Number of extra rows rendered above and below the viewport in virtual mode.
     * @default 3
     */
    rowsBufferSize?: number | null;

    /**
     * Minimum column width in pixels.
     * @default 35
     */
    minColumnWidth?: number | null;

    /**
     * Maximum sticky-column width as a fraction of the table width.
     * Set to `null` to disable the limit.
     * @default null
     */
    maxStickyColumnRelativeWidth?: number | null;

    /**
     * Width in pixels of the draggable resize hotspot near header edges.
     * @default 8
     */
    resizeAreaWidth?: number | null;

    /**
     * Automatically fit a column to its content when the user double-clicks
     * the column resize area.
     * @default false
     */
    autoFitColumnOnResizeDoubleClick?: boolean | null;

    /**
     * Callback used to supply a custom comparator for a column and sort direction.
     * @default null
     */
    onComparatorRequired?: OnComparatorRequired | null;

    /**
     * Deprecated comparator callback name.
     * Use `onComparatorRequired` instead.
     * @deprecated Use `onComparatorRequired` instead.
     * @default undefined
     */
    comparatorCallback?: OnComparatorRequired | null;

    /**
     * Custom sorting provider that can wrap or replace the built-in sort routine.
     * @default null
     */
    customSortingProvider?: CustomSortingProvider | null;

    /**
     * CSS class used for the temporary resize guide element.
     * @default "dgtable-resize"
     */
    resizerClassName?: string | null;

    /**
     * Base CSS class used for generated table elements.
     * @default "dgtable"
     */
    tableClassName?: string | null;

    /**
     * Show a preview for truncated body-cell content on hover.
     * @default true
     */
    allowCellPreview?: boolean | null;

    /**
     * Show a preview for truncated header-cell content on hover.
     * @default true
     */
    allowHeaderCellPreview?: boolean | null;

    /**
     * CSS class applied to the generated preview element.
     * @default "dgtable-cell-preview"
     */
    cellPreviewClassName?: string | null;

    /**
     * Copy the source cell background onto the preview automatically.
     * @default true
     */
    cellPreviewAutoBackground?: boolean | null;

    /**
     * Custom row filter used by `filter()`.
     * @default null
     */
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
    width: number | string;
    oldWidth: number | string;
}

/**
 * Event data for 'columnresizeareadoubleclick' event
 */
export interface ColumnResizeAreaDoubleClickEvent {
    name: string;
    columnName: string;
    event: Event;
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
    'columnresizeareadoubleclick': ColumnResizeAreaDoubleClickEvent;

    // Data events
    'addrows': AddRowsEvent;
    'sort': SortEvent;
    'filter': unknown;
    'filterclear': Record<string, never>;
}

