import type DGTable from '../../src/index';

// The only module allowed to read private state. Keep it tiny: prefer DOM + public API,
// so internal refactors break one file instead of the whole suite.

export function headerCompensation(table: DGTable, column: string): number {
    return table._p.columns.get(column)?.headerScrollbarCompensation ?? 0;
}

export function rowsBufferSize(table: DGTable): number {
    return table._o.rowsBufferSize;
}

export function isResizePending(table: DGTable): boolean {
    return table._p.columnResizeStartTimeout != null;
}
