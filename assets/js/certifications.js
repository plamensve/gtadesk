import {createClient} from "https://esm.sh/@supabase/supabase-js@2.58.0";
import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from "../../config.js";
import { byId as $, escapeHtml as escape } from "./dom.js";
const client=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);let companies=[],companyCatalog=[],fuels=[],page=0,term="",editId=null,viewRecord=null,signatureURL=null,editCompanyId=null,companyActionBusy=false;const LIMIT=40;
function message(id,text,bad=false){$(id).textContent=text;$(id).classList.toggle("bad",bad)}
function showTab(tab){for(let el of document.querySelectorAll(".tabs button"))el.classList.toggle("active",el.dataset.tab===tab);for(let key of ["records","new","companies"])$(key).hidden=key!==tab}
for(let button of document.querySelectorAll(".tabs button"))button.onclick=()=>{showTab(button.dataset.tab);if(button.dataset.tab==="records")loadRecords()};
try{let {data:{user},error}=await client.auth.getUser();if(error||!user)throw Error("Влезте в GTA Desk.");let a=await client.from("gtadesk_access").select("user_id").eq("user_id",user.id).maybeSingle();if(a.error||!a.data)throw Error("Нямате достъп.");$("account-email").textContent=user.email||"Одобрен потребител";$("logout").addEventListener("click",async()=>{await client.auth.signOut();location.replace("./")});$("app").hidden=false;document.querySelector(".gta-unified-sidebar").hidden=false;$("guard").hidden=true;await loadLookups();await loadRecords()}catch(e){$("guard").textContent=e.message;setTimeout(()=>location.replace("./"),2300)}
client.auth.onAuthStateChange(event=>{if(event==="SIGNED_OUT")location.replace("./")});
async function loadLookups(){
 const selectedId=$("company-choice").value;
 const [a,b]=await Promise.all([
   client.from("gta_cert_companies").select("id,name,eik,archived_at").order("name").limit(2000),
   client.from("gta_cert_fuels").select("name").order("name")
 ]);
 if(a.error||b.error)throw Error(a.error?.message||b.error?.message);
 companyCatalog=a.data||[];
 companies=companyCatalog.filter(c=>!c.archived_at);
 fuels=(b.data||[]).map(x=>x.name);
 $("fuel-choice").innerHTML='<option value="">Изберете гориво</option>'+fuels.map(x=>'<option>'+escape(x)+'</option>').join("");
 if(selectedId){
   const selected=companyCatalog.find(c=>String(c.id)===String(selectedId) &&
       (!c.archived_at || (editId && String(viewRecord?.company_id)===String(c.id))));
   $("company-choice").value=selected?String(selected.id):"";
   $("company-search").value=selected?selected.name:"";
   $("company-help").textContent=selected?
       (selected.archived_at?"Архивирана фирма, свързана със стара заверка.":"Избрана фирма"+(selected.eik?" · ЕИК: "+selected.eik:"")):
       "Избери активна фирма от предложенията.";
 }
 renderCompanies();
}

