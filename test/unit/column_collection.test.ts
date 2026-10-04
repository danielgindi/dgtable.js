import { describe, expect, it } from 'vitest';
import ColumnCollection from '../../src/column_collection';
import type { InternalColumn } from '../../src/private_types';

function column(name: string, order: number, visible = true): InternalColumn {
    return {
        name,
        label: name,
        width: 0,
        widthMode: 0,
        resizable: true,
        sortable: true,
        movable: true,
        visible,
        cellClasses: '',
        ignoreMin: false,
        sticky: null,
        allowPreview: true,
        dataPath: [name],
        comparePath: [name],
        order,
    };
}

function collection(...columns: InternalColumn[]): ColumnCollection {
    const result = new ColumnCollection();
    result.push(...columns);
    return result;
}

function names(columns: InternalColumn[]): string[] {
    return columns.map(c => c.name);
}

describe('ColumnCollection', () => {
    it('COL-01: finds columns by name and object', () => {
        const b = column('b', 1);
        const columns = collection(column('a', 0), b);

        expect(columns.get('b')).toBe(b);
        expect(columns.get('x')).toBeNull();
        expect(columns.indexOf('b')).toBe(1);
        expect(columns.indexOf(b)).toBe(1);
        expect(columns.indexOf('x')).toBe(-1);
    });

    it('COL-02: normalizes order to 0..n-1, keeping relative order and stable ties', () => {
        const columns = collection(column('a', 10), column('b', -2), column('c', 10), column('d', 4));
        columns.normalizeOrder();

        expect(names(columns.getColumns())).toEqual(['b', 'd', 'a', 'c']);
        expect(columns.getColumns().map(c => c.order)).toEqual([0, 1, 2, 3]);
    });

    it('COL-03: orders columns and excludes hidden ones from visible columns', () => {
        const columns = collection(column('a', 2), column('b', 0, false), column('c', 1));

        expect(names(columns.getColumns())).toEqual(['b', 'c', 'a']);
        expect(names(columns.getVisibleColumns())).toEqual(['c', 'a']);
        expect(columns.getByOrder(1)?.name).toBe('c');
        expect(columns.getByOrder(9)).toBeNull();
    });

    it('COL-04: returns 0 as the max order of an empty collection', () => {
        expect(new ColumnCollection().getMaxOrder()).toBe(0);
        expect(collection(column('a', 3), column('b', 7)).getMaxOrder()).toBe(7);
    });

    it('COL-05: moves columns forward and backward, shifting the ones in between', () => {
        const columns = collection(column('a', 0), column('b', 1), column('c', 2), column('d', 3));

        columns.moveColumn(columns.get('a')!, columns.get('c')!);
        expect(names(columns.getColumns())).toEqual(['b', 'c', 'a', 'd']);

        columns.moveColumn(columns.get('d')!, columns.get('b')!);
        expect(names(columns.getColumns())).toEqual(['d', 'b', 'c', 'a']);

        columns.moveColumn(null as unknown as InternalColumn, columns.get('b')!);
        expect(names(columns.getColumns())).toEqual(['d', 'b', 'c', 'a']);
    });

    it('COL-06: supports Array methods that construct the subclass', () => {
        const columns = collection(column('a', 0), column('b', 1));

        expect(columns.filter(c => c.name === 'b').map(c => c.name)).toEqual(['b']);
        expect(columns.slice(1).length).toBe(1);
    });
});
