import test from "node:test";
import assert from "node:assert/strict";
import {previewDeclarationDeletion,deleteDeclarationMetadata,cleanupDeletedPdfFiles} from "../assets/js/declaration-delete.js";

const rows=[
 {id:"a",declaration_no:"186",invoice_no:"700",invoice_date:"2026-11-02"},
 {id:"b",declaration_no:"186",invoice_no:"701",invoice_date:"2026-11-02"},
 {id:"foreign",declaration_no:"123",invoice_no:"700",invoice_date:"2026-11-02"}
];
const deliveryDocs=[
 {delivery_id:"a",filename:"арк.pdf"},
 {declaration_no:"186",document_kind:"supporting",filename:"съпътстващ.pdf"},
 {declaration_no:"186",document_kind:"analysis",filename:"анализ.pdf"},
 {delivery_id:"foreign",filename:"чужд.pdf"}
];
const invoiceDocs=[
 {invoice_no:"700",invoice_date:"2026-11-02",filename:"обща-фактура.pdf"},
 {invoice_no:"701",invoice_date:"2026-11-02",filename:"само-186.pdf"},
 {invoice_no:"700",invoice_date:"2026-11-03",filename:"друга-дата.pdf"}
];
test("Delete preview counts direct ARK/declaration/analysis PDFs but preserves shared invoices",()=>{
 const v=previewDeclarationDeletion("186",rows,deliveryDocs,invoiceDocs);
 assert.deepEqual(v,{deliveries:2,deliveryDocuments:3,invoiceDocumentsToDelete:1,sharedInvoiceDocumentsRetained:1,filesToDelete:4});
});
test("Delete preview never deletes invoice files without a complete matching number and date",()=>{
 const v=previewDeclarationDeletion("186",[{id:"a",declaration_no:"186",invoice_no:"700"}],[],invoiceDocs);
 assert.equal(v.invoiceDocumentsToDelete,0);
});
test("Database deletion RPC passes only the declaration number",async()=>{
 const args=[];
 const client={rpc:async(name,data)=>{args.push([name,data]);return {data:{declaration_no:"186",deleted_deliveries:2,queued_paths:[]},error:null};}};
 const result=await deleteDeclarationMetadata(client,"186");
 assert.equal(result.deleted_deliveries,2);
 assert.deepEqual(args,[["gta_delete_declaration",{p_declaration_no:"186"}]]);
});
test("File cleanup removes from private storage before clearing persistent queue",async()=>{
 const calls=[];
 const client={
  storage:{from(bucket){calls.push(["bucket",bucket]);return {async remove(paths){calls.push(["storage",paths]);return {error:null};}}}},
  from(table){calls.push(["table",table]);return {delete(){return {in(field,items){calls.push(["ack",field,items]);return {async select(){return {data:items.map(storage_path=>({storage_path})),error:null};}}}}}}}
 };
 const progress=[];
 const x=await cleanupDeletedPdfFiles(client,["a.pdf","b.pdf"]);
 assert.deepEqual(x,{cleaned:2,failed:0,errors:[]});
 assert.deepEqual(calls,[["bucket","gta-delivery-pdfs"],["storage",["a.pdf","b.pdf"]],["table","gta_pdf_cleanup_queue"],["ack","storage_path",["a.pdf","b.pdf"]]]);
});
test("Storage deletion failures preserve cleanup queue for later retries",async()=>{
 let ackCalled=false;
 const client={storage:{from(){return {async remove(){return {error:{message:"network error"}};}}}},from(){ackCalled=true;throw Error("queue must not be acknowledged");}};
 const result=await cleanupDeletedPdfFiles(client,["failed.pdf"]);
 assert.equal(result.cleaned,0);
 assert.equal(result.failed,1);
 assert.equal(ackCalled,false);
 assert.match(result.errors[0],/network error/);
});
test("Pending cleanup retries queue entries without impacting the database records",async()=>{
 const operations=[];
 const client={
  storage:{from(){return {async remove(p){operations.push(["remove",p]);return {error:null};}}}},
  from(table){
   assert.equal(table,"gta_pdf_cleanup_queue");
   return {
    select(){return {order(){return {async limit(){return {data:[{storage_path:"leftover.pdf"}],error:null};}}}}},
    delete(){return {in(_field,paths){return {async select(){return {data:paths.map(storage_path=>({storage_path})),error:null};}}}}}
   };
  }
 };
 const r=await cleanupDeletedPdfFiles(client);
 assert.equal(r.cleaned,1);
 assert.deepEqual(operations,[["remove",["leftover.pdf"]]]);
});
