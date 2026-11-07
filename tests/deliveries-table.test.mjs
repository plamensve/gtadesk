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
  assert.match(row,/data-ark-docs="delivery-1"/);
  assert.match(row,/class="ark-doc-trigger has-docs"/);
  assert.match(row,/class="ark-doc-count">1/);
  assert.doesNotMatch(row,/row-doc-dot/);
  assert.match(row,/<td class="actions-cell">[\s\S]*row-actions-trigger[\s\S]*<\/td>/);
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

test("Actions column does not cover Status or Notes divider",()=>{
  const css=readFileSync(new URL("../assets/css/deliveries.css",import.meta.url),"utf8");
  assert.match(css,/scrollbar-gutter:auto/);
  assert.match(css,/#records-table th\.actions-heading,#records-table td\.actions-cell\s*\{[\s\S]*?position:static;right:auto/);
  assert.match(css,/tbody td\.actions-cell\{[\s\S]*?position:static!important/);
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

test("Declaration cards use uniform typography, consistent spacing and equal-size actions",()=>{
  const css=readFileSync(new URL("../assets/css/deliveries.css",import.meta.url),"utf8");
  const block=css.slice(css.indexOf("/* Unified declaration card typography and spacing."));
  assert.ok(block.length>1000);
  assert.match(block,/height:112px;[\s\S]*?min-height:112px;[\s\S]*?max-height:112px/);
  assert.match(block,/grid-template-rows:17px repeat\(3,14px\) 19px/);
  assert.match(block,/font-size:13px/);
  assert.match(block,/font-size:11px/);
  assert.match(block,/font-variant-numeric:tabular-nums/);
  assert.match(block,/\.group-card-operations > \.group-card-docs,[\s\S]*?\.group-card-operations > \.group-card-analysis\{/);
  assert.match(block,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(block,/grid-template-rows:30px 30px/);
  assert.match(block,/width:100%;[\s\S]*?height:30px/);
  assert.match(block,/\.group-card-archive\{/);
});

test("Declaration removal requires a typed confirmation and tracks Storage cleanup",()=>{
 assert.match(html,/id="group-delete-declaration"/);
 assert.match(html,/id="delete-active-declaration"/);
 assert.match(html,/id="delete-declaration-dialog"/);
 assert.match(html,/id="delete-declaration-confirm"/);
 assert.match(js,/previewDeclarationDeletion/);
 assert.match(js,/deleteDeclarationMetadata/);
 assert.match(js,/runQueuedFileCleanup/);
 assert.match(js,/removed\.queued_paths/);
});
test("ARK PDFs use a separate clickable file badge instead of a dot over row actions",()=>{
 const source=js.slice(js.indexOf("function rowHtml("),js.indexOf("function renderRows("));
 assert.match(source,/ark-doc-trigger/);
 assert.match(source,/data-ark-docs/);
 assert.match(source,/ark-doc-count/);
 assert.doesNotMatch(source,/row-doc-dot/);
 assert.match(js,/openDocs\(\{type:"row",id:arkTrigger.dataset.arkDocs\},\{previewIfSingle:true\}\)/);
});
test("Delivery dates use DD.MM.YYYY in form widgets, tables, Excel exports, and Sofia clock",()=>{
 assert.match(js,/installDayMonthYearInputs\(document\)/);
 assert.match(js,/const prettyDate = date => formatDateDMY\(date\)/);
 assert.match(js,/formatDateDMY\(declarationDateOf\(r.declaration_no\)\)/);
 assert.ok(html.includes('class="gta-clock-date">--.--.----'));
 const css=readFileSync(new URL("../assets/css/deliveries.css",import.meta.url),"utf8");
 assert.match(css,/\.date-display-wrap/);
 assert.match(css,/\.date-native-input/);
});
test("ARK, invoice and declaration numbers use larger consistent typography",()=>{
 const css=readFileSync(new URL("../assets/css/deliveries.css",import.meta.url),"utf8");
 assert.match(css,/\.ark-copy-value\{[\s\S]*?font-size:15px/);
 assert.match(css,/\.invoice-copy-value\{[\s\S]*?font-size:13\.5px/);
 assert.match(css,/\.decl-label\{[\s\S]*?font-size:14px/);
});

test("Status labels keep space before the sticky row actions menu",()=>{
 const css=readFileSync(new URL("../assets/css/deliveries.css",import.meta.url),"utf8");
 const block=css.slice(css.lastIndexOf("/* Clearly separate status labels"));
 assert.ok(block.length>200);
 assert.match(block,/td\.usage-status-cell\{[\s\S]*?padding-right:20px/);
 assert.match(block,/th\.actions-heading,[\s\S]*?td\.actions-cell\{[\s\S]*?width:58px/);
 assert.match(css,/td\.actions-cell\{[\s\S]*?width:46px!important/);
});

test("Upload entry points share the blue document icon and pointer cursor",()=>{
 const css=readFileSync(new URL("../assets/css/deliveries.css",import.meta.url),"utf8");
 const svg=readFileSync(new URL("../assets/document-upload.svg",import.meta.url),"utf8");
 const rows=js.slice(js.indexOf("function rowHtml("),js.indexOf("function renderRows("));
 const groups=js.slice(js.indexOf("function renderGroups("),js.indexOf("function rowHtml("));
 assert.match(svg,/<svg/);
 assert.match(svg,/<path/);
 assert.match(svg,/#[0-9a-fA-F]{6}/);
 assert.match(rows,/document-upload\.svg/);
 assert.match(rows,/ark-doc-trigger/);
 assert.match(rows,/invoice-attach-trigger/);
 assert.match(groups,/document-upload\.svg/);
 assert.match(groups,/group-card-docs/);
 assert.match(groups,/group-card-analysis/);
 assert.match(html,/id="docs-upload"[^>]*><img src="\.\/assets\/document-upload\.svg"/);
 assert.match(css,/#docs-file::file-selector-button\{[\s\S]*?cursor:pointer;/);
 assert.match(css,/#records-table \.ark-doc-trigger,[\s\S]*?cursor:pointer;/);
});

test("Uploaded documents use an eye icon, while empty controls use the yellow folder icon",()=>{
  const folder=readFileSync(new URL("../assets/document-upload.svg",import.meta.url),"utf8");
  const eye=readFileSync(new URL("../assets/document-view.svg",import.meta.url),"utf8");
  const groups=js.slice(js.indexOf("function renderGroups("),js.indexOf("function rowHtml("));
  const rows=js.slice(js.indexOf("function rowHtml("),js.indexOf("function renderRows("));
  assert.match(folder,/#FFB80D/);
  assert.match(folder,/#18CC29/);
  assert.match(eye,/<circle/);
  assert.match(groups,/document-view\.svg/);
  assert.match(rows,/document-view\.svg/);
  assert.match(rows,/document-upload\.svg/);
  assert.match(js,/previewIfSingle/);
});
test("Delivery table has fixed layout with horizontal scrolling for resized columns",()=>{
  const css=readFileSync(new URL("../assets/css/deliveries.css",import.meta.url),"utf8");
  assert.match(css,/table-layout:fixed/);
  assert.match(css,/\.scroll\[aria-label="Регистър доставки"\]\{overflow-x:auto/);
  assert.match(js,/DELIVERY_COLUMN_RATIOS=\[4,7\.5,16\.5,15,12,7,7,5,6\.5,9,7\.5,3\]/);
  assert.doesNotMatch(css,/#records-table tr > :nth-child\(\d+\)\{width:[^\n]*!important/);
});

test("Document action buttons keep labels, icons and borders inside a consistent layout",()=>{
 const css=readFileSync(new URL("../assets/css/deliveries.css",import.meta.url),"utf8");
 const block=css.slice(css.lastIndexOf("/* Control geometry: fit upload/preview icons"));
 assert.ok(block.length>1000);
 assert.match(block,/grid-template-columns:minmax\(0,1fr\) 184px/);
 assert.match(block,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(block,/\.group-card-operations > \.group-card-mini\{[\s\S]*?overflow:hidden/);
 assert.match(block,/\.group-card-upload-label\{[\s\S]*?text-overflow:ellipsis/);
 assert.match(block,/\.document-view-icon\{[\s\S]*?flex:0 0 17px/);
 assert.match(block,/\.ark-doc-trigger,[\s\S]*?height:32px/);
  assert.ok(js.includes("DELIVERY_ACTIONS_WIDTH=46"));
  assert.ok(js.includes("heading.appendChild(grip)"));
  assert.ok(!block.includes("nth-child(12){width:4%!important}"));
});

test("Full Analysis label is never ellipsized and document buttons have sufficient width",()=>{
 const css=readFileSync(new URL("../assets/css/deliveries.css",import.meta.url),"utf8");
 const block=css.slice(css.indexOf('/* Control geometry: fit upload/preview icons'));
 assert.match(block,/grid-template-columns:minmax\(0,1fr\) 184px/);
 assert.match(block,/width:184px;/);
 const final=block.slice(block.indexOf('/* Preserve the full text'));
 assert.match(final,/\.group-card-analysis \.group-card-upload-label/);
 assert.match(final,/overflow:visible/);
 assert.match(final,/text-overflow:clip/);
 assert.match(final,/white-space:nowrap/);
});

test("Different invoices remain selectable inside one declaration, but other declarations clear selection",()=>{
 const selection=js.slice(js.indexOf('const selected=event.target.closest("input[data-export-select]")'),
   js.indexOf('const input=event.target.closest("input[data-field]")'));
 assert.match(selection,/selectedDeliveryIds\.add\(row\.id\)/);
 assert.match(selection,/declaration_no!==row\.declaration_no/);
 assert.match(selection,/selectedDeliveryIds\.clear\(\)/);
 assert.doesNotMatch(selection,/invoice_no!==/);
 const group=js.slice(js.indexOf('$("group-list").addEventListener("click"'),
  js.indexOf('$("group-list").addEventListener("contextmenu"'));
 assert.match(group,/if\(name!==activeDeclaration\)/);
 assert.match(group,/selectedDeliveryIds\.clear\(\)/);
 assert.match(js,/customsPdfFileName\(bundle\.declarationNos\)/);
});

test("ZIP archive download button has its own WinRAR-style vector icon and keeps its label",()=>{
 const css=readFileSync(new URL("../assets/css/deliveries.css",import.meta.url),"utf8");
 const icon=readFileSync(new URL("../assets/archive-download.svg",import.meta.url),"utf8");
 const groups=js.slice(js.indexOf("function renderGroups("),js.indexOf("function rowHtml("));
 assert.match(groups,/data-group-archive/);
 assert.match(groups,/archive-download\.svg/);
 assert.match(groups,/archive-download-label/);
 assert.match(groups,/ZIP ↓/);
 assert.match(css,/\.group-card-archive \.archive-download-icon\{/);
 assert.match(css,/cursor:pointer/);
 assert.match(icon,/<svg/);
 assert.match(icon,/#764D9B/i);
 assert.match(icon,/#2869B4/i);
 assert.match(icon,/#38B69E/i);
});

test("Delivery origin uses the displayed destination field in edit and save",()=>{
  assert.match(html, /id="field-destination" name="destination"/);
  assert.doesNotMatch(html, /name="counterparty"/);
  assert.match(js, /const createFields=\[[^\n]*"destination"/);
  assert.match(js, /key==="destination"\?\(record\.destination\|\|record\.counterparty\|\|""\)/);
  assert.match(js, /!payload\.destination/);
  assert.match(js, /insert\(\{\.\.\.payload,counterparty:payload\.destination,notes:""\}\)/);
  assert.match(js, /safe\(r\.destination\|\|"—"\)/);
});

test("Delivery register has viewport tooltips and faint vertical dividers",()=>{
  const css=readFileSync(new URL("../assets/css/deliveries.css",import.meta.url),"utf8");
  assert.match(css, /#records-table thead th:not\(:last-child\)/);
  assert.match(css, /#records-table tbody td:not\(:last-child\)/);
  assert.match(css, /\.delivery-cell-tooltip\[hidden\]\{display:none\}/);
  assert.match(js, /deliveryCells\.addEventListener\("pointermove"/);
  assert.match(js, /deliveryCells\.addEventListener\("focusin"/);
  assert.match(js, /deliveryCells\.addEventListener\("pointerleave",hideDeliveryTooltip\)/);
  assert.match(js, /field\?field\.value:cell\.textContent/);
  assert.match(js, /document\.body\.appendChild\(deliveryCellTooltip\)/);
});

test("Hover preview waits over two seconds and selection hint is removed",()=>{
  assert.match(js,/DELIVERY_TOOLTIP_DELAY=2100/);
  assert.match(js,/deliveryTooltipTimer=setTimeout\(/);
  assert.match(js,/cell===hoveredDeliveryCell/);
  assert.match(js,/clearTimeout\(deliveryTooltipTimer\)/);
  assert.doesNotMatch(js,/title="Маркирай и копирай АРК номера"/);
  assert.doesNotMatch(js,/title="Двоен клик: маркирай номер и дата на фактурата"/);
  assert.doesNotMatch(js,/title="Избери доставка за митническия PDF"/);
});

test("Every column except Actions has one right-side resize grip",()=>{
 const css=readFileSync(new URL("../assets/css/deliveries.css",import.meta.url),"utf8");
 assert.match(js,/DELIVERY_COLUMN_KEY="gtadesk.delivery-columns.v3"/);
 assert.match(js,/if\(index===DELIVERY_ACTIONS_INDEX\)return/);
 assert.match(js,/heading.appendChild\(grip\)/);
 assert.match(js,/grip.setPointerCapture\(event.pointerId\)/);
 assert.match(js,/deliveryColumnWidths=resizeDeliveryBoundary/);
 assert.match(js,/deliveryBoundaryAt\(event\)/);
 assert.match(js,/document.addEventListener\("pointerup",finishDeliveryResize\)/);
 assert.match(css,/\.delivery-column-grip\{[\s\S]*?right:0/);
 assert.doesNotMatch(js,/notesCellDrag|notesResizeOverlay|addDeliveryResizeGrip/);
 assert.doesNotMatch(css,/delivery-column-grip-left|delivery-notes-resize-overlay/);
});
test("Actions stay compact and no longer overlap other columns",()=>{
 const css=readFileSync(new URL("../assets/css/deliveries.css",import.meta.url),"utf8");
 assert.match(js,/DELIVERY_ACTIONS_WIDTH=46/);
 assert.match(css,/th.actions-heading,[\s\S]*?td.actions-cell\{[\s\S]*?width:46px!important/);
 assert.match(css,/tbody td.actions-cell\{[\s\S]*?position:static!important/);
 assert.match(js,/fitDeliveryColumns\(deliverySavedWidths\(\)/);
});
