'use strict';

// Symbols for internal use
export const IsSafeSymbol = Symbol('safe');
export const HoverInEventSymbol = Symbol('hover_in');
export const HoverOutEventSymbol = Symbol('hover_out');
export const RowClickEventSymbol = Symbol('row_click');
export const PreviewCellSymbol = Symbol('preview_cell');
export const OriginalCellSymbol = Symbol('cell');
export const RelatedTouch = Symbol('related_touch');

/**
 * @enum {ColumnWidthMode|number|undefined}
 * @const
 * @typedef {ColumnWidthMode}
 */
export const ColumnWidthMode = {
    /** @const*/ AUTO: 0,
    /** @const*/ ABSOLUTE: 1,
    /** @const*/ RELATIVE: 2,
};

/**
 * @enum {Width|string|undefined}
 * @const
 * @typedef {Width}
 */
export const Width = {
    /** @const*/ NONE: 'none',
    /** @const*/ AUTO: 'auto',
    /** @const*/ SCROLL: 'scroll',
};