/* Search is local and instantaneous across the authorized companies already fetched from Supabase. */
let visibleCompanyMatches=[], highlightedCompanyIndex=-1;
const companyInput=$("company-search"), companyList=$("company-suggestions");
function hideCompanySuggestions(){
 companyList.hidden=true;
 companyInput.setAttribute("aria-expanded","false");
 companyInput.removeAttribute("aria-activedescendant");
 highlightedCompanyIndex=-1;
}
function companyMatches(query){
 const terms=query.trim().toLocaleLowerCase("bg-BG").split(/\s+/).filter(Boolean);
 return companies.filter(c=>{
   const haystack=(c.name+" "+(c.eik||"")).toLocaleLowerCase("bg-BG");
   return terms.every(t=>haystack.includes(t));
 });
}
function updateCompanyHighlight(index){
 if(!visibleCompanyMatches.length)return;
 highlightedCompanyIndex=(index+visibleCompanyMatches.length)%visibleCompanyMatches.length;
 const options=companyList.querySelectorAll('[role="option"]');
 options.forEach((el,i)=>{
   const active=i===highlightedCompanyIndex;
   el.classList.toggle("is-highlighted",active);
   el.setAttribute("aria-selected",String(active));
 });
 const selected=options[highlightedCompanyIndex];
 if(selected){
   companyInput.setAttribute("aria-activedescendant",selected.id);
   selected.scrollIntoView({block:"nearest"});
 }
}
function showCompanySuggestions(){
 const matches=companyMatches(companyInput.value);
 visibleCompanyMatches=matches.slice(0,12);
 highlightedCompanyIndex=-1;
 companyList.innerHTML=visibleCompanyMatches.map((c,i)=>
   '<div id="company-option-'+i+'" role="option" aria-selected="false" class="company-option" data-company="'+escape(c.id)+'"><span class="company-name">'+escape(c.name)+'</span><span class="company-eik">'+(c.eik?'ЕИК: '+escape(c.eik):'Без ЕИК')+'</span></div>'
 ).join("")+(matches.length>12?'<div class="company-more">Още '+(matches.length-12)+' резултата — въведи повече символи.</div>':"");
 if(!visibleCompanyMatches.length)companyList.innerHTML='<div class="company-empty">Няма намерени фирми. Провери името или ЕИК.</div>';
 companyList.hidden=false;
 companyInput.setAttribute("aria-expanded","true");
 companyInput.removeAttribute("aria-activedescendant");
}
function selectCompany(company){
 $("company-choice").value=company?String(company.id):"";
 companyInput.value=company?company.name:"";
 $("company-help").textContent=company?(company.eik?"Избрана фирма · ЕИК: "+company.eik:"Избрана фирма · без въведен ЕИК"):"Започни да пишеш, за да избереш фирма.";
 hideCompanySuggestions();
}
companyInput.addEventListener("focus",showCompanySuggestions);
companyInput.addEventListener("input",()=>{
 $("company-choice").value="";
 $("company-help").textContent="Избери фирма от предложенията.";
 showCompanySuggestions();
});
companyInput.addEventListener("keydown",event=>{
 if(event.key==="Escape"){hideCompanySuggestions();return}
 if(event.key==="Tab"){hideCompanySuggestions();return}
 if(event.key==="ArrowDown"||event.key==="ArrowUp"){
   event.preventDefault();
   if(companyList.hidden)showCompanySuggestions();
   if(visibleCompanyMatches.length){const direction=event.key==="ArrowDown"?1:-1;const index=highlightedCompanyIndex<0?(direction===1?0:visibleCompanyMatches.length-1):highlightedCompanyIndex+direction;updateCompanyHighlight(index)}
   return;
 }
 if(event.key==="Enter"){
   event.preventDefault();
   if(companyList.hidden)showCompanySuggestions();
   if(visibleCompanyMatches.length)selectCompany(visibleCompanyMatches[Math.max(0,highlightedCompanyIndex)]);
 }
});
function chooseCompanyFromEvent(event){
 const choice=event.target.closest("[data-company]");
 if(!choice)return;
 const selected=companies.find(c=>String(c.id)===choice.dataset.company);
 if(selected)selectCompany(selected);
}
companyList.addEventListener("pointerdown",event=>{
 if(event.target.closest("[data-company]")){event.preventDefault();chooseCompanyFromEvent(event)}
});
companyList.addEventListener("click",chooseCompanyFromEvent);
companyInput.addEventListener("blur",()=>{
 // Allow clicks on the suggestions to select an item before the dropdown closes.
 setTimeout(()=>{if(document.activeElement!==companyInput)hideCompanySuggestions()},150);
});
document.addEventListener("pointerdown",event=>{
 if(!event.target.closest(".company-combobox"))hideCompanySuggestions();
});
$("cert-form").addEventListener("reset",()=>{
 selectCompany(null);
});


