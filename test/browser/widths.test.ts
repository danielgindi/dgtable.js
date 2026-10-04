import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import DGTable from '../../src/index';
import type { ColumnOptions } from '../../src/index';
import { layoutName, layouts, makeRows, mountLayout, mountTable } from '../helpers/table';
import { headerCell, renderedRows, scrollContainer, scrollHorizontally } from '../helpers/dom';
import { checkInvariants, expectColumnsAligned, expectNoGapAtEnd } from '../helpers/invariants';

function width(table: DGTable, column: string): number {
    return parseFloat(headerCell(table, column).style.width);
}

function bodyWidth(table: DGTable, column: string): number {
    return renderedRows(table)[0].querySelector<HTMLElement>(`[data-column="${column}"]`)!.getBoundingClientRect().width;
}

function rowsFor(columns: ColumnOptions[], count = 3) {
    return makeRows(count, i => Object.fromEntries(columns.map(c => [c.name, c.name + i])));
}

describe.each(layouts)('column widths ($dir, $boxSizing, virtual=$virtualTable)', layout => {
    function mount(columns: ColumnOptions[], options: Partial<ConstructorParameters<typeof DGTable>[0]> = {}, hostWidth = 500, rowCount = 3) {
        const { table } = mountLayout(layout, { columns, ...options }, { width: hostWidth });
        table.setRows(rowsFor(columns, rowCount));
        return table;
    }

    it('WID-01: keeps absolute widths and stretches the last column to fill', () => {
        const table = mount([{ name: 'a', width: 100 }, { name: 'b', width: 80 }]);

        expect(width(table, 'a')).toBe(100);
        expect(width(table, 'b')).toBeGreaterThan(80);
        expect(table.getColumnWidth('b')).toBe(80);
        expectNoGapAtEnd(table);
        checkInvariants(table);
    });

    it('WID-02: leaves a gap when autoFillLastColumn is off', () => {
        const table = mount([{ name: 'a', width: 100 }, { name: 'b', width: 80 }], { autoFillLastColumn: false });
        expect(width(table, 'b')).toBe(80);
        expect(() => expectNoGapAtEnd(table)).toThrow();
        checkInvariants(table);
    });

    it('WID-03: fills the width exactly with relative columns for any container width', () => {
        for (let hostWidth = 301; hostWidth <= 311; hostWidth++) {
            const table = mount([{ name: 'a', width: '30%' }, { name: 'b', width: '33%' }, { name: 'c', width: '37%' }], {}, hostWidth);
            expectNoGapAtEnd(table);
            checkInvariants(table);
        }
    });

    it('WID-04: grows relative columns below 100% only when relativeWidthGrowsToFillWidth', () => {
        const grow = mount([{ name: 'a', width: '20%' }, { name: 'b', width: '20%' }], { autoFillLastColumn: false });
        expect(Math.abs(bodyWidth(grow, 'a') - bodyWidth(grow, 'b'))).toBeLessThanOrEqual(15 + 1);
        expectNoGapAtEnd(grow);

        const fixed = mount([{ name: 'a', width: '20%' }, { name: 'b', width: '20%' }], { autoFillLastColumn: false, relativeWidthGrowsToFillWidth: false });
        expect(width(fixed, 'a')).toBeLessThan(width(grow, 'a') / 2 + 5);
        checkInvariants(fixed);
    });

    it('WID-05: shrinks relative columns above 100% only when relativeWidthShrinksToFillWidth', () => {
        const shrink = mount([{ name: 'a', width: '60%' }, { name: 'b', width: '60%' }], { relativeWidthShrinksToFillWidth: true, width: DGTable.Width.SCROLL });
        expect(scrollContainer(shrink).scrollWidth).toBeLessThanOrEqual(scrollContainer(shrink).clientWidth);
        checkInvariants(shrink);

        const overflow = mount([{ name: 'a', width: '60%' }, { name: 'b', width: '60%' }], { width: DGTable.Width.SCROLL });
        expect(scrollContainer(overflow).scrollWidth).toBeGreaterThan(scrollContainer(overflow).clientWidth);
        checkInvariants(overflow);
    });

    it('WID-06: relative columns share the space left after absolute ones', () => {
        const table = mount([{ name: 'a', width: 200 }, { name: 'b', width: '50%' }, { name: 'c', width: '50%' }]);
        expect(width(table, 'a')).toBe(200);
        expect(Math.abs(width(table, 'b') - (width(table, 'c') + parseFloat(getComputedStyle(scrollContainer(table)).width) * 0))).toBeLessThanOrEqual(16);
        expectNoGapAtEnd(table);
        checkInvariants(table);
    });

    it('WID-07: rest columns take the remaining width', () => {
        const one = mount([{ name: 'a', width: 100 }, { name: 'b', width: 'rest' }, { name: 'c', width: 60 }]);
        expect(width(one, 'a')).toBe(100);
        expect(width(one, 'c')).toBe(60);
        expect(width(one, 'b')).toBeGreaterThan(200);
        expectNoGapAtEnd(one);
        checkInvariants(one);

        const two = mount([{ name: 'a', width: 100 }, { name: 'b', width: 'rest' }, { name: 'c', width: 'rest' }, { name: 'd', width: 50 }]);
        expect(Math.abs(width(two, 'b') - width(two, 'c'))).toBeLessThanOrEqual(1);
        checkInvariants(two);

        const none = mount([{ name: 'a', width: 600 }, { name: 'b', width: 'rest' }, { name: 'c', width: 50 }], { width: DGTable.Width.SCROLL });
        expect(width(none, 'b')).toBe(35);
        checkInvariants(none);
    });

    it('WID-07 (D44): a rest column never gets a negative width when an earlier one took the minimum', () => {
        const table = mount([
            { name: 'a', width: 'rest' },
            { name: 'b', width: 'rest', ignoreMin: true },
            { name: 'c', width: 94 },
            { name: 'd', width: '1%' },
        ], { width: DGTable.Width.SCROLL }, 200);

        expect(parseFloat(headerCell(table, 'b').style.width)).toBeGreaterThanOrEqual(0);
        checkInvariants(table);
    });

    it('WID-08: relatives do not grow when a rest column exists', () => {
        const table = mount([{ name: 'a', width: '20%' }, { name: 'b', width: 'rest' }, { name: 'c', width: 50 }]);
        const reference = mount([{ name: 'a', width: '20%' }, { name: 'b', width: 100 }, { name: 'c', width: 50 }]);
        expect(width(table, 'a')).toBeLessThan(width(reference, 'a'));
        checkInvariants(table);
    });

    it('WID-10: convertColumnWidthsToRelative keeps the configured width', () => {
        const table = mount([{ name: 'a', width: 'auto' }, { name: 'b', width: 'auto' }], { convertColumnWidthsToRelative: true });
        expect(table.getColumnWidth('a')).toBe('auto');
        expectNoGapAtEnd(table);
        checkInvariants(table);

        table.setConvertColumnWidthsToRelative(false);
        expect(table.getColumnWidth('a')).toBe('auto');
        checkInvariants(table);
    });

    it('WID-11: autoFillTableWidth stretches resizable columns only', () => {
        const table = mount([
            { name: 'a', width: 100 },
            { name: 'fixed', width: 50, resizable: false },
            { name: 'b', width: 100 },
        ], { autoFillTableWidth: true, autoFillLastColumn: false });

        expect(width(table, 'fixed')).toBe(50);
        expect(width(table, 'a')).toBeGreaterThan(100);
        expect(Math.abs(width(table, 'a') - width(table, 'b'))).toBeLessThanOrEqual(16);
        checkInvariants(table);
    });

    it('WID-12: raises tiny relative columns to the minimum, except ignoreMin ones', () => {
        const table = mount([{ name: 'a', width: '1%' }, { name: 'b', width: '1%', ignoreMin: true }, { name: 'c', width: '98%' }]);
        expect(width(table, 'a')).toBeGreaterThanOrEqual(35);
        expect(width(table, 'b')).toBeLessThan(35);
        expectNoGapAtEnd(table);
        checkInvariants(table);
    });

    it('WID-13: hidden columns take no width', () => {
        const table = mount([{ name: 'a', width: '50%' }, { name: 'b', width: '50%' }, { name: 'c', width: '50%', visible: false }]);
        expectNoGapAtEnd(table);
        checkInvariants(table);

        table.setColumnVisible('c', true);
        expectNoGapAtEnd(table);
        checkInvariants(table);
    });

    it('WID-15: keeps header and body aligned at every horizontal scroll offset', () => {
        const table = mount([{ name: 'a', width: 300 }, { name: 'b', width: 300 }, { name: 'c', width: 300 }], { width: DGTable.Width.SCROLL });
        const header = table.el.querySelector<HTMLElement>('.dgtable-header')!;

        for (const offset of [0, 50, 200, 10_000]) {
            scrollHorizontally(table, offset);
            expect(Math.abs(header.scrollLeft)).toBe(Math.abs(scrollContainer(table).scrollLeft));
            expectColumnsAligned(table);
        }
    });

    it('WID-16: re-lays out after the container width changes', () => {
        const { table, host } = mountLayout(layout, { columns: [{ name: 'a', width: '50%' }, { name: 'b', width: '50%' }] });
        table.setRows(rowsFor([{ name: 'a' }, { name: 'b' }]));

        host.style.width = '700px';
        table.tableWidthChanged();
        expectNoGapAtEnd(table);
        checkInvariants(table);
    });

    it('WID-18: adjusts the last column when the vertical scrollbar appears and disappears', () => {
        const table = mount([{ name: 'a', width: 100 }, { name: 'b', width: 100 }]);
        table.addRows(rowsFor([{ name: 'a' }, { name: 'b' }], 50));
        expectNoGapAtEnd(table);
        checkInvariants(table);

        table.removeRows(0, 50);
        expectNoGapAtEnd(table);
        checkInvariants(table);
    });

    it('WID-19: random column configurations keep the invariants', () => {
        const columnArb = fc.record({
            width: fc.oneof(
                fc.integer({ min: 0, max: 300 }),
                fc.integer({ min: 1, max: 99 }).map(n => n + '%'),
                fc.constantFrom('auto', 'rest'),
            ),
            ignoreMin: fc.boolean(),
            visible: fc.boolean(),
        });

        fc.assert(fc.property(
            fc.array(columnArb, { minLength: 1, maxLength: 6 }),
            fc.integer({ min: 200, max: 1200 }),
            (specs, hostWidth) => {
                const columns: ColumnOptions[] = specs.map((spec, i) => ({ name: 'c' + i, ...spec }));
                const table = mount(columns, { width: DGTable.Width.SCROLL }, hostWidth);
                for (const header of Array.from(table.getHeaderRowElement()!.children) as HTMLElement[]) {
                    expect(Number.isFinite(parseFloat(header.style.width))).toBe(true);
                    expect(parseFloat(header.style.width)).toBeGreaterThanOrEqual(0);
                }
                checkInvariants(table);
                table.destroy();
            },
        ), { numRuns: 25 });
    }, 60_000);

    it('has a readable name', () => {
        expect(layoutName(layout)).toContain(layout.dir);
    });
});

