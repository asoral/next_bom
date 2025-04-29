# Copyright (c) 2025, Chiranjeevi Subburaj and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import now


class BulkJobCardTransfer(Document):
        pass
	

@frappe.whitelist()
def bom_data(work_order, bom):
    data = []
    is_last_operation = False

    if not work_order:
        return {"data": [], "is_last_operation": False}

   
    work_order_doc = frappe.get_doc("Work Order", work_order)
    if not work_order_doc or not work_order_doc.bom_no:
        return {"data": [], "is_last_operation": False}

    
    job_cards = frappe.get_all(
        "Job Card",
        filters={"work_order": work_order_doc.name},
        fields=["name", "operation", "workstation", "total_completed_qty", "custom_transferred_qty"]
    )

    
    bom_doc = frappe.get_doc("BOM", work_order_doc.bom_no)
    operations = [op.operation for op in bom_doc.operations]

    for jc in job_cards:
        completed_qty = jc.total_completed_qty or 0
        transferred_qty = jc.custom_transferred_qty or 0

       
        if completed_qty > transferred_qty and jc.operation in operations:
            op_index = operations.index(jc.operation)

           
            if op_index == len(operations) - 1:
                is_last_operation = True
                continue

           
            next_operation = operations[op_index + 1]

            
            next_op_jc = next(
                (njc for njc in job_cards if njc.operation == next_operation),
                None
            )

            if next_op_jc:
                data.append({
                    "job_card": jc.name,
                    "operation": jc.operation,
                    "qty_to_transfer": 0,
                    "transfer_to_job_card": next_op_jc.name
                })

    
    data.sort(key=lambda x: x["job_card"])

    return {
        "data": data,
        "is_last_operation": is_last_operation
    }




@frappe.whitelist()
def make_transfer(doc):
    doc = frappe.parse_json(doc)

    if doc.get("job_card_transfer_qty"):
        for d in doc["job_card_transfer_qty"]:
            if d.get("job_card"):
                job_card = frappe.get_doc("Job Card", d["job_card"])

                
                if job_card.total_completed_qty < job_card.custom_transferred_qty + d["transfer_qty"]:
                    frappe.throw(
                        f"Cannot transfer {d['transfer_qty']} qty for Job Card {job_card.name}. "
                        f"Completed Qty: {job_card.total_completed_qty}, "
                        f"Already Transferred Qty: {job_card.custom_transferred_qty}, "
                        f"Remaining Allowed Qty: {job_card.total_completed_qty - job_card.custom_transferred_qty}."
                    )

                job_card.custom_transferred_qty += d["transfer_qty"]
                job_card.custom_balance_qty = job_card.total_completed_qty - job_card.custom_transferred_qty
                job_card.save(ignore_permissions=True)

                next_job_card = frappe.get_doc("Job Card", d["transfer_to_job_card"])
                next_job_card.append("custom_received_qty_", {
                    "transferred_from_job_card_id": job_card.name,
                    "date_and_time": now(),
                    "received_qty": d["transfer_qty"]
                })

                total_received_qty = sum(row.received_qty for row in next_job_card.custom_received_qty_)
                next_job_card.custom_received_qty = total_received_qty
                next_job_card.save(ignore_permissions=True)

                frappe.db.commit()

    return "Transferred successfully!"
