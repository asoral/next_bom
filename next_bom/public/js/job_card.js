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
                                                label: __('Date'),
                                                fieldname: 'date',
                                                fieldtype: 'Datetime',
                                                in_list_view: 1,
                                                reqd: 1
                                            },
                                            {
                                                label: __('Work Station'),
                                                fieldname: 'work_station',
                                                fieldtype: 'Link',
                                                options: "Workstation",
                                                reqd: 1,
                                                read_only: 1
                                            }
                                        ]
                                    }
                                ],
                                primary_action_label: __('Submit'),
                                primary_action(values) {
                                    let total_qty = 0;
                                    const now = new Date(); // current datetime

                                    for (let row of values.transfer_qty) {
                                        if (!row.date) {
                                            frappe.throw(__('Please select a date for all transfer rows.'));
                                        }

                                        const selected_date = new Date(row.date);
                                        if (selected_date > now) {
                                            frappe.throw(__('Date and time cannot be in the future.'));
                                        }

                                        if (!row.qty_to_transfer || row.qty_to_transfer <= 0) {
                                            frappe.throw(__('Qty to transfer must be greater than 0.'));
                                        }

                                        total_qty += row.qty_to_transfer;
                                    }

                                    if (total_qty > frm.doc.total_completed_qty) {
                                        frappe.throw(__(`Total transfer quantity (${total_qty}) cannot exceed total completed quantity (${frm.doc.total_completed_qty})`));
                                    }

                                    let data = values.transfer_qty.map(row => ({
                                        job_card: row.job_card,
                                        qty: row.qty_to_transfer,
                                        work_station: row.work_station,
                                        job_name: frm.doc.name,
                                        date: row.date
                                    }));

                                    frappe.call({
                                        method: "next_bom.job_card.child_table_append",
                                        args: {
                                            data: JSON.stringify(data),
                                            doc: frm.doc.name
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

        if (frm.doc.work_order && frm.doc.bom_no && frm.doc.operation) {
            frappe.call({
                method: "next_bom.job_card.received_qty",
                args: {
                    bom_no: frm.doc.bom_no,
                    operation: frm.doc.operation
                },
                callback: function (r) {
                    if (r.message && r.message.is_first_operation) {
                        frm.add_custom_button("Received Qty", () => {
                            let d = new frappe.ui.Dialog({
                                title: 'Enter Received Quantity',
                                fields: [
                                    {
                                        label: 'Quantity',
                                        fieldname: 'qty',
                                        fieldtype: 'Float',
                                        reqd: true
                                    }
                                ],
                                primary_action_label: 'Submit',
                                primary_action(values) {
                                    let current_qty = frm.doc.custom_received_qty || 0;
                                    let total_received_qty = current_qty + values.qty;

                                    if (frm.doc.for_quantity != null && frm.doc.for_quantity < total_received_qty) {
                                        frappe.throw("Qty To Manufacture cannot be less than Total Received Qty.");
                                    }

                                    frm.set_value("custom_received_qty", total_received_qty);
                                    frm.save();
                                    d.hide();
                                }

                            });
                            d.show();
                        });
                    }
                }
            });
        }
       
    },
    
    total_completed_qty: function(frm) {
        if (
            frm.doc.custom_received_qty != null &&
            frm.doc.total_completed_qty != null &&
            frm.doc.custom_received_qty < frm.doc.total_completed_qty
        ) {
            frappe.throw("Received Quantity cannot be less than Completed Quantity.");
        }
    }
});


frappe.ui.form.on('Received Qty', {
    revert_qty: async function (frm, cdt, cdn) {
        const row = locals[cdt][cdn];
        const last_row = frm.doc.custom_received_qty_[frm.doc.custom_received_qty_.length - 1];

        if (row.name !== last_row.name) {
            frappe.msgprint("Only the last row can be reverted.");
            return;
        }

        let received_qty_total = frm.doc.custom_received_qty || 0;
        let transferred_qty_total = frm.doc.custom_transferred_qty || 0;
        let completed_qty = frm.doc.total_completed_qty || 0;


        let max_available_revert_qty = received_qty_total - transferred_qty_total;
        let completed_qty_remaining = received_qty_total - completed_qty;

        if (max_available_revert_qty <= 0) {
            frappe.msgprint("No available quantity to revert.");
            return;
        }

        if (completed_qty_remaining <= 0) {
            frappe.msgprint("No available quantity to revert. This is fully completed qty.");
            return;
        }

    
        if (max_available_revert_qty > completed_qty_remaining) {
            max_available_revert_qty = completed_qty_remaining;
        }

        
        let max_revert_qty = Math.min(row.received_qty, max_available_revert_qty);

        const dialog = new frappe.ui.Dialog({
            title: 'Revert Quantity',
            fields: [
                {
                    label: 'Transferred From Job Card ID',
                    fieldname: 'transferred_from_job_card_id',
                    fieldtype: 'Link',
                    options: 'Job Card',
                    default: row.transferred_from_job_card_id || '',
                    read_only: 1
                },
                {
                    label: 'Date and Time',
                    fieldname: 'date_and_time',
                    fieldtype: 'Datetime',
                    default: frappe.datetime.now_datetime(),
                    read_only: 1
                },
                {
                    label: 'Received Qty',
                    fieldname: 'received_qty',
                    fieldtype: 'Float',
                    default: row.received_qty,
                    read_only: 1
                },
                {
                    label: 'Revert Qty',
                    fieldname: 'revert_qty',
                    fieldtype: 'Float',
                    description: `Max: ${max_revert_qty}`,
                    reqd: 1
                }
            ],
            primary_action_label: 'Revert',
            primary_action: function (values) {
                if (!values.revert_qty || values.revert_qty <= 0 || values.revert_qty > max_revert_qty) {
                    frappe.msgprint(`Revert Qty must be between 0 and ${max_revert_qty}`);
                    return;
                }

                frappe.call({
                    method: 'frappe.client.get',
                    args: {
                        doctype: 'Job Card',
                        name: values.transferred_from_job_card_id
                    },
                    callback: function (res) {
                        let source_job_card = res.message;
                        let new_transferred_qty = (source_job_card.custom_transferred_qty || 0) - values.revert_qty;
                        let new_balance_qty = (source_job_card.custom_balance_qty || 0) + values.revert_qty;

                        frappe.call({
                            method: 'frappe.client.set_value',
                            args: {
                                doctype: 'Job Card',
                                name: values.transferred_from_job_card_id,
                                fieldname: {
                                    custom_transferred_qty: Math.max(0, new_transferred_qty),
                                    custom_balance_qty: new_balance_qty
                                }
                            },
                            callback: function () {
                                // Update current job card
                                frm.set_value('custom_received_qty', (frm.doc.custom_received_qty || 0) - values.revert_qty);

                                // Update row
                                row.received_qty = row.received_qty - values.revert_qty;

                                // If qty is 0, remove the row
                                if (row.received_qty <= 0) {
                                    frm.get_field("custom_received_qty_").grid.grid_rows_by_docname[row.name].remove();
                                }

                                frm.refresh_field('custom_received_qty_');
                                frm.save().then(() => {
                                    frappe.msgprint(`Reverted ${values.revert_qty} Qty. Job Cards updated.`);
                                    dialog.hide();
                                });
                            }
                        });
                    }
                });
            }
        });

        dialog.show();
    }
});