describe('table width modes', () => {
    it('WID-15 (pin): Width.AUTO does not shrink the wrapper below its container', () => {
        const { table } = mountTable({
            columns: [{ name: 'a', width: 100 }, { name: 'b', width: 100 }],
            width: DGTable.Width.AUTO,
            autoFillLastColumn: false,
        });
        table.setRows(rowsFor([{ name: 'a' }, { name: 'b' }]));
        // DECIDE: should AUTO size the wrapper to the columns (~217px here)? The tbody is a block, so it never shrinks.
        expect(table.el.getBoundingClientRect().width).toBe(500);
        checkInvariants(table);
    });

    it.each([true, false])('WID-17: tableHeightChanged follows the container height (virtual=%s)', virtualTable => {
        const { table } = mountTable({ columns: [{ name: 'a', width: 100 }], virtualTable });
        table.setRows(makeRows(100, i => ({ a: i })));
        table.el.style.height = '400px';
        table.tableHeightChanged();

        const header = table.el.querySelector<HTMLElement>('.dgtable-header')!;
        expect(header.offsetHeight + scrollContainer(table).offsetHeight).toBe(400);
        checkInvariants(table);

        table.el.style.height = '300px';
        table.tableHeightChanged();
        const newHeader = table.el.querySelector<HTMLElement>('.dgtable-header')!;
        expect(newHeader.offsetHeight + scrollContainer(table).offsetHeight).toBe(300);
    });

    it('OPT-09: subtracts the scroll container\'s own borders from the height', () => {
        const style = document.createElement('style');
        style.textContent = '.bordered .dgtable { border-top: 3px solid red; border-bottom: 2px solid red; }';
        document.head.appendChild(style);
        try {
            const { table } = mountTable({ columns: [{ name: 'a', width: 100 }], height: 300 });
            table.el.classList.add('bordered');
            table.setRows(makeRows(100, i => ({ a: i })));
            const header = table.el.querySelector<HTMLElement>('.dgtable-header')!;
            expect(header.offsetHeight + scrollContainer(table).offsetHeight).toBe(300);
        } finally {
            style.remove();
        }
    });

    it('WID-09: auto columns take the header width plus the scrollbar when last', () => {
        const { table } = mountTable({
            columns: [{ name: 'a', width: 'auto' }, { name: 'b', width: 'auto' }],
            autoFillLastColumn: false,
            headerCellFormatter: label => `<span style="display:inline-block;width:${label === 'a' ? 70 : 90}px"></span>`,
        });
        table.setRows(rowsFor([{ name: 'a' }, { name: 'b' }]));
        expect(width(table, 'a')).toBeGreaterThanOrEqual(70);
        expect(width(table, 'b')).toBeGreaterThanOrEqual(90);
        checkInvariants(table);
    });
});
