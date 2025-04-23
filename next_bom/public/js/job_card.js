frappe.ui.form.on("Job Card", {
    refresh: function(frm) {
        if (frm.doc.total_completed_qty > 0 && frm.doc.total_completed_qty > frm.doc.custom_transferred_qty) {
            frappe.call({
                method: "next_bom.job_card.transfer_qty",
                args: {
                    doc: frm.doc.name,
                    operation: frm.doc.operation
                },
                callback: function(r) {
                    if (r.message && !r.message.is_last_operation) {
                        frm.add_custom_button("Transfer Qty", function() {
                            let d = new frappe.ui.Dialog({
                                title: __("Transfer Qty"),
                                size: "large",
                                fields: [
                                    {
                                        fieldname: 'transfer_qty',
                                        fieldtype: 'Table',
                                        label: __('Transfer Qty'),
                                        cannot_add_rows: 1,
                                        reqd: 1,
                                        fields: [
                                            {
                                                label: __('Job Card'),
                                                fieldname: 'job_card',
                                                fieldtype: 'Link',
                                                options: "Job Card",
                                                in_list_view: 1,
                                                reqd: 1,
                                                read_only: 1
                                            },
                                            {
                                                label: __('Next JC'),
                                                fieldname: 'operation',
                                                fieldtype: 'Link',
                                                options: 'Operation',
                                                in_list_view: 1,
                                                reqd: 1,
                                                read_only: 1
                                            },
                                            {
                                                label: __('Qty to Transfer'),
                                                fieldname: 'qty_to_transfer',
                                                fieldtype: 'Float',
                                                in_list_view: 1,
                                                reqd: 1
                                            },
                                            {
                                                label: __('Work Station'),
                                                fieldname: 'work_station',
                                                fieldtype: 'Link',
                                                options: "Workstation",
                                                in_list_view: 1,
                                                reqd: 1,
                                                read_only: 1
                                            }
                                        ]
                                    }
                                ],
                                primary_action_label: __('Submit'),
                                primary_action(values) {
                                    let total_qty = 0;
                                    values.transfer_qty.forEach(row => {
                                        total_qty += row.qty_to_transfer;
                                    });

                                    if (total_qty > frm.doc.total_completed_qty) {
                                        frappe.throw(__(`Total transfer quantity (${total_qty}) cannot exceed total completed quantity (${frm.doc.total_completed_qty})`));
                                    }

                                    let data = values.transfer_qty.map(row => ({
                                        job_card: row.job_card,
                                        qty: row.qty_to_transfer,
                                        work_station: row.work_station,
                                        job_name: frm.doc.name
                                    }));

                                    frappe.call({
                                        method: "next_bom.job_card.child_table_append",
                                        args: {
                                            data: JSON.stringify(data),
                                            doc:frm.doc.name
                                        },
                                        callback: function(res) {
                                            frappe.msgprint(__("Quantity transferred successfully"));
                                            d.hide();
                                        }
                                    });
                                }
                            });

                            d.show();
                            d.fields_dict.transfer_qty.df.data = r.message.data;
                            d.fields_dict.transfer_qty.grid.refresh();
                        });
                    }
                }
            });
        }
    }
});
