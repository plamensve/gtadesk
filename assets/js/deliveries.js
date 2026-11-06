import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "../../config.js";
import { escapeHtml } from "./dom.js";
import { fetchDeliveryPdf, removeDeliveryPdf } from "./delivery-documents.js";
import { invoiceKey, invoiceDisplay, documentsForInvoice } from "./invoice-documents.js";
import { prepareCustomsBundle, mergeCustomsPdfs, customsPdfFileName } from "./delivery-pdf.js";
import { sortDeliveryRows, planDeclarationArchive, createDeclarationZip, declarationZipFileName } from "./declaration-archive.js";

const $ = id => document.getElementById(id);
const client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const safe = value => escapeHtml(String(value ?? ""));
const prettyDate = date => date ? date.slice(8,10)+"."+date.slice(5,7)+"."+date.slice(0,4) : "—";
const declarationDateOf=no=>declarationDetails.get(no)||"";
const PAGE_SIZE = 40, GROUP_PAGE_SIZE = 4;
let records=[], activeDeclaration="", currentPage=0, groupPage=0, editId=null, selectedRowId=null, busy=false;
let menuTarget=null,documents=[],invoiceDocuments=[],docsTarget=null,declarationDetails=new Map(),archiveBusy=false,declarationDateTarget=null;
let pdfPreviewObjectUrl=null,pdfPreviewRequest=0,pdfDocumentBusy=false,activePreviewDocumentId=null;
const selectedDeliveryIds=new Set();
const createFields=["delivered_on","ark","declaration_no","counterparty","quantity_liters","invoice_no","invoice_date"];
const csvFields=["delivered_on","document_date","ark","invoice_no","invoice_date","declaration_no","declaration_date","tractor","tanker","quantity_liters","counterparty","destination","notes","usage_status"];
const status=(message,bad=false)=>{$("status").textContent=message;$("status").classList.toggle("bad",bad);};
const normalize=value=>String(value??"").trim().toLocaleLowerCase("bg");

