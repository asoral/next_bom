frappe.ui.form.on("BOM Item", {
	custom_type: function(frm, cdt, cdn){
                var row = locals[cdt][cdn];
                if (row.custom_type == 'On Previous Row Qty' && row.idx == 1)
                {
                        frappe.msgprint(__('Cannot select Type as On Previous Row Qty for first row'));
                        frappe.model.set_value(cdt, cdn, "custom_type", '');
                }
                // else if(row.custom_type == 'On Previous Row Qty')
                // {
                //         frappe.model.set_value(cdt, cdn, "custom_reference_row_",row.idx - 1);   
                // }
	},
        custom_is_custom_calculation :function(frm,cdt,cdn){
                var row = locals[cdt][cdn];
                if (row.custom_is_custom_calculation == 0)
                {
                frappe.model.set_value(cdt, cdn, "custom_is_custom_calculation", 0);
                frappe.model.set_value(cdt, cdn, "custom_formula", '');
                frappe.model.set_value(cdt, cdn, "custom_reference_row_", '');
                frappe.model.set_value(cdt, cdn, "custom_type", '');
                }
        },
        custom_reference_row_ : function(frm,cdt,cdn)
        {
                var row = locals[cdt][cdn];
                if (isNaN(row.custom_reference_row_)) {
                        frappe.msgprint(__('Only positive numbers are allowed.'));
                        frappe.model.set_value(cdt, cdn, "custom_reference_row_", '');
                        return;
                } 

                const enteredRowNumber = parseInt(row.custom_reference_row_, 10);
                if (enteredRowNumber <= 0) {
                        frappe.msgprint(__('Only positive numbers are allowed.'));
                        frappe.model.set_value(cdt, cdn, "custom_reference_row_", '');
                        return;
                }
                if (row.idx == enteredRowNumber) {
                        frappe.msgprint(__('Please enter a Reference Row # less than the current row.'));
                        frappe.model.set_value(cdt, cdn, "custom_reference_row_", '');
                        return;
                }
                if (enteredRowNumber >= row.idx) {
                        frappe.msgprint(__('Only previous row numbers are allowed.'));
                        frappe.model.set_value(cdt, cdn, "custom_reference_row_", '');
                        return; 
                }
        }
});