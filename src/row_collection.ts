import type { RowData, ComparatorFunction, OnComparatorRequired, CustomSortingProvider, SortColumn } from './types';

/**
 * Options for RowCollection initialization
 */
interface RowCollectionOptions {
    sortColumn?: SortColumn[];
    onComparatorRequired?: OnComparatorRequired | null;
    customSortingProvider?: CustomSortingProvider | null;
}

/**
 * A collection of rows that extends Array functionality with sorting and filtering
 */
class RowCollection extends Array<RowData> {
    sortColumn: SortColumn[];
    onComparatorRequired: OnComparatorRequired | null = null;
    customSortingProvider: CustomSortingProvider | null = null;

    constructor(options?: RowCollectionOptions) {
        super();
        options = options || {};
        this.sortColumn = options.sortColumn ?? [];
        this.onComparatorRequired = options.onComparatorRequired ?? null;
        this.customSortingProvider = options.customSortingProvider ?? null;
    }

    /**
     * Add a row or array of rows to this collection
     */
    add(rows: RowData | RowData[], at?: number): void {
        const isArray = Array.isArray(rows);
        if (isArray) {
            const rowArray = rows as RowData[];
            if (typeof at === 'number') {
                for (let i = 0, len = rowArray.length; i < len; i++) {
                    this.splice(at++, 0, rowArray[i]);
                }
            } else {
                for (let i = 0, len = rowArray.length; i < len; i++) {
                    this.push(rowArray[i]);
                }
            }
        } else {
            const row = rows as RowData;
            if (typeof at === 'number') {
                this.splice(at, 0, row);
            } else {
                this.push(row);
            }
        }
    }

    /**
     * Reset the collection with optional new rows
     */
    reset(rows?: RowData | RowData[]): void {
        this.length = 0;
        if (rows) {
            this.add(rows);
        }
    }

    /**
     * Create a filtered collection based on a filter function
     */
    filteredCollection(
        filterFunc: (row: RowData, args: unknown) => boolean,
        args: unknown
    ): RowCollection | null {
        if (filterFunc && args) {
            const rows = new RowCollection({
                sortColumn: this.sortColumn,
                onComparatorRequired: this.onComparatorRequired,
                customSortingProvider: this.customSortingProvider,
            });

            for (let i = 0, len = this.length; i < len; i++) {
                const row = this[i];
                if (filterFunc(row, args)) {
                    row['__i'] = i;
                    rows.push(row);
                }
            }
            return rows;
        } else {
            return null;
        }
    }

    /**
     * Sort the collection based on the current sort columns
     * @returns the comparator function used, if any
     */
    sort(compareFn?: (a: RowData, b: RowData) => number): this {
        let comparator: ComparatorFunction | undefined;

        // If a compare function is passed directly (from Array.sort), use native
        if (typeof compareFn === 'function') {
            return super.sort(compareFn);
        }

        if (this.sortColumn.length) {
            const comparators: ComparatorFunction[] = [];

            for (let i = 0; i < this.sortColumn.length; i++) {
                const defaultComparator = getDefaultComparator(this.sortColumn[i], this.sortColumn[i].descending);
                let comp: ComparatorFunction | null = null;
                if (this.onComparatorRequired) {
                    comp = this.onComparatorRequired(
                        this.sortColumn[i].column,
                        this.sortColumn[i].descending,
                        defaultComparator
                    );
                }
                if (!comp) {
                    comp = defaultComparator;
                }
                comparators.push(comp.bind(this));
            }

            if (comparators.length === 1) {
                comparator = comparators[0];
            } else {
                const len = comparators.length;
                comparator = (leftRow: RowData, rightRow: RowData): number => {
                    let value = 0;
                    for (let i = 0; i < len; i++) {
                        value = comparators[i](leftRow, rightRow);
                        if (value !== 0) {
                            return value;
                        }
                    }
                    return value;
                };
            }

            const sorter = (data: RowData[]): RowData[] => {
                data.sort(comparator);
                return data;
            };

            if (this.customSortingProvider) {
                const results = this.customSortingProvider(this as unknown as RowData[], sorter);
                if (results !== (this as unknown as RowData[])) {
                    this.splice(0, this.length, ...results);
                }
            } else {
                sorter(this as unknown as RowData[]);
            }
        }

        return this;
    }
}

/**
 * Get a default comparator for a sort column
 */
function getDefaultComparator(column: SortColumn, descending: boolean): ComparatorFunction {
    let comparePath = column.comparePath;
    if (typeof comparePath === 'string') {
        comparePath = (comparePath as unknown as string).split('.');
    }
    const pathLength = comparePath.length;
    const hasPath = pathLength > 1;

    const lessVal = descending ? 1 : -1;
    const moreVal = descending ? -1 : 1;

    return function (leftRow: RowData, rightRow: RowData): number {
        let leftVal: unknown = leftRow[comparePath[0]];
        let rightVal: unknown = rightRow[comparePath[0]];

        if (hasPath) {
            for (let i = 1; i < pathLength; i++) {
                leftVal = leftVal && (leftVal as Record<string, unknown>)[comparePath[i]];
                rightVal = rightVal && (rightVal as Record<string, unknown>)[comparePath[i]];
            }
        }

        if (leftVal === rightVal) return 0;
        if (leftVal == null) return lessVal;
        if (rightVal == null) return moreVal;
        if (leftVal < rightVal) return lessVal;
        return moreVal;
    };
}

export default RowCollection;

