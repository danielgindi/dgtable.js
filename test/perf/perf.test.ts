import { describe, expect, it } from 'vitest';
import DGTable from '../../src/index';
import { makeRows, mountTable } from '../helpers/table';
import { renderedRows, scrollVertically } from '../helpers/dom';
import { expectRowsMatchData, expectVirtualBound } from '../helpers/invariants';

// Generous absolute ceilings catch pathological regressions (e.g. accidental O(n^2)).
// Each test prints its timing so trends can be compared between runs.

const columns = [
    { name: 'id', width: 80 },
    { name: 'name', width: 150 },
    { name: 'value', width: 100 },
];

function time(label: string, action: () => void): number {
    const start = performance.now();
    action();
    const elapsed = performance.now() - start;
    console.info(`[perf] ${label}: ${elapsed.toFixed(1)}ms`);
    return elapsed;
}

describe('performance', () => {
    it('PERF-01: renders 100k and 500k rows with a bounded DOM', () => {
        const { table } = mountTable({ columns, height: 400 });
        expect(time('setRows(100k)', () => table.setRows(makeRows(100_000)))).toBeLessThan(2000);
        expectVirtualBound(table);
        expect(time('setRows(500k)', () => table.setRows(makeRows(500_000)))).toBeLessThan(5000);
        expectVirtualBound(table);
    });

    it('PERF-02: scrolls through 100k rows without long frames', () => {
        const { table } = mountTable({ columns, height: 400 });
        table.setRows(makeRows(100_000));
        const durations: number[] = [];

        for (let top = 0; top < 100_000 * 29; top += 29 * 997) {
            const start = performance.now();
            scrollVertically(table, top);
            durations.push(performance.now() - start);
        }

        durations.sort((a, b) => a - b);
        const p95 = durations[Math.floor(durations.length * 0.95)];
        console.info(`[perf] scroll step p95: ${p95.toFixed(1)}ms over ${durations.length} steps`);
        expect(p95).toBeLessThan(50);
        expectRowsMatchData(table);
    });

    it('PERF-03: sorts 100k rows by number, string, and three columns', () => {
        const { table } = mountTable({ columns, height: 400, maxColumnsSortCount: 3 });
        table.setRows(makeRows(100_000, i => ({ id: i, name: 'n' + ((i * 7919) % 100_000), value: i % 10 })));

        expect(time('sort number', () => table.sort('id', true))).toBeLessThan(1500);
        expect(time('sort string', () => table.sort('name'))).toBeLessThan(1500);
        expect(time('sort 3 columns', () => table.setSortedColumns([
            { column: 'value', descending: false },
            { column: 'name', descending: true },
            { column: 'id', descending: false },
        ]))).toBeLessThan(2000);
        expect(renderedRows(table)[0].textContent).toContain('n99');
    });

    it('PERF-03: a custom sorting provider returning a new 300k array', () => {
        const { table } = mountTable({ columns, height: 400, customSortingProvider: (data, sort) => sort(data.slice()) });
        table.setRows(makeRows(300_000));
        expect(time('custom provider sort', () => table.sort('value'))).toBeLessThan(3000);
    });

    it('PERF-04: filters and clears on 100k rows', () => {
        const { table } = mountTable({ columns, height: 400 });
        table.setRows(makeRows(100_000));
        expect(time('filter', () => table.filter({ column: 'name', keyword: '99' }))).toBeLessThan(1000);
        expect(time('clearFilter', () => table.clearFilter())).toBeLessThan(1000);
    });

    it('PERF-05: inserts 10k rows in the middle of 100k', () => {
        const { table } = mountTable({ columns, height: 400 });
        table.setRows(makeRows(100_000));
        expect(time('addRows(10k, middle)', () => table.addRows(makeRows(10_000), 50_000))).toBeLessThan(3000);
        expect(table.getRowCount()).toBe(110_000);
    });

    it('PERF-07: destroyed tables can be garbage collected', async () => {
        const gc = (globalThis as { gc?: () => void }).gc;
        if (!gc)
            return;

        const refs: WeakRef<object>[] = [];
        for (let i = 0; i < 50; i++) {
            const host = document.createElement('div');
            document.body.appendChild(host);
            const table = new DGTable({ columns, height: 200 });
            host.appendChild(table.el);
            table.render();
            table.setRows(makeRows(200));
            refs.push(new WeakRef(table.el));
            table.destroy();
            host.remove();
        }

        await new Promise(resolve => setTimeout(resolve, 0));
        gc();
        const alive = refs.filter(ref => ref.deref()).length;
        console.info(`[perf] tables still alive after gc: ${alive}/50`);
        expect(alive).toBeLessThanOrEqual(1);
    });
});
