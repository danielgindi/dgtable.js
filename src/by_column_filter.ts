/**
 * Arguments for the by-column filter
 */
export interface ByColumnFilterArgs {
    column: string;
    keyword?: string | null;
    caseSensitive?: boolean;
}

/**
 * Default filter function that filters rows by a column value containing a keyword
 */
function ByColumnFilter(row: Record<string, unknown>, args: ByColumnFilterArgs): boolean {
    const column = args.column;
    const keyword = args.keyword == null ? '' : args.keyword.toString();

    if (!keyword || !column) return true;

    let actualVal = row[column];
    if (actualVal == null) {
        return false;
    }

    let actualValStr = actualVal.toString();
    let keywordStr = keyword;

    if (!args.caseSensitive) {
        actualValStr = actualValStr.toLowerCase();
        keywordStr = keywordStr.toLowerCase();
    }

    return actualValStr.indexOf(keywordStr) !== -1;
}

export default ByColumnFilter;

