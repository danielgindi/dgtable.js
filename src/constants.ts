// Symbols for internal use
export const IsSafeSymbol = Symbol('safe');
export const HoverInEventSymbol = Symbol('hover_in');
export const HoverOutEventSymbol = Symbol('hover_out');
export const RowClickEventSymbol = Symbol('row_click');
export const PreviewCellSymbol = Symbol('preview_cell');
export const OriginalCellSymbol = Symbol('cell');
export const RelatedTouchSymbol = Symbol('related_touch');

/**
 * Column width mode enumeration
 */
export const ColumnWidthMode = {
    AUTO: 0,
    ABSOLUTE: 1,
    RELATIVE: 2,
} as const;

export type ColumnWidthModeType = typeof ColumnWidthMode[keyof typeof ColumnWidthMode];

/**
 * Table width mode enumeration
 */
export const Width = {
    NONE: 'none',
    AUTO: 'auto',
    SCROLL: 'scroll',
} as const;

export type WidthType = typeof Width[keyof typeof Width];

