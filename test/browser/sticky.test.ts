import { describe, expect, it } from 'vitest';
import type { TestContext } from 'vitest';
import DGTable from '../../src/index';
import type { ColumnOptions } from '../../src/index';
import { layouts, makeRows, mountLayout, mountTable } from '../helpers/table';
import type { Layout } from '../helpers/table';
import { bodyCell, headerCell, isRtl, renderedRows, scrollbarWidth, scrollHorizontally } from '../helpers/dom';
import { dragColumn } from '../helpers/pointer';
import { checkInvariants, expectColumnsAligned } from '../helpers/invariants';

// Port of the legacy test/sticky_scrollbar_test.js (fixture: border-box cells, 400px host, SCROLL mode).

const stickyColumns: ColumnOptions[] = [
    { name: 'first', width: 200 },
    { name: 'secondEnd', width: 100, sticky: 'end' },
    { name: 'firstEnd', width: 120, sticky: 'end' },
    { name: 'last', width: 200 },
];

const stickyRows = makeRows(20, i => ({
    first: 'first-' + i,
    firstEnd: 'first-end-' + i,
    secondEnd: 'second-end-' + i,
    last: 'last-' + i,
}));

function createLegacyTable(dir: 'ltr' | 'rtl', virtualTable = true, columns = stickyColumns): DGTable {
    const { table } = mountTable(
        { columns, height: 120, virtualTable, width: DGTable.Width.SCROLL },
        { dir, width: 400, boxSizing: 'border-box', render: true },
    );
    table.addRows(stickyRows);
    return table;
}

// Overlay scrollbars (e.g. Firefox on Windows 11) take no space, so there is no gutter to compensate.
function skipWithoutClassicScrollbars(context: TestContext, table: DGTable): void {
    context.skip(scrollbarWidth(table) === 0, 'the engine uses overlay scrollbars, so there is no gutter to compensate');
}

function inspect(table: DGTable) {
    const edge = isRtl(table) ? 'left' : 'right';
    const header = (name: string) => headerCell(table, name);
    const body = (name: string) => bodyCell(table, 0, name);
    return {
        scrollbarWidth: scrollbarWidth(table),
        firstHeaderEdge: header('firstEnd').style[edge],
        firstRowEdge: body('firstEnd').style[edge],
        firstHeaderWidth: parseFloat(header('firstEnd').style.width),
        firstRowWidth: parseFloat(body('firstEnd').style.width),
        secondHeaderEdge: header('secondEnd').style[edge],
        secondRowEdge: body('secondEnd').style[edge],
        secondHeaderWidth: parseFloat(header('secondEnd').style.width),
        secondRowWidth: parseFloat(body('secondEnd').style.width),
    };
}

function expectLegacyLayout(actual: ReturnType<typeof inspect>, columnWidth: number) {
    expect(actual.scrollbarWidth, 'fixture must have a vertical scrollbar').toBeGreaterThan(0);
    expect(actual.firstHeaderEdge, 'header must stick to the end edge').toBe('0px');
    expect(actual.firstRowEdge, 'row offset must stay unchanged').toBe('100px');
    expect(actual.firstHeaderWidth, 'header must cover the scrollbar gutter').toBe(columnWidth + actual.scrollbarWidth);
    expect(actual.firstRowWidth, 'row width must stay unchanged').toBe(columnWidth);
    expect(actual.secondHeaderWidth).toBe(100);
    expect(actual.secondRowWidth).toBe(100);
    expect(actual.secondHeaderEdge, 'earlier header offset must stay unchanged').toBe(actual.scrollbarWidth + 'px');
    expect(actual.secondRowEdge, 'earlier row offset must stay unchanged').toBe('0px');
}

function inspectMovedColumn(table: DGTable) {
    const rtl = isRtl(table);
    const header = headerCell(table, 'last');
    const headerRect = header.getBoundingClientRect();
    const bodyRect = bodyCell(table, 0, 'last').getBoundingClientRect();
    const followingHeader = headerCell(table, 'secondEnd').getBoundingClientRect();
    const followingBody = bodyCell(table, 0, 'secondEnd').getBoundingClientRect();

    return {
        headerWidth: headerRect.width,
        bodyWidth: bodyRect.width,
        margin: parseFloat(header.style[rtl ? 'marginRight' : 'marginLeft']) || 0,
        startDifference: rtl ? bodyRect.right - headerRect.right : headerRect.left - bodyRect.left,
        endDifference: rtl ? bodyRect.left - headerRect.left : headerRect.right - bodyRect.right,
        followingDifference: rtl ? followingBody.right - followingHeader.right : followingHeader.left - followingBody.left,
    };
}

