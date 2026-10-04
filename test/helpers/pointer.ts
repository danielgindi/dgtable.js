import type DGTable from '../../src/index';
import { headerCell, isRtl } from './dom';

type TouchType = 'touchstart' | 'touchmove' | 'touchend' | 'touchcancel';

export function mouse(type: string, target: EventTarget, clientX: number, clientY = 0, button = 0): MouseEvent {
    const event = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        button,
        clientX,
        clientY,
    });
    target.dispatchEvent(event);
    return event;
}

/** X coordinate 1px inside the trailing edge of a header cell (the resize hotspot). */
export function resizeEdgeX(table: DGTable, column: string): number {
    const rect = headerCell(table, column).getBoundingClientRect();
    return isRtl(table) ? rect.left + 1 : rect.right - 1;
}

/** Drag a column's resize edge by deltaX (positive = wider, in both directions). */
export function resizeBy(table: DGTable, column: string, deltaX: number): void {
    const startX = resizeEdgeX(table, column);
    const endX = isRtl(table) ? startX - deltaX : startX + deltaX;
    const middleX = isRtl(table) ? startX - 10 : startX + 10;

    mouse('mousedown', headerCell(table, column), startX);
    mouse('mousemove', document, middleX);
    mouse('mousemove', document, endX);
    mouse('mouseup', document, endX);
}

export interface DragOptions {
    dataTransfer?: DataTransfer;
    skipDragStart?: boolean;
}

/** HTML5 drag & drop of one header onto another, as the library sees it. */
export function dragColumn(table: DGTable, source: string, target: string, targetTable: DGTable = table): DataTransfer {
    const dataTransfer = new DataTransfer();
    const sourceCell = headerCell(table, source);
    const targetCell = headerCell(targetTable, target);

    sourceCell.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer }));
    targetCell.firstElementChild!.dispatchEvent(new DragEvent('dragenter', { bubbles: true, dataTransfer }));
    targetCell.firstElementChild!.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
    sourceCell.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer }));
    return dataTransfer;
}

/**
 * Cross-engine fake touch event. The library only reads `type`, `changedTouches`
 * and the touch points' identifier/pageX/pageY, so no Touch/TouchEvent constructor
 * is needed (Firefox desktop has neither).
 */
export function touch(type: TouchType, target: EventTarget, pageX: number, pageY = 0, identifier = 1): Event {
    const event = new Event(type, { bubbles: true, cancelable: true });
    const point = { identifier, pageX, pageY, clientX: pageX, clientY: pageY, target };
    const isEnd = type === 'touchend' || type === 'touchcancel';

    Object.defineProperty(event, 'changedTouches', { value: [point] });
    Object.defineProperty(event, 'touches', { value: isEnd ? [] : [point] });
    target.dispatchEvent(event);
    return event;
}

export function wheel(target: EventTarget, deltaY = 40): void {
    target.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY }));
}

/** Synthetic hover: mouseover on the cell, coming from outside the table. */
export function hover(target: Element, relatedTarget: EventTarget | null = null): void {
    target.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget }));
}

/** Synthetic un-hover: mouseout from the element, going to relatedTarget. */
export function unhover(target: Element, relatedTarget: EventTarget | null = document.body): void {
    target.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget }));
}
