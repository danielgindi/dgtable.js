'use strict';

/**
 * Header events functionality for DGTable
 */

import { find } from './util.js';
import {
    getElementWidth,
    getElementHeight,
    getElementOffset,
} from '@danielgindi/dom-utils/lib/Css.js';
import { RelatedTouch } from './constants.js';
import { isInputElementEvent } from './helpers.js';
import {
    getColumnByResizePosition,
    cancelColumnResize,
    onMouseDownColumnHeader,
} from './column_resize.js';

/**
 * Handle touch start on column header
 * @param {DGTable} table - The DGTable instance
 * @param {TouchEvent} event
 */
export function onTouchStartColumnHeader(table, event) {
    const p = table._p;

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

    event[RelatedTouch] = event.changedTouches[0];
    onMouseDownColumnHeader(table, event);

    tapAndHoldTimeout = setTimeout(() => {
        unbind();

        p.eventsSink
            .add(cellEl, 'touchend.colheader', (event) => {
                if (!isInputElementEvent(event))
                    event.preventDefault();

                p.eventsSink.remove(cellEl, '.colheader');
            }, { once: true })
            .add(cellEl, 'touchcancel.colheader', (_event) => {
                p.eventsSink.remove(cellEl, '.colheader');
            }, { once: true });

        let distanceTravelled = Math.sqrt(Math.pow(Math.abs(currentPos.x - startPos.x), 2) + Math.pow(Math.abs(currentPos.y - startPos.y), 2));

        if (distanceTravelled < distanceTreshold) {
            cancelColumnResize(table);
            triggerColumnHeaderContextMenu(table, event);
        }

    }, 500);

    p.eventsSink
        .add(cellEl, 'touchend.colheader', (/**TouchEvent*/event) => {
            let touch = find(event.changedTouches, (touch) => touch.identifier === p.currentTouchId);
            if (!touch) return;

            unbind();

            if (!isInputElementEvent(event))
                event.preventDefault();

            currentPos = { x: touch.pageX, y: touch.pageY };
            let distanceTravelled = Math.sqrt(Math.pow(Math.abs(currentPos.x - startPos.x), 2) + Math.pow(Math.abs(currentPos.y - startPos.y), 2));

            if (distanceTravelled < distanceTreshold || p.resizer) {
                event[RelatedTouch] = touch;
                onSortOnColumnHeaderEvent(table, event);
            }

        })
        .add(cellEl, 'touchcancel.colheader', unbind)
        .add(cellEl, 'touchmove.colheader', (/**TouchEvent*/event) => {
            let touch = find(event.changedTouches, (touch) => touch.identifier === p.currentTouchId);
            if (!touch) return;

            currentPos = { x: touch.pageX, y: touch.pageY };

            if (p.resizer) {
                event.preventDefault();

                event[RelatedTouch] = touch;
                onMouseMoveColumnHeader(table, event);
            }
        });
}

/**
 * Handle mouse move on column header
 * @param {DGTable} table - The DGTable instance
 * @param {MouseEvent|TouchEvent} event
 */
export function onMouseMoveColumnHeader(table, event) {
    const o = table._o,
        p = table._p;

    if (!o.resizableColumns)
        return;

    let col = getColumnByResizePosition(table, event);
    let headerCell = event.target.closest(`div.${o.tableClassName}-header-cell,div.${o.cellPreviewClassName}`);
    if (!col || !p.columns.get(col).resizable) {
        headerCell.style.cursor = '';
    } else {
        headerCell.style.cursor = 'e-resize';
    }
}

/**
 * Handle mouse up on column header
 * @param {DGTable} table - The DGTable instance
 * @param {MouseEvent|TouchEvent} event
 */
export function onMouseUpColumnHeader(table, event) {
    if (event.button !== 2)
        return;

    triggerColumnHeaderContextMenu(table, event);
}

/**
 * Trigger context menu on column header
 * @param {DGTable} table - The DGTable instance
 * @param {MouseEvent|TouchEvent} event
 */
