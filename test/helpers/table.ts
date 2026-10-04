import DGTable from '../../src/index';
import type { DGTableOptions, RowData } from '../../src/index';

export interface MountOptions {
    width?: number;
    dir?: 'ltr' | 'rtl';
    boxSizing?: 'content-box' | 'border-box';
    attach?: boolean;
    render?: boolean;
}

export interface Mounted {
    table: DGTable;
    host: HTMLElement;
}

export interface Layout {
    dir: 'ltr' | 'rtl';
    boxSizing: 'content-box' | 'border-box';
    virtualTable: boolean;
}

const mounted: Mounted[] = [];

export function mountTable(options: DGTableOptions = {}, mount: MountOptions = {}): Mounted {
    const host = document.createElement('div');
    host.dir = mount.dir ?? 'ltr';
    host.style.width = (mount.width ?? 500) + 'px';

    const table = new DGTable({ height: 200, ...options });
    if (mount.boxSizing === 'border-box')
        table.el.classList.add('test-border-box');

    host.appendChild(table.el);

    const attach = mount.attach !== false;
    if (attach)
        document.body.appendChild(host);

    if (attach && mount.render !== false)
        table.render();

    const result = { table, host };
    mounted.push(result);
    return result;
}

/** Mount a table using one of the layout matrix entries. */
export function mountLayout(layout: Layout, options: DGTableOptions = {}, mount: MountOptions = {}): Mounted {
    return mountTable(
        { virtualTable: layout.virtualTable, ...options },
        { dir: layout.dir, boxSizing: layout.boxSizing, ...mount },
    );
}

export function cleanupTables(): void {
    for (const { table, host } of mounted.splice(0)) {
        table.destroy();
        host.remove();
    }
}

export function makeRows(count: number, factory?: (index: number) => RowData): RowData[] {
    return Array.from({ length: count }, (_, index) => factory
        ? factory(index)
        : { id: index, name: 'name-' + index, value: count - index });
}

/** Cell formatter rendering a fixed-width box, for font-independent width assertions. */
export function boxFormatter(value: unknown): string {
    return '<span style="display:inline-block;vertical-align:top;height:10px;width:' + Number(value) + 'px"></span>';
}

export const layouts: Layout[] = [
    { dir: 'ltr', boxSizing: 'content-box', virtualTable: true },
    { dir: 'ltr', boxSizing: 'border-box', virtualTable: true },
    { dir: 'rtl', boxSizing: 'content-box', virtualTable: true },
    { dir: 'rtl', boxSizing: 'border-box', virtualTable: true },
    { dir: 'ltr', boxSizing: 'content-box', virtualTable: false },
    { dir: 'ltr', boxSizing: 'border-box', virtualTable: false },
    { dir: 'rtl', boxSizing: 'content-box', virtualTable: false },
    { dir: 'rtl', boxSizing: 'border-box', virtualTable: false },
];

export function layoutName(layout: Layout): string {
    return `${layout.dir}, ${layout.boxSizing}, ${layout.virtualTable ? 'virtual' : 'non-virtual'}`;
}