async function guard(){
  const {data:{user},error}=await client.auth.getUser();
  if(error||!user)throw Error("Необходим е вход в GTA Desk.");
  const {data,error:accessError}=await client.from("gtadesk_access").select("user_id").eq("user_id",user.id).maybeSingle();
  if(accessError||!data)throw Error("Нямате разрешен достъп.");
  $("account-email").textContent=user.email||"Одобрен потребител";
  $("guard").hidden=true;$("app").hidden=false;
  document.querySelector(".gta-unified-sidebar").hidden=false;
}
function formReset(){
  editId=null;$("delivery-form").reset();
  $("form-title").textContent="Нова доставка";$("save").textContent="Запиши доставка";
  $("cancel").hidden=true;$("delivery-form").elements.declaration_no.value=activeDeclaration||"";
  $("delivery-form").elements.declaration_date.value=declarationDateOf(activeDeclaration);
  $("form-status").textContent="";
  arkInput.setCustomValidity("");arkValidation.textContent="";arkValidation.hidden=true;arkValidation.style.color="";arkValidIcon.hidden=true;
}
function edit(record){
  if(record.is_locked){status("Редът е заключен. Отключи го от менюто ⋮, за да го редактираш.",true);return;}
  editId=record.id;
  for(const key of createFields)$("delivery-form").elements[key].value=record[key]??"";
  $("delivery-form").elements.declaration_date.value=declarationDateOf(record.declaration_no);
  $("form-title").textContent="Редакция на доставка";
  $("save").textContent="Запази промените";$("cancel").hidden=false;
  $("form-panel").scrollIntoView({behavior:"smooth",block:"start"});
}
const usage=r=>r.usage_status||(r.is_used?"used":"unused");
const usageLabel=s=>({unused:"Неизползван",used:"Използван",shared:"Общ"})[s]||"Неизползван";
function visibleNote(record){
  const note=String(record.notes??"");
  if(record.source_extra?.notes_edited===true)return note;
  // Legacy workbook import filled notes with "A=...; H=..."; keep those in source data,
  // but don't present them as manually entered user notes.
  const fromWorkbook=Boolean(record.source_sheet&&record.source_row&&record.source_extra?.workbook);
  const isGenerated=/^[A-Z]=/u.test(note.trim());
  return fromWorkbook&&isGenerated?"":note;
}
function groups(){
  const map=new Map();
  for(const r of records){
    if(!map.has(r.declaration_no))map.set(r.declaration_no,{count:0,liters:0,remaining:0,used:0});
    const g=map.get(r.declaration_no);g.count++;const liters=litersOf(r);g.liters+=liters;if(usage(r)==="used")g.used++;else g.remaining+=liters;
  }
  return [...map].sort((a,b)=>a[0].localeCompare(b[0],"bg",{numeric:true}));
}
function visibleRows(){
  const q=normalize($("search").value),from=$("date-from").value,to=$("date-to").value;
  return records.filter(r=>{
    if(activeDeclaration&&r.declaration_no!==activeDeclaration)return false;
    if(from&&(!r.delivered_on||r.delivered_on<from))return false;
    if(to&&(!r.delivered_on||r.delivered_on>to))return false;
    return !q||[r.ark,r.invoice_no,r.invoice_date,r.declaration_no,declarationDateOf(r.declaration_no),r.tractor,r.tanker,r.counterparty,r.destination,visibleNote(r),r.source_sheet].some(v=>normalize(v).includes(q));
  }).sort(sortDeliveryRows);
}
const litersOf=record=>{
  const value=Number(record.quantity_liters);
  return record.quantity_liters==null||record.quantity_liters===""||!Number.isFinite(value)?0:value;
};
const litersFormat=value=>new Intl.NumberFormat("bg-BG",{maximumFractionDigits:3}).format(value)+" л";
function renderHeaderSummary(){
  const total=records.reduce((sum,record)=>sum+litersOf(record),0);
  const remaining=records.reduce((sum,record)=>sum+(usage(record)==="used"?0:litersOf(record)),0);
  $("summary-count").textContent=new Intl.NumberFormat("bg-BG").format(records.length);
  $("summary-total").textContent=litersFormat(total);
  $("summary-remaining").textContent=litersFormat(remaining);
  const missing=records.filter(record=>record.quantity_liters==null||record.quantity_liters==="").length;
  $("header-summary").title=missing?missing+" доставки са без въведено количество и се изчисляват като 0 л.":"Използваните редове се изключват от оставащото количество. Статус „Общ“ остава включен.";
}
function renderGroups(){
  const all=groups(),filter=$("group-filter").value,q=normalize($("group-search").value);
  $("declaration-options").innerHTML=all.map(([name])=>'<option value="'+safe(name)+'"></option>').join("");
  const filtered=all.filter(([name,g])=>(!q||normalize(name).includes(q))&&(filter==="all"||(filter==="used"?g.used===g.count:g.used<g.count)));
  const options=[["",{count:records.length,liters:records.reduce((sum,r)=>sum+litersOf(r),0),remaining:records.reduce((sum,r)=>sum+(usage(r)==="used"?0:litersOf(r)),0),used:records.filter(r=>usage(r)==="used").length}],...filtered];
  const pageCount=Math.max(1,Math.ceil(options.length/GROUP_PAGE_SIZE));
  groupPage=Math.min(groupPage,pageCount-1);
  const slice=options.slice(groupPage*GROUP_PAGE_SIZE,(groupPage+1)*GROUP_PAGE_SIZE);
  $("group-list").innerHTML=slice.map(([name,g])=>{
    const used=!!name&&g.used===g.count;
    const docCount=documents.filter(d=>d.declaration_no===name&&d.document_kind!=="analysis").length;
    const analysisCount=documents.filter(d=>d.declaration_no===name&&d.document_kind==="analysis").length;
    const date=declarationDateOf(name);
    return '<div class="group-card '+(used?"used ":"")+(activeDeclaration===name?"selected":"")+'" data-declaration="'+safe(name)+'">'+
      '<button type="button" class="group-card-main group-card-select" data-group-select="'+safe(name)+'" aria-pressed="'+(activeDeclaration===name)+'">'+
      '<b>'+(name?"Декларация "+safe(name):"Всички декларации")+'</b>'+
      '<span>'+g.count+' доставки · '+litersFormat(g.liters)+'</span>'+
      '<span class="group-remaining">Оставащи: '+litersFormat(g.remaining)+'</span>'+
      '<span class="declaration-card-date">'+(name?"Дата: "+(date?prettyDate(date):"не е въведена"):"")+'</span>'+
      '<span class="group-status-slot">'+(used?'<span class="used-label">✓ Използвана</span>':g.used?'<span class="used-label">'+g.used+' използвани реда</span>':'<span class="used-label used-label-placeholder" aria-hidden="true">✓ Използвана</span>')+'</span></button>'+
      (name?'<div class="group-card-operations">'+
       '<button type="button" class="group-card-mini group-card-docs '+(docCount?'has-docs':'no-docs')+'" data-group-docs="'+safe(name)+'" title="Придружаващи PDF: '+docCount+'">PDF '+(docCount||"")+'</button>'+
       '<button type="button" class="group-card-mini group-card-analysis '+(analysisCount?'has-docs':'')+'" data-group-analysis="'+safe(name)+'" title="Качи или виж анализ на декларацията">Анализ'+(analysisCount?' ✓':'')+'</button>'+
       '<button type="button" class="group-card-mini" data-group-date="'+safe(name)+'" title="Редактирай дата на декларацията">Дата</button>'+
       '<button type="button" class="group-card-mini group-card-archive" data-group-archive="'+safe(name)+'" title="Изтегли ZIP архива с папки по АРК">ZIP ↓</button>'+
       '</div>':'')+'</div>';
  }).join("");
  $("group-page-info").textContent="Страница "+(groupPage+1)+" от "+pageCount+" · "+all.length+" декларации";
  $("group-previous").disabled=groupPage===0;$("group-next").disabled=groupPage>=pageCount-1;
  renderHeaderSummary();
  $("active-group").textContent=activeDeclaration?"Декларация "+activeDeclaration:"Всички декларации";
}
function rowHtml(r,number){
  const docCount=documents.filter(d=>d.delivery_id===r.id).length;
  const invoiceDocCount=documentsForInvoice(invoiceDocuments,r).length;
  const field=(key,label,cls="")=>'<input class="inline-field '+cls+'" data-field="'+key+'" aria-label="'+label+'" value="'+safe(key==="notes"?visibleNote(r):(r[key]??""))+'" maxlength="'+(key==="notes"?4000:250)+'" autocomplete="off"'+(r.is_locked?' disabled title="Редът е само за четене"':'')+'>';
  return '<tr data-id="'+safe(r.id)+'" class="'+(usage(r)==="used"?"row-used ":usage(r)==="shared"?"row-shared ":"")+(selectedRowId===r.id?"row-selected ":"")+(selectedDeliveryIds.has(r.id)?"row-export-selected":"")+'">'+
    '<td class="row-number"><span class="row-number-wrap"><span class="row-index">'+number+'</span><label class="delivery-select-label" title="Избери доставка за митническия PDF"><input type="checkbox" class="delivery-select" data-export-select="'+safe(r.id)+'" aria-label="Избери АРК '+safe(r.ark)+' за украинска митница"'+(selectedDeliveryIds.has(r.id)?' checked':'')+'><span class="delivery-check-ui" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.3 4.3L19 7"/></svg></span></label></span></td><td>'+prettyDate(r.delivered_on)+'</td><td class="mono copyable-number" title="Маркирай и копирай АРК номера">'+safe(r.ark)+'</td>'+
    '<td class="invoice-number copyable-number"><span class="invoice-cell-content"><span class="invoice-copy-value" title="Двоен клик: маркирай номер и дата на фактурата">'+safe(invoiceDisplay(r))+'</span>'+(r.invoice_no?'<button type="button" class="invoice-attach-trigger '+(invoiceDocCount?'has-docs':'')+'" data-invoice-docs="'+safe(r.id)+'" aria-label="'+(invoiceDocCount?'Преглед на '+invoiceDocCount+' PDF документа':'Прикачи PDF документ')+' към фактура '+safe(r.invoice_no)+'" title="'+(invoiceDocCount?invoiceDocCount+' прикачени PDF файла':'Прикачи PDF към фактура')+'">'+(invoiceDocCount?'<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3h7l4 4v14H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M14 3v5h5"/><path d="m9 15 2 2 4-4"/></svg><span class="invoice-document-count">'+invoiceDocCount+'</span>':'<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m21.4 11.6-8.7 8.7a6 6 0 0 1-8.5-8.5l9.5-9.5a4 4 0 0 1 5.7 5.7l-9.5 9.5a2 2 0 0 1-2.8-2.8l8.8-8.8"/></svg>')+'</button>':'')+'</span></td><td><span class="decl-reference"><span class="decl-label">'+safe(r.declaration_no)+'</span><span class="decl-date-inline">'+(declarationDateOf(r.declaration_no)?prettyDate(declarationDateOf(r.declaration_no)):"Без дата")+'</span></span></td>'+
    '<td>'+field("tractor","Влекач")+'</td><td>'+field("tanker","Цистерна")+'</td>'+
    '<td class="number">'+(r.quantity_liters==null?"—":Number(r.quantity_liters).toLocaleString("bg-BG",{maximumFractionDigits:3}))+'</td>'+
    '<td>'+safe(r.destination||"—")+'</td><td>'+field("notes","Бележка","notes")+'</td>'+
    '<td data-status-cell="true" class="usage-status-cell">'+('<span class="usage-label usage-'+usage(r)+'">'+safe(usageLabel(usage(r)))+'</span>')+'</td>'+
    '<td class="actions-cell"><button type="button" class="row-actions-trigger" data-row-menu="'+safe(r.id)+'" aria-label="Действия за АРК '+safe(r.ark)+' · '+docCount+' PDF документа" aria-haspopup="menu" aria-expanded="false" title="Действия · '+docCount+' PDF"><span aria-hidden="true">⋮</span><span class="row-doc-dot '+(docCount?'has-docs':'no-docs')+'" aria-hidden="true"></span></button>'+(r.is_locked?'<span class="row-lock-indicator" title="Само за четене">🔒</span>':"")+'</td></tr>';
}
function updateCustomsSelectionUI(){
  const selected=records.filter(r=>selectedDeliveryIds.has(r.id));
  const count=selected.length;
  $("customs-selected-count").textContent=count?count+" избрани "+(count===1?"доставка":"доставки"):"Няма избрани доставки";
  $("customs-export").disabled=!count||busy;
  $("customs-clear-selection").hidden=!count;
}
function clearCustomsSelection(){
  selectedDeliveryIds.clear();
  renderRows();
  $("customs-export-progress").textContent="";
}
function renderRows(){
  const rows=visibleRows(),pageCount=Math.max(1,Math.ceil(rows.length/PAGE_SIZE));
  currentPage=Math.min(currentPage,pageCount-1);
  $("records-body").innerHTML=rows.slice(currentPage*PAGE_SIZE,(currentPage+1)*PAGE_SIZE).map((record,index)=>rowHtml(record,currentPage*PAGE_SIZE+index+1)).join("")||
    '<tr><td colspan="12" class="empty">Няма намерени доставки.</td></tr>';
  $("pagination").textContent=rows.length+" записа · страница "+(currentPage+1)+" от "+pageCount;
  $("previous").disabled=currentPage===0;$("next").disabled=currentPage>=pageCount-1;
  $("export").disabled=!rows.length;
  updateCustomsSelectionUI();
}
function render(){renderGroups();renderRows();}
async function load(){
  status("Зареждане...");
  const list=[];
  for(let offset=0;;offset+=1000){
    const {data,error}=await client.from("gta_deliveries").select("*").order("created_at",{ascending:false}).range(offset,offset+999);
    if(error)throw error;
    list.push(...data);
    if(data.length<1000)break;
  }
  records=list;
  const {data:metadata,error:metaError}=await client.from("gta_declaration_details").select("declaration_no,declaration_date");
  if(metaError)throw metaError;
  declarationDetails=new Map((metadata||[]).map(d=>[d.declaration_no,d.declaration_date]));
  for(const id of selectedDeliveryIds)if(!records.some(r=>r.id===id))selectedDeliveryIds.delete(id);
  await loadDocs();render();status("Данните са актуални.");
}
async function updateRow(id,patch){
  if(busy)return false;
  const current=records.find(r=>r.id===id);
  if(current?.is_locked && !(Object.keys(patch).length===1 && patch.is_locked===false)){
    status("Редът е заключен. Първо го отключи от менюто ⋮.",true);return false;
  }
  busy=true;
  try{
    const {data,error}=await client.from("gta_deliveries").update(patch).eq("id",id).select("id").single();
    if(error)throw error;
    if(!data)throw Error("Записът не беше потвърден.");
    const record=records.find(r=>r.id===id);
    if(record)Object.assign(record,patch);
    render();status("Промените са запазени.");return true;
  }catch(error){status("Грешка при запис: "+error.message,true);return false;}
  finally{busy=false;}
}
async function updateGroup(name,used){
  if(busy||!name)return;
  busy=true;
  try{
    if(records.some(r=>r.declaration_no===name&&r.is_locked))throw Error("Декларацията съдържа заключени редове. Отключи ги преди промяна на общия статус.");
    // One atomic update for the entire declaration; no per-row network loop.
    const {data,error}=await client.from("gta_deliveries").update({is_used:used,usage_status:used?"used":"unused"}).eq("declaration_no",name).select("id");
    if(error)throw error;
    const expected=records.filter(r=>r.declaration_no===name).length;
    if(!data||data.length!==expected)throw Error("Не всички редове са актуализирани. Обновете регистъра.");
    for(const r of records)if(r.declaration_no===name){r.is_used=used;r.usage_status=used?"used":"unused";}
    render();status(used?"Декларацията е маркирана като използвана.":"Маркировката е премахната.");
  }catch(error){status("Грешка: "+error.message,true);await load().catch(()=>{});}
  finally{busy=false;}
}
function closeMenus(){for(const id of ["group-menu","row-menu","row-actions-menu"])$(id).hidden=true;document.querySelectorAll("[data-row-menu][aria-expanded=true]").forEach(button=>button.setAttribute("aria-expanded","false"));menuTarget=null;}
function openMenu(id,x,y,anchor=null){
  closeMenus();
  const menu=$(id);
  // Context menus are portaled to body, so table scrolling never clips them.
  if(menu.parentElement!==document.body)document.body.appendChild(menu);
  menu.hidden=false;
  menu.style.visibility="hidden";
  menu.style.left="0px";menu.style.top="0px";
  const {width,height}=menu.getBoundingClientRect();
  const gap=10,edge=10;
  let left=x,top=y;
  if(anchor&&id==="row-actions-menu"){
    // Place the menu to the LEFT of the three-dot trigger, aligned with its row.
    left=anchor.left-width-gap;
    if(left<edge)left=anchor.right+gap;
    top=anchor.bottom+height+gap<=window.innerHeight?anchor.top:anchor.bottom-height;
  }else if(anchor){
    left=anchor.left;
    top=anchor.bottom+height+gap<=window.innerHeight?anchor.bottom+5:anchor.top-height-5;
  }else{
    if(y+height+edge>window.innerHeight)top=y-height-6;
  }
  menu.style.left=Math.max(edge,Math.min(left,window.innerWidth-width-edge))+"px";
  menu.style.top=Math.max(edge,Math.min(top,window.innerHeight-height-edge))+"px";
  menu.style.visibility="visible";
}

