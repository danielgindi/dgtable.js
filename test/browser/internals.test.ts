import { describe, expect, it, vi } from 'vitest';
import { ColumnWidthMode } from '../../src/constants';
import { getHtmlForCell, initColumnFromData, parseColumnWidth } from '../../src/internal';
import { serializeColumnWidth } from '../../src/helpers';
import SelectionHelper from '../../src/SelectionHelper';
import DGTable from '../../src/index';
import type { DGTableInternalOptions, InternalColumn } from '../../src/private_types';

// Pure functions that live in modules touching `document` at import time (see D15),
// so they are unit-tested in the browser project.

const { AUTO, ABSOLUTE, RELATIVE, REST } = ColumnWidthMode;

describe('parseColumnWidth', () => {
    it.each([
        [100, { width: 100, mode: ABSOLUTE }],
        ['100px', { width: 100, mode: ABSOLUTE }],
        ['30%', { width: 0.3, mode: RELATIVE }],
        ['150%', { width: 1.5, mode: RELATIVE }],
        [0.3, { width: 0.3, mode: RELATIVE }],
        ['0.3', { width: 0.3, mode: RELATIVE }],
        [1, { width: 35, mode: ABSOLUTE }],
        [20, { width: 35, mode: ABSOLUTE }],
        ['auto', { width: 0, mode: AUTO }],
        [' AUTO ', { width: 0, mode: AUTO }],
        ['rest', { width: 0, mode: REST }],
        ['Rest', { width: 0, mode: REST }],
        [null, { width: 0, mode: AUTO }],
        [undefined, { width: 0, mode: AUTO }],
        ['', { width: 0, mode: AUTO }],
        ['abc', { width: 0, mode: AUTO }],
        [NaN, { width: 0, mode: AUTO }],
        [-5, { width: 0, mode: AUTO }],
        [0, { width: 0, mode: AUTO }],
    ])('PARSE-01: %j', (input, expected) => {
        expect(parseColumnWidth(input as never, 35)).toEqual(expected);
    });

    it('PARSE-01: a zero minimum keeps tiny absolute widths', () => {
        expect(parseColumnWidth(5, 0)).toEqual({ width: 5, mode: ABSOLUTE });
    });
});

describe('initColumnFromData', () => {
    const options = { minColumnWidth: 35, cellClasses: 'table-class' } as DGTableInternalOptions;

    it('INIT-01: applies defaults', () => {
        expect(initColumnFromData(options, { name: 'a' })).toEqual({
            name: 'a', label: 'a', width: 0, widthMode: AUTO, resizable: true, sortable: true, movable: true,
            visible: true, cellClasses: 'table-class', ignoreMin: false, sticky: null, allowPreview: true,
            dataPath: ['a'], comparePath: ['a'], order: 0,
        });
    });

    it('INIT-01: splits paths, keeps a null label, and maps sticky false to null', () => {
        const column = initColumnFromData(options, { name: 'a', label: null, dataPath: 'x.y', sticky: false, cellClasses: '' });
        expect(column.label).toBeNull();
        expect(column.dataPath).toEqual(['x', 'y']);
        expect(column.comparePath).toEqual(['x', 'y']);
        expect(column.sticky).toBeNull();
        expect(column.cellClasses).toBe('');
    });
});

describe('serializeColumnWidth', () => {
    function column(width: number, widthMode: number, unconverted?: [number, number]): InternalColumn {
        return { width, widthMode, unconvertedWidth: unconverted?.[0], unconvertedWidthMode: unconverted?.[1] } as InternalColumn;
    }

    it('SER-01: serializes every width mode, preferring the unconverted width', () => {
        expect(serializeColumnWidth(column(120, ABSOLUTE))).toBe(120);
        expect(serializeColumnWidth(column(0.25, RELATIVE))).toBe('25%');
        expect(serializeColumnWidth(column(0, AUTO))).toBe('auto');
        expect(serializeColumnWidth(column(0, REST))).toBe('rest');
        expect(serializeColumnWidth(column(0.4, RELATIVE, [0, AUTO]))).toBe('auto');
    });

    it.each(Array.from({ length: 100 }, (_, i) => i + 1))('SER-02 (D22): round-trips %i%', percent => {
        const parsed = parseColumnWidth(percent + '%', 35);
        expect(serializeColumnWidth(column(parsed.width, parsed.mode))).toBe(percent + '%');
    });
});

describe('getHtmlForCell', () => {
    const table = new DGTable({});
    const options = table._o;
    const col = (dataPath: string[]) => ({ name: 'c', dataPath }) as InternalColumn;

    it('HTML-01: resolves nested paths and empties nullish values', () => {
        expect(getHtmlForCell(options, { a: { b: 'x' } }, col(['a', 'b']))).toBe('x');
        expect(getHtmlForCell(options, { a: null }, col(['a', 'b']))).toBe('');
        expect(getHtmlForCell(options, { a: undefined }, col(['a']))).toBe('');
        expect(getHtmlForCell(options, { a: 0 }, col(['a']))).toBe(0);
        expect(getHtmlForCell(options, { a: '<b>' }, col(['a']))).toBe('&lt;b&gt;');
    });

    it('HTML-02: turns a throwing custom formatter into [ERROR]', () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        table.setCellFormatter(() => {
            throw new Error('boom');
        });
        expect(getHtmlForCell(table._o, { a: 1 }, col(['a']))).toBe('[ERROR]');
        expect(error).toHaveBeenCalledTimes(1);
        table.setCellFormatter(null);
    });
});

describe('SelectionHelper', () => {
    it('SEL-01: saves and restores a selection across copies of an element', () => {
        const source = document.createElement('div');
        source.innerHTML = 'hello <b>bold</b> world';
        const copy = source.cloneNode(true) as HTMLElement;
        document.body.append(source, copy);

        try {
            const range = document.createRange();
            range.setStart(source.firstChild!, 3);
            range.setEnd(source.querySelector('b')!.firstChild!, 2);
            getSelection()!.removeAllRanges();
            getSelection()!.addRange(range);

            const saved = SelectionHelper.saveSelection(source)!;
            expect(saved).toEqual({ start: 3, end: 8 });
            SelectionHelper.restoreSelection(copy, saved);
            expect(getSelection()!.toString()).toBe('lo bo');
            expect(copy.contains(getSelection()!.anchorNode)).toBe(true);

            expect(SelectionHelper.saveSelection(document.createElement('div'))).toBeNull();
        } finally {
            getSelection()!.removeAllRanges();
            source.remove();
            copy.remove();
        }
    });
});
