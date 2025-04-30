
import frappe
from frappe.utils import now ,get_datetime, now_datetime
import json
from datetime import timedelta

@frappe.whitelist()
def transfer_qty(doc, operation):
    data = []
    is_last_operation = False

    if doc:
        work_order_id = frappe.get_value("Job Card", doc, "work_order")
        work_order = frappe.get_doc("Work Order", work_order_id)

        if work_order and work_order.bom_no:
            bom = frappe.get_doc("BOM", work_order.bom_no)
            job_cards = frappe.get_all("Job Card", 
                filters={"work_order": work_order.name},
                fields=["name", "workstation", "operation"]
            )

            operations = [op.operation for op in bom.operations]

            if operation in operations:
                op_index = operations.index(operation)
                if op_index == len(operations) - 1:
                    is_last_operation = True
                else:
                    next_operation = operations[op_index + 1]

                    for jc in job_cards:
                        if jc.operation == next_operation:
                            data.append({
                                "job_card": jc.name,
                                "operation": next_operation,
                                "qty_to_transfer": 0,
                                "work_station": jc.workstation
                            })

    return {
        "data": data,
        "is_last_operation": is_last_operation
    }

@frappe.whitelist()
def child_table_append(data, doc):
    
    try:
        data = json.loads(data)
    except Exception as e:
        frappe.throw(f"Invalid JSON data: {e}")

    job_card_doc = frappe.get_doc("Job Card", doc)
    transfer_qty, balance_qty, total_completed_qty = frappe.db.get_value(
        "Job Card", doc, ["custom_transferred_qty", "custom_balance_qty", "total_completed_qty"]
    )

    transfer_qty = transfer_qty or 0
    total_qty_trans = transfer_qty

    for i in data:
        qty = i.get("qty")
        job_card_id = i.get("job_card")
        job_name = i.get("job_name")

        if qty:
            total_qty_trans += qty

        if total_qty_trans > total_completed_qty:
            frappe.throw(f"Total transferred quantity ({total_qty_trans}) cannot exceed completed quantity ({total_completed_qty})")

       
        job_card_doc.custom_transferred_qty = total_qty_trans
        job_card_doc.custom_balance_qty = total_completed_qty - total_qty_trans
        job_card_doc.save(ignore_permissions=True)

       
        if qty and qty > 0 and job_card_id:
            job_card = frappe.get_doc("Job Card", job_card_id)

            job_card.append("custom_received_qty_", {
                "transferred_from_job_card_id": job_name,
                "date_and_time": now(),
                "received_qty": qty
            })

            total_received_qty = sum(row.received_qty for row in job_card.custom_received_qty_)
            job_card.custom_received_qty = total_received_qty
            job_card.save(ignore_permissions=True)

    return True


def job_card_validation(self, method):
    if not self.custom_received_qty_ or not self.time_logs:
        return

    first_entry = self.custom_received_qty_[0]
    first_entry_time = get_datetime(first_entry.date_and_time) - timedelta(minutes=1)

    for log in self.time_logs:
        log_from_time = get_datetime(log.from_time)
        log_to_time = get_datetime(log.to_time)

        if first_entry_time > log_from_time:
            frappe.throw(
                f"First entry time {first_entry_time} should not be greater than time log's from_time {log_from_time}."
            )

       
        if log_to_time and log_to_time > now_datetime():
            frappe.throw(
                f"Time log's to_time {log_to_time} cannot be in the future (current time: {now_datetime()})."
            )

    total_received_qty = 0
    total_completed_qty = 0


    latest_to_time = max(
        [get_datetime(log.to_time).replace(microsecond=0) for log in self.time_logs if log.to_time],
        default=None
    )
    if not latest_to_time:
        return

    latest_to_time += timedelta(minutes=1)

    for entry in self.custom_received_qty_:
        try:
            entry_datetime = get_datetime(entry.date_and_time).replace(microsecond=0)
        except Exception as e:
            frappe.logger().warning(f"Invalid entry.date_and_time: {entry.date_and_time} - {e}")
            continue

        if entry_datetime <= latest_to_time:
            total_received_qty += entry.received_qty
        else:
            print(f"Entry Excluded: {entry_datetime} > {latest_to_time}")

    for log in self.time_logs:
        total_completed_qty += log.completed_qty

    if total_completed_qty > total_received_qty:
        frappe.throw("Completed Quantity should not be greater than Received Quantity.")
