
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

        if work_order and work_order.operations:
            # Get all operations from Work Order
            operations = [op.operation for op in work_order.operations]

            if operation in operations:
                op_index = operations.index(operation)

                if op_index == len(operations) - 1:
                    is_last_operation = True
                else:
                    next_operation = operations[op_index + 1]

                    # Fetch job cards for this work order
                    job_cards = frappe.get_all(
                        "Job Card", 
                        filters={"work_order": work_order.name},
                        fields=["name", "workstation", "operation"]
                    )

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

    # First pass: validate and calculate new total transferred qty
    for i in data:
        qty = i.get("qty")
        if qty:
            total_qty_trans += qty

    if total_qty_trans > total_completed_qty:
        frappe.throw(f"Total transferred quantity ({total_qty_trans}) cannot exceed completed quantity ({total_completed_qty})")

    # Update parent Job Card after all validation passed
    job_card_doc.custom_transferred_qty = total_qty_trans
    job_card_doc.custom_balance_qty = total_completed_qty - total_qty_trans
    job_card_doc.save(ignore_permissions=True)

    # Second pass: update child tables
    for i in data:
        qty = i.get("qty")
        job_card_id = i.get("job_card")
        job_name = i.get("job_name")
        date = i.get("date")

        if qty and qty > 0 and job_card_id:
            job_card = frappe.get_doc("Job Card", job_card_id)
            job_card.append("custom_received_qty_", {
                "transferred_from_job_card_id": job_name,
                "date_and_time": date,
                "received_qty": qty
            })

            job_card.custom_received_qty = sum(
                row.received_qty for row in job_card.custom_received_qty_
            )
            job_card.save(ignore_permissions=True)

    return True


def job_card_validation(self, method):
    if self.total_completed_qty and self.custom_transferred_qty:
        balance_qty = self.total_completed_qty - self.custom_transferred_qty
        self.custom_balance_qty=balance_qty

    if not self.custom_received_qty_ or not self.time_logs:
        return
    
    if self.total_completed_qty:
        balance_qty=self.total_completed_qty - self.custom_transferred_qty
        self.custom_balance_qty = balance_qty
    
    if self.for_quantity and self.custom_received_qty:
        if self.for_quantity < self.custom_received_qty:
            frappe.throw("Qty to Manufacture cannot be less than Total Received Qty.")


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

    if self.time_logs:
        for log in self.time_logs:
            if log.completed_qty is not None:
                total_completed_qty += log.completed_qty
import frappe

def on_update(doc, method):
    print("🔄 on_update triggered...")

    if not doc.time_logs:
        return

    for log in doc.time_logs:
        if not log.name:
            frappe.msgprint(f"⏩ Skipping log (no name): {log.idx}")
            continue  

       
        existing_qi_name = frappe.get_value("Quality Inspection", {
            "reference_name": doc.name,
            "child_row_reference": log.name
        }, "name")

        if not existing_qi_name:
           
            try:
                quality_inspection = frappe.new_doc("Quality Inspection")
                quality_inspection.reference_type = "Job Card"
                quality_inspection.inspection_type = "In Process"
                quality_inspection.reference_name = doc.name
                quality_inspection.child_row_reference = log.name
                quality_inspection.item_code = doc.production_item
                quality_inspection.sample_size = 1
                quality_inspection.custom_accepted_quantity = log.completed_qty or 0
                quality_inspection.inspected_by = frappe.session.user

                quality_inspection.save(ignore_permissions=True)
                frappe.msgprint(f"✅ Created Quality Inspection for time log: {log.name}")
            except Exception as e:
                frappe.throw(f"❌ Error creating Quality Inspection for log {log.name}: {e}")
        else:
            # 🔄 Update existing Quality Inspection
            try:
                qi = frappe.get_doc("Quality Inspection", existing_qi_name)
                qi.custom_accepted_quantity = log.completed_qty or 0
                qi.inspected_by = frappe.session.user
                qi.save(ignore_permissions=True)
                frappe.msgprint(f"🔄 Updated Quality Inspection for time log: {log.name}")
            except Exception as e:
                frappe.throw(f"❌ Error updating Quality Inspection for log {log.name}: {e}")

 
@frappe.whitelist()
def received_qty(bom_no, operation=None):
    if not bom_no:
        frappe.throw("Please provide BOM No")

    bom = frappe.get_doc("BOM", bom_no)

    if not bom.operations:
        frappe.throw(f"No Operation child table data for BOM {bom_no}")

    first_operation = sorted(bom.operations, key=lambda op: op.idx)[0].operation

    
    if operation == first_operation:
        return {"is_first_operation": True, "operation": first_operation}
    else:
        return {"is_first_operation": False, "operation": first_operation}
    
def validate_bom_qty(self, method):

    if self.custom_received_qty is not None and self.total_completed_qty is not None:
        try:
            custom_received_qty = float(self.custom_received_qty)
            total_completed_qty = float(self.total_completed_qty)

            if custom_received_qty >= 0 and total_completed_qty >= 0:
                if custom_received_qty < total_completed_qty:
                    frappe.throw("Received Quantity cannot be less than Completed Quantity.")
        except ValueError:
            frappe.throw("Received Quantity and Completed Quantity must be numbers.")

