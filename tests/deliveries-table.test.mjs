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
    selectedRowId:null,
    safe:value=>String(value??""),
    prettyDate:value=>value??"—",
    usage:()=>"unused",
    usageLabel:()=>"Неизползван"
  });
  const record={id:"delivery-1",ark:"26BG000000000982636S9",invoice_no:"7001301629",declaration_no:"165",quantity_liters:31986,tractor:"CE8708EH",tanker:"CE7996XT",notes:"",is_locked:false};
  const row=renderer(record,1);
  const inputs=[...row.matchAll(/<input\b[^>]*>/g)].map(m=>m[0]);
  assert.equal(inputs.length,3,"Three inline edit fields expected");
  for(const input of inputs){
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
    documents:[],selectedRowId:null,safe:value=>String(value??""),
    prettyDate:()=> "—",usage:()=> "unused",usageLabel:()=> "Неизползван"
  });
  const row=renderer({id:"delivery-2",ark:"26BG000000000982636S9",declaration_no:"123",is_locked:true},2);
  const inputs=[...row.matchAll(/<input\b[^>]*>/g)].map(m=>m[0]);
  assert.equal(inputs.length,3);
  assert.ok(inputs.every(tag=>tag.includes(" disabled ")),"All edit fields must be disabled for locked deliveries");
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
