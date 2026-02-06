import {
    InternalColumn,
} from './private_types';

/**
 * A collection of columns that extends Array functionality
 */
class ColumnCollection extends Array<InternalColumn> {
    constructor() {
        super();
    }

    /**
     * Get the column by this name
     */
    get(column: string): InternalColumn | null {
        for (let i = 0, len = this.length; i < len; i++) {
            if (this[i].name === column) {
                return this[i];
            }
        }
        return null;
    }

    /**
     * Get the index of the column by this name
     */
    indexOf(column: string | InternalColumn): number {
        const columnName = typeof column === 'string' ? column : column.name;
        for (let i = 0, len = this.length; i < len; i++) {
            if (this[i].name === columnName) {
                return i;
            }
        }
        return -1;
    }

    /**
     * Get the column by the specified order
     */
    getByOrder(order: number): InternalColumn | null {
        for (let i = 0, len = this.length; i < len; i++) {
            if (this[i].order === order) {
                return this[i];
            }
        }
        return null;
    }

    /**
     * Normalize order to be sequential starting from 0
     */
    normalizeOrder(): this {
        const ordered: InternalColumn[] = [];
        for (let i = 0; i < this.length; i++) {
            ordered.push(this[i]);
        }
        ordered.sort((col1, col2) => col1.order < col2.order ? -1 : (col1.order > col2.order ? 1 : 0));
        for (let i = 0; i < ordered.length; i++) {
            ordered[i].order = i;
        }
        return this;
    }

    /**
     * Get the array of columns, ordered by the order property
     */
    getColumns(): InternalColumn[] {
        const cols: InternalColumn[] = [];
        for (let i = 0; i < this.length; i++) {
            cols.push(this[i]);
        }
        cols.sort((col1, col2) => col1.order < col2.order ? -1 : (col1.order > col2.order ? 1 : 0));
        return cols;
    }

    /**
     * Get the array of visible columns, ordered by the order property
     */
    getVisibleColumns(): InternalColumn[] {
        const cols: InternalColumn[] = [];
        for (let i = 0; i < this.length; i++) {
            const column = this[i];
            if (column.visible) {
                cols.push(column);
            }
        }
        cols.sort((col1, col2) => col1.order < col2.order ? -1 : (col1.order > col2.order ? 1 : 0));
        return cols;
    }

    /**
     * Get the maximum order currently in the array
     */
    getMaxOrder(): number {
        let order = 0;
        for (let i = 0; i < this.length; i++) {
            const column = this[i];
            if (column.order > order) {
                order = column.order;
            }
        }
        return order;
    }

    /**
     * Move a column to a new spot in the collection
     */
    moveColumn(src: InternalColumn, dest: InternalColumn): this {
        if (src && dest) {
            const srcOrder = src.order;
            const destOrder = dest.order;
            if (srcOrder < destOrder) {
                for (let i = srcOrder + 1; i <= destOrder; i++) {
                    const col = this.getByOrder(i);
                    if (col) col.order--;
                }
            } else {
                for (let i = srcOrder - 1; i >= destOrder; i--) {
                    const col = this.getByOrder(i);
                    if (col) col.order++;
                }
            }
            src.order = destOrder;
        }
        return this;
    }
}

export default ColumnCollection;