const arkInput=$("field-ark");
const arkValidation=$("ark-validation");
const arkValidIcon=$("ark-valid-icon");
function validateArk(){
  const length=Array.from(arkInput.value).length;
  const valid=length===21;
  arkInput.setCustomValidity(valid?"":"АРК номерът трябва да съдържа точно 21 символа (въведени: "+length+").");
  arkValidation.textContent=valid||length===0?"":"АРК номерът трябва да съдържа точно 21 символа (въведени: "+length+").";
  arkValidation.hidden=valid||length===0;
  arkValidIcon.hidden=!valid;
  arkValidation.style.color=valid?"#166f62":"#b52f46";
  return valid;
}
arkInput.addEventListener("input",validateArk);
$("delivery-form").addEventListener("submit",async event=>{
  event.preventDefault();const form=event.currentTarget;
  validateArk();
  if(!form.reportValidity()||busy)return;
  const payload=Object.fromEntries(createFields.map(key=>[key,String(form.elements[key].value).trim()]));
  if(editId&&records.find(r=>r.id===editId)?.is_locked){$("form-status").textContent="Редът е заключен.";return;}
  if(!payload.delivered_on||!payload.ark||!payload.declaration_no||!payload.counterparty)return;
  if(Boolean(payload.invoice_no)!==Boolean(payload.invoice_date)){
    $("form-status").textContent="За фактура попълни едновременно номер и дата.";return;
  }
  payload.invoice_date=payload.invoice_date||null;
  const declarationDate=form.elements.declaration_date.value||null;
  const quantity=Number(payload.quantity_liters);
  if(!Number.isFinite(quantity)||quantity<=0){$("form-status").textContent="Въведете валидно количество, по-голямо от 0 литра.";return;}
  payload.quantity_liters=quantity;
  busy=true;$("save").disabled=true;$("form-status").textContent="Записване...";
  try{
    const query=editId?client.from("gta_deliveries").update(payload).eq("id",editId).select("id"):
      client.from("gta_deliveries").insert({...payload,notes:""}).select("id");
    const {data,error}=await query.single();
    if(error)throw error;if(!data)throw Error("Записът не беше потвърден.");
    if(declarationDate!==declarationDateOf(payload.declaration_no))await persistDeclarationDate(payload.declaration_no,declarationDate);
    formReset();await load();status("Доставката е записана.");
  }catch(error){$("form-status").textContent="Грешка: "+error.message;}
  finally{busy=false;$("save").disabled=false;}
});
$("cancel").addEventListener("click",formReset);
$("new-delivery").addEventListener("click",()=>{formReset();$("form-panel").scrollIntoView({behavior:"smooth"});});
$("reload").addEventListener("click",()=>load().catch(error=>status(error.message,true)));

