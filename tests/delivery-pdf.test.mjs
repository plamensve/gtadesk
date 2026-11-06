import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import {
  prepareCustomsBundle,
  mergeCustomsPdfs,
  renderDeliveryCoverPng,
  customsPdfFileName
} from "../assets/js/delivery-pdf.js";

const first={id:"row-a",ark:"26BG000000000982636S9",declaration_no:"123",invoice_no:"7001301629",delivered_on:"2026-10-15",quantity_liters:29629,tractor:"CE8708EH",tanker:"CE7996XT",counterparty:"Бургас",destination:"Русе",usage_status:"used",notes:""};
const second={id:"row-b",ark:"26BG000000000982637S1",declaration_no:"123",quantity_liters:29439};
const other={id:"row-c",declaration_no:"124",ark:"26BG000000000982638S2"};

test("A selected delivery produces a customs bundle even without any uploaded PDFs",()=>{
  const bundle=prepareCustomsBundle([first,second],[],new Set(["row-a"]));
  assert.equal(bundle.declarationNo,"123");
  assert.deepEqual(bundle.rows.map(r=>r.id),["row-a"]);
  assert.equal(bundle.documents.length,0);
  assert.equal(bundle.rowsWithoutDocuments,1);
  assert.equal(bundle.rowDocumentCount,0);
  assert.equal(bundle.declarationDocumentCount,0);
});

test("Only selected rows and declaration-wide documents are included",()=>{
  const declaration={id:"doc-decl",declaration_no:"123",filename:"declaration.pdf",created_at:"2026-01-01"};
  const own={id:"doc-a",delivery_id:"row-a",filename:"a.pdf",created_at:"2026-02-01"};
  const excluded={id:"doc-b",delivery_id:"row-b",filename:"b.pdf"};
  const foreign={id:"doc-other",declaration_no:"124",filename:"other.pdf"};
  const bundle=prepareCustomsBundle([first,second,other],[declaration,own,excluded,foreign],new Set(["row-a"]));
  assert.deepEqual(bundle.documents.map(d=>d.id),["doc-decl","doc-a"]);
  assert.equal(bundle.rowsWithoutDocuments,0);
  assert.equal(bundle.selectedCount,1);
  assert.throws(()=>prepareCustomsBundle([first,other],[],new Set(["row-a","row-c"])),/една декларация/);
});

function fakePdfFactory(events){
  return {
    async create(){
      return {
        async embedPng(png){events.push("embed:"+png);return {width:1190,height:1684};},
        addPage(arg){
          events.push(Array.isArray(arg)?"summary":"attachment");
          return {drawImage(){events.push("draw");}};
        },
        async copyPages(_pdf,indices){return indices.map(()=>({fromAttachment:true}));},
        async save(){events.push("save");return new Uint8Array([37,80,68,70]);}
      };
    },
    async load(arrayBuffer){
      assert.ok(arrayBuffer instanceof ArrayBuffer);
      events.push("parse");
      return {getPageIndices(){return [0];}};
    }
  };
}
const fakeDownload=(_doc)=>({arrayBuffer:async()=>new ArrayBuffer(16)});
const fakePng=async row=>"png-for-"+row.id;

test("No uploads: merged PDF still contains the selected delivery's information page",async()=>{
  const bundle=prepareCustomsBundle([first],[],new Set(["row-a"]));
  const events=[],updates=[];
  const bytes=await mergeCustomsPdfs(bundle,async()=>{throw Error("Must not download files when none exist");},fakePdfFactory(events),(done,total)=>updates.push([done,total]),fakePng);
  assert.deepEqual([...bytes],[37,80,68,70]);
  assert.deepEqual(events,["embed:png-for-row-a","summary","draw","save"]);
  assert.deepEqual(updates,[[1,1]]);
});

