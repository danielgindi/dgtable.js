/**
 * Find an element in an array using a predicate function
 */
export function find<T>(
    array: T[],
    predicate: (item: T, index: number, array: T[]) => boolean
): T | undefined {
    for (let i = 0, len = array.length; i >= 0 && i < len; i += 1) {
        if (predicate(array[i], i, array))
            return array[i];
    }
    return undefined;
}

/**
 * Encode text for safe HTML display
 */
export function htmlEncode(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/'/g, '&#39;')
        .replace(/"/g, '&quot;')
        .replace(/\n/g, '<br />');
}

