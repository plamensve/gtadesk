import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "../../config.js";
import { escapeHtml } from "./dom.js";

const $ = id => document.getElementById(id);
const client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const safe = value => escapeHtml(String(value ?? ""));
const prettyDate = date => date ? date.slice(8,10)+"."+date.slice(5,7)+"."+date.slice(0,4) : "—";
const PAGE_SIZE = 40, GROUP_PAGE_SIZE = 4;
let records=[], activeDeclaration="", currentPage=0, groupPage=0, editId=null, selectedRowId=null, busy=false;
let menuTarget=null;
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
    return !q||[r.ark,r.invoice_no,r.declaration_no,r.tractor,r.tanker,r.counterparty,r.destination,r.notes,r.source_sheet].some(v=>normalize(v).includes(q));
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
    return '<button type="button" class="group-card '+(used?"used ":"")+(activeDeclaration===name?"selected":"")+
      '" data-declaration="'+safe(name)+'" aria-pressed="'+(activeDeclaration===name)+'"><b>'+
      (name?"Декларация "+safe(name):"Всички декларации")+'</b><span>'+g.count+' доставки'+
      ' · '+litersFormat(g.liters)+'</span><span class="group-remaining">Оставащи: '+litersFormat(g.remaining)+'</span>'+
      (used?'<span class="used-label">✓ Използвана</span>':g.used?'<span class="used-label">'+g.used+' използвани реда</span>':"")+'</button>';
  }).join("");
  $("group-page-info").textContent="Страница "+(groupPage+1)+" от "+pageCount+" · "+all.length+" декларации";
  $("group-previous").disabled=groupPage===0;$("group-next").disabled=groupPage>=pageCount-1;
  renderHeaderSummary();
  $("active-group").textContent=activeDeclaration?"Декларация "+activeDeclaration:"Всички декларации";
}
function rowHtml(r,number){
  const field=(key,label,cls="")=>'<input class="inline-field '+cls+'" data-field="'+key+'" aria-label="'+label+'" value="'+safe(r[key]??"")+'" maxlength="'+(key==="notes"?4000:250)+'" '+(r.is_locked?"disabled title=\"Редът е само за четене\"":"")+'>';
  return '<tr data-id="'+safe(r.id)+'" class="'+(usage(r)==="used"?"row-used ":usage(r)==="shared"?"row-shared ":"")+(selectedRowId===r.id?"row-selected":"")+'">'+
    '<td class="row-number">'+number+'</td><td>'+prettyDate(r.delivered_on)+'</td><td class="mono copyable-number" title="Маркирай и копирай АРК номера">'+safe(r.ark)+'</td>'+
    '<td class="invoice-number copyable-number" title="Маркирай и копирай номера на фактурата">'+safe(r.invoice_no||"—")+'</td><td><span class="decl-label">'+safe(r.declaration_no)+'</span></td>'+
    '<td>'+field("tractor","Влекач")+'</td><td>'+field("tanker","Цистерна")+'</td>'+
    '<td class="number">'+(r.quantity_liters==null?"—":Number(r.quantity_liters).toLocaleString("bg-BG",{maximumFractionDigits:3}))+'</td>'+
    '<td>'+safe(r.destination||"—")+'</td><td>'+field("notes","Бележка","notes")+'</td>'+
    '<td data-status-cell="true" class="usage-status-cell">'+('<span class="usage-label usage-'+usage(r)+'">'+safe(usageLabel(usage(r)))+'</span>')+'</td>'+
    '<td class="actions-cell"><button type="button" class="row-actions-trigger" data-row-menu="'+safe(r.id)+'" aria-label="Действия за АРК '+safe(r.ark)+'" aria-haspopup="menu" aria-expanded="false" title="Действия">⋮</button>'+(r.is_locked?'<span class="row-lock-indicator" title="Само за четене">🔒</span>':"")+'</td></tr>';
}
function renderRows(){
  const rows=visibleRows(),pageCount=Math.max(1,Math.ceil(rows.length/PAGE_SIZE));
  currentPage=Math.min(currentPage,pageCount-1);
  $("records-body").innerHTML=rows.slice(currentPage*PAGE_SIZE,(currentPage+1)*PAGE_SIZE).map((record,index)=>rowHtml(record,currentPage*PAGE_SIZE+index+1)).join("")||
    '<tr><td colspan="12" class="empty">Няма намерени доставки.</td></tr>';
  $("pagination").textContent=rows.length+" записа · страница "+(currentPage+1)+" от "+pageCount;
  $("previous").disabled=currentPage===0;$("next").disabled=currentPage>=pageCount-1;
  $("export").disabled=!rows.length;
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
  records=list;render();status("Данните са актуални.");
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
function openMenu(id,x,y){closeMenus();const menu=$(id);menu.hidden=false;menu.style.left=Math.max(8,Math.min(x,window.innerWidth-menu.offsetWidth-8))+"px";menu.style.top=Math.max(8,Math.min(y,window.innerHeight-menu.offsetHeight-8))+"px";}
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
  activeDeclaration=btn.dataset.declaration;currentPage=0;render();formReset();
});
$("group-list").addEventListener("contextmenu",event=>{
  const btn=event.target.closest("[data-declaration]");if(!btn||!btn.dataset.declaration)return;
  event.preventDefault();const name=btn.dataset.declaration;
  const members=records.filter(r=>r.declaration_no===name);
  const used=members.every(r=>usage(r)==="used");
  menuTarget={type:"group",name,used};
  openMenu("group-menu",event.clientX,event.clientY);
  menuTarget={type:"group",name,used};
  $("group-toggle-used").textContent=used?"Премахни маркировката":"✓ Маркирай като използвана";
});
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
  openMenu("row-menu",rect.left,rect.bottom+4);
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
  renderRows();openMenu(statusCell?"row-menu":"row-actions-menu",event.clientX,event.clientY);
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
$("records-body").addEventListener("change",async event=>{
  const input=event.target.closest("input[data-field]");if(!input)return;
  const tr=input.closest("tr[data-id]"),record=records.find(r=>r.id===tr.dataset.id);
  if(!record)return;
  const field=input.dataset.field,value=input.value.trim();
  if(value===String(record[field]??""))return;
  if(record.is_locked){input.value=record[field]??"";status("Редът е заключен.",true);return;}
  const ok=await updateRow(record.id,{[field]:value});
  if(!ok)input.value=record[field]??"";
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
  if(event.target.closest("input,[data-status-cell]"))return;
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
    openMenu("row-actions-menu",rect.left,rect.bottom+4);
    menuTarget={type:"row",id};
    trigger.setAttribute("aria-expanded","true");
    return;
  }
  if(event.target.closest("input,.copyable-number"))return;
  const id=event.target.closest("tr[data-id]")?.dataset.id;
  if(id){selectedRowId=id;renderRows();}
});
const csvValue=value=>'"'+String(value??"").replaceAll('"','""')+'"';
$("export").addEventListener("click",()=>{
  const headers=["Дата доставка","Дата документ","АРК","Фактура №","Декларация №","Влекач","Цистерна","Литри","Контрагент","Място","Бележки","Статус"];
  const rows=visibleRows().map(r=>csvFields.map(k=>csvValue(k==="usage_status"?usageLabel(usage(r)):r[k])).join(";"));
  const text="\uFEFF"+headers.map(csvValue).join(";")+"\r\n"+rows.join("\r\n");
  const url=URL.createObjectURL(new Blob([text],{type:"text/csv;charset=utf-8"}));
  const a=document.createElement("a");a.href=url;a.download=activeDeclaration?"декларация-"+activeDeclaration.replace(/[^a-zA-Z0-9_-]/g,"_")+".csv":"доставки-декларации.csv";
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
$("logout").addEventListener("click",async()=>{await client.auth.signOut();location.replace("./");});
client.auth.onAuthStateChange(event=>{if(event==="SIGNED_OUT")location.replace("./");});
try{await guard();await load();}catch(error){$("guard").textContent=error.message;if(!$("app").hidden)status(error.message,true);}
