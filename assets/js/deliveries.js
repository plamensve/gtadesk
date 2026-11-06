import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "../../config.js";
import { escapeHtml } from "./dom.js";
import { prepareCustomsBundle, mergeCustomsPdfs, customsPdfFileName } from "./delivery-pdf.js";

const $ = id => document.getElementById(id);
const client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const safe = value => escapeHtml(String(value ?? ""));
const prettyDate = date => date ? date.slice(8,10)+"."+date.slice(5,7)+"."+date.slice(0,4) : "—";
const PAGE_SIZE = 40, GROUP_PAGE_SIZE = 4;
let records=[], activeDeclaration="", currentPage=0, groupPage=0, editId=null, selectedRowId=null, busy=false;
let menuTarget=null,documents=[],docsTarget=null;
const selectedDeliveryIds=new Set();
const createFields=["delivered_on","ark","declaration_no","counterparty","quantity_liters","invoice_no"];
const csvFields=["delivered_on","document_date","ark","invoice_no","declaration_no","tractor","tanker","quantity_liters","counterparty","destination","notes","usage_status"];
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
  $("form-status").textContent="";
  arkInput.setCustomValidity("");arkValidation.textContent="";arkValidation.hidden=true;arkValidation.style.color="";arkValidIcon.hidden=true;
}
function edit(record){
  if(record.is_locked){status("Редът е заключен. Отключи го от менюто ⋮, за да го редактираш.",true);return;}
  editId=record.id;
  for(const key of createFields)$("delivery-form").elements[key].value=record[key]??"";
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
    return !q||[r.ark,r.invoice_no,r.declaration_no,r.tractor,r.tanker,r.counterparty,r.destination,visibleNote(r),r.source_sheet].some(v=>normalize(v).includes(q));
  });
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
    const docCount=documents.filter(d=>d.declaration_no===name).length;
    return '<button type="button" class="group-card '+(used?"used ":"")+(activeDeclaration===name?"selected":"")+
      '" data-declaration="'+safe(name)+'" aria-pressed="'+(activeDeclaration===name)+'">'+
      '<span class="group-card-main"><b>'+(name?"Декларация "+safe(name):"Всички декларации")+'</b>'+
      '<span>'+g.count+' доставки · '+litersFormat(g.liters)+'</span>'+
      '<span class="group-remaining">Оставащи: '+litersFormat(g.remaining)+'</span>'+
      '<span class="group-status-slot">'+(used?'<span class="used-label">✓ Използвана</span>':g.used?'<span class="used-label">'+g.used+' използвани реда</span>':'<span class="used-label used-label-placeholder" aria-hidden="true">✓ Използвана</span>')+'</span></span>'+
      (name?'<span class="group-card-docs '+(docCount?'has-docs':'no-docs')+'" title="Кликни за качване и преглед на PDF документи · '+docCount+' прикачени"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m21.4 11.6-8.7 8.7a6 6 0 0 1-8.5-8.5l9.5-9.5a4 4 0 0 1 5.7 5.7l-9.5 9.5a2 2 0 0 1-2.8-2.8l8.8-8.8"/></svg><span>'+(docCount?docCount+' PDF':'Няма PDF')+'</span></span>':'')+'</button>';
  }).join("");
  $("group-page-info").textContent="Страница "+(groupPage+1)+" от "+pageCount+" · "+all.length+" декларации";
  $("group-previous").disabled=groupPage===0;$("group-next").disabled=groupPage>=pageCount-1;
  renderHeaderSummary();
  $("active-group").textContent=activeDeclaration?"Декларация "+activeDeclaration:"Всички декларации";
}
function rowHtml(r,number){
  const docCount=documents.filter(d=>d.delivery_id===r.id).length;
  const field=(key,label,cls="")=>'<input class="inline-field '+cls+'" data-field="'+key+'" aria-label="'+label+'" value="'+safe(key==="notes"?visibleNote(r):(r[key]??""))+'" maxlength="'+(key==="notes"?4000:250)+'" autocomplete="off"'+(r.is_locked?' disabled title="Редът е само за четене"':'')+'>';
  return '<tr data-id="'+safe(r.id)+'" class="'+(usage(r)==="used"?"row-used ":usage(r)==="shared"?"row-shared ":"")+(selectedRowId===r.id?"row-selected ":"")+(selectedDeliveryIds.has(r.id)?"row-export-selected":"")+'">'+
    '<td class="row-number"><span class="row-number-wrap"><span class="row-index">'+number+'</span><label class="delivery-select-label" title="Избери доставка за митническия PDF"><input type="checkbox" class="delivery-select" data-export-select="'+safe(r.id)+'" aria-label="Избери АРК '+safe(r.ark)+' за украинска митница"'+(selectedDeliveryIds.has(r.id)?' checked':'')+'><span class="delivery-check-ui" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.3 4.3L19 7"/></svg></span></label></span></td><td>'+prettyDate(r.delivered_on)+'</td><td class="mono copyable-number" title="Маркирай и копирай АРК номера">'+safe(r.ark)+'</td>'+
    '<td class="invoice-number copyable-number" title="Маркирай и копирай номера на фактурата">'+safe(r.invoice_no||"—")+'</td><td><span class="decl-label">'+safe(r.declaration_no)+'</span></td>'+
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
  const quantity=Number(payload.quantity_liters);
  if(!Number.isFinite(quantity)||quantity<=0){$("form-status").textContent="Въведете валидно количество, по-голямо от 0 литра.";return;}
  payload.quantity_liters=quantity;
  busy=true;$("save").disabled=true;$("form-status").textContent="Записване...";
  try{
    const query=editId?client.from("gta_deliveries").update(payload).eq("id",editId).select("id"):
      client.from("gta_deliveries").insert({...payload,notes:""}).select("id");
    const {data,error}=await query.single();
    if(error)throw error;if(!data)throw Error("Записът не беше потвърден.");
    formReset();await load();status("Доставката е записана.");
  }catch(error){$("form-status").textContent="Грешка: "+error.message;}
  finally{busy=false;$("save").disabled=false;}
});
$("cancel").addEventListener("click",formReset);
$("new-delivery").addEventListener("click",()=>{formReset();$("form-panel").scrollIntoView({behavior:"smooth"});});
$("reload").addEventListener("click",()=>load().catch(error=>status(error.message,true)));
$("group-list").addEventListener("click",event=>{
  const btn=event.target.closest("[data-declaration]");if(!btn)return;
  const name=btn.dataset.declaration;
  // Clicking the PDF badge opens this declaration's documents without changing the active filter.
  if(name&&event.target.closest(".group-card-docs")){
    event.preventDefault();
    openDocs({type:"group",name});
    return;
  }
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
    bundle=prepareCustomsBundle(records,documents,selectedDeliveryIds);
    if(!bundle.documents.length)throw Error("Няма качени PDF документи към декларацията или избраните доставки.");
    if(!window.PDFLib?.PDFDocument)throw Error("Библиотеката за обединяване на PDF не е заредена. Обнови страницата и опитай отново.");
  }catch(error){status(error.message,true);progress.textContent=error.message;return;}
  busy=true;updateCustomsSelectionUI();
  try{
    const bytes=await mergeCustomsPdfs(bundle.documents,async doc=>{
      const {data,error}=await client.storage.from(bucket).download(doc.storage_path);
      if(error)throw error;
      return data;
    },window.PDFLib.PDFDocument,(done,total)=>{progress.textContent="Подготвяне на PDF: "+done+" от "+total+" документа…";});
    const blob=new Blob([bytes],{type:"application/pdf"});
    const url=URL.createObjectURL(blob);
    const link=document.createElement("a");link.href=url;link.download=customsPdfFileName(bundle.declarationNo);
    document.body.appendChild(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
    const missing=bundle.rowsWithoutDocuments;
    progress.textContent="Готово: "+bundle.documents.length+" PDF документа са обединени."+(missing?" "+missing+" избрани доставки нямат собствен прикачен PDF.":"");
    status("PDF документите за украинска митница са подготвени.");
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
    const selection=window.getSelection();
    if(selection){
      const range=document.createRange();
      range.selectNodeContents(numberCell);
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
  const headers=["Дата доставка","Дата документ","АРК","Фактура №","Декларация №","Влекач","Цистерна","Литри","Контрагент","Място","Бележки","Статус"];
  const data=visibleRows().map(r=>csvFields.map(k=>{
    if(k==="usage_status")return usageLabel(usage(r));
    if(k==="quantity_liters")return r[k]==null?"":Number(r[k]);
    if(k==="notes")return visibleNote(r);
    return String(r[k]??"");
  }));
  const worksheet=XLSX.utils.aoa_to_sheet([headers,...data]);
  worksheet["!cols"]=[{wch:16},{wch:16},{wch:25},{wch:19},{wch:18},{wch:17},{wch:17},{wch:16},{wch:24},{wch:22},{wch:35},{wch:17}];
  worksheet["!autofilter"]={ref:XLSX.utils.encode_range({s:{r:0,c:0},e:{r:data.length,c:headers.length-1}})};
  // ARK and invoice identifiers must remain exact text, including leading zeros.
  for(let row=1;row<=data.length;row++){
    for(const col of [2,3,4]){
      const cell=worksheet[XLSX.utils.encode_cell({r:row,c:col})];
      if(cell){cell.t="s";cell.v=String(cell.v);}
    }
    const liters=worksheet[XLSX.utils.encode_cell({r:row,c:7})];
    if(liters&&liters.t==="n")liters.z="#,##0.###";
  }
  const workbook=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook,worksheet,"Доставки");
  const name=activeDeclaration?"декларация-"+activeDeclaration.replace(/[^a-zA-Z0-9_-]/g,"_")+".xlsx":"доставки-декларации.xlsx";
  XLSX.writeFile(workbook,name,{compression:true});
  status("Excel файлът е генериран.");
});

const bucket="gta-delivery-pdfs";
async function loadDocs(){const {data,error}=await client.from("gta_delivery_documents").select("id,delivery_id,declaration_no,storage_path,filename,created_at");if(error)throw error;documents=data||[];}
async function openDocs(t){docsTarget=t;$("docs-file").value="";$("docs-message").textContent="";$("docs-title").textContent=t.type==="row"?"PDF към АРК "+(records.find(r=>r.id===t.id)?.ark||""):"PDF към декларация "+t.name;$("docs-dialog").showModal();renderDocs();}
function renderDocs(){
 const list=$("docs-list");list.replaceChildren();
 const items=documents.filter(d=>docsTarget.type==="row"?d.delivery_id===docsTarget.id:d.declaration_no===docsTarget.name);
 if(!items.length){list.textContent="Няма качени документи.";return;}
 for(const doc of items){const line=document.createElement("div");line.className="docs-entry";const name=document.createElement("span");name.textContent=doc.filename;const btn=document.createElement("button");btn.type="button";btn.className="btn";btn.textContent="Свали";btn.onclick=async()=>{const {data,error}=await client.storage.from(bucket).download(doc.storage_path);if(error){$("docs-message").textContent=error.message;return;}const url=URL.createObjectURL(data),a=document.createElement("a");a.href=url;a.download=doc.filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);};line.append(name,btn);list.append(line);}
}
$("docs-close").onclick=()=>$("docs-dialog").close();
$("docs-upload").onclick=async()=>{
 const file=$("docs-file").files[0],t=docsTarget;if(!file||!t)return;
 if(file.type!=="application/pdf"||!file.name.toLowerCase().endsWith(".pdf")||file.size===0||file.size>10485760){$("docs-message").textContent="Избери PDF до 10 MB.";return;}
 const button=$("docs-upload");button.disabled=true;$("docs-message").textContent="Качване...";
 const path=(t.type==="row"?"delivery/"+t.id:"declaration/"+t.name)+"/"+crypto.randomUUID()+".pdf";
 try{const {error}=await client.storage.from(bucket).upload(path,file,{contentType:"application/pdf"});if(error)throw error;
 const entry={delivery_id:t.type==="row"?t.id:null,declaration_no:t.type==="group"?t.name:null,storage_path:path,filename:file.name};
 const {error:dbError}=await client.from("gta_delivery_documents").insert(entry);
 if(dbError){await client.storage.from(bucket).remove([path]);throw dbError;}
 await loadDocs();render();renderDocs();$("docs-file").value="";$("docs-message").textContent="Успешно качен PDF.";
 }catch(e){$("docs-message").textContent="Грешка: "+e.message;}finally{button.disabled=false;}
};
$("logout").addEventListener("click",async()=>{await client.auth.signOut();location.replace("./");});
client.auth.onAuthStateChange(event=>{if(event==="SIGNED_OUT")location.replace("./");});
try{await guard();await load();}catch(error){$("guard").textContent=error.message;if(!$("app").hidden)status(error.message,true);}
