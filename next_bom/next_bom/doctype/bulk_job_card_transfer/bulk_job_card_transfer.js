frappe.ui.form.on('Bulk Job Card Transfer', {
	refresh: function(frm) {
        frm.disable_save();
        
		frm.add_custom_button(__('Transfer'), function() {
            frappe.call({
                method: "next_bom.next_bom.doctype.bulk_job_card_transfer.bulk_job_card_transfer.make_transfer",
                args: {
                    doc: frm.doc
                },
                callback: function(r) {
                    if (!r.exc) {
                        frappe.msgprint(__('Transferred successfully!'), () => {
                            frm.set_value("work_order","")
                            
                        });
                    }
                }
            });
        }).addClass('btn-primary');
	},

	fetch_job_cards: function(frm) {
		frm.clear_table("job_card_transfer_qty");

		if (!frm.doc.work_order) {
			frappe.throw("Please first select Work Order");
		}
		if (!frm.doc.bom_no) {
			frappe.throw("Please set the BOM");
		}

		frappe.call({
			method: "next_bom.next_bom.doctype.bulk_job_card_transfer.bulk_job_card_transfer.bom_data",
			args: {
				work_order: frm.doc.work_order,
				bom: frm.doc.bom_no
			},
			callback: function(r) {
				if (r.message) {
					let data = r.message.data || [];
					data.forEach(function(row) {
						let child = frm.add_child("job_card_transfer_qty", {
							job_card: row.job_card,
							operation: row.operation,
							transfer_qty: row.qty_to_transfer,
							transfer_to_job_card: row.transfer_to_job_card
						});
					});
					frm.refresh_field("job_card_transfer_qty");
				}
			}
		});
	},
    work_order:function(frm){
        frm.clear_table("job_card_transfer_qty")
        frm.refresh_field("job_card_transfer_qty")

    }
});