test("Uploaded declaration PDFs appear before row summaries and row-specific PDFs",async()=>{
  const documents=[
    {id:"d",declaration_no:"123",filename:"declaration.pdf"},
    {id:"a",delivery_id:"row-a",filename:"ark-a.pdf"},
    {id:"b",delivery_id:"row-b",filename:"ark-b.pdf"}
  ];
  const bundle=prepareCustomsBundle([first,second],documents,new Set(["row-a","row-b"]));
  const events=[],updates=[];
  const bytes=await mergeCustomsPdfs(bundle,async doc=>{
    events.push("download:"+doc.filename);
    return fakeDownload(doc);
  },fakePdfFactory(events),(done,total)=>updates.push([done,total]),fakePng);
  assert.deepEqual([...bytes],[37,80,68,70]);
  assert.deepEqual(events,[
    "download:declaration.pdf","parse","attachment",
    "embed:png-for-row-a","summary","draw",
    "download:ark-a.pdf","parse","attachment",
    "embed:png-for-row-b","summary","draw",
    "download:ark-b.pdf","parse","attachment","save"
  ]);
  assert.deepEqual(updates,[[1,5],[2,5],[3,5],[4,5],[5,5]]);
});

test("Cover page includes Bulgarian delivery labels and saved values",()=>{
  const texts=[];
  const ctx={
    fillStyle:"",font:"",textBaseline:"",
    fillRect(){},
    fillText(label){texts.push(label);},
    measureText(label){return {width:String(label).length*12};}
  };
  const png=renderDeliveryCoverPng(first,{index:1,total:1},()=>({
    getContext:()=>ctx,
    toDataURL:()=>"data:image/png;base64,AAAA"
  }));
  assert.equal(png,"data:image/png;base64,AAAA");
  assert.ok(texts.some(x=>x.includes("ИНФОРМАЦИЯ ЗА ДОСТАВКА")));
  assert.ok(texts.includes(first.ark));
  assert.ok(texts.includes(first.invoice_no));
  assert.ok(texts.includes("ВЛЕКАЧ"));
  assert.ok(texts.includes("ЦИСТЕРНА"));
  assert.ok(texts.includes("ИЗПОЛЗВАН")===false); // Status value remains human-readable case.
  assert.ok(texts.includes("Използван"));
});

test("Download filename includes declaration number",()=>{
  assert.equal(customsPdfFileName("123"),"Украинска_митница_декларация_123.pdf");
});

test("Matching invoice PDF is included once for multiple selected deliveries with the same number and date",async()=>{
 const sharedInvoice={id:"invoice-1",invoice_no:"7001301629",invoice_date:"2026-10-11",filename:"invoice.pdf"};
 const otherDay={id:"invoice-2",invoice_no:"7001301629",invoice_date:"2026-10-12",filename:"wrong-date.pdf"};
 const a={...first,invoice_date:"2026-10-11"};
 const b={...second,invoice_no:"7001301629",invoice_date:"2026-10-11"};
 const bundle=prepareCustomsBundle([a,b],[],new Set(["row-a","row-b"]),[sharedInvoice,otherDay]);
 assert.deepEqual(bundle.documents.map(d=>d.id),["invoice-1"]);
 assert.equal(bundle.invoiceDocumentsByRowId.get("row-a").length,1);
 assert.equal(bundle.invoiceDocumentsByRowId.get("row-b").length,0);
 const events=[],progress=[];
 await mergeCustomsPdfs(bundle,async doc=>{events.push("download:"+doc.filename);return fakeDownload(doc);},fakePdfFactory(events),(done,total)=>progress.push([done,total]),fakePng);
 assert.deepEqual(events,[
  "embed:png-for-row-a","summary","draw","download:invoice.pdf","parse","attachment",
  "embed:png-for-row-b","summary","draw","save"
 ]);
 assert.deepEqual(progress,[[1,3],[2,3],[3,3]]);
});

test("PDF cover dates use DD/MM/YYYY",()=>{
 const source=readFileSync(new URL("../assets/js/delivery-pdf.js",import.meta.url),"utf8");
 assert.match(source,/formatDateDMY\(date\)/);
});
