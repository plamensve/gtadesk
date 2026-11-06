import test from "node:test";
import assert from "node:assert/strict";
import {planDeclarationArchive,createDeclarationZip,sortDeliveryRows,declarationZipFileName} from "../assets/js/declaration-archive.js";

const rows=[
 {id:"a",ark:"26BG123",declaration_no:"186",invoice_no:"001",invoice_date:"2026-11-01",created_at:"2026-11-04T09:00:00Z"},
 {id:"b",ark:"26BG456",declaration_no:"186",invoice_no:"001",invoice_date:"2026-11-01",created_at:"2026-11-04T08:00:00Z"},
 {id:"other",ark:"26BG999",declaration_no:"185",created_at:"2026-11-05"}
];
const docs=[
 {id:"decl",declaration_no:"186",document_kind:"supporting",filename:"Съпътстващ.pdf"},
 {id:"analysis",declaration_no:"186",document_kind:"analysis",filename:"Анализ.pdf"},
 {id:"ark-a",delivery_id:"a",filename:"Транспорт.pdf"},
 {id:"other",delivery_id:"other",filename:"Чужд.pdf"}
];
const invoices=[{invoice_no:"001",invoice_date:"2026-11-01",filename:"Фактура.pdf",id:"invoice"}];

test("Archive includes declaration attachments, analysis, and all ARK folders with matching invoices",()=>{
 const plan=planDeclarationArchive("186",rows,docs,invoices);
 assert.equal(plan.root,"Декларация 186");
 assert.ok(plan.dirs.includes("Декларация 186/26BG123/"));
 assert.ok(plan.dirs.includes("Декларация 186/26BG456/"));
 assert.deepEqual(plan.entries.map(x=>x.path),[
 "Декларация 186/Придружаващи документи/Съпътстващ.pdf",
 "Декларация 186/Анализ/Анализ.pdf",
 "Декларация 186/26BG123/Транспорт.pdf",
 "Декларация 186/26BG123/Фактура.pdf",
 "Декларация 186/26BG456/Фактура.pdf"
 ]);
 assert.equal(plan.deliveryCount,2);
});
test("Archive preserves empty ARK folders and ignores foreign declarations",()=>{
 const plan=planDeclarationArchive("186",rows,[],[]);
 assert.equal(plan.entries.length,0);
 assert.equal(plan.dirs.length,5);
});
test("Archive sanitizes unsafe paths and handles duplicate filenames without overwriting",()=>{
 const p=planDeclarationArchive("18/6",[
  {id:"1",ark:"../ARK",declaration_no:"18/6"}
 ],[{delivery_id:"1",filename:"a.pdf"},{delivery_id:"1",filename:"a.pdf"}],[]);
 assert.ok(p.entries.every(e=>!e.path.includes("../")));
 assert.notEqual(p.entries[0].path,p.entries[1].path);
});
test("ZIP generation includes each planned file from protected storage and reports progress",async()=>{
 const events=[];
 class Zip {
  folder(path){events.push(["dir",path]);return this;}
  file(path,blob){events.push(["file",path,blob]);}
  async generateAsync(config){events.push(["zip",config.type]);return new Blob(["PK"]);}
 }
 const plan=planDeclarationArchive("186",rows,docs,invoices);
 const report=[];
 const blob=await createDeclarationZip(plan,async d=>new Blob([d.id||"file"]),Zip,(a,b)=>report.push([a,b]));
 assert.equal(blob.size,2);
 assert.equal(events.filter(x=>x[0]==="file").length,5);
 assert.deepEqual(report.at(-1),[5,5]);
 assert.equal(declarationZipFileName("186"),"Декларация 186.zip");
});
test("Sort by invoice date descending, then most recently entered record",()=>{
 const data=[
 {id:"1",invoice_date:"2026-10-31",created_at:"2026-11-02"},
 {id:"2",invoice_date:"2026-11-01",created_at:"2026-11-02"},
 {id:"3",invoice_date:"2026-11-01",created_at:"2026-11-03"},
 {id:"4",invoice_date:null,created_at:"2026-11-06"}
 ];
 assert.deepEqual([...data].sort(sortDeliveryRows).map(x=>x.id),["3","2","1","4"]);
});