function renderCompanies(){
 const needle=$("company-filter").value.trim().toLocaleLowerCase("bg-BG");
 const showArchived=$("company-show-archived").checked;
 const filtered=companyCatalog.filter(c=>{
   if(c.archived_at&&!showArchived)return false;
   return (c.name+" "+(c.eik||"")).toLocaleLowerCase("bg-BG").includes(needle);
 });
 $("company-count").textContent=filtered.length+" намерени / "+companies.length+" активни";
 $("company-list").innerHTML=filtered.map(c=>'<tr class="'+(c.archived_at?'is-archived':'')+'">'+
 '<td>'+escape(c.name)+'</td><td>'+escape(c.eik||"—")+'</td>'+
 '<td><span class="company-status-pill'+(c.archived_at?' archived':'')+'">'+(c.archived_at?'Архивирана':'Активна')+'</span></td>'+
 '<td><div class="company-row-actions">'+
 '<button type="button" data-company-action="edit" data-company-id="'+c.id+'">Редактирай</button>'+
 (c.archived_at?
 '<button type="button" class="restore" data-company-action="restore" data-company-id="'+c.id+'">Възстанови</button>':
 '<button type="button" class="archive" title="Изтрива от активния списък, без да премахва старите заверки" data-company-action="archive" data-company-id="'+c.id+'">Изтрий</button>')+
 '</div></td></tr>').join("")||'<tr><td colspan="4">Няма намерени фирми.</td></tr>';
}
function resetCompanyEditor(clearMessage=true){
 editCompanyId=null;
 $("company-form").reset();
 $("company-form").elements.eik.required=true;
 $("company-editor-title").textContent="Добавяне на фирма";
 $("company-editor-help").textContent="Добави фирма с нейното наименование и ЕИК. Можеш да променяш данните по-късно.";
 $("company-save").textContent="Добави фирма";
 $("company-cancel").hidden=true;
 if(clearMessage)message("company-status","");
}
function beginCompanyEdit(c){
 editCompanyId=c.id;
 const form=$("company-form");
 form.elements.name.value=c.name;
 form.elements.eik.value=c.eik||"";
 // Imported historical companies may not have an EIK yet.
 form.elements.eik.required=false;
 $("company-editor-title").textContent="Редактиране на фирма";
 $("company-editor-help").textContent="Коригирай наименованието или ЕИК. Вече издадените заверки запазват оригиналните си данни.";
 $("company-save").textContent="Запази промените";
 $("company-cancel").hidden=false;
 message("company-status",c.archived_at?"Редактираш архивирана фирма. Възстанови я, за да я използваш за нови заверки.":"");
 $("company-editor").scrollIntoView({behavior:"smooth",block:"start"});
 form.elements.name.focus({preventScroll:true});
}
$("company-filter").oninput=renderCompanies;
$("company-show-archived").onchange=renderCompanies;
$("company-cancel").onclick=()=>resetCompanyEditor();
$("company-form").onsubmit=async event=>{
 event.preventDefault();
 if(companyActionBusy)return;
 const form=$("company-form");
 const fields=new FormData(form);
 const name=String(fields.get("name")||"").trim();
 const eik=String(fields.get("eik")||"").trim();
 if(!name){message("company-status","Въведи наименование на фирмата.",true);return}
 if(eik&&!/^[0-9]{9,13}$/.test(eik)){message("company-status","ЕИК трябва да съдържа между 9 и 13 цифри.",true);return}
 if(!editCompanyId&&!eik){message("company-status","Въведи ЕИК за новата фирма.",true);return}
 const current=editCompanyId?companyCatalog.find(x=>x.id===editCompanyId):null;
 if(editCompanyId&&!current){message("company-status","Фирмата вече не е налична. Обнови списъка.",true);return}
 companyActionBusy=true;
 $("company-save").disabled=true;
 $("company-cancel").disabled=true;
 try{
   const values={name,eik:eik||null};
   const result=current?
     await client.from("gta_cert_companies").update(values).eq("id",current.id).select("id").single():
     await client.from("gta_cert_companies").insert(values).select("id").single();
   if(result.error)throw result.error;
   resetCompanyEditor(false);
   await loadLookups();
   message("company-status",current?"Промените по фирмата са запазени.":"Фирмата е добавена.");
 }catch(error){
   const existing=companyCatalog.find(x=>x.eik===eik&&(x.id!==editCompanyId));
   const note=error.code==="23505"?
      (existing?.archived_at?"Този ЕИК принадлежи на архивирана фирма. Покажи архивираните и я възстанови.":"Вече съществува фирма с този ЕИК."):
      error.message;
   message("company-status",note,true);
 }finally{
   companyActionBusy=false;
   $("company-save").disabled=false;
   $("company-cancel").disabled=false;
 }
};
$("company-list").onclick=async event=>{
 const button=event.target.closest("[data-company-action]");
 if(!button||companyActionBusy)return;
 const c=companyCatalog.find(x=>String(x.id)===button.dataset.companyId);
 if(!c)return;
 const action=button.dataset.companyAction;
 if(action==="edit"){beginCompanyEdit(c);return}
 if(action==="archive"&&!confirm('Изтриване на "'+c.name+'" от активния списък?\nФирмата ще бъде архивирана и няма да се показва за нови заверки. Всички исторически документи ще бъдат запазени.'))return;
 if(action==="restore"&&!confirm('Възстановяване на "'+c.name+'"?\nФирмата отново ще бъде достъпна за нови заверки.'))return;
 if(action!=="archive"&&action!=="restore")return;
 companyActionBusy=true;
 button.disabled=true;
 try{
   const result=await client.from("gta_cert_companies")
     .update({archived_at:action==="archive"?new Date().toISOString():null})
     .eq("id",c.id).select("id").single();
   if(result.error)throw result.error;
   if(editCompanyId===c.id)resetCompanyEditor(false);
   await loadLookups();
   message("company-status",action==="archive"?
     'Фирмата е архивирана. Старите заверки остават непроменени.':
     'Фирмата е възстановена.');
 }catch(error){message("company-status",error.message,true)}
 finally{companyActionBusy=false;button.disabled=false}
};