describe.each(['ltr', 'rtl'] as const)('end-sticky scrollbar compensation (%s) — legacy port', dir => {
    it('STK-01: first end-sticky header covers the scrollbar gutter', context => {
        const table = createLegacyTable(dir);
        skipWithoutClassicScrollbars(context, table);
        expectLegacyLayout(inspect(table), 120);
    });

    it('STK-02: stays compensated after a horizontal scroll', context => {
        const table = createLegacyTable(dir);
        skipWithoutClassicScrollbars(context, table);
        scrollHorizontally(table, 1);
        expectLegacyLayout(inspect(table), 120);
    });

    it('STK-03: stays compensated after a repeated layout', context => {
        const table = createLegacyTable(dir);
        skipWithoutClassicScrollbars(context, table);
        scrollHorizontally(table, 1);
        table.tableWidthChanged(true);
        expectLegacyLayout(inspect(table), 120);
    });

    it('STK-03: stays compensated after setColumnWidth', context => {
        const table = createLegacyTable(dir);
        skipWithoutClassicScrollbars(context, table);
        table.setColumnWidth('firstEnd', 140);
        expectLegacyLayout(inspect(table), 140);
    });

    it.for([true, false])('STK-04: compensation transfers when reordering end-stickies (virtual=%s)', (virtualTable, context) => {
        const table = createLegacyTable(dir, virtualTable);
        skipWithoutClassicScrollbars(context, table);
        const sb = scrollbarWidth(table);
        const widths = () => ['firstEnd', 'secondEnd'].map(name => parseFloat(headerCell(table, name).style.width));

        dragColumn(table, 'firstEnd', 'secondEnd');
        expect(widths(), 'compensation must transfer after dragging').toEqual([120, 100 + sb]);
        expect(Array.from(renderedRows(table)[0].children, c => c.getAttribute('data-column'))).toEqual(['first', 'firstEnd', 'secondEnd', 'last']);

        table.tableWidthChanged(true);
        expect(widths(), 'compensation must stay correct after layout').toEqual([120, 100 + sb]);
    });

    it('STK-05: moving the only end-sticky into the middle, pinning, and the partial-compensation transition', context => {
        const table = createLegacyTable(dir, true, [
            { name: 'first', width: 200 },
            { name: 'secondEnd', width: 100 },
            { name: 'firstEnd', width: 120 },
            { name: 'last', width: 40, sticky: 'end' },
        ]);
        skipWithoutClassicScrollbars(context, table);
        const sb = scrollbarWidth(table);

        scrollHorizontally(table, 1);
        const beforeDragWidth = headerCell(table, 'last').getBoundingClientRect().width;
        const beforeDragBodyWidth = bodyCell(table, 0, 'last').getBoundingClientRect().width;
        expect(beforeDragWidth, 'drag must start with a compensated header').toBe(beforeDragBodyWidth + sb);

        dragColumn(table, 'last', 'secondEnd');
        const moved = inspectMovedColumn(table);
        expect(moved.headerWidth, 'moved header must match the body when not pinned').toBe(moved.bodyWidth);
        expect(moved.startDifference).toBe(0);
        expect(moved.endDifference).toBe(0);

        table.setColumnWidth('first', 400);
        const fullWidth = 40 + sb;
        expect(headerCell(table, 'last').getBoundingClientRect().width, 'pinned header must cover the gutter').toBe(fullWidth);

        scrollHorizontally(table, 200);
        expect(headerCell(table, 'last').getBoundingClientRect().width, 'scrolling away must remove compensation').toBe(40);
        scrollHorizontally(table, 0);
        expect(headerCell(table, 'last').getBoundingClientRect().width, 'returning to the edge must restore compensation').toBe(fullWidth);

        const transition = [];
        for (let offset = 1; offset <= 100; offset++) {
            scrollHorizontally(table, offset);
            transition.push(inspectMovedColumn(table));
        }

        expect(transition.some(s => s.headerWidth > 40 && s.headerWidth < fullWidth), 'must exercise the partially compensated transition').toBe(true);
        expect(transition[0].headerWidth).toBe(fullWidth);
        expect(transition.at(-1)!.headerWidth).toBe(40);
        for (const sample of transition) {
            const compensation = sample.headerWidth - 40;
            expect(sample.bodyWidth).toBe(40);
            expect(compensation).toBeGreaterThanOrEqual(0);
            expect(compensation).toBeLessThanOrEqual(sb);
            expect(sample.startDifference).toBe(0);
            if (compensation < sb) {
                expect(sample.margin + compensation, 'margin must cancel partial width in normal flow').toBe(0);
                expect(sample.followingDifference).toBe(0);
            }
        }

        scrollHorizontally(table, 0);
        const returned = inspectMovedColumn(table);
        expect(returned.headerWidth).toBe(fullWidth);
        expect(returned.margin).toBe(0);
    });
});

