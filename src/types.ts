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
 * Serialized column configuration
 */
export interface SerializedColumn {
    order?: number | null;
    width?: string | number | null;
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