async function persistDeclarationDate(name,date){
  const {data,error}=await client.from("gta_declaration_details")
    .upsert({declaration_no:name,declaration_date:date||null,updated_at:new Date().toISOString()},{onConflict:"declaration_no"})
    .select("declaration_no,declaration_date").single();
  if(error)throw error;
  declarationDetails.set(name,data.declaration_date);
}
function openDeclarationDate(name){
  declarationDateTarget=name;
  $("declaration-date-title").textContent="Дата на декларация "+name;
  $("declaration-date-input").value=declarationDateOf(name);
  $("declaration-date-status").textContent="";
  $("declaration-date-dialog").showModal();
}
$("declaration-date-close").addEventListener("click",()=>$("declaration-date-dialog").close());
$("declaration-date-clear").addEventListener("click",()=>{
  $("declaration-date-input").value="";
  $("declaration-date-form").requestSubmit();
});
$("declaration-date-form").addEventListener("submit",async event=>{
  event.preventDefault();
  const name=declarationDateTarget;
  if(!name||busy)return;
  const button=$("declaration-date-save");button.disabled=true;
  $("declaration-date-status").textContent="Запазване…";
  try{
    await persistDeclarationDate(name,$("declaration-date-input").value);
    render();
    $("declaration-date-dialog").close();
    status("Датата на декларация "+name+" е актуализирана.");
  }catch(error){$("declaration-date-status").textContent="Грешка: "+error.message;}
  finally{button.disabled=false;}
});
async function downloadDeclarationArchive(name){
  if(archiveBusy)return;
  archiveBusy=true;
  const progress=$("group-archive-progress");
  progress.textContent="Подготвяне на ZIP за декларация "+name+"…";
  try{
    const plan=planDeclarationArchive(name,records,documents,invoiceDocuments);
    const zip=await createDeclarationZip(plan,async doc=>{
      const {data,error}=await client.storage.from(bucket).download(doc.storage_path);
      if(error)throw error;
      return data;
    },window.JSZip,(done,total)=>{
      progress.textContent="Изтегляне на файлове: "+done+"/"+total+"…";
    });
    const url=URL.createObjectURL(zip),link=document.createElement("a");
    link.href=url;link.download=declarationZipFileName(name);
    document.body.append(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
    progress.textContent="ZIP архивът е готов: "+plan.deliveryCount+" АРК папки, "+plan.entries.length+" файла.";
  }catch(error){
    progress.textContent="Грешка при архивиране: "+error.message;
    status(progress.textContent,true);
  }finally{archiveBusy=false;}
}

$("group-list").addEventListener("click",event=>{
  const btn=event.target.closest("[data-declaration]");if(!btn)return;
  const name=btn.dataset.declaration;
  if(name&&event.target.closest("[data-group-date]")){openDeclarationDate(name);return;}
  if(name&&event.target.closest("[data-group-analysis]")){openDocs({type:"analysis",name});return;}
  if(name&&event.target.closest("[data-group-archive]")){downloadDeclarationArchive(name);return;}
  // Clicking the PDF badge opens this declaration's documents without changing the active filter.
  if(name&&event.target.closest(".group-card-docs")){
    event.preventDefault();
    openDocs({type:"group",name});
    return;
  }
  if(event.target.closest("button")&&!event.target.closest("[data-group-select]"))return;
  if(name&&[...selectedDeliveryIds].some(id=>records.find(r=>r.id===id)?.declaration_no!==name))selectedDeliveryIds.clear();
  activeDeclaration=name;currentPage=0;render();formReset();
});
$("group-list").addEventListener("contextmenu",event=>{
  const btn=event.target.closest("[data-declaration]");if(!btn||!btn.dataset.declaration)return;
  event.preventDefault();const name=btn.dataset.declaration;
  const members=records.filter(r=>r.declaration_no===name);
  const used=members.every(r=>usage(r)==="used");
  menuTarget={type:"group",name,used};
  openMenu("group-menu",event.clientX,event.clientY,btn.getBoundingClientRect());
  menuTarget={type:"group",name,used};
  $("group-toggle-used").textContent=used?"Премахни маркировката":"✓ Маркирай като използвана";
});
$("group-documents").addEventListener("click",()=>{const t=menuTarget;closeMenus();if(t?.type==="group")openDocs({type:"group",name:t.name});});
$("group-toggle-used").addEventListener("click",async()=>{
  const target=menuTarget;closeMenus();
  if(target?.type==="group")await updateGroup(target.name,!target.used);
});
$("row-menu").addEventListener("click",async event=>{
  const button=event.target.closest("[data-usage]");if(!button)return;
  const target=menuTarget;closeMenus();
  if(target?.type==="row")await updateRow(target.id,{usage_status:button.dataset.usage,is_used:button.dataset.usage==="used"});
});
$("records-body").addEventListener("click",event=>{
  const cell=event.target.closest("[data-status-cell]");
  if(!cell)return;
  event.stopPropagation();
  const tr=cell.closest("tr[data-id]");
  const record=records.find(r=>r.id===tr?.dataset.id);
  if(!record)return;
  const rect=cell.getBoundingClientRect();
  const wasOpen=!$("row-menu").hidden&&menuTarget?.id===record.id;
  closeMenus();
  if(wasOpen)return;
  selectedRowId=record.id;
  openMenu("row-menu",rect.left,rect.bottom+4,rect);
  menuTarget={type:"row",id:record.id};
});
$("records-body").addEventListener("contextmenu",event=>{
  if(event.target.closest("input"))return;
  const tr=event.target.closest("tr[data-id]");if(!tr)return;
  event.preventDefault();selectedRowId=tr.dataset.id;const record=records.find(r=>r.id===selectedRowId);
  if(!record)return;
  const statusCell=event.target.closest("[data-status-cell]");
  if(!statusCell){
    $("row-actions-menu").querySelector('[data-row-action="lock"]').textContent=record.is_locked?"🔓 Отключи реда":"🔒 Само за четене";
    $("row-actions-menu").querySelector('[data-row-action="edit"]').disabled=!!record.is_locked;
    $("row-actions-menu").querySelector('[data-row-action="delete"]').disabled=!!record.is_locked;
  }
  const anchor=statusCell?.getBoundingClientRect()||tr.querySelector("[data-row-menu]")?.getBoundingClientRect();
  renderRows();openMenu(statusCell?"row-menu":"row-actions-menu",event.clientX,event.clientY,anchor);
  menuTarget={type:"row",id:record.id};
});
document.addEventListener("click",event=>{if(!event.target.closest(".context-menu"))closeMenus();});
document.addEventListener("keydown",event=>{if(event.key==="Escape")closeMenus();});
window.addEventListener("scroll",closeMenus,true);
for(const id of ["group-search","group-filter"])$(id).addEventListener("input",()=>{groupPage=0;renderGroups();});
$("group-previous").addEventListener("click",()=>{groupPage--;renderGroups();});
$("group-next").addEventListener("click",()=>{groupPage++;renderGroups();});
for(const id of ["search","date-from","date-to"])$(id).addEventListener("input",()=>{currentPage=0;renderRows();});
$("clear-filters").addEventListener("click",()=>{$("search").value="";$("date-from").value="";$("date-to").value="";activeDeclaration="";currentPage=0;render();});
$("previous").addEventListener("click",()=>{currentPage--;renderRows();});
$("next").addEventListener("click",()=>{currentPage++;renderRows();});
$("customs-clear-selection").addEventListener("click",clearCustomsSelection);
$("customs-export").addEventListener("click",async()=>{
  if(busy)return;
  const progress=$("customs-export-progress");
  let bundle;
  try{
    bundle=prepareCustomsBundle(records,documents,selectedDeliveryIds,invoiceDocuments);
    // Include the manually entered note, never the generated legacy Excel-import note.
    bundle.rows=bundle.rows.map(row=>({...row,notes:visibleNote(row)}));
    if(!window.PDFLib?.PDFDocument)throw Error("Библиотеката за създаване на PDF не е заредена. Обнови страницата и опитай отново.");
  }catch(error){status(error.message,true);progress.textContent=error.message;return;}
  busy=true;updateCustomsSelectionUI();
  try{
    const bytes=await mergeCustomsPdfs(bundle,async doc=>{
      const {data,error}=await client.storage.from(bucket).download(doc.storage_path);
      if(error)throw error;
      return data;
    },window.PDFLib.PDFDocument,(done,total)=>{progress.textContent="Подготвяне на PDF: "+done+" от "+total+" части…";});
    const blob=new Blob([bytes],{type:"application/pdf"});
    const url=URL.createObjectURL(blob);
    const link=document.createElement("a");link.href=url;link.download=customsPdfFileName(bundle.declarationNo);
    document.body.appendChild(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
    const pages=bundle.rows.length,files=bundle.documents.length;
    progress.textContent="Готово: "+pages+" "+(pages===1?"избрана доставка":"избрани доставки")+" (информационни PDF страници) и "+files+" прикачени PDF файла в общ документ.";
    status("PDF файлът за украинска митница е подготвен.");
  }catch(error){const message="Грешка при обединяване: "+error.message;status(message,true);progress.textContent=message;}
  finally{busy=false;updateCustomsSelectionUI();}
});
$("records-body").addEventListener("change",async event=>{
  const selected=event.target.closest("input[data-export-select]");
  if(selected){
    const row=records.find(r=>r.id===selected.dataset.exportSelect);
    if(!row)return;
    if(selected.checked){
      for(const id of selectedDeliveryIds){
        if(records.find(r=>r.id===id)?.declaration_no!==row.declaration_no)selectedDeliveryIds.delete(id);
      }
      selectedDeliveryIds.add(row.id);
    }else selectedDeliveryIds.delete(row.id);
    $("customs-export-progress").textContent="";
    renderRows();
    return;
  }
  const input=event.target.closest("input[data-field]");if(!input)return;
  const tr=input.closest("tr[data-id]"),record=records.find(r=>r.id===tr.dataset.id);
  if(!record)return;
  const field=input.dataset.field,value=input.value.trim();
  if(value===String(field==="notes"?visibleNote(record):(record[field]??"")))return;
  if(record.is_locked){input.value=field==="notes"?visibleNote(record):(record[field]??"");status("Редът е заключен.",true);return;}
  const patch=field==="notes"?{notes:value,source_extra:{...(record.source_extra||{}),notes_edited:true}}:{[field]:value};
  const ok=await updateRow(record.id,patch);
  if(!ok)input.value=field==="notes"?visibleNote(record):(record[field]??"");
});
$("records-body").addEventListener("keydown",event=>{
  if(event.key==="Enter"&&event.target.matches("input[data-field]")){event.preventDefault();event.target.blur();}
});
async function deleteDelivery(record){
  if(record.is_locked){status("Редът е заключен. Първо го отключи.",true);return;}
  if(busy||!window.confirm("Да се изтрие ли доставката с АРК "+record.ark+"?"))return;
  busy=true;
  try{
    const {data,error}=await client.from("gta_deliveries").delete().eq("id",record.id).select("id").single();
    if(error)throw error;if(!data)throw Error("Неуспешно изтриване.");
    records=records.filter(r=>r.id!==record.id);
    selectedDeliveryIds.delete(record.id);
    if(editId===record.id)formReset();
    render();status("Доставката е изтрита.");
  }catch(error){status("Грешка: "+error.message,true);}
  finally{busy=false;}
}
$("row-actions-menu").addEventListener("click",async event=>{
  const action=event.target.closest("[data-row-action]")?.dataset.rowAction;
  const target=menuTarget;closeMenus();
  if(!action||target?.type!=="row")return;
  const record=records.find(r=>r.id===target.id);if(!record)return;
  if(action==="documents"){openDocs({type:"row",id:record.id});return;}
  if(action==="lock")await updateRow(record.id,{is_locked:!record.is_locked});
  else if(action==="edit")edit(record);
  else if(action==="delete")await deleteDelivery(record);
});
$("records-body").addEventListener("dblclick",event=>{
  const numberCell=event.target.closest("td.copyable-number");
  if(numberCell){
    event.preventDefault();
    event.stopPropagation();
    if(event.target.closest("button"))return;
    const selection=window.getSelection();
    if(selection){
      const range=document.createRange();
      range.selectNodeContents(numberCell.querySelector(".invoice-copy-value")||numberCell);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    return;
  }
  if(event.target.closest("input,button,[data-status-cell]"))return;
  const id=event.target.closest("tr[data-id]")?.dataset.id;
  const record=records.find(r=>r.id===id);
  if(record)edit(record);
});
$("records-body").addEventListener("click",event=>{
  const invoiceTrigger=event.target.closest("[data-invoice-docs]");
  if(invoiceTrigger){
    event.stopPropagation();
    const record=records.find(r=>r.id===invoiceTrigger.dataset.invoiceDocs);
    if(!record)return;
    if(!record.invoice_date){
      status("Първо попълни дата на фактурата в редакцията на доставката.",true);
      if(!record.is_locked)edit(record);
      return;
    }
    openDocs({type:"invoice",invoiceNo:String(record.invoice_no).trim(),invoiceDate:record.invoice_date});
    return;
  }
  const trigger=event.target.closest("[data-row-menu]");
  if(trigger){
    event.stopPropagation();
    const id=trigger.dataset.rowMenu;
    const record=records.find(r=>r.id===id);
    if(!record)return;
    const wasOpen=!$("row-actions-menu").hidden&&menuTarget?.id===id;
    closeMenus();
    if(wasOpen)return;
    selectedRowId=id;
    const rect=trigger.getBoundingClientRect();
    const lockButton=$("row-actions-menu").querySelector('[data-row-action="lock"]');
    lockButton.textContent=record.is_locked?"🔓 Отключи реда":"🔒 Само за четене";
    $("row-actions-menu").querySelector('[data-row-action="edit"]').disabled=!!record.is_locked;
    $("row-actions-menu").querySelector('[data-row-action="delete"]').disabled=!!record.is_locked;
    openMenu("row-actions-menu",rect.left,rect.bottom+4,rect);
    menuTarget={type:"row",id};
    trigger.setAttribute("aria-expanded","true");
    return;
  }
  if(event.target.closest("input,.copyable-number"))return;
  const id=event.target.closest("tr[data-id]")?.dataset.id;
  if(id){selectedRowId=id;renderRows();}
});
$("export").addEventListener("click",()=>{
  if(!window.XLSX){status("Библиотеката за Excel не е заредена. Проверете връзката и опитайте отново.",true);return;}
  const headers=["Дата доставка","Дата документ","АРК","Фактура №","Дата фактура","Декларация №","Дата декларация","Влекач","Цистерна","Литри","Контрагент","Място","Бележки","Статус"];
  const data=visibleRows().map(r=>csvFields.map(k=>{
    if(k==="usage_status")return usageLabel(usage(r));
    if(k==="quantity_liters")return r[k]==null?"":Number(r[k]);
    if(k==="notes")return visibleNote(r);
    if(k==="declaration_date")return declarationDateOf(r.declaration_no);
    return String(r[k]??"");
  }));
  const worksheet=XLSX.utils.aoa_to_sheet([headers,...data]);
  worksheet["!cols"]=[{wch:16},{wch:16},{wch:25},{wch:19},{wch:16},{wch:18},{wch:16},{wch:17},{wch:17},{wch:16},{wch:24},{wch:22},{wch:35},{wch:17}];
  worksheet["!autofilter"]={ref:XLSX.utils.encode_range({s:{r:0,c:0},e:{r:data.length,c:headers.length-1}})};
  // ARK and invoice identifiers must remain exact text, including leading zeros.
  for(let row=1;row<=data.length;row++){
    for(const col of [2,3,5]){
      const cell=worksheet[XLSX.utils.encode_cell({r:row,c:col})];
      if(cell){cell.t="s";cell.v=String(cell.v);}
    }
    const liters=worksheet[XLSX.utils.encode_cell({r:row,c:9})];
    if(liters&&liters.t==="n")liters.z="#,##0.###";
  }
  const workbook=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook,worksheet,"Доставки");
  const name=activeDeclaration?"декларация-"+activeDeclaration.replace(/[^a-zA-Z0-9_-]/g,"_")+".xlsx":"доставки-декларации.xlsx";
  XLSX.writeFile(workbook,name,{compression:true});
  status("Excel файлът е генериран.");
});

const bucket="gta-delivery-pdfs";
async function loadDocs(){
 const [deliveryResult,invoiceResult]=await Promise.all([
  client.from("gta_delivery_documents").select("id,delivery_id,declaration_no,document_kind,storage_path,filename,created_at"),
  client.from("gta_invoice_documents").select("id,invoice_no,invoice_date,storage_path,filename,created_at")
 ]);
 if(deliveryResult.error)throw deliveryResult.error;
 if(invoiceResult.error)throw invoiceResult.error;
 documents=deliveryResult.data||[];
 invoiceDocuments=invoiceResult.data||[];
}

function resetDocPreview(){
  pdfPreviewRequest++;
  const frame=$("docs-preview-frame");
  frame.removeAttribute("src");
  if(pdfPreviewObjectUrl){URL.revokeObjectURL(pdfPreviewObjectUrl);pdfPreviewObjectUrl=null;}
  activePreviewDocumentId=null;
  $("docs-preview-name").textContent="";
  $("docs-preview").hidden=true;
}
async function openDocs(target){
  docsTarget=target;
  resetDocPreview();
  $("docs-file").value="";
  $("docs-message").textContent="";
  $("docs-title").textContent=target.type==="row"?
    "PDF към АРК "+(records.find(r=>r.id===target.id)?.ark||""):
    target.type==="invoice"?"Фактура "+target.invoiceNo+" / "+prettyDate(target.invoiceDate):
    target.type==="analysis"?"Анализ към декларация "+target.name:
    "PDF към декларация "+target.name;
  $("docs-dialog").showModal();
  renderDocs();
}
async function previewDeliveryPdf(doc,button){
  if(pdfDocumentBusy)return;
  resetDocPreview();
  const requested=pdfPreviewRequest;
  button.disabled=true;
  $("docs-message").textContent="Зареждане на PDF преглед…";
  try{
    const pdf=await fetchDeliveryPdf(client,doc,bucket);
    if(requested!==pdfPreviewRequest)return;
    pdfPreviewObjectUrl=URL.createObjectURL(new Blob([pdf],{type:"application/pdf"}));
    activePreviewDocumentId=doc.id;
    $("docs-preview-name").textContent=doc.filename;
    $("docs-preview-frame").src=pdfPreviewObjectUrl;
    $("docs-preview").hidden=false;
    $("docs-message").textContent="";
    $("docs-preview").scrollIntoView({behavior:"smooth",block:"nearest"});
  }catch(error){
    if(requested===pdfPreviewRequest)$("docs-message").textContent="Грешка при преглед: "+error.message;
  }finally{button.disabled=false;}
}
function renderDocs(){
  const list=$("docs-list");list.replaceChildren();
  const target=docsTarget;
  if(!target)return;
  const items=target.type==="invoice"
    ?documentsForInvoice(invoiceDocuments,{invoice_no:target.invoiceNo,invoice_date:target.invoiceDate})
    :documents.filter(d=>target.type==="row"
      ?d.delivery_id===target.id
      :d.declaration_no===target.name&&(target.type==="analysis"?d.document_kind==="analysis":d.document_kind!=="analysis"));
  if(!items.length){
    list.textContent="Няма качени PDF документи.";
    return;
  }
  for(const doc of items){
    const entry=document.createElement("div");entry.className="docs-entry";
    const name=document.createElement("span");name.className="docs-filename";name.textContent=doc.filename;
    name.title=doc.filename;
    const controls=document.createElement("div");controls.className="docs-entry-controls";
    const preview=document.createElement("button");preview.type="button";preview.className="btn";
    preview.textContent="Преглед";preview.title="Прегледай "+doc.filename;
    preview.addEventListener("click",()=>previewDeliveryPdf(doc,preview));
    const download=document.createElement("button");download.type="button";download.className="btn";download.textContent="Свали";
    download.addEventListener("click",async()=>{
      download.disabled=true;
      try{
        const pdf=await fetchDeliveryPdf(client,doc,bucket);
        const url=URL.createObjectURL(pdf);
        const a=document.createElement("a");a.href=url;a.download=doc.filename;
        document.body.appendChild(a);a.click();a.remove();
        setTimeout(()=>URL.revokeObjectURL(url),30000);
        $("docs-message").textContent="";
      }catch(error){$("docs-message").textContent="Грешка при сваляне: "+error.message;}
      finally{download.disabled=false;}
    });
    const remove=document.createElement("button");remove.type="button";remove.className="btn docs-remove";
    remove.textContent="Изтрий";remove.title="Изтрий "+doc.filename;
    remove.addEventListener("click",async()=>{
      if(pdfDocumentBusy||!window.confirm("Да изтрия ли PDF документа „"+doc.filename+"“? Това действие е необратимо."))return;
      pdfDocumentBusy=true;
      $("docs-upload").disabled=true;
      controls.querySelectorAll("button").forEach(btn=>btn.disabled=true);
      $("docs-message").textContent="Изтриване на документа…";
      try{
        await removeDeliveryPdf(client,doc,bucket,doc.invoice_no?"gta_invoice_documents":"gta_delivery_documents");
        if(activePreviewDocumentId===doc.id)resetDocPreview();
        await loadDocs();render();renderDocs();
        $("docs-message").textContent="PDF документът е изтрит успешно.";
      }catch(error){
        $("docs-message").textContent="Грешка при изтриване: "+error.message;
        try{await loadDocs();render();renderDocs();}catch(_reloadError){}
      }finally{
        pdfDocumentBusy=false;
        $("docs-upload").disabled=false;
        controls.querySelectorAll("button").forEach(btn=>btn.disabled=false);
      }
    });
    controls.append(preview,download,remove);
    entry.append(name,controls);
    list.append(entry);
  }
}
$("docs-close").addEventListener("click",()=>$("docs-dialog").close());
$("docs-preview-close").addEventListener("click",resetDocPreview);
$("docs-dialog").addEventListener("close",resetDocPreview);
$("docs-upload").onclick=async()=>{
 const file=$("docs-file").files[0],t=docsTarget;if(!file||!t||pdfDocumentBusy)return;
 if(file.type!=="application/pdf"||!file.name.toLowerCase().endsWith(".pdf")||file.size===0||file.size>10485760){$("docs-message").textContent="Избери PDF до 10 MB.";return;}
 pdfDocumentBusy=true;
 const button=$("docs-upload");button.disabled=true;$("docs-message").textContent="Качване...";
 const path=(t.type==="invoice"?"invoice":t.type==="row"?"delivery/"+t.id:"declaration/"+t.name)+"/"+crypto.randomUUID()+".pdf";
 try{const {error}=await client.storage.from(bucket).upload(path,file,{contentType:"application/pdf"});if(error)throw error;
 const entry=t.type==="invoice"
  ?{invoice_no:t.invoiceNo,invoice_date:t.invoiceDate,storage_path:path,filename:file.name}
  :{delivery_id:t.type==="row"?t.id:null,declaration_no:(t.type==="group"||t.type==="analysis")?t.name:null,document_kind:t.type==="analysis"?"analysis":"supporting",storage_path:path,filename:file.name};
 const {error:dbError}=await client.from(t.type==="invoice"?"gta_invoice_documents":"gta_delivery_documents").insert(entry);
 if(dbError){await client.storage.from(bucket).remove([path]);throw dbError;}
 await loadDocs();render();renderDocs();$("docs-file").value="";$("docs-message").textContent="Успешно качен PDF.";
 }catch(e){$("docs-message").textContent="Грешка: "+e.message;}finally{button.disabled=false;pdfDocumentBusy=false;}
};
$("logout").addEventListener("click",async()=>{await client.auth.signOut();location.replace("./");});
client.auth.onAuthStateChange(event=>{if(event==="SIGNED_OUT")location.replace("./");});
try{await guard();await load();}catch(error){$("guard").textContent=error.message;if(!$("app").hidden)status(error.message,true);}
