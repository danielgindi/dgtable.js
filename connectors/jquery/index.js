import jQuery from 'connectors/jquery/index';
import DGTable from '@danielgindi/dgtable.js';

export class DGTableJQuery extends DGTable {
    constructor(options) {
        super(options);

        this.$el = jQuery(this.el)
            .data('dgtable', this)
            .on('remove', () => this.destroy());

        this.on('headerrowdestroy', () => {
            const headerRow = this.p?.headerRow;
            if (!headerRow) return;

            jQuery(headerRow).find(`div.${this.o.tableClassName}-header-cell`).remove();
        });
    }

    destroy() {
        if (this.p?.table)
            jQuery(this.p.table).empty();
        if (this.p?.tbody)
            jQuery(this.p.tbody).empty();
        return super.destroy();
    }
}
