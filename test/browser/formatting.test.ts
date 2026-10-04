import { describe, expect, it, vi } from 'vitest';
import { mountTable } from '../helpers/table';
import { bodyCell, headerCell, previewCell, renderedRows, rowTexts } from '../helpers/dom';
import { hover } from '../helpers/pointer';

declare global {
    interface Window {
        __xss?: number;
    }
}

describe('formatting and HTML safety', () => {
    it('FMT-01: renders strings as text by default, including in the preview', () => {
        const payload = '<img src="x" onerror="window.__xss = 1"> and a long tail that overflows the cell';
        const { table } = mountTable({ columns: [{ name: 'v', width: 60 }, { name: 'x', width: 60 }] });
        table.setRows([{ v: payload, x: 1 }]);

        const cell = bodyCell(table, 0, 'v');
        expect(cell.textContent).toBe(payload);
        expect(cell.querySelector('img')).toBeNull();

        hover(cell);
        expect(previewCell(table)!.textContent).toBe(payload);
        expect(previewCell(table)!.querySelector('img')).toBeNull();
        expect(window.__xss).toBeUndefined();
    });

    it('FMT-02: renders newlines as line breaks and round-trips quotes and ampersands', () => {
        const { table } = mountTable({ columns: [{ name: 'v' }] });
        table.setRows([{ v: 'a\nb' }, { v: 'Tom & "Jerry" \'s' }]);

        expect(bodyCell(table, 0, 'v').querySelector('br')).not.toBeNull();
        expect(rowTexts(table, 'v')[1]).toBe('Tom & "Jerry" \'s');
    });

    it('FMT-03: renders primitive values', () => {
        const { table } = mountTable({ columns: [{ name: 'v' }] });
        table.setRows([{ v: 0 }, { v: false }, { v: 123 }, { v: null }, { v: undefined }, { v: { a: 1 } }]);
        expect(rowTexts(table, 'v')).toEqual(['0', 'false', '123', '', '', '[object Object]']);
    });

    it('FMT-04: passes value, column name and row data to a custom formatter, rendering HTML', () => {
        const formatter = vi.fn((value: unknown, column: string) => `<b class="${column}">${value}</b>`);
        const { table } = mountTable({ columns: [{ name: 'v' }], cellFormatter: formatter });
        const row = { v: 'x' };
        table.setRows([row]);

        expect(bodyCell(table, 0, 'v').querySelector('b.v')!.textContent).toBe('x');
        expect(formatter).toHaveBeenCalledWith('x', 'v', row);
    });

    it('FMT-05: isolates a throwing formatter to its cell', () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        const { table } = mountTable({
            columns: [{ name: 'a' }, { name: 'b' }],
            cellFormatter: (value, column) => {
                if (column === 'a' && value === 2)
                    throw new Error('boom');
                return String(value);
            },
        });
        table.setRows([{ a: 1, b: 1 }, { a: 2, b: 2 }]);

        expect(rowTexts(table, 'a')).toEqual(['1', '[ERROR]']);
        expect(rowTexts(table, 'b')).toEqual(['1', '2']);
        expect(error).toHaveBeenCalledTimes(1);
    });

    it('FMT-06: setCellFormatter(null) restores the encoding default', () => {
        const { table } = mountTable({ columns: [{ name: 'v' }], cellFormatter: v => `<i>${v}</i>` });
        table.setRows([{ v: '<u>x</u>' }]);
        expect(bodyCell(table, 0, 'v').querySelector('u')).not.toBeNull();

        table.setCellFormatter(null);
        table.refreshAllVirtualRows();
        expect(bodyCell(table, 0, 'v').querySelector('u')).toBeNull();
        expect(rowTexts(table, 'v')).toEqual(['<u>x</u>']);
    });

    it('FMT-07: encodes header labels by default and supports custom header formatters', () => {
        const { table } = mountTable({ columns: [{ name: 'a', label: '<i>A</i>' }] });
        expect(headerCell(table, 'a').textContent).toBe('<i>A</i>');
        expect(headerCell(table, 'a').querySelector('i')).toBeNull();

        const formatter = vi.fn((label: string, name: string) => `<em>${label}:${name}</em>`);
        const { table: custom } = mountTable({ columns: [{ name: 'a', label: 'A' }], headerCellFormatter: formatter });
        expect(headerCell(custom, 'a').querySelector('em')!.textContent).toBe('A:a');
        expect(formatter).toHaveBeenCalledWith('A', 'a');
    });

    it('FMT-08: the preview copies the cell HTML', () => {
        const { table } = mountTable({
            columns: [{ name: 'v', width: 40 }, { name: 'x', width: 40 }],
            cellFormatter: v => `<span class="tag">${v}</span>`,
        });
        table.setRows([{ v: 'a long value that overflows', x: 1 }]);

        hover(bodyCell(table, 0, 'v'));
        expect(previewCell(table)!.firstElementChild!.innerHTML).toBe(bodyCell(table, 0, 'v').firstElementChild!.innerHTML);
        expect(renderedRows(table)).toHaveLength(1);
    });
});
