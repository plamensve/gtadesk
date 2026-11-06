import test from "node:test";
import assert from "node:assert/strict";
import {fetchDeliveryPdf,removeDeliveryPdf} from "../assets/js/delivery-documents.js";

const doc={id:"doc-a",storage_path:"declaration/123/file.pdf",filename:"file.pdf"};

test("Preview obtains PDF using the private authenticated Storage download",async()=>{
  const calls=[],blob=new Blob(["pdf"],{type:"application/pdf"});
  const client={storage:{from(bucket){calls.push(["bucket",bucket]);return {async download(path){calls.push(["download",path]);return {data:blob,error:null};}}}}};
  assert.equal(await fetchDeliveryPdf(client,doc),blob);
  assert.deepEqual(calls,[["bucket","gta-delivery-pdfs"],["download",doc.storage_path]]);
});

test("Deletion removes Storage object and its metadata",async()=>{
  const calls=[];
  const client={
    storage:{from(bucket){calls.push(["bucket",bucket]);return {async remove(paths){calls.push(["storage-delete",paths]);return {data:paths,error:null};}}}},
    from(table){calls.push(["table",table]);return {delete(){calls.push(["db-delete"]);return {eq(k,id){calls.push(["match",k,id]);return {select(){return {async single(){calls.push(["db-confirm"]);return {data:{id:doc.id},error:null};}}}}}}}}}
  };
  assert.equal(await removeDeliveryPdf(client,doc),"doc-a");
  assert.deepEqual(calls,[["bucket","gta-delivery-pdfs"],["storage-delete",[doc.storage_path]],["table","gta_delivery_documents"],["db-delete"],["match","id","doc-a"],["db-confirm"]]);
});

test("Storage failure stops deletion before metadata changes",async()=>{
  let touchedDatabase=false;
  const client={storage:{from(){return {async remove(){return {error:{message:"forbidden"}}}}}},from(){touchedDatabase=true;throw Error("Unexpected database call");}};
  await assert.rejects(removeDeliveryPdf(client,doc),/forbidden/);
  assert.equal(touchedDatabase,false);
});

test("Missing metadata deletion confirmation produces an actionable error",async()=>{
  const client={
    storage:{from(){return {async remove(){return {error:null}}}}},
    from(){return {delete(){return {eq(){return {select(){return {async single(){return {data:null,error:{message:"row missing"}}}}}}}}}}}
  };
  await assert.rejects(removeDeliveryPdf(client,doc),/Повтори изтриването/);
});
