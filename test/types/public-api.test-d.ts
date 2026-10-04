import { describe, expectTypeOf, it } from 'vitest';
import DGTable from '../../src/index';
import type {
    AddRowsEvent,
    CellFormatter,
    CellHoverOverflowEvent,
    CellPreviewDestroyEvent,
    CellPreviewEvent,
    ColumnOptions,
    ColumnResizeAreaDoubleClickEvent,
    ColumnSortOptions,
    ColumnWidthEvent,
    ComparatorFunction,
    CustomSortingProvider,
    DGTableEventMap,
    DGTableOptions,
    FilterFunction,
    HeaderCellFormatter,
    HeaderContextMenuEvent,
    MoveColumnEvent,
    OnComparatorRequired,
    RowClickEvent,
    RowCreateEvent,
    RowData,
    SerializedColumnSort,
    SortEvent,
} from '../../src/index';

describe('public typings', () => {
    it('TYPE-01: types built-in event payloads', () => {
        const table = new DGTable({});
        table.on('rowclick', data => expectTypeOf(data).toEqualTypeOf<RowClickEvent>());
        table.on('rowcreate', data => expectTypeOf(data).toEqualTypeOf<RowCreateEvent>());
        table.on('rowdestroy', data => expectTypeOf(data).toEqualTypeOf<HTMLElement>());
        table.on('cellpreview', data => expectTypeOf(data).toEqualTypeOf<CellPreviewEvent>());
        table.on('cellpreviewdestroy', data => expectTypeOf(data).toEqualTypeOf<CellPreviewDestroyEvent>());
        table.on('cellhoveroverflow', data => expectTypeOf(data).toEqualTypeOf<CellHoverOverflowEvent>());
        table.on('headercontextmenu', data => expectTypeOf(data).toEqualTypeOf<HeaderContextMenuEvent>());
        table.on('movecolumn', data => expectTypeOf(data).toEqualTypeOf<MoveColumnEvent>());
        table.on('columnwidth', data => expectTypeOf(data).toEqualTypeOf<ColumnWidthEvent>());
        table.on('columnresizeareadoubleclick', data => expectTypeOf(data).toEqualTypeOf<ColumnResizeAreaDoubleClickEvent>());
        table.on('addrows', data => expectTypeOf(data).toEqualTypeOf<AddRowsEvent>());
        table.on('sort', data => expectTypeOf(data).toEqualTypeOf<SortEvent>());
        table.once('addcolumn', data => expectTypeOf(data).toEqualTypeOf<string>());
        table.off('render', data => expectTypeOf(data).toEqualTypeOf<undefined>());
        table.on('custom', data => expectTypeOf(data).toEqualTypeOf<unknown>());
        table.on<{ value: number }>('typed', data => expectTypeOf(data.value).toEqualTypeOf<number>());
        table.emit('sort', { sorts: [] });
        expectTypeOf<keyof DGTableEventMap>().toEqualTypeOf<
            'render' | 'renderskeleton' | 'rowcreate' | 'rowclick' | 'rowdestroy' | 'cellpreview' | 'cellpreviewdestroy'
            | 'cellhoveroverflow' | 'headerrowcreate' | 'headercontextmenu' | 'addcolumn' | 'removecolumn' | 'movecolumn'
            | 'showcolumn' | 'hidecolumn' | 'columnwidth' | 'columnresizeareadoubleclick' | 'addrows' | 'sort' | 'filter' | 'filterclear'
        >();
    });

    it('TYPE-02: exports the documented helper types', () => {
        expectTypeOf<RowData>().toEqualTypeOf<Record<string, unknown>>();
        expectTypeOf<CellFormatter>().parameters.toEqualTypeOf<[unknown, string, RowData]>();
        expectTypeOf<HeaderCellFormatter>().returns.toEqualTypeOf<string>();
        expectTypeOf<FilterFunction>().returns.toEqualTypeOf<boolean>();
        expectTypeOf<ComparatorFunction>().returns.toEqualTypeOf<number>();
        expectTypeOf<OnComparatorRequired>().returns.toEqualTypeOf<ComparatorFunction>();
        expectTypeOf<CustomSortingProvider>().returns.toEqualTypeOf<RowData[]>();
        expectTypeOf<ColumnSortOptions>().toHaveProperty('column');
        expectTypeOf<SerializedColumnSort>().toHaveProperty('descending').toEqualTypeOf<boolean>();
    });

    it('TYPE-03: accepts the documented options', () => {
        const options: DGTableOptions = {
            el: document.createElement('div'),
            className: 'x',
            columns: [{ name: 'a', width: '30%' }, { name: 'b', width: 'rest', sticky: 'end' }],
            height: 300,
            width: DGTable.Width.SCROLL,
            virtualTable: true,
            sortedColumns: ['a', { column: 'b', descending: true }],
            cellFormatter: (value, column, row) => String(value) + column + Object.keys(row).length,
            filter: (row, args) => !!row && !!args,
        };
        expectTypeOf(options).toExtend<DGTableOptions>();

        // @ts-expect-error unknown option
        const invalid: DGTableOptions = { notAnOption: true };
        expectTypeOf(invalid).toExtend<DGTableOptions>();
    });

    it('TYPE-04 (D16): accepts array data and compare paths', () => {
        const column: ColumnOptions = { name: 'a', dataPath: ['x', 'y'], comparePath: ['x', 'z'] };
        expectTypeOf(column).toExtend<ColumnOptions>();
    });

    it('TYPE-05: mutators chain and accessors are typed', () => {
        const table = new DGTable({});
        expectTypeOf(table.setRows([]).sort('a').render()).toEqualTypeOf<DGTable>();
        expectTypeOf(table.getColumnWidth('a')).toEqualTypeOf<string | number | null>();
        expectTypeOf(table.getSortedColumns()).toEqualTypeOf<SerializedColumnSort[]>();
        expectTypeOf(table.getColumnsConfig()).toEqualTypeOf<Record<string, ColumnOptions | null>>();
    });

    it('TYPE-06: the constructor argument is optional', () => {
        expectTypeOf(DGTable).constructorParameters.toEqualTypeOf<[options?: DGTableOptions]>();
    });
});
