from __future__ import unicode_literals
import frappe
from frappe import _
from frappe.utils import flt, cint
from frappe import safe_eval
from frappe.utils import (
	ceil,
	floor,
	getdate,
    get_link_to_form
)
from datetime import date

def before_save(self,method):
    for i in self.items:
        if i.custom_type == 'Actual' and i.custom_formula:
            i.qty = calculate_formula(i.custom_formula,self,i)
        elif i.custom_type == 'On Previous Row Qty':
            prev_row = self.items[int(i.custom_reference_row_) - 1]
            i.qty = calculate_formula(i.custom_formula,self,prev_row)
def throw_error_message(row, error, title, description=None):
	data = frappe._dict(
		{
			"doctype": row.parenttype,
			"name": row.parent,
			"doclink": get_link_to_form(row.parenttype, row.parent),
			"row_id": row.idx,
			"error": error,
			"title": title,
			"description": description or "",
		}
	)

	message = _(
		"Error while evaluating the {doctype} {doclink} at row {row_id}. <br><br> <b>Error:</b> {error} <br><br> <b>Hint:</b> {description}"
	).format(**data)

	frappe.throw(message, title=title)

def calculate_formula(formula,self,row):
    whitelisted_globals = {
        "int": int,
        "float": float,
        "long": int,
        "round": round,
        "date": date,
        "getdate": getdate,
        "ceil": ceil,
        "floor": floor,
    }

    data = frappe._dict()
    data.update(row.as_dict())
    data.update(self.as_dict())      
    try:
        formula = sanitize_expression(formula)
        if formula:
            amount = flt(
                safe_eval(formula, whitelisted_globals, data)
                )
        return amount
    except:
        frappe.throw(title="Raw Materials Formula Error", msg=f"<b>Row {row.idx}#:</b> Please check the Formula")

def sanitize_expression(string: str | None = None) -> str | None:
	if not string:
		return None

	parts = string.strip().splitlines()
	string = " ".join(parts)

	return string
