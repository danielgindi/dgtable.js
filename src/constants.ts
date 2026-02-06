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

