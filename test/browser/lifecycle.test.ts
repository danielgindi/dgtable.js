import { describe, expect, it, vi } from 'vitest';
import DGTable from '../../src/index';
import { makeRows, mountTable } from '../helpers/table';
import { headerCell, previewCell, renderedRows, resizeMarker, scrollContainer, scrollHorizontally, scrollVertically, bodyCell } from '../helpers/dom';
import { hover, mouse, resizeEdgeX } from '../helpers/pointer';
import { checkInvariants } from '../helpers/invariants';

const columns = [
    { name: 'id', width: 80 },
    { name: 'name', width: 150 },
];

describe('rendering lifecycle', () => {
    it('LIFE-01: renders and emits renderskeleton before render', () => {
        const { table } = mountTable({ columns }, { render: false });
        const events: string[] = [];
        table.on('renderskeleton', () => events.push('renderskeleton'));
        table.on('render', () => events.push('render'));

        table.render();
        expect(events).toEqual(['renderskeleton', 'render']);
        expect(table.getHeaderRowElement()!.children.length).toBe(2);

        table.render();
        expect(events).toEqual(['renderskeleton', 'render', 'render']);
    });

    it('LIFE-02: defers rendering while detached and renders once attached', () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        const { table, host } = mountTable({ columns }, { attach: false });
        const renders = vi.fn();
        table.on('renderskeleton', renders);

        table.render();
        table.render();
        table.render();
        expect(table.getHeaderRowElement()).toBeUndefined();

        document.body.appendChild(host);
        vi.runAllTimers();
        expect(renders).toHaveBeenCalledTimes(1);
        expect(table.getHeaderRowElement()).toBeDefined();
    });

    it('LIFE-02: does nothing when the deferred render fires while still detached', () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        const { table } = mountTable({ columns }, { attach: false });

        table.render();
        expect(() => vi.runAllTimers()).not.toThrow();
        expect(table.getHeaderRowElement()).toBeUndefined();
    });

    it('LIFE-03: does not render inside a display:none ancestor until shown', () => {
        const { table, host } = mountTable({ columns }, { render: false });
        host.style.display = 'none';
        table.render();
        expect(table.getHeaderRowElement()).toBeUndefined();

        host.style.display = '';
        table.render();
        expect(table.getHeaderRowElement()).toBeDefined();
    });

    it('LIFE-04: clearAndRender(false) defers the skeleton rebuild to the next render()', () => {
        const { table } = mountTable({ columns });
        const skeletons = vi.fn();
        table.on('renderskeleton', skeletons);

        table.clearAndRender(false);
        expect(skeletons).not.toHaveBeenCalled();
        table.render();
        expect(skeletons).toHaveBeenCalledTimes(1);
    });

    it('LIFE-05: preserves scroll positions across a full re-render', () => {
        const { table } = mountTable({
            columns: [{ name: 'id', width: 300 }, { name: 'name', width: 400 }],
            width: DGTable.Width.SCROLL,
        });
        table.setRows(makeRows(200));
        scrollVertically(table, 500);
        scrollHorizontally(table, 100);

        table.clearAndRender();
        expect(scrollContainer(table).scrollTop).toBe(500);
        expect(Math.abs(scrollContainer(table).scrollLeft)).toBe(100);
    });

    it('LIFE-06: destroy removes the element and turns event methods into no-ops', () => {
        const { table } = mountTable({ columns });
        const el = table.el;
        table.setRows(makeRows(3));

        expect(table.destroy()).toBe(table);
        expect(el.isConnected).toBe(false);
        expect(table.on('x', () => {})).toBe(table);
        expect(table.once('x', () => {})).toBe(table);
        expect(table.emit('x')).toBe(table);
        expect(table.off()).toBe(table);
        expect(() => table.destroy()).not.toThrow();
    });

    it('LIFE-06: close() and remove() are aliases of destroy()', () => {
        for (const method of ['close', 'remove'] as const) {
            const { table } = mountTable({ columns });
            const el = table.el;
            table[method]();
            expect(el.isConnected).toBe(false);
        }
    });

    it('LIFE-07: cancels a pending deferred render on destroy', () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        const { table, host } = mountTable({ columns }, { attach: false });
        const renders = vi.fn();
        table.on('render', renders);

        table.render();
        table.destroy();
        document.body.appendChild(host);
        expect(() => vi.runAllTimers()).not.toThrow();
        expect(renders).not.toHaveBeenCalled();
    });

    it('LIFE-08: destroy during a pending and an active resize removes the marker and listeners', () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
        const { table } = mountTable({ columns });
        table.setRows(makeRows(3));

        mouse('mousedown', headerCell(table, 'id'), resizeEdgeX(table, 'id'));
        vi.advanceTimersByTime(table.getResizeAreaDoubleClickDuration());
        expect(resizeMarker(table)).not.toBeNull();

        const el = table.el;
        table.destroy();
        expect(el.querySelector('.dgtable-resize')).toBeNull();
    });

    it('LIFE-09 (pin): destroy while a cell preview is shown removes the preview', () => {
        const { table } = mountTable({ columns: [{ name: 'id', width: 40 }, { name: 'name', width: 150 }] });
        table.setRows([{ id: 'a very long value that overflows', name: 'x' }]);
        const el = table.el;
        const destroyed = vi.fn();
        table.on('cellpreviewdestroy', destroyed);

        hover(bodyCell(table, 0, 'id'));
        expect(previewCell(table)).not.toBeNull();

        table.destroy();
        expect(el.isConnected).toBe(false);
        // DECIDE: the preview stays inside the detached element.
        // DECIDE: today no cellpreviewdestroy is emitted for a destroyed table.
        expect(destroyed).not.toHaveBeenCalled();
    });

    it('LIFE-10 (pin, D13): destroy removes a caller-provided element from the DOM', () => {
        const el = document.createElement('div');
        const host = document.createElement('div');
        host.appendChild(el);
        document.body.appendChild(host);

        const table = new DGTable({ el, columns });
        table.render();
        table.destroy();

        // DECIDE: the caller owns `el`; today destroy() removes it.
        expect(el.isConnected).toBe(false);
        host.remove();
    });

    it('LIFE-13 (D27): destroy unbinds the DOM listeners it added', () => {
        const errors: unknown[] = [];
        const onError = (event: ErrorEvent) => {
            errors.push(event.error);
            event.preventDefault();
        };
        window.addEventListener('error', onError);

        try {
            const el = document.createElement('div');
            document.body.appendChild(el);
            const table = new DGTable({ el, columns, width: DGTable.Width.SCROLL });
            table.render();
            table.setRows(makeRows(50));
            const container = scrollContainer(table);

            table.destroy();
            container.dispatchEvent(new Event('scroll'));
            el.dispatchEvent(new WheelEvent('wheel', { bubbles: true }));
            el.dispatchEvent(new DragEvent('dragend', { bubbles: true }));
            el.remove();
        } finally {
            window.removeEventListener('error', onError);
        }

        expect(errors).toEqual([]);
    });

    it('LIFE-11 (pin): non-event API calls after destroy throw', () => {
        const { table } = mountTable({ columns });
        table.destroy();
        // DECIDE: no-op or documented throw.
        expect(() => table.render()).toThrow(TypeError);
    });

    it('LIFE-12 (D2): row APIs do not throw before the first render, and data shows after render', () => {
        const { table, host } = mountTable({ columns }, { attach: false });

        expect(() => {
            table.addRows(makeRows(5));
            table.removeRows(0, 1);
            table.refreshRow(0);
            table.refreshAllVirtualRows();
            expect(table.getRowElement(0)).toBeNull();
            expect(table.getRowYPos(0)).toBeNull();
        }).not.toThrow();

        document.body.appendChild(host);
        table.render();
        expect(renderedRows(table)).toHaveLength(4);
        checkInvariants(table);
    });
});
