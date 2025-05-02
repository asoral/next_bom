frappe.ui.form.on('Bulk Job Card Transfer', {
    refresh: function(frm) {
        frm.disable_save();
		frm.fields_dict["job_card_transfer_qty"].grid.wrapper.find('.grid-add-row').hide();


        frm.add_custom_button(__('Transfer'), function() {
            if (!frm.doc.work_order) {
                frappe.throw("Please select a Work Order.");
            }

            if (!frm.doc.job_card_transfer_qty || frm.doc.job_card_transfer_qty.length === 0) {
                frappe.throw("Job Card Transfer Qty table is empty.");
            }

            const now = frappe.datetime.now_datetime();

            frm.doc.job_card_transfer_qty.forEach(function(row) {
                if (!row.date) {
                    frappe.throw(`Please select a DateTime in row for Job Card ${row.job_card}.`);
                }

                if (new Date(row.date) > new Date(now)) {
                    frappe.throw(`DateTime cannot be in the future for Job Card ${row.job_card}.`);
                }

                if (!row.transfer_qty || row.transfer_qty <= 0) {
                    frappe.throw(`Transfer Qty must be greater than 0 in row for Job Card ${row.job_card}.`);
                }
            });

            frappe.call({
                method: "next_bom.next_bom.doctype.bulk_job_card_transfer.bulk_job_card_transfer.make_transfer",
                args: {
                    doc: frm.doc
                },
                callback: function(r) {
                    if (!r.exc) {
                        frappe.msgprint(__('Transferred successfully!'), () => {
                            frm.set_value("work_order", "");
                            frm.clear_table("job_card_transfer_qty");
                            frm.refresh_fields();
                        });
                    }
                }
            });
        }).addClass('btn-primary');
    },

    fetch_job_cards: function(frm) {
        frm.clear_table("job_card_transfer_qty");

        if (!frm.doc.work_order) {
            frappe.throw("Please first select a Work Order.");
        }

        if (!frm.doc.bom_no) {
            frappe.throw("Please set the BOM.");
        }

        frappe.call({
            method: "next_bom.next_bom.doctype.bulk_job_card_transfer.bulk_job_card_transfer.bom_data",
            args: {
                work_order: frm.doc.work_order,
                bom: frm.doc.bom_no
            },
            callback: function(r) {
                if (r.message) {
                    const data = r.message.data || [];
                    data.forEach(function(row) {
                        frm.add_child("job_card_transfer_qty", {
                            job_card: row.job_card,
                            operation: row.operation,
                            transfer_qty: row.qty_to_transfer,
                            transfer_to_job_card: row.transfer_to_job_card,
							workstation:row.workstation
                        });
                    });
                    frm.refresh_field("job_card_transfer_qty");
                }
            }
        });
    },

    work_order: function(frm) {
        frm.clear_table("job_card_transfer_qty");
        frm.refresh_field("job_card_transfer_qty");
    }
});
