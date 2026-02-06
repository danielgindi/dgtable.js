/**
 * Header events functionality for DGTable
 */

import { find } from './util';
/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-ignore - No type declarations available for this module
import { getElementWidth, getElementHeight, getElementOffset } from '@danielgindi/dom-utils/lib/Css.js';
import { isInputElementEvent } from './helpers';
import {
    getColumnByResizePosition,
    cancelColumnResize,
    onMouseDownColumnHeader,
} from './column_resize';
import type { DGTableInterface } from './private_types';
import { RelatedTouchSymbol } from './private_types';

// Extended element types
interface HeaderCellElement extends HTMLElement {
    columnName?: string;
}

interface DragData {
    dragId: number;
    column: string;
}

type PositionHost = {
    pageX: number;
    pageY: number;
    clientX?: number;
    identifier?: number;
};

type TouchOrMouseEvent = (MouseEvent | TouchEvent) & {
    [RelatedTouchSymbol]?: PositionHost;
    currentTarget: HTMLElement;
    target: HTMLElement;
};

interface TableWithSort extends DGTableInterface {
    sort(column?: string, descending?: boolean, add?: boolean): this;
    render(): this;
    moveColumn(src: string, dest: string): void;
}

/**
 * Handle touch start on column header
 */
export function onTouchStartColumnHeader(table: DGTableInterface, event: TouchEvent & { [RelatedTouchSymbol]?: PositionHost }): void {
    const p = table._p;

    if (p.currentTouchId) return;

    const startTouch = event.changedTouches[0];
    p.currentTouchId = startTouch.identifier;

    const cellEl = event.currentTarget as HTMLElement;

    const startPos = { x: startTouch.pageX, y: startTouch.pageY };
    let currentPos = startPos;
    const distanceTreshold = 9;

    let tapAndHoldTimeout: ReturnType<typeof setTimeout>;

    const unbind = function () {
        p.currentTouchId = null;
        p.eventsSink.remove(cellEl, '.colheader');
        clearTimeout(tapAndHoldTimeout);
    };

    (event as any)[RelatedTouchSymbol] = event.changedTouches[0];
    onMouseDownColumnHeader(table, event as unknown as MouseEvent & { [RelatedTouchSymbol]?: PositionHost });

    tapAndHoldTimeout = setTimeout(() => {
        unbind();

        p.eventsSink
            .add(cellEl, 'touchend.colheader', (event: Event) => {
                if (!isInputElementEvent(event))
                    event.preventDefault();

                p.eventsSink.remove(cellEl, '.colheader');
            }, { once: true })
            .add(cellEl, 'touchcancel.colheader', (_event: Event) => {
                p.eventsSink.remove(cellEl, '.colheader');
            }, { once: true });

        const distanceTravelled = Math.sqrt(Math.pow(Math.abs(currentPos.x - startPos.x), 2) + Math.pow(Math.abs(currentPos.y - startPos.y), 2));

        if (distanceTravelled < distanceTreshold) {
            cancelColumnResize(table);
            triggerColumnHeaderContextMenu(table, event);
        }

    }, 500);

    p.eventsSink
        .add(cellEl, 'touchend.colheader', (event: Event) => {
            const touchEvent = event as TouchEvent & { [RelatedTouchSymbol]?: PositionHost };
            const touch = find(Array.from(touchEvent.changedTouches), (t) => t.identifier === p.currentTouchId);
            if (!touch) return;

            unbind();

            if (!isInputElementEvent(event))
                event.preventDefault();

            currentPos = { x: touch.pageX, y: touch.pageY };
            const distanceTravelled = Math.sqrt(Math.pow(Math.abs(currentPos.x - startPos.x), 2) + Math.pow(Math.abs(currentPos.y - startPos.y), 2));

            if (distanceTravelled < distanceTreshold || p.resizer) {
                (touchEvent as any)[RelatedTouchSymbol] = touch;
                onSortOnColumnHeaderEvent(table, touchEvent);
            }

        })
        .add(cellEl, 'touchcancel.colheader', unbind)
        .add(cellEl, 'touchmove.colheader', (event: Event) => {
            const touchEvent = event as TouchEvent & { [RelatedTouchSymbol]?: PositionHost };
            const touch = find(Array.from(touchEvent.changedTouches), (t) => t.identifier === p.currentTouchId);
            if (!touch) return;

            currentPos = { x: touch.pageX, y: touch.pageY };

            if (p.resizer) {
                event.preventDefault();

                (touchEvent as any)[RelatedTouchSymbol] = touch;
                onMouseMoveColumnHeader(table, touchEvent);
            }
        });
}

/**
 * Handle mouse move on column header
 */
export function onMouseMoveColumnHeader(table: DGTableInterface, event: Event): void {
    const o = table._o;
    const p = table._p;

    if (!o.resizableColumns)
        return;

    const col = getColumnByResizePosition(table, event as MouseEvent);
    const headerCell = (event.target as HTMLElement).closest(`div.${o.tableClassName}-header-cell,div.${o.cellPreviewClassName}`) as HTMLElement;
    if (!headerCell) return;

    if (!col || !p.columns.get(col)?.resizable) {
        headerCell.style.cursor = '';
    } else {
        headerCell.style.cursor = 'e-resize';
    }
}

/**
 * Handle mouse up on column header
 */
export function onMouseUpColumnHeader(table: DGTableInterface, event: Event): void {
    if ((event as MouseEvent).button !== 2)
        return;

    triggerColumnHeaderContextMenu(table, event);
}

/**
 * Trigger context menu on column header
 */
export function triggerColumnHeaderContextMenu(table: DGTableInterface, event: Event): void {
    const o = table._o;

    const touchEvent = event as TouchEvent;
    const mouseEvent = event as MouseEvent;
    const positionHost: PositionHost = (event as TouchOrMouseEvent)[RelatedTouchSymbol] ?? touchEvent.changedTouches?.[0] ?? { pageX: mouseEvent.pageX, pageY: mouseEvent.pageY };

    const headerCell = (event.target as HTMLElement).closest(`div.${o.tableClassName}-header-cell,div.${o.cellPreviewClassName}`) as HeaderCellElement;
    if (!headerCell) return;

    const bounds = getElementOffset(headerCell) as { left: number; top: number; width?: number; height?: number };
    bounds.width = getElementWidth(headerCell, true, true, true);
    bounds.height = getElementHeight(headerCell, true, true, true);
    table.emit('headercontextmenu', {
        columnName: headerCell.columnName,
        pageX: positionHost.pageX,
        pageY: positionHost.pageY,
        bounds: bounds,
    });
}

/**
 * Handle mouse leave on column header
 */
export function onMouseLeaveColumnHeader(table: DGTableInterface, event: MouseEvent): void {
    const o = table._o;
    const headerCell = (event.target as HTMLElement).closest(`div.${o.tableClassName}-header-cell,div.${o.cellPreviewClassName}`) as HTMLElement;
    if (headerCell) {
        headerCell.style.cursor = '';
    }
}

/**
 * Handle sort click on column header
 */
export function onSortOnColumnHeaderEvent(table: DGTableInterface, event: Event): void {
    if (isInputElementEvent(event))
        return;

    if (getColumnByResizePosition(table, event as MouseEvent))
        return;

    const o = table._o;
    const p = table._p;

    const headerCell = (event.target as HTMLElement).closest(`div.${o.tableClassName}-header-cell,div.${o.cellPreviewClassName}`) as HeaderCellElement;
    if (!headerCell) return;

    if (!o.sortableColumns)
        return;

    const column = p.columns.get(headerCell.columnName!);
    const currentSort = p.rows.sortColumn;
    if (column && column.sortable) {
        let shouldAdd = true;

        const lastSort = currentSort.length ? currentSort[currentSort.length - 1] : null;

        if (lastSort && lastSort.column === column.name) {
            if (!lastSort.descending || !o.allowCancelSort) {
                lastSort.descending = !lastSort.descending;
            } else {
                shouldAdd = false;
                currentSort.splice(currentSort.length - 1, 1);
            }
        }

        const tableWithSort = table as unknown as TableWithSort;
        if (shouldAdd) {
            tableWithSort.sort(column.name, undefined, true).render();
        } else {
            tableWithSort.sort(); // just refresh current situation
        }
    }
}

