import type { WidthType } from './constants';
import type RowCollection from './row_collection';
import type ColumnCollection from './column_collection';
import type { Emitter } from 'mitt';
import {
    CellFormatter, ColumnOptions,
    CustomSortingProvider,
    FilterFunction,
    HeaderCellFormatter,
    OnComparatorRequired, RowData
} from "@/types";

// Symbols for internal use
export const IsSafeSymbol = Symbol('safe');
export const HoverInEventSymbol = Symbol('hover_in');
export const HoverOutEventSymbol = Symbol('hover_out');
export const RowClickEventSymbol = Symbol('row_click');
export const PreviewCellSymbol = Symbol('preview_cell');
export const OriginalCellSymbol = Symbol('cell');
export const RelatedTouchSymbol = Symbol('related_touch');
export const OriginalRowIndex = Symbol('original_row_index');

// External untyped modules - use any
type DomEventsSink = any;
type VirtualListHelper = any;

/**
 * Internal column representation
 */
export interface InternalColumn {
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
    visibleColumns: InternalColumn[];
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
    _bindCellHoverIn: (el: HTMLElement) => void;
    _unbindCellHoverIn: (el: HTMLElement) => void;
    _bindCellHoverOut: (el: HTMLElement) => void;
    _unbindCellHoverOut: (el: HTMLElement) => void;
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
    _getHtmlForCell(rowData: RowData, column: InternalColumn): string;
    _initColumnFromData(columnData: ColumnOptions): InternalColumn;
    tableWidthChanged(forceUpdate?: boolean, renderColumns?: boolean): void;
}
