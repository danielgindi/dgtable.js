DGTable.js
==========

This is a table View for vanilla JS, which is meant to be high-performance, and allow simple user interactions with the UI, such as:
* Sorting
* Sorting by more than one column
* Moving columns
* Resizing columns
* Full cell preview when hovering
* Native RTL support
* Variable row height

Other features implemented are:
* Mix absolute column widths with relative column widths
* Virtual table mode (to supply high performance with hundreds of thousands of rows). This is the default.
* Non-virtual table mode is fully supported, but for giant amounts of data it is not recommended.
* Option to set a fixed width for the table so resizing (relative) columns will still make sure the table will not be less (and/or more) than the specified width.
* Option to have both scrollbars inside the table. (set `width: DGTable.Width.SCROLL`)

`jquery.dgtable` users:
* Older `jquery.dgtable` can either keep using `jquery.dgtable`, or migrate to this new version which is more lightweight. 
* The new version's API is the same as the old one, except that:
  * No `$el` property
  * No auto-clear of jQuery data.
  * There is now an `emit` method instead of `trigger`.
  * Event arguments are now always a single value/object.
  * Props on DOM elements are now: `'columnName'` on a cell, `'index'/'vIndex'` on a row, `'columnName'/rowIndex'/'rowVIndex'` on a cellPreview

My TODO list:
* TODO: Have a simple and accurate API documentation here in the readme

## Dev environment

* Using grunt over Node.js to automate validating and building.
* After installing Node.js, use `npm install`, and `npm install -g grunt-cli` to prepare building environment.
* Use `grunt style` to just test for correct styling.
* Use `grunt build` or just `grunt` to compile for release.
* I am using Google Closure Compiler, because UglifyJS does not work with the JSDoc, and there's a major difference in size & performance of the output code.
* Some features of jshint are disabled because it does not work well with JSDoc which is used for Google Closue Compiler.
* Indentations in my editor are set to 4 spaces, and jshint validates that.

## Me
* Hi! I am Daniel Cohen Gindi. Or in short- Daniel.
* danielgindi@gmail.com is my email address.
* That's all you need to know.

## Help

