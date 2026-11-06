import test from "node:test";
import assert from "node:assert/strict";
import {invoiceKey,documentsForInvoice,invoiceDisplay} from "../assets/js/invoice-documents.js";
test("Invoice number and date form the unique sharing key",()=>{
 const docs=[{invoice_no:"70000012312",invoice_date:"2026-10-11",filename:"invoice.pdf"},
 {invoice_no:"70000012312",invoice_date:"2026-10-12",filename:"different-date.pdf"},
 {invoice_no:"70000012313",invoice_date:"2026-10-11",filename:"different-number.pdf"}];
 assert.equal(documentsForInvoice(docs,{invoice_no:"70000012312",invoice_date:"2026-10-11"}).length,1);
 assert.equal(documentsForInvoice(docs,{invoice_no:"70000012312",invoice_date:null}).length,0);
 assert.equal(invoiceKey(" 70000012312 ","2026-10-11"),invoiceKey("70000012312","2026-10-11"));
 assert.equal(invoiceDisplay({invoice_no:"70000012312",invoice_date:"2026-10-11"}),"70000012312/11.10.2026");
 assert.equal(invoiceDisplay({invoice_no:"70000012312"}),"70000012312");
});