/**
 * Handle drag start on column header
 */
export function onStartDragColumnHeader(table: DGTableInterface, event: DragEvent): void {
    const o = table._o;
    const p = table._p;

    if (o.movableColumns) {
        const headerCell = (event.target as HTMLElement).closest(`div.${o.tableClassName}-header-cell,div.${o.cellPreviewClassName}`) as HeaderCellElement;
        if (!headerCell) {
            event.preventDefault();
            return;
        }

        const column = p.columns.get(headerCell.columnName!);
        if (column && column.movable) {
            headerCell.style.opacity = '0.35';
            p.dragId = Math.random() * 0x9999999;
            event.dataTransfer?.setData('text', JSON.stringify({ dragId: p.dragId, column: column.name }));
        } else {
            event.preventDefault();
        }
    } else {
        event.preventDefault();
    }
}

/**
 * Handle drag end on column header
 */
export function onDragEndColumnHeader(table: DGTableInterface, event: DragEvent): void {
    const p = table._p;

    if (!p.resizer) {
        (event.target as HTMLElement).style.opacity = '';
    }
}

/**
 * Handle drag enter on column header
 */
export function onDragEnterColumnHeader(table: DGTableInterface, event: DragEvent): void {
    const o = table._o;
    const p = table._p;

    if (o.movableColumns) {
        let dataTransferred: DragData | null = null;
        const dataStr = event.dataTransfer?.getData('text');
        if (dataStr) {
            try {
                dataTransferred = JSON.parse(dataStr);
            } catch {
                dataTransferred = null;
            }
        }

        const headerCell = (event.target as HTMLElement).closest(`div.${o.tableClassName}-header-cell,div.${o.cellPreviewClassName}`) as HeaderCellElement;
        if (!headerCell) return;

        if (!dataTransferred ||
            (p.dragId === dataTransferred.dragId && headerCell.columnName !== dataTransferred.column)) {

            const column = p.columns.get(headerCell.columnName!);
            if (column && (column.movable || column !== p.visibleColumns[0])) {
                headerCell.classList.add('drag-over');
            }
        }
    }
}

/**
 * Handle drag over on column header
 */
export function onDragOverColumnHeader(_table: DGTableInterface, event: DragEvent): void {
    event.preventDefault();
}

/**
 * Handle drag leave on column header
 */
export function onDragLeaveColumnHeader(table: DGTableInterface, event: DragEvent): void {
    const o = table._o;
    const headerCell = (event.target as HTMLElement).closest(`div.${o.tableClassName}-header-cell,div.${o.cellPreviewClassName}`) as HTMLElement;
    if (!headerCell) return;

    const relatedTarget = event.relatedTarget as HTMLElement;
    if (!relatedTarget?.contains(headerCell.firstChild)) {
        headerCell.classList.remove('drag-over');
    }
}

/**
 * Handle drop on column header
 */
export function onDropColumnHeader(table: DGTableInterface, event: DragEvent): void {
    event.preventDefault();

    const o = table._o;
    const p = table._p;

    const dataStr = event.dataTransfer?.getData('text');
    if (!dataStr) return;

    let dataTransferred: DragData;
    try {
        dataTransferred = JSON.parse(dataStr);
    } catch {
        return;
    }

    const headerCell = (event.target as HTMLElement).closest(`div.${o.tableClassName}-header-cell,div.${o.cellPreviewClassName}`) as HeaderCellElement;
    if (!headerCell) return;

    if (o.movableColumns && dataTransferred.dragId === p.dragId) {
        const srcColName = dataTransferred.column;
        const destColName = headerCell.columnName!;
        const srcCol = p.columns.get(srcColName);
        const destCol = p.columns.get(destColName);
        if (srcCol && destCol && srcCol.movable && (destCol.movable || destCol !== p.visibleColumns[0])) {
            (table as unknown as TableWithSort).moveColumn(srcColName, destColName);
        }
    }
    headerCell.classList.remove('drag-over');
}

