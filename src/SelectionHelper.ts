/**
 * Selection state for save/restore operations
 */
export interface SelectionState {
    start: number;
    end: number;
}

/**
 * Check if a node is a child of a parent node
 */
function isChildOf(child: Node | null, parent: Node): boolean {
    let current: Node | null = child;
    while ((current = current?.parentNode ?? null) && current !== parent);
    return !!current;
}

/**
 * Helper class for saving and restoring text selections
 * Based on Tim Down's solution with improvements
 * @see https://stackoverflow.com/questions/13949059/persisting-the-changes-of-range-objects-after-selection-in-html/13950376#13950376
 */
class SelectionHelper {
    /**
     * Save the current selection relative to an element
     */
    static saveSelection(el: Node): SelectionState | null {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return null;

        const range = selection.getRangeAt(0);

        if (el !== range.commonAncestorContainer && !isChildOf(range.commonAncestorContainer, el))
            return null;

        const preSelectionRange = range.cloneRange();
        preSelectionRange.selectNodeContents(el);
        preSelectionRange.setEnd(range.startContainer, range.startOffset);
        const start = preSelectionRange.toString().length;

        return {
            start: start,
            end: start + range.toString().length,
        };
    }

    /**
     * Restore a previously saved selection
     */
    static restoreSelection(el: Node, savedSel: SelectionState): void {
        let charIndex = 0;
        const nodeStack: Node[] = [el];
        let node: Node | undefined;
        let foundStart = false;
        let stop = false;
        const range = document.createRange();
        range.setStart(el, 0);
        range.collapse(true);

        while (!stop && (node = nodeStack.pop())) {
            if (node.nodeType === Node.TEXT_NODE) {
                const textNode = node as Text;
                const nextCharIndex = charIndex + textNode.length;
                if (!foundStart && savedSel.start >= charIndex && savedSel.start <= nextCharIndex) {
                    range.setStart(node, savedSel.start - charIndex);
                    foundStart = true;
                }
                if (foundStart && savedSel.end >= charIndex && savedSel.end <= nextCharIndex) {
                    range.setEnd(node, savedSel.end - charIndex);
                    stop = true;
                }
                charIndex = nextCharIndex;
            } else {
                let i = node.childNodes.length;
                while (i--) {
                    nodeStack.push(node.childNodes[i]);
                }
            }
        }

        const sel = window.getSelection();
        if (sel) {
            sel.removeAllRanges();
            sel.addRange(range);
        }
    }
}

export default SelectionHelper;

