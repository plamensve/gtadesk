/** Canonical invoice reference: document sharing requires BOTH number and date. */
export function invoiceKey(number,date){
 const normalized=String(number??"").trim();
 const day=String(date??"").slice(0,10);
 return normalized&&/^\d{4}-\d{2}-\d{2}$/.test(day)?JSON.stringify([normalized,day]):"";
}
export function documentsForInvoice(docs,record){
 const key=invoiceKey(record.invoice_no,record.invoice_date);
 return key?docs.filter(d=>invoiceKey(d.invoice_no,d.invoice_date)===key):[];
}
export function invoiceDisplay(record){
 const no=String(record.invoice_no??"").trim();
 const day=String(record.invoice_date??"").slice(0,10);
 return no?(invoiceKey(no,day)?no+"/"+day.slice(8,10)+"."+day.slice(5,7)+"."+day.slice(0,4):no):"—";
}