async function loadRecords(){let query=client.from("gta_cert_records").select("id,seq_no,cert_date,company_name,company_eik,fuel_type,litres,kilograms,document_ref,batch_ref,prepared_by,source_row,company_id",{count:"exact"}).order("id",{ascending:false}).range(page*LIMIT,(page+1)*LIMIT-1);
if(term){let safe=term.replace(/[,%()]/g," ").trim();if(/^\\d+$/.test(safe))query=query.or("company_name.ilike.%"+safe+"%,company_eik.ilike.%"+safe+"%,document_ref.ilike.%"+safe+"%,seq_no.eq."+safe);else query=query.or("company_name.ilike.%"+safe+"%,company_eik.ilike.%"+safe+"%,document_ref.ilike.%"+safe+"%")}
let r=await query;if(r.error){message("records-status",r.error.message,true);return}
$("metrics").textContent=(r.count||0).toLocaleString("bg-BG")+" заверки";$("pagination").textContent="Страница "+(page+1)+" · "+(r.count||0).toLocaleString("bg-BG")+" записа";$("previous").disabled=page===0;$("next").disabled=(page+1)*LIMIT>=(r.count||0);
$("rows").innerHTML=(r.data||[]).map(x=>'<tr><td class="num">'+escape(x.seq_no)+'</td><td>'+escape(x.cert_date)+'</td><td>'+escape(x.company_name)+'<div class="muted">'+escape(x.company_eik)+'</div></td><td>'+escape(x.fuel_type)+'</td><td>'+escape(x.litres)+'</td><td>'+escape(x.kilograms)+'</td><td>'+escape(x.document_ref)+'</td><td>'+escape(x.batch_ref)+'</td><td>'+escape(x.prepared_by)+'</td><td><button data-open="'+x.id+'">Отвори</button></td></tr>').join("")||'<tr><td colspan="10">Няма намерени заверки.</td></tr>';
$("rows").onclick=e=>{let b=e.target.closest("[data-open]");if(!b)return;let x=r.data.find(z=>String(z.id)===b.dataset.open);if(x)openRecord(x)}}
$("filter").oninput=e=>{term=e.target.value;page=0;loadRecords()};$("reload").onclick=loadRecords;$("previous").onclick=()=>{page=Math.max(0,page-1);loadRecords()};$("next").onclick=()=>{page++;loadRecords()};
$("cert-form").elements.cert_date.value=new Date().toLocaleDateString("en-CA");
function openRecord(x){editId=x.id;viewRecord=x;showTab("new");$("form-title").textContent="Заверка № "+(x.seq_no||"—");let f=$("cert-form");for(const k of ["cert_date","fuel_type","litres","kilograms","document_ref","batch_ref","prepared_by"])f.elements[k].value=x[k]??"";
let company=companyCatalog.find(c=>c.id===x.company_id)||companyCatalog.find(c=>c.eik&&c.eik===x.company_eik)||companyCatalog.find(c=>c.name===x.company_name);if(company)selectCompany(company);else{$("company-choice").value="";companyInput.value=x.company_name||"";$("company-help").textContent="Избери фирма от предложенията.";hideCompanySuggestions()}
message("form-status",x.source_row?"Импортиран запис от Excel, ред "+x.source_row:"Редактиране на заверката")};
$("cancel-edit").onclick=()=>{editId=null;viewRecord=null;$("form-title").textContent="Нова заверка";message("form-status","");setTimeout(()=>$("cert-form").elements.cert_date.value=new Date().toLocaleDateString("en-CA"))};
function readForm(){let f=new FormData($("cert-form"));let c=companies.find(x=>String(x.id)===String(f.get("company_id"))) || (editId?companyCatalog.find(x=>String(x.id)===String(f.get("company_id")) && String(x.id)===String(viewRecord?.company_id)):null);if(!c){companyInput.focus();showCompanySuggestions();throw Error("Изберете фирма от предложените резултати.");}let val=n=>f.get(n)===""?null:Number(f.get(n));return {company_id:c.id,company_name:c.name,company_eik:c.eik,cert_date:f.get("cert_date"),fuel_type:f.get("fuel_type"),litres:val("litres"),kilograms:val("kilograms"),document_ref:f.get("document_ref")||null,batch_ref:f.get("batch_ref")||null,prepared_by:f.get("prepared_by")||null}}
$("cert-form").onsubmit=async e=>{e.preventDefault();try{let data=readForm();if(!data.fuel_type||!data.cert_date)throw Error("Попълнете задължителните полета.");$("save").disabled=true;let r=editId?await client.from("gta_cert_records").update(data).eq("id",editId).select().single():await client.from("gta_cert_records").insert(data).select().single();if(r.error)throw r.error;viewRecord=r.data;editId=r.data.id;message("form-status","Записано успешно. Номер на заверката: "+r.data.seq_no);$("form-title").textContent="Заверка № "+r.data.seq_no}catch(err){message("form-status",err.message,true)}finally{$("save").disabled=false}};
$("signature").onchange=e=>{if(signatureURL)URL.revokeObjectURL(signatureURL);signatureURL=e.target.files?.[0]?URL.createObjectURL(e.target.files[0]):null};
function docHtml(x){let company=x.company_name||"",date=x.cert_date?x.cert_date.split("-").reverse().join("."):"",litres=x.litres??"…………",kgs=x.kilograms??"…………";
let bio=/Дизелово.*Б6|CP-10 Б6/i.test(x.fuel_type)?"Съгласно чл. 47 и чл. 48 от ЗЕВИ, съдържание на БИОКОМПОНЕНТ минимум 6 %, в това число съдържание на БИОКОМПОНЕНТ от ново поколение минимум 2 %.":/Бензин.*9\s*%/i.test(x.fuel_type)?"Съдържание на биокомпонент минимум 9 % (според посочения вид гориво).":"Проверете приложимите нормативни изисквания за конкретния вид гориво.";
return '<div class="printsheet"><p>Това копие на Декларация за съответствие е издадено от <b>ДЖИ ТИ ЕЙ ПЕТРОЛИУМ ООД</b> с ЕИК <b>200871895</b></p><p>Течно гориво <b>'+escape(x.fuel_type)+'</b> предоставено за разпространение и/или използване на <b>'+escape(company)+'</b>, ЕИК '+escape(x.company_eik)+', в количество <b>'+escape(litres)+' л. / '+escape(kgs)+' кг</b> по документ <b>'+escape(x.document_ref)+'</b> е от партида <b>'+escape(x.batch_ref)+'</b>, съответствието на която е декларирано в т. 1 от Декларацията. Декларирам, че ми е известна отговорността, която нося съгласно ЗЧАВ и ЗВИ.</p><div class="docfooter"><span>'+escape(date)+' г.</span><div>подпис и печат:<div>'+(signatureURL?'<img src="'+signatureURL+'" alt="Подпис и печат">':'……………………………')+'</div></div></div><p class="prepared-by">ИЗГОТВИЛ: '+escape(x.prepared_by)+' <span class="signature-label">ПОДПИС:………………………</span></p><p>'+escape(date)+' г.</p><p class="legal-note"><b>ЗАБЕЛЕЖКА:</b> '+escape(bio)+'</p><p class="legal-note">Декларирам, че ми е известна отговорността, която нося съгласно Закона за чистотата на атмосферния въздух.</p></div>'}
$("preview").onclick=()=>{try{const x=readForm();$("print-target").innerHTML=docHtml(x);document.querySelectorAll(".preview").forEach(x=>x.remove());let holder=document.createElement("article");holder.className="panel preview";holder.innerHTML='<div class="actions preview-actions"><button class="btn primary" id="print-button">Печат / Запази като PDF</button><button class="btn" id="close-preview">Затвори</button></div>'+docHtml(x);$("new").append(holder);$("print-button").onclick=()=>window.print();$("close-preview").onclick=()=>holder.remove();holder.scrollIntoView({behavior:"smooth"})}catch(err){message("form-status",err.message,true)}};