export function triggerColumnHeaderContextMenu(table, event) {
    const o = table._o;

    const positionHost = event[RelatedTouch] ?? event.changedTouches?.[0] ?? event;

    let headerCell = event.target.closest(`div.${o.tableClassName}-header-cell,div.${o.cellPreviewClassName}`);
    let bounds = getElementOffset(headerCell);
    bounds['width'] = getElementWidth(headerCell, true, true, true);
    bounds['height'] = getElementHeight(headerCell, true, true, true);
    table.emit('headercontextmenu', {
        columnName: headerCell['columnName'],
        pageX: positionHost.pageX,
        pageY: positionHost.pageY,
        bounds: bounds,
    });
}

/**
 * Handle mouse leave on column header
 * @param {DGTable} table - The DGTable instance
 * @param {MouseEvent} event
 */
export function onMouseLeaveColumnHeader(table, event) {
    let o = table._o;
    let headerCell = event.target.closest(`div.${o.tableClassName}-header-cell,div.${o.cellPreviewClassName}`);
    headerCell.style.cursor = '';
}

/**
 * Handle sort click on column header
 * @param {DGTable} table - The DGTable instance
 * @param {MouseEvent|TouchEvent} event
 */
export function onSortOnColumnHeaderEvent(table, event) {
    if (isInputElementEvent(event))
        return;

    if (getColumnByResizePosition(table, event))
        return;

    const o = table._o,
        p = table._p;

    let headerCell = event.target.closest(`div.${o.tableClassName}-header-cell,div.${o.cellPreviewClassName}`);
    if (!o.sortableColumns)
        return;

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
            table.sort(column.name, undefined, true).render();
        } else {
            table.sort(); // just refresh current situation
        }
    }
}

/**
 * Handle drag start on column header
 * @param {DGTable} table - The DGTable instance
 * @param {DragEvent} event
 */
export function onStartDragColumnHeader(table, event) {
    let o = table._o,
        p = table._p;

    if (o.movableColumns) {
        let headerCell = event.target.closest(`div.${o.tableClassName}-header-cell,div.${o.cellPreviewClassName}`);
        let column = p.columns.get(headerCell['columnName']);
        if (column && column.movable) {
            headerCell.style.opacity = 0.35;
            p.dragId = Math.random() * 0x9999999;
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
 * Handle drag end on column header
 * @param {DGTable} table - The DGTable instance
 * @param {DragEvent} event
 */
export function onDragEndColumnHeader(table, event) {
    let p = table._p;

    if (!p.resizer) {
        event.target.style.opacity = null;
    }
}

/**
 * Handle drag enter on column header
 * @param {DGTable} table - The DGTable instance
 * @param {DragEvent} event
 */
export function onDragEnterColumnHeader(table, event) {
    let o = table._o,
        p = table._p;

    if (o.movableColumns) {
        let dataTransferred = event.dataTransfer.getData('text');
        if (dataTransferred) {
            dataTransferred = JSON.parse(dataTransferred);
        }
        else {
            dataTransferred = null;
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
 * Handle drag over on column header
 * @param {DGTable} table - The DGTable instance
 * @param {DragEvent} event
 */
export function onDragOverColumnHeader(table, event) {
    event.preventDefault();
}

/**
 * Handle drag leave on column header
 * @param {DGTable} table - The DGTable instance
 * @param {DragEvent} event
 */
export function onDragLeaveColumnHeader(table, event) {
    let o = table._o;
    let headerCell = event.target.closest(`div.${o.tableClassName}-header-cell,div.${o.cellPreviewClassName}`);
    if (!event.relatedTarget.contains(headerCell.firstChild)) {
        headerCell.classList.remove('drag-over');
    }
}

/**
 * Handle drop on column header
 * @param {DGTable} table - The DGTable instance
 * @param {DragEvent} event
 */
export function onDropColumnHeader(table, event) {
    event.preventDefault();

    let o = table._o,
        p = table._p;

    let dataTransferred = JSON.parse(event.dataTransfer.getData('text'));
    let headerCell = event.target.closest(`div.${o.tableClassName}-header-cell,div.${o.cellPreviewClassName}`);
    if (o.movableColumns && dataTransferred.dragId === p.dragId) {
        let srcColName = dataTransferred.column,
            destColName = headerCell['columnName'],
            srcCol = p.columns.get(srcColName),
            destCol = p.columns.get(destColName);
        if (srcCol && destCol && srcCol.movable && (destCol.movable || destCol !== p.visibleColumns[0])) {
            table.moveColumn(srcColName, destColName);
        }
    }
    headerCell.classList.remove('drag-over');
}