describe.each(layouts)('sticky columns ($dir, $boxSizing, virtual=$virtualTable)', (layout: Layout) => {
    const columns: ColumnOptions[] = [
        { name: 's1', width: 60, sticky: 'start' },
        { name: 's2', width: 70, sticky: 'start' },
        { name: 'a', width: 200 },
        { name: 'b', width: 200 },
        { name: 'c', width: 200 },
        { name: 'e1', width: 50, sticky: 'end' },
    ];

    function mount(options: Partial<ConstructorParameters<typeof DGTable>[0]> = {}) {
        const { table } = mountLayout(layout, { columns, width: DGTable.Width.SCROLL, ...options }, { width: 500 });
        table.setRows(makeRows(30, i => Object.fromEntries(columns.map(c => [c.name, c.name + i]))));
        return table;
    }

    function fullWidth(el: HTMLElement) {
        return el.getBoundingClientRect().width;
    }

    it('STK-06/07: start stickies have cumulative offsets in header and body', () => {
        const table = mount();
        const edge = isRtl(table) ? 'right' : 'left';
        const s1Width = fullWidth(headerCell(table, 's1'));

        expect(headerCell(table, 's1').style[edge]).toBe('0px');
        expect(headerCell(table, 's2').style[edge]).toBe(s1Width + 'px');
        expect(bodyCell(table, 0, 's2').style[edge]).toBe(s1Width + 'px');
        expect(bodyCell(table, 0, 's2').style.position).toBe('sticky');
        expect(bodyCell(table, 0, 's2').classList.contains('dgtable-sticky')).toBe(true);
        expect(headerCell(table, 'a').style.position).toBe('');
        checkInvariants(table);
    });

    it('STK-08: marks stickies that overlap scrolled content, in header and body', () => {
        const table = mount();
        const startClass = isRtl(table) ? 'is-sticky-right' : 'is-sticky-left';
        const endClass = isRtl(table) ? 'is-sticky-left' : 'is-sticky-right';

        expect(headerCell(table, 's2').classList.contains(startClass)).toBe(false);
        expect(headerCell(table, 'e1').classList.contains(endClass)).toBe(true);

        scrollHorizontally(table, 150);
        expect(headerCell(table, 's2').classList.contains(startClass)).toBe(true);
        expect(bodyCell(table, 0, 's2').classList.contains(startClass)).toBe(true);
        expectColumnsAligned(table);

        scrollHorizontally(table, 0);
        expect(headerCell(table, 's2').classList.contains(startClass)).toBe(false);
        expect(bodyCell(table, 0, 's2').classList.contains(startClass)).toBe(false);
    });

    it('STK-09: maxStickyColumnRelativeWidth un-sticks columns wider than the limit', () => {
        const table = mount({ maxStickyColumnRelativeWidth: 0.16 });
        table.setColumnWidth('s2', 100);
        expect(headerCell(table, 's1').style.position).toBe('sticky');
        expect(headerCell(table, 's2').style.position).toBe('');
        expect(bodyCell(table, 0, 's2').style.position).toBe('');

        table.setMaxStickyColumnRelativeWidth(null as never);
        expect(headerCell(table, 's2').style.position).toBe('sticky');
        checkInvariants(table);
    });

    it('STK-10: removing stickiness clears styles in header and body', () => {
        const table = mount();
        table.setColumns(columns.map(c => ({ ...c, sticky: false })));
        expect(headerCell(table, 's2').style.position).toBe('');
        expect(bodyCell(table, 0, 's2').style.position).toBe('');
        expect(table.el.querySelector('.dgtable-sticky')).toBeNull();
        checkInvariants(table);

        table.setColumns(columns);
        table.setColumnVisible('s1', false);
        const edge = isRtl(table) ? 'right' : 'left';
        expect(headerCell(table, 's2').style[edge]).toBe('0px');
        checkInvariants(table);
    });

    it('STK-11: resizing a start sticky moves the following stickies', () => {
        const table = mount();
        const edge = isRtl(table) ? 'right' : 'left';
        table.setColumnWidth('s1', 90);
        const s1Width = fullWidth(headerCell(table, 's1'));
        expect(headerCell(table, 's2').style[edge]).toBe(s1Width + 'px');
        expect(bodyCell(table, 0, 's2').style[edge]).toBe(s1Width + 'px');
        checkInvariants(table);
    });

    it('STK-13: the last end-sticky leaves no gap at the far scroll edge', () => {
        const table = mount();
        scrollHorizontally(table, 100_000);
        const edge = isRtl(table) ? 'left' : 'right';
        expect(headerCell(table, 'e1').style[edge]).toBe('0px');
        expectColumnsAligned(table);
    });
});
