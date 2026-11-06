import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const js=readFileSync(new URL("../assets/js/deliveries.js",import.meta.url),"utf8");
const html=readFileSync(new URL("../deliveries.html",import.meta.url),"utf8");

test("Delivery table declares its own stylesheet target",()=>{
  assert.match(html,/<table id="records-table">/);
});

test("Inline editor markup stays valid and PDF indicators stay in action cells",()=>{
  const start=js.indexOf("function rowHtml(r,number){");
  const end=js.indexOf("function renderRows(){",start);
  assert.ok(start>=0&&end>start,"Row renderer must exist");
  const renderer=runInNewContext(js.slice(start,end)+";rowHtml",{
    documents:[{delivery_id:"delivery-1"}],
    invoiceDocuments:[],
    documentsForInvoice:()=>[],
    invoiceDisplay:record=>record.invoice_no||"—",
    declarationDateOf:()=>"",
    selectedRowId:null,
    selectedDeliveryIds:new Set(),
    safe:value=>String(value??""),
    prettyDate:value=>value??"—",
    visibleNote:r=>String(r.notes??""),
    usage:()=>"unused",
    usageLabel:()=>"Неизползван"
  });
  const record={id:"delivery-1",ark:"26BG000000000982636S9",invoice_no:"7001301629",declaration_no:"165",quantity_liters:31986,tractor:"CE8708EH",tanker:"CE7996XT",notes:"",is_locked:false};
  const row=renderer(record,1);
  const inputs=[...row.matchAll(/<input\b[^>]*>/g)].map(m=>m[0]);
  assert.equal(inputs.length,4,"Three inline editors and one selection checkbox expected");
  const editors=inputs.filter(input=>input.includes('class="inline-field'));
  assert.equal(editors.length,3);
  for(const input of editors){
    assert.doesNotMatch(input,/<span/i,"Markup must not be embedded inside input attributes");
    assert.doesNotMatch(input,/doc-indicator|📎/);
  }
  assert.match(row,/<td class="actions-cell">[\s\S]*row-doc-dot has-docs[\s\S]*<\/td>/);
  assert.equal((row.match(/class="row-doc-dot/g)||[]).length,1,"Exactly one document indicator per row");
});

test("Locked delivery fields remain disabled",()=>{
  const start=js.indexOf("function rowHtml(r,number){");
  const end=js.indexOf("function renderRows(){",start);
  const renderer=runInNewContext(js.slice(start,end)+";rowHtml",{
    documents:[],invoiceDocuments:[],documentsForInvoice:()=>[],invoiceDisplay:r=>r.invoice_no||"—",declarationDateOf:()=>"",selectedRowId:null,selectedDeliveryIds:new Set(),safe:value=>String(value??""),
    prettyDate:()=> "—",visibleNote:r=>String(r.notes??""),usage:()=> "unused",usageLabel:()=> "Неизползван"
  });
  const row=renderer({id:"delivery-2",ark:"26BG000000000982636S9",declaration_no:"123",is_locked:true},2);
  const inputs=[...row.matchAll(/<input\b[^>]*>/g)].map(m=>m[0]);
  const editors=inputs.filter(input=>input.includes('class="inline-field'));
  const selection=inputs.filter(input=>input.includes('class="delivery-select'));
  assert.equal(editors.length,3);
  assert.equal(selection.length,1);
  assert.ok(editors.every(tag=>tag.includes(" disabled ")),"All editing fields must be disabled for locked deliveries");
  assert.ok(!selection[0].includes(" disabled "), "Locked deliveries remain selectable for PDF export");
});

test("Sofia clock is in the delivery header, not the sidebar",()=>{
  const header=html.slice(html.indexOf('<header class="top">'),html.indexOf('</header>')+9);
  assert.match(header,/gta-clock-deliveries/);
  assert.doesNotMatch(html,/gta-sidebar-clock-wrap/);
});
test("Imported worksheet notes are hidden, manually written notes remain visible",()=>{
  const start=js.indexOf("function visibleNote("),end=js.indexOf("function groups()",start);
  assert.ok(start>=0&&end>start);
  const visibleNote=runInNewContext(js.slice(start,end)+";visibleNote");
  const imported={notes:"H=CE7802EE; I=2.11",source_sheet:"186",source_row:5,source_extra:{workbook:"original.xls"}};
  assert.equal(visibleNote(imported),"");
  assert.equal(visibleNote({...imported,notes:"Моля, проверете фактурата."}),"Моля, проверете фактурата.");
  assert.equal(visibleNote({...imported,source_extra:{...imported.source_extra,notes_edited:true}}),imported.notes);
});
test("Declaration cards use a separate document badge in the right column",()=>{
  assert.match(js,/group-card-main/);
  assert.match(js,/group-card-docs/);
});

test("Clicking a declaration PDF badge opens its documents without changing selection",()=>{
  const start=js.indexOf('\\$("group-list").addEventListener("click"'.replace('\\$','$'));
  const end=js.indexOf('\\$("group-list").addEventListener("contextmenu"'.replace('\\$','$'),start);
  assert.ok(start>=0&&end>start);
  const scope={
    activeDeclaration:"121",currentPage:2,selectedDeliveryIds:new Set(),
    opened:null,renderCalls:0,resetCalls:0,
    $:()=>({addEventListener:(_,cb)=>{scope.click=cb;}}),
    openDocs:target=>{scope.opened=target;},
    render:()=>{scope.renderCalls++;},
    formReset:()=>{scope.resetCalls++;}
  };
  runInNewContext(js.slice(start,end),scope);
  const card={dataset:{declaration:"123"}};
  const pdfEvent={target:{closest:selector=>selector==="[data-declaration]"?card:selector===".group-card-docs"?{}:null},preventDefault(){this.prevented=true;}};
  scope.click(pdfEvent);
  assert.equal(scope.opened.type,"group");
  assert.equal(scope.opened.name,"123");
  assert.equal(scope.activeDeclaration,"121");
  assert.equal(scope.renderCalls,0);
  assert.equal(scope.resetCalls,0);
  const cardEvent={target:{closest:selector=>selector==="[data-declaration]"?card:null},preventDefault(){}};
  scope.click(cardEvent);
  assert.equal(scope.activeDeclaration,"123");
  assert.equal(scope.renderCalls,1);
  assert.equal(scope.resetCalls,1);
});

test("Declaration status space is reserved for used and unused cards",()=>{
  const start=js.indexOf("function renderGroups(){");
  const end=js.indexOf("function rowHtml(",start);
  assert.ok(start>=0&&end>start);
  const source=js.slice(start,end);
  assert.match(source,/group-status-slot/);
  assert.match(source,/used-label-placeholder/);
  assert.match(source,/aria-hidden="true"/);
});

test("Actions column stays pinned to the table edge",()=>{
  const css=readFileSync(new URL("../assets/css/deliveries.css",import.meta.url),"utf8");
  assert.match(css,/scrollbar-gutter:auto/);
  assert.match(css,/#records-table th\.actions-heading,#records-table td\.actions-cell\s*\{[\s\S]*?position:sticky;right:0/);
});

test("Customs selection checkboxes are inside the row-number column",()=>{
  const source=js.slice(js.indexOf("function rowHtml("),js.indexOf("function renderRows("));
  assert.match(source,/data-export-select/);
  assert.match(source,/delivery-check-ui/);
  assert.match(source,/row-export-selected/);
});
test("Customs export controls and pinned pdf-lib are present",()=>{
  assert.match(html,/id="customs-export"/);
  assert.match(html,/Свали документи за украинска митница/);
  assert.match(html,/pdf-lib@1\.17\.1/);
  assert.match(js,/prepareCustomsBundle/);
  assert.match(js,/mergeCustomsPdfs/);
});

test("Delivery date uses a compact, fixed-width table column",()=>{
  const css=readFileSync(new URL("../assets/css/deliveries.css",import.meta.url),"utf8");
  assert.match(css,/#records-table th:nth-child\(2\),#records-table td:nth-child\(2\)\s*\{[\s\S]*?width:104px/);
});
test("PDF document manager has preview, download and delete actions",()=>{
  assert.match(html,/id="docs-preview"/);
  assert.match(html,/id="docs-preview-frame"/);
  assert.match(html,/id="docs-preview-close"/);
  assert.match(js,/previewDeliveryPdf/);
  assert.match(js,/removeDeliveryPdf/);
  assert.match(js,/window\.confirm/);
  assert.match(js,/resetDocPreview/);
  assert.match(js,/await loadDocs\(\);render\(\);renderDocs\(\)/);
});

test("Invoice field includes invoice date and paperclip upload action",()=>{
 assert.match(html,/name="invoice_date" type="date"/);
 const source=js.slice(js.indexOf("function rowHtml("),js.indexOf("function renderRows("));
 assert.match(source,/invoiceDisplay\(r\)/);
 assert.match(source,/data-invoice-docs/);
 assert.match(source,/invoice-attach-trigger/);
 assert.match(js,/gta_invoice_documents/);
});

test("Declaration date is available in the form and next to declaration number",()=>{
 assert.match(html,/name="declaration_date" type="date"/);
 const block=js.slice(js.indexOf("function rowHtml("),js.indexOf("function renderRows("));
 assert.match(block,/decl-date-inline/);
 assert.match(block,/declarationDateOf\(r.declaration_no\)/);
 assert.doesNotMatch(html,/id="declaration-date-dialog"/);
 assert.match(js,/persistDeclarationDate/);
});
test("Declaration cards offer PDF, analysis and ZIP actions without a date button",()=>{
 const block=js.slice(js.indexOf("function renderGroups("),js.indexOf("function rowHtml("));
 for(const selector of ["data-group-docs","data-group-analysis","data-group-archive"]){
  assert.ok(block.includes(selector),selector);
 }
 assert.match(block,/group-status-slot/);
 assert.doesNotMatch(block,/data-group-date/);
 assert.match(block,/declaration-card-date/);
});
test("Separate declaration analysis uses a document_kind discriminator",()=>{
 assert.match(js,/document_kind:t.type==="analysis"\?"analysis":"supporting"/);
 assert.match(js,/target.type==="analysis"\?d.document_kind==="analysis"/);
 assert.match(js,/createDeclarationZip/);
 assert.match(html,/jszip@3\.10\.1/);
});

test("Declaration cards fill their grid columns and keep the previous low profile",()=>{
  const css=readFileSync(new URL("../assets/css/deliveries.css",import.meta.url),"utf8");
  const block=css.slice(css.indexOf("/* Declarational workspace: fixed card geometry"),css.indexOf("/* Invoice: remove unused gap"));
  assert.match(block,/body\.gta-deliveries-page \.group-list \.group-card\{[\s\S]*?width:100%;min-width:0;max-width:none/);
  assert.match(block,/height:112px;min-height:112px;max-height:112px/);
  assert.match(block,/group-card\[data-declaration=""\]/);
  assert.match(block,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(block,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.doesNotMatch(block,/width:calc\(\(100% - 30px\)\/4\)/);
});

test("Upload actions use the hand cursor on hover",()=>{
  const css=readFileSync(new URL("../assets/css/deliveries.css",import.meta.url),"utf8");
  assert.match(css,/\.group-card-operations button,[\s\S]*?#docs-upload,[\s\S]*?cursor:pointer/);
  assert.match(css,/file-selector-button/);
});
