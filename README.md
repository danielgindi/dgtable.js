# DGTable.js

A high-performance virtual table component for vanilla JavaScript.

[![npm version](https://badge.fury.io/js/@danielgindi%2Fdgtable.svg)](https://www.npmjs.com/package/@danielgindi/dgtable)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- **High Performance** - Virtual scrolling renders only visible rows, handling hundreds of thousands of rows smoothly
- **Column Management** - Sort, resize, reorder, and hide/show columns
- **Multi-column Sorting** - Sort by multiple columns simultaneously
- **Flexible Column Widths** - Mix absolute, relative, and auto-calculated widths
- **Cell Preview** - Hover tooltips for truncated cell content
- **Sticky Columns** - Pin columns to the start or end of the table
- **RTL Support** - Native right-to-left language support
- **Variable Row Height** - Support for rows with different heights
- **Filtering** - Built-in filtering with custom filter function support
- **Web Worker Support** - Load data asynchronously via Web Workers

## Installation

```bash
npm install @danielgindi/dgtable
```

## Quick Start

```javascript
import DGTable from '@danielgindi/dgtable';

const table = new DGTable({
    columns: [
        { name: 'id', label: 'ID', width: 80 },
        { name: 'name', label: 'Name', width: '30%' },
        { name: 'email', label: 'Email' },
    ],
    height: 400,
    virtualTable: true,
});

document.getElementById('container').appendChild(table.el);

table.setRows([
    { id: 1, name: 'John Doe', email: 'john@example.com' },
    { id: 2, name: 'Jane Smith', email: 'jane@example.com' },
]);

table.render();
```

## Migration from jquery.dgtable

If you're migrating from the older jQuery version:

- No `$el` property - use `table.el` instead
- No auto-clear of jQuery data
- Use `emit()` instead of `trigger()` for events
- Event arguments are now always a single value/object
- DOM element properties: `'columnName'` on cells, `'index'/'vIndex'` on rows

---

## API Reference

### Constructor Options

```typescript
new DGTable(options?: DGTableOptions)
```

#### Table Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `el` | `Element` | - | Optional existing element to use as container |
| `className` | `string` | `'dgtable-wrapper'` | CSS class for the wrapper element |
| `height` | `number` | - | Table height in pixels |
| `width` | `DGTable.Width` | `NONE` | Width handling mode: `NONE`, `AUTO`, or `SCROLL` |
| `virtualTable` | `boolean` | `true` | Enable virtual scrolling (recommended for large datasets) |
| `estimatedRowHeight` | `number` | `40` | Estimated row height for virtual scrolling calculations |
| `rowsBufferSize` | `number` | `3` | Number of rows to render outside visible area |

#### Column Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `columns` | `ColumnOptions[]` | `[]` | Array of column definitions |
| `minColumnWidth` | `number` | `35` | Minimum column width in pixels |
| `resizableColumns` | `boolean` | `true` | Allow column resizing |
| `movableColumns` | `boolean` | `true` | Allow column reordering |
| `sortableColumns` | `number` | `1` | Maximum number of columns to sort by |
| `allowCancelSort` | `boolean` | `true` | Allow cycling through asc → desc → none |
| `adjustColumnWidthForSortArrow` | `boolean` | `true` | Auto-expand columns for sort indicator |
| `relativeWidthGrowsToFillWidth` | `boolean` | `true` | Expand relative columns to fill space |
| `relativeWidthShrinksToFillWidth` | `boolean` | `false` | Shrink relative columns to fit |
| `convertColumnWidthsToRelative` | `boolean` | `false` | Convert auto widths to relative |
| `autoFillTableWidth` | `boolean` | `false` | Stretch columns to fill table width |
| `resizeAreaWidth` | `number` | `8` | Width of resize drag area in pixels |

#### Column Definition

```typescript
{
    name: string;                  // Required: unique identifier
    label?: string;                // Header text (defaults to name)
    width?: number | string;       // number (px), '30%', or 0.3 (relative)
    dataPath?: string | string[];  // Path to data (defaults to [name])
    comparePath?: string | string[]; // Path for sorting (defaults to dataPath)
    resizable?: boolean;           // Allow resizing this column (default: true)
    sortable?: boolean;            // Allow sorting by this column (default: true)
    movable?: boolean;             // Allow moving this column (default: true)
    visible?: boolean;             // Column visibility (default: true)
    sticky?: 'start' | 'end' | false | null; // Pin to start or end
    cellClasses?: string;          // Additional CSS classes for cells
    ignoreMin?: boolean;           // Ignore minColumnWidth for this column
    order?: number;                // Column order
}
```

#### Formatting & Filtering

| Option | Type | Description |
|--------|------|-------------|
| `cellFormatter` | `(value: unknown, columnName: string, rowData: RowData) => string` | Custom cell HTML renderer |
| `headerCellFormatter` | `(label: string, columnName: string) => string` | Custom header cell renderer |
| `filter` | `(row: RowData, args: unknown) => boolean` | Custom filter function |
| `sortColumn` | `string \| string[] \| ColumnSortOptions \| ColumnSortOptions[]` | Initial sort configuration |
| `onComparatorRequired` | `(columnName: string, descending: boolean, defaultComparator: ComparatorFunction) => ComparatorFunction` | Custom comparator provider |
| `comparatorCallback` | Same as `onComparatorRequired` | Deprecated alias |
| `customSortingProvider` | `(data: RowData[], sort: (data: RowData[]) => RowData[]) => RowData[]` | Custom sorting implementation |

#### Styling

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `tableClassName` | `string` | `'dgtable'` | Base CSS class for the table |
| `cellClasses` | `string` | `''` | Additional classes for all cells |
| `resizerClassName` | `string` | `'dgtable-resize'` | Class for resize handle |
| `cellPreviewClassName` | `string` | `'dgtable-cell-preview'` | Class for cell preview |
| `allowCellPreview` | `boolean` | `true` | Show preview on hover |
| `allowHeaderCellPreview` | `boolean` | `true` | Show preview for headers |
| `cellPreviewAutoBackground` | `boolean` | `true` | Match preview background to cell |
| `resizeAreaWidth` | `number` | `8` | Width of resize drag area |

---

### Methods

#### Rendering

```javascript
table.render()                    // Render the table
table.clearAndRender(render=true) // Force full re-render
```

#### Column Management

```javascript
table.setColumns(columns, render=true)           // Replace all columns
table.addColumn(columnData, before=-1, render)   // Add a column
table.removeColumn(columnName, render=true)      // Remove a column
table.setColumnLabel(column, label)              // Update column label
table.moveColumn(src, dest, visibleOnly=true)    // Reorder columns
table.setColumnVisible(column, visible)          // Show/hide column
table.isColumnVisible(column)                    // Check visibility
table.setColumnWidth(column, width)              // Set column width
table.getColumnWidth(column)                     // Get column width
table.getColumnConfig(column)                    // Get column config
table.getColumnsConfig()                         // Get all columns config
```

#### Sorting

```javascript
table.sort(column, descending, add=false)  // Sort by column
table.resort()                             // Re-apply current sort
table.getSortedColumns()                   // Get current sort state
table.setSortableColumns(count)            // Set max sortable columns
table.getSortableColumns()                 // Get max sortable columns
```

#### Data Management

```javascript
table.setRows(data, resort=false)                      // Replace all rows
table.addRows(data, at=-1, resort=false, render=true)  // Add rows
table.removeRow(rowIndex, render=true)                 // Remove one row
table.removeRows(rowIndex, count, render=true)         // Remove multiple rows
table.refreshRow(rowIndex, render=true)                // Refresh a row
table.refreshAllVirtualRows()                          // Refresh all visible rows

table.getRowCount()                        // Total row count
table.getFilteredRowCount()                // Filtered row count
table.getDataForRow(rowIndex)              // Get row data by index
table.getDataForFilteredRow(filteredIndex) // Get filtered row data
table.getIndexForRow(rowData)              // Find row index
table.getIndexForFilteredRow(rowData)      // Find filtered row index
table.getRowElement(rowIndex)              // Get row DOM element
table.getRowYPos(rowIndex)                 // Get row Y position
```

#### Filtering

```javascript
table.setFilter(filterFn)     // Set custom filter function
table.filter(args)            // Apply filter with arguments
table.clearFilter()           // Clear active filter

// Built-in filter example:
table.filter({ column: 'name', keyword: 'john', caseSensitive: false });
```

#### Formatters

```javascript
table.setCellFormatter(fn)        // Set cell formatter
table.setHeaderCellFormatter(fn)  // Set header formatter
table.getHtmlForRowCell(rowIndex, columnName)      // Get cell HTML
table.getHtmlForRowDataCell(rowData, columnName)   // Get cell HTML from data
```

#### Layout

```javascript
table.tableWidthChanged(forceUpdate=false, renderColumns=true)  // Notify width change
table.tableHeightChanged()                                      // Notify height change
table.setMinColumnWidth(width)                                  // Set global min width
table.getMinColumnWidth()                                       // Get global min width
```

#### Cell Preview

```javascript
table.hideCellPreview()   // Hide or prevent cell preview
table.abortCellPreview()  // Alias for hideCellPreview()
```

#### Column Features

```javascript
table.setMovableColumns(movable)     // Enable/disable column moving
table.getMovableColumns()            // Get movable state
table.setResizableColumns(resizable) // Enable/disable column resizing
table.getResizableColumns()          // Get resizable state
```

#### Sorting Customization

```javascript
table.setOnComparatorRequired(callback)   // Set comparator provider
table.setComparatorCallback(callback)     // Alias (deprecated)
table.setCustomSortingProvider(provider)  // Set custom sort provider
```

#### Web Workers

```javascript
table.isWorkerSupported()                     // Check Web Worker support
table.createWebWorker(url, start=true, resort=false)  // Create worker
table.unbindWebWorker(worker)                 // Unbind worker
table.getUrlForElementContent(elementId)      // Create blob URL from element
```

#### DOM Access

```javascript
table.el                      // The table wrapper element
table.getHeaderRowElement()   // Get header row element
```

#### Events

```javascript
table.on(event, handler)      // Add event listener
table.once(event, handler)    // Add one-time listener
table.off(event, handler)     // Remove listener
table.emit(event, data)       // Emit event
```

#### Lifecycle

```javascript
table.destroy()  // Destroy table and free memory
table.close()    // Alias for destroy()
table.remove()   // Alias for destroy()
```

---

### Events

| Event | Data | Description |
|-------|------|-------------|
| `render` | - | Table finished rendering |
| `renderskeleton` | - | Table structure rebuilt |
| `rowcreate` | `{ filteredRowIndex, rowIndex, rowEl, rowData }` | Row element created |
| `rowclick` | `{ event, filteredRowIndex, rowIndex, rowEl, rowData }` | Row clicked |
| `rowdestroy` | `Element` | Row element about to be removed |
| `cellpreview` | `{ el, rowIndex, name, rowData, cell, cellEl }` | Cell preview showing |
| `cellpreviewdestroy` | `{ el, name, filteredRowIndex, rowIndex, cell, cellEl }` | Cell preview hiding |
| `headerrowcreate` | `Element` | Header row created |
| `headerrowdestroy` | `Element` | Header row removing |
| `headercontextmenu` | `{ columnName, pageX, pageY, bounds }` | Header right-click |
| `addrows` | `{ count, clear }` | Rows added |
| `addcolumn` | `string` (column name) | Column added |
| `removecolumn` | `string` (column name) | Column removed |
| `movecolumn` | `{ name, src, dest }` | Column moved |
| `showcolumn` | `string` (column name) | Column shown |
| `hidecolumn` | `string` (column name) | Column hidden |
| `columnwidth` | `{ name, width, oldWidth }` | Column resized |
| `sort` | `{ sorts, resort?, comparator }` | Data sorted |
| `filter` | `any` (filter args) | Filter applied |
| `filterclear` | `{}` | Filter cleared |

---

## TypeScript Types

The library exports the following types for TypeScript users:

```typescript
import type {
    DGTableOptions,        // Constructor options
    ColumnOptions,         // Column definition
    ColumnSortOptions,     // Sort specification { column, descending? }
    SerializedColumn,      // Saved column config
    SerializedColumnSort,  // Saved sort config
    RowData,               // Row data (Record<string, unknown>)
    CellFormatter,         // Cell formatter function
    HeaderCellFormatter,   // Header cell formatter function
    FilterFunction,        // Filter function
    ComparatorFunction,    // Row comparator function
    OnComparatorRequired,  // Comparator provider callback
    CustomSortingProvider, // Custom sorting function
} from '@danielgindi/dgtable';
```

---

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Lint
npm run lint
```

## Author

**Daniel Cohen Gindi** - danielgindi@gmail.com

## Contributing

Contributions are welcome! Please feel free to:

- Report bugs and issues
- Submit pull requests
- Improve documentation
- Share your use cases

## License

MIT License - see [LICENSE](LICENSE) for details.

Copyright (c) 2013-present Daniel Cohen Gindi