I have invested, and investing, a lot of time in this project.
If you want to help, you could:
* Actually code, and issue pull requests
* Test the library under different conditions and browsers
* Create more demo pages
* Spread the word
* 
[![Donate](https://www.paypalobjects.com/en_US/i/btn/btn_donate_LG.gif)](https://www.paypal.com/cgi-bin/webscr?cmd=_s-xclick&hosted_button_id=G22LPLJ79NBYQ)

## API

To create a new table, just use `var myTable = new DGTable(INIT_OPTIONS)`.

#### `INIT_OPTIONS`

* **columns**: `COLUMN_OPTIONS[]` (Array of COLUMN_OPTIONS objects)
  * **name**: `string` Name of the column
  * **label**: `string=name` Used for the header of this column
  * **dataPath**: `string=name` Path to the data to show (Defaults to `name`)
  * **comparePath**: `string=name` Path to the data to use for comparison (Defaults to `dataPath`)
  * **width**: `number|string`
    * A simple number (i.e `10`, `30`, `50`) will set an absolute width for the column.
    * A percentage (i.e `'30%'`) or a 0-1 decimal value (i.e `0.2`, `0.7`) will set a relative width for the column, out of the full table's width.
    * Any other value, like `0`, `null` etc. will set an automatic width mode, base of the header's content length.
  * **resizable**: `boolean=true` Is this column resizable?
  * **sortable**: `boolean=true` Is this column sortable?
  * **movable**: `boolean=true` Is this column movable?
  * **visible**: `boolean=true` Is this column visible?
  * **cellClasses**: `string` Classes to add to the DOM element of this cell
  * **ignoreMin**: `boolean=false` Should this column ignore the minimum width specified for the table columns?
* **height**: `number` Suggested height for the table
* **width**: `DGTable.Width=DGTable.Width.NONE` The way that the width of the table will be handled
  * `DGTable.Width.NONE`: No special handling
  * `DGTable.Width.AUTO`: Sets the width automatically
  * `DGTable.Width.SCROLL`: Creates a horizontal scroll when required
* **virtualTable**: `boolean=true` When set, the table will work in virtual mode, which means only the visible rows are rendered. Rows must have fixed height in this mode.
* **estimatedRowHeight**: `number?` Sets the estimated row height for the table. This is used for virtual table mode, to calculate the estimated scroll size. Will be auto calculated by default.
* **resizableColumns**: `boolean=true` Turns on or off the resizable columns globally.
* **movableColumns**: `boolean=true` Turns on or off the movable columns globally.
* **sortableColumns**: `number=1` How many columns can you sort by, one after another?
* **adjustColumnWidthForSortArrow**: `boolean=true` When set, the columns will automatically grow to accommodate for the sort arrow.
* **relativeWidthGrowsToFillWidth**: `boolean=true` When set, relative width columns automatically grow to fill the table's width.
* **relativeWidthShrinksToFillWidth**: `boolean=false` When set, relative width columns automatically shrink to fill the table's width.
* **convertColumnWidthsToRelative**: `boolean=false` When set, auto-width columns are automatically converted to relatives.
* **autoFillTableWidth**: `boolean=false` When set, columns are stretched proportionally to fill the table width (only if there is space left). Will supersede `relativeWidthGrowsToFillWidth` in the future.
* **allowCancelSort**: `boolean=true` When set, the sorting arrows will have 3 modes - asc, desc, and cancelled.
* **cellClasses**: `string` Classes to add to the DOM element of all cells
* **sortColumn**: `string|string[]|COLUMN_SORT_OPTIONS|COLUMN_SORT_OPTIONS[]` Columns to sort by
  * Can be a column or an array of columns.
  * Each column is a `string` or a `COLUMN_SORT_OPTIONS`:
  * **column**: `string` Column name
  * **descending**: `boolean=false` Is this column sorted in descending order?
* **cellFormatter**: `Function(string value, string columnName, Object rowData)string` *(optional)* A formatter function which will return the HTML for the cell. By default the formatter is a plain HTML formatter.
* **headerCellFormatter**: `Function(string value, string columnName)string` *(optional)* A formatter function which will return the HTML for the cell's header. By default the formatter is a plain HTML formatter.
* **rowsBufferSize**: `number=10` The size of the rows buffer, for virtual table
* **minColumnWidth**: `number=35` In pixels, the minimum width for a column
* **resizeAreaWidth**: `number=8` The size of the area where you can drag to resize.
* **onComparatorRequired**: `function(columnName: string, descending: boolean, defaultComparator: function(a,b):number):{function(a,b):number}` A callback that can pass a comparator function for each column and mode as required.
* **resizerClassName**: `string='dgtable-resize'` Class name for the dragged resizing element (showing when resizing a column)
* **tableClassName**: `string='dgtable'` Class name for the table
* **allowCellPreview**: `boolean=true` When set, hovering on truncated cells will show a preview of the full content.
* **allowHeaderCellPreview**: `boolean=true` Allow for toggling off **allowCellPreview** for headers specifically.
* **cellPreviewAutoBackground**: `boolean=true` When set, the preview cell will receive its background automatically from the cell.
* **cellPreviewClassName**: `string='dgtable-cell-preview'` Class name for the cell preview element
* **className**: `string='dgtable-wrapper'` Element class name.
* **el**: `Element?` Optional element to take over
* **filter**: `Function(row: Object, args: Object): boolean` *(optional)* A filter function for using with the `filter` method

#### Events triggered by DGTable:

* `renderskeleton`: The table is re-drawing it's base elements, including headers. Will always be followed by a `render` event.
* `render`: The table has finished rendering (after adding rows etc.).
* `cellpreview`: We are about to show a cell preview - `{ el: Element, rowIndex: number|null, name: string, rowData: Object|null, cell: Element, cellEl: Element }`
  * At this stage you can prevent showing the preview, by calling `table.hideCellPreview`
* `cellpreviewdestroy`: Cell preview element is about to be destroyed after hiding - `{ el: Element, name: string, filteredRowIndex: number|null, rowIndex: Object|null, cell: Element, cellEl: Element }`
  * You can use this event to release any resources that you may have used in `cellPreview` event.
* `headerrowcreate`: The header row has just been created - `Element`
* `headerrowdestroy`: Called just before removing the header row DOM element from the table - `Element`
* `rowcreate`: A row has just been created - `{ filteredRowIndex: number, rowIndex: number, rowEl: Element, rowData: Object }`
* `rowclick`: A row has just been created - `{ event: MouseEvent, rowIndex: number, rowIndex: number, rowEl: Element, rowData: Object }`
* `rowdestroy`: Called just before removing a row DOM element from the table - `Element`
* `addrows`: Data rows have been added to the table - `({ count: number, clear: boolean })`
* `addcolumn`: A column was added - `string` (the column's name)
* `removecolumn`: A column was removed - `string` (the column's name)
* `movecolumn`: A column was moved - `({ name: string, src: number, dest: number })`
* `showcolumn`: A column was shown - `string` (the column's name)
* `hidecolumn`: A column was hidden - `string` (the column's name)
* `columnwidth`: A column was resized - `({ name: string, width: number|string, oldWidth: number|string })`
* `filter`: A filter was applied - `any` - the arguments passed to the filter method
* `filterclear`: A filter was cleared
* `sort`: The data was sorted - `{ sorts: { "column": "column's name", "descending": true|false }[], resort: true|undefined, comparator: Function }`
* `headercontextmenu`: A context menu should be shown for a header cell - `({ name: string, pageX: number, pageY: number, bounds: { left: number, top: number, width: number, height: number } })`

- Member functions:
* `on(eventName, {Function?} callback)`: Adds an event listener
* `once(eventName, {Function?} callback)`: Adds a one-shot event listener
* `off(eventName, {Function?} callback)`: Removes an event listener
* `render()`: Renders the view. Should be called after adding to the DOM, and when the viewport has changed and the table has no knowledge of it.
* `clearAndRender({boolean} render = true)`: Forces a full render of the table
* `setColumns({COLUMN_OPTIONS[]} columns, {boolean} render = true) {DGTable}`: Sets the table columns
* `addColumn({COLUMN_OPTIONS} columnData, {string|number} before = -1, {boolean} render = true) {DGTable}`: Add a column to the table
  * **columnData**: Column properties. Same manner as in the **columns** options when initializing the DGTable
  * **before**: Column name or order to be inserted before.
  * *returns* Self, to allow for call chaining.
* `removeColumn({string} column, {boolean} render = true) {DGTable}`: Remove a column from the table
  * **column**: Column name
  * *returns* Self, to allow for call chaining.
* `setFilter({Function(row: Object, args: Object): boolean} filterFunc) {DGTable}`: Sets a new filtering function, set null for default.
  * **filterFunc**: The filtering function receives a row and an options object, and returns true for any row that passes the filter.
  * *returns* Self, to allow for call chaining.
* `setCellFormatter({Function(value: *, columnName: string, row: Object):string|null} formatter) {DGTable}`: Sets a new cell formatter.
  * **formatter**: The cell formatter. Should return an HTML.
  * *returns* Self, to allow for call chaining.
* `setHeaderCellFormatter({Function(label: string, columnName: string):string|null} formatter) {DGTable}`: Sets a new header cell formatter.
  * **formatter**: The cell formatter. Should return an HTML.
  * *returns* Self, to allow for call chaining.
* `filter({Object} args) {DGTable}`: Filter the visible rows in the table
  * **args**: Options to pass to the filtering function
  * *returns* Self, to allow for call chaining.
* `filter({{column: string, keyword: string, caseSensitive: boolean}} args) {DGTable}`: Syntax for default filtering function.
  * **args.column**: Name of the column to filter on
  * **args.keyword**: Tests the specified column if contains this keyword
  * **args.caseSensitive**: Use caseSensitive filtering
  * *returns* Self, to allow for call chaining.
* `clearFilter() {DGTable}`: Clears the current filter
  * *returns* Self, to allow for call chaining.
* `setColumnLabel({string} column, {string} label) {DGTable}`: Set a new label to a column
  * **column**: Name of the column
  * **label**: New label for the column
  * *returns* Self, to allow for call chaining.
* `moveColumn({string|number} src, {string|number} dest, visibleOnly = true) {DGTable}`: Move a column to a new position
  * **src**: Name or position of the column to be moved
  * **dest**: Name of the column currently in the desired position, or the position itself
  * **visibleOnly**: Should consider only visible columns and visible-relative indexes
  * *returns* Self, to allow for call chaining.
* `sort({string?} column, {boolean?} descending, {boolean=false} add) {DGTable}`: Sort the table. This does not render automatically, so you may need to call render() too.
  * **src**: Name of the column to sort on
  * **descending**: Sort in descending order (if not specified, defaults to false or reverses current descending mode if sorting by same column)
  * **add**: Should this sort be on top of the existing sort? (For multiple column sort)
  * *returns* Self, to allow for call chaining.
* `resort() {DGTable}`: Re-sort the table using current sort specifiers. This does not render automatically, so you may need to call render() too.
  * *returns* Self, to allow for call chaining.
* `setColumnVisible({string} column, {boolean} visible) {DGTable}`: Show or hide a column
  * **column**: Unique column name
  * **visible**: New visibility mode for the column
  * *returns* Self, to allow for call chaining.
* `isColumnVisible({string} column, {boolean} visible) {boolean}`: Get the visibility mode of a column
  * *returns* True if visible
* `setMinColumnWidth({number} minColumnWidth) {DGTable}`: Globally set the minimum column width
  * **minColumnWidth**: Minimum column width
  * *returns* Self, to allow for call chaining.
* `getMinColumnWidth() {number}`: Get the current minimum column width
  * *returns* Minimum column width
* `setSortableColumns({number} sortableColumns) {DGTable}`: Set the limit on concurrent columns sortedh
  * **sortableColumns**: Minimum column width
  * *returns* Self, to allow for call chaining.
* `getSortableColumns() {number}`: Get the limit on concurrent columns sorted
  * *returns* How many sortable columns are allowed?
* `getHeaderRowElement() {Element}`: Get the DOM element of the header row
  * *returns* a DOM element
* `setMovableColumns({boolean} movableColumns) {DGTable}`: *Undocumented yet*
* `getMovableColumns() {boolean}`: *Undocumented yet*
* `setResizableColumns({boolean} resizableColumns) {DGTable}`: *Undocumented yet*
* `getResizableColumns() {boolean}`: *Undocumented yet*
* `setOnComparatorRequired({function(columnName: string, descending: boolean, defaultComparator: function(a,b):number):{function(a,b):number}}|null comparatorCallback) {DGTable}`: Sets a functions that supplies comparators dynamically
  * **comparatorCallback**: a function that returns the comparator for a specific column
* `setCustomSortingProvider({{function(data: any[], sort: function(any[]):any[]):any[]}|null} customSortingProvider) {DGTable}`: sets custom sorting function for a data set
  * **customSortingProvider**: provides a custom sorting function (not the comparator, but a sort() alternative) for a data set
* `setColumnWidth({string} column, {number|string} width) {DGTable}`: *Undocumented yet*
* `getColumnWidth({string} column) {string|null}`: *Undocumented yet*
* `getColumnConfig({string} column name) {SERIALIZED_COLUMN}`: *Undocumented yet*
* `getColumnsConfig() {Object}`: *Undocumented yet*
* `getSortedColumns() {Array.<SERIALIZED_COLUMN_SORT>}`: *Undocumented yet*
* `getHtmlForRowCell(row: number, columnName: string) {string}`: Returns the HTML for specified cell in a row.
  * **row**: Index of row
  * **columnName**: Name of cell
  * *returns* HTML for cell. By default cell content is *not* HTML encoded, you should encode appropriately in your `cellFormatter`.
* `getHtmlForRowDataCell(rowData: Object, columnName: string) {string|null}`: Returns the HTML string for a specific cell. Can be used externally for special cases (i.e. when setting a fresh HTML in the cell preview through the callback).
  * **rowData**: Actual row data
  * **columnName**: Name of column
  * *returns*  string for the specified cell
* `getDataForRow(rowIndex: number): Object`: Gets the row data for a specific row
  * *returns* row data at the specified index, out of all rows (not filtered)
* `getRowCount(): number`: Gets the number of rows
  * *returns* the number of rows
* `getIndexForRow(row: Object): number`: Finds the index of the specified row
  * *returns* the index of the specified row
* `getFilteredRowCount(): number`: Gets the number of filtered rows
  * *returns* the number of rows in the filtered set (defaults to full row count if no filtering is active)
* `getIndexForFilteredRow(row: Object): number`: Finds the index of the specified row within the filtered results
  * *returns* the index of the specified row
* `getDataForFilteredRow(row: number): Object`: *Undocumented yet*
* `getRowElement(rowIndex: number): Element`: Returns the element of the specified row (unfiltered index)
* `getRowYPos(rowIndex: number): number?`: Returns the Y pos of the specified row (unfiltered index)
* `tableWidthChanged() {DGTable}`: *Undocumented yet*
* `tableHeightChanged() {DGTable}`: *Undocumented yet*
* `addRows({Object[]} data, {number} at = -1, {boolean} resort = false, {boolean} render = true) {DGTable}`: Adds the specified rows at the specified position, and optionally resorts the data
* `removeRow({number} rowIndex, {boolean} render = true) {DGTable}`: Removes one row at the specified position
* `removeRows({number} rowIndex, {number} count, {boolean} render = true) {DGTable}`: Removes rows at the specified position
* `refreshRow({number} rowIndex) {DGTable}`: Refreshes the row specified
  * *returns* Self
* `refreshAllVirtualRows() {DGTable}`: Refreshes all virtual rows
  * *returns* Self
* `setRows(data: Object[], resort: boolean=false) {DGTable}`: Rests the table rows to the provided array of rows.
  * **data**: New rows for the table
  * **resort**: Should re-sort the table?
  * *returns* Self, to allow for call chaining.
* `getUrlForElementContent({string} id) {string?}`: *Undocumented yet*
* `isWorkerSupported() {boolean}`: *Undocumented yet*
* `createWebWorker({string} url) {Worker?}`: *Undocumented yet*
* `unbindWebWorker({Worker} worker) {DGTable}`: *Undocumented yet*
* `hideCellPreview() {DGTable}`: Hide any cell preview showing currently, or prevent showing a cell preview from within the `cellpreview` event.
* `destroy()`: Destroy the table and free all of its memory.

## License

All the code here is under MIT license. Which means you could do virtually anything with the code.
I will appreciate it very much if you keep an attribution where appropriate.

    The MIT License (MIT)
    
    Copyright (c) 2013 Daniel Cohen Gindi (danielgindi@gmail.com)
    
    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:
    
    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.
    
    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    SOFTWARE.
