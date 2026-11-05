import {createClient} from "https://esm.sh/@supabase/supabase-js@2.58.0";
import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from "../../config.js";
import { byId as $, escapeHtml as esc } from "./dom.js";
let client;try{client=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);const {data:{user},error}=await client.auth.getUser();if(error||!user)throw Error("Неоторизиран достъп");const {data:access,error:err}=await client.from("gtadesk_access").select("user_id").eq("user_id",user.id).maybeSingle();if(err||!access)throw Error("Нямате разрешен достъп");$("account-email").textContent=user.email||"Одобрен потребител";$("logout").addEventListener("click",async()=>{await client.auth.signOut();location.replace("./")});// The shared navigation controller selected the requested tab before authentication.
$("app").hidden=false;document.querySelector(".gta-unified-sidebar").hidden=false;$("guard").hidden=true;client.auth.onAuthStateChange(e=>{if(e==="SIGNED_OUT")location.replace("./")})}catch(e){$("guard").textContent=e.message||"Неуспешна проверка";location.replace("./")}
const key="gtadesk_zaraex_v1";const defaults={products:[],transport_companies:[],vehicles:[],drivers:[],bases:[],handover_people:[],loads:[]};let state;try{state={...defaults,...JSON.parse(sessionStorage.getItem(key)||"{}")}}catch{state=structuredClone(defaults)};const persist=()=>sessionStorage.setItem(key,JSON.stringify(state));
if(!state.products.length){try{const response=await fetch("./zaraex/products.json");if(response.ok){state.products=await response.json();persist()}}catch{}}

const schemas={products:[["name","Наименование"],["catalog_code","Код продукт"],["link_code","Код за връзка"],["kn_code","Код по КН"]],transport_companies:[["name","Транспортна фирма"],["eik","ЕИК"]],vehicles:[["registration","Регистрационен номер"],["company_eik","ЕИК на транспортната фирма"]],drivers:[["name","Име"],["egn","ЕГН"],["company_eik","ЕИК на транспортната фирма"]],bases:[["name","Петролна база"],["eik","ЕИК"],["link_code","Код в Лукойл"],["region","Област"],["region_code","Код област"],["municipality","Община"],["municipality_code","Код община"],["city","Населено място"],["city_code","Код град"],["street","Адрес"]],handover_people:[["first_name","Име"],["middle_name","Презиме"],["last_name","Фамилия"],["egn","ЕГН"],["base_name","Петролна база"]]};
const labels={products:"Продукти",transport_companies:"Транспортни фирми",vehicles:"МПС",drivers:"Шофьори",bases:"Петролни бази",handover_people:"Предал горивото"};
let collection="products",editItem=-1,editLoad=-1;
function field([k,label],value="",type="text"){if(k==="date")type="date";return '<div class="field"><label for="f-'+esc(k)+'">'+esc(label)+'</label><input id="f-'+esc(k)+'" name="'+esc(k)+'" type="'+type+'" value="'+esc(value)+'" '+(["middle_name"].includes(k)?"":"required")+'></div>'}
function drawSettings(){ $("collections").innerHTML=Object.keys(schemas).map(k=>'<button type="button" data-collection="'+k+'" class="'+(k===collection?"active":"")+'">'+labels[k]+'</button>').join("");$("item-fields").innerHTML=schemas[collection].map(f=>field(f)).join("");$("items-head").innerHTML="<tr>"+schemas[collection].map(v=>"<th>"+esc(v[1])+"</th>").join("")+"<th>Действия</th></tr>";$("items-list").innerHTML=state[collection].map((it,i)=>"<tr>"+schemas[collection].map(([k])=>"<td>"+esc(it[k])+"</td>").join("")+'<td><button class="small secondary" data-edit-item="'+i+'">Редакция</button> <button class="small danger" data-del-item="'+i+'">Изтрий</button></td></tr>').join("")||'<tr><td colspan="9" class="empty">Няма записи</td></tr>';$("save-item").textContent=editItem<0?"Добави запис":"Запази промените"}
$("collections").onclick=e=>{const b=e.target.closest("[data-collection]");if(b){collection=b.dataset.collection;editItem=-1;drawSettings()}};
$("items-list").onclick=e=>{const b=e.target.closest("button");if(!b)return;const i=Number(b.dataset.editItem??b.dataset.delItem);if(b.hasAttribute("data-del-item")){if(confirm("Изтриване на запис?")){state[collection].splice(i,1);persist();drawSettings()}}else{editItem=i;for(const [k] of schemas[collection])$("item-form").elements.namedItem(k).value=state[collection][i][k]||"";$("save-item").textContent="Запази промените"}};
$("item-form").onsubmit=e=>{e.preventDefault();const obj=Object.fromEntries(new FormData(e.target).entries());if(("egn" in obj)&&!/^\d{10}$/.test(obj.egn)){$("item-status").textContent="ЕГН трябва да съдържа точно 10 цифри.";return}if(editItem<0)state[collection].push(obj);else state[collection][editItem]=obj;persist();editItem=-1;$("item-status").textContent="";drawSettings()};$("reset-item").onclick=()=>{editItem=-1;drawSettings()};drawSettings();
const loadFields=[["date","Дата"],["ukn","УКН"],["add","ADD №"],["quantity","Количество (л.)"],["zara","Код ЗАРА"],["product","Продукт"],["base","Петролна база"],["company","Транспортна фирма"],["vehicle","МПС"],["driver","Шофьор"],["handover_name","Предал горивото"],["handover_egn","ЕГН на предал горивото"]];
function renderLoadForm(){const existing=editLoad>=0?state.loads[editLoad]:{};$("load-fields").innerHTML=loadFields.map(([k,title])=>{let coll={product:"products",base:"bases",company:"transport_companies",vehicle:"vehicles",driver:"drivers"}[k];if(coll){let name=k==="vehicle"?"registration":"name";return '<div class="field"><label>'+title+'</label><select name="'+k+'" required><option value="">Избери</option>'+state[coll].map(it=>'<option value="'+esc(it[name])+'" '+(it[name]===existing[k]?"selected":"")+'>'+esc(it[name])+'</option>').join("")+'</select></div>'}return field([k,title],existing[k]||"",k==="quantity"?"number":"text")}).join("");$("save-load").textContent=editLoad<0?"Добави товарене":"Запази промените"}
function drawLoads(){$("loads-list").innerHTML=state.loads.map((x,i)=>'<tr><td>'+esc(x.date)+'</td><td>'+esc(x.ukn)+'</td><td>'+esc(x.add)+'</td><td>'+esc(x.quantity)+'</td><td>'+esc(x.product)+'</td><td>'+esc(x.vehicle)+'</td><td><button class="small secondary" data-edit="'+i+'">Редакция</button> <button class="small danger" data-del="'+i+'">Изтрий</button></td></tr>').join("")||'<tr><td colspan="7" class="empty">Няма добавени товарения</td></tr>'}
$("load-form").onsubmit=e=>{e.preventDefault();const o=Object.fromEntries(new FormData(e.target).entries());const q=Number(o.quantity);if(!Number.isFinite(q)||q<=0){$("load-status").textContent="Количеството трябва да е положително число.";return}if(!/^\d{2}\.\d{2}\.\d{4}$/.test(o.date)){$("load-status").textContent="Датата трябва да е ДД.ММ.ГГГГ.";return}if(o.handover_egn&&!/^\d{10}$/.test(o.handover_egn)){$("load-status").textContent="ЕГН трябва да е 10 цифри.";return}if(editLoad<0)state.loads.push(o);else state.loads[editLoad]=o;editLoad=-1;persist();$("load-status").textContent="";renderLoadForm();drawLoads()};
$("loads-list").onclick=e=>{const b=e.target.closest("button");if(!b)return;const i=Number(b.dataset.edit??b.dataset.del);if(b.hasAttribute("data-del")){if(confirm("Изтриване на товаренето?")){state.loads.splice(i,1);persist();drawLoads()}}else{editLoad=i;renderLoadForm();window.scrollTo({top:0,behavior:"smooth"})}};
$("reset-load").onclick=()=>{editLoad=-1;renderLoadForm();$("load-status").textContent=""};
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000)}

$("export-loads").onclick=()=>{
 if(!state.loads.length){$("load-status").textContent="Няма товарения за експорт.";return}
 const doc=document.implementation.createDocument(null,"zaraexLoadsDraft",null);
 const root=doc.documentElement;root.setAttribute("version","1");root.setAttribute("format","draft-not-official-NRA");
 const add=(parent,name,value)=>{const el=doc.createElement(name);el.textContent=String(value??"");parent.appendChild(el);return el};
 const find=(name,collection,key="name")=>state[collection].find(x=>x[key]===name)||{};
 for(const record of state.loads){
  const load=add(root,"loading","");
  const product=find(record.product,"products"),base=find(record.base,"bases"),company=find(record.company,"transport_companies");
  const driver=find(record.driver,"drivers"),vehicle=find(record.vehicle,"vehicles","registration");
  const qty=Number(record.quantity);
  const values={
   ukn:record.ukn,addNumber:record.add,date:record.date,quantity:Number.isFinite(qty)?qty:record.quantity,
   zaraCode:record.zara,productName:record.product,productCode:product.catalog_code,
   fuelKind:product.fuel_kind,knCode:product.kn_code,productLinkCode:product.link_code,
   petroleumBase:record.base,baseEik:base.eik,baseLinkCode:base.link_code,
   region:base.region,regionCode:base.region_code,municipality:base.municipality,
   municipalityCode:base.municipality_code,city:base.city,cityCode:base.city_code,
   baseAddress:base.street,transportCompany:record.company,transportCompanyEik:company.eik,
   vehicleRegistration:record.vehicle,driverName:record.driver,driverEgn:driver.egn,
   handoverName:record.handover_name||record.driver,handoverEgn:record.handover_egn||driver.egn
  };
  for(const [key,value] of Object.entries(values))add(load,key,value);
 }
 const xml='<?xml version="1.0" encoding="UTF-8"?>\n'+new XMLSerializer().serializeToString(doc);
 download(new Blob([xml],{type:"application/xml;charset=utf-8"}),"zaraex_loads_draft.xml");
 $("load-status").textContent="XML файлът е създаден. Това е структурирана чернова, не потвърдена декларация за НАП.";
};
renderLoadForm();drawLoads();
// Form refresh is module-specific; all route changes and selected nav states are centralized.
document.addEventListener("gtadesk:tabchange", event => {
 if(event.detail.tab==="loads")renderLoadForm();
});
window.GtaDeskNavigation.sync();

// Original reference data copied unchanged from zaraex_import.
let stayLocations=null, cityMunicipalities=null;
const option=(v,label)=>{const el=document.createElement("option");el.value=v;el.textContent=label;return el};
const fillSelect=(id,items,title)=>{const node=$(id);node.replaceChildren(option("",title));for(const p of items)node.append(option(p.code,p.name+" · "+p.code));node.disabled=!items.length};
try{
 const results=await Promise.all(["./zaraex/locations.json","./zaraex/city_municipalities.json"].map(u=>fetch(u)));
 if(results.some(r=>!r.ok))throw Error("Не могат да бъдат заредени номенклатурите.");
 [stayLocations,cityMunicipalities]=await Promise.all(results.map(r=>r.json()));
 fillSelect("stay-region",stayLocations.domain,"Избери област");
 $("stay-region").addEventListener("change",()=>{
   const region=$("stay-region").value;
   fillSelect("stay-municipality",stayLocations.municipality.filter(i=>region&&i.code.startsWith(region)),"Избери община");
   fillSelect("stay-city",[],"Избери населено място");
 });
 $("stay-municipality").addEventListener("change",()=>{
   const municipality=$("stay-municipality").value;
   fillSelect("stay-city",stayLocations.city.filter(i=>municipality&&cityMunicipalities[i.code]===municipality),"Избери населено място");
 });
}catch(err){$("stay-status").textContent="Грешка при зареждане на номенклатурите: "+err.message;}


const stayPresetKey="gtadesk_stay_presets_v2";
let stayPresets=[];
try { const saved=JSON.parse(sessionStorage.getItem(stayPresetKey)||"[]"); if(Array.isArray(saved))stayPresets=saved.slice(0,5); }catch{}
const stayControls=["domain","municipality","city","address","addressNumber"];
const storePresets=()=>sessionStorage.setItem(stayPresetKey,JSON.stringify(stayPresets));
function selectionLabel(key,code){
 const collection=key==="domain"?"domain":key==="municipality"?"municipality":"city";
 return stayLocations?.[collection]?.find(i=>i.code===code)?.name || code;
}
function presetRefresh(){
 const host=$("stay-presets");host.replaceChildren();
 if(!stayPresets.length){
  const empty=document.createElement("p");empty.textContent="Все още няма запазени адреси.";host.append(empty);
 }
 stayPresets.forEach((preset,i)=>{
  const card=document.createElement("div");card.className="address-card";
  const name=document.createElement("strong");name.textContent=preset.label || "Адрес "+(i+1);
  const detail=document.createElement("span");
  detail.textContent=[selectionLabel("city",preset.city),selectionLabel("municipality",preset.municipality),preset.address,preset.addressNumber].filter(Boolean).join(", ");
  const actions=document.createElement("div");actions.className="edit-row";
  for(const [action,text] of [["load","Използвай"],["rename","Преименувай"],["delete","Премахни"]]){
   const btn=document.createElement("button");btn.type="button";btn.textContent=text;btn.dataset.action=action;btn.dataset.index=String(i);actions.append(btn);
  }
  card.append(name,detail,actions);host.append(card);
 });
 $("save-current-address").disabled=stayPresets.length>=5;
 $("save-current-address").textContent=stayPresets.length>=5?"Запълнени са 5 адреса":"+ Запази текущия адрес";
}
function validCurrentAddress(entry){
 return Boolean(stayLocations&&cityMunicipalities&&
 stayLocations.domain.some(i=>i.code===entry.domain)&&
 stayLocations.municipality.some(i=>i.code===entry.municipality&&i.code.startsWith(entry.domain))&&
 stayLocations.city.some(i=>i.code===entry.city&&cityMunicipalities[i.code]===entry.municipality)&&
 entry.address?.trim()&&entry.addressNumber?.trim());
}
$("save-current-address").addEventListener("click",()=>{
 const entry=Object.fromEntries(new FormData($("stay-form")).entries());
 if(!validCurrentAddress(entry)){$("stay-status").textContent="Първо попълни област, община, населено място, адрес и номер.";return}
 if(stayPresets.length>=5){$("stay-status").textContent="Можеш да запазиш до 5 адреса.";return}
 const suggestion=[selectionLabel("city",entry.city),entry.address].filter(Boolean).join(" — ");
 const label=prompt("Име за запазения адрес:",suggestion);
 if(label===null)return;
 if(!label.trim()){$("stay-status").textContent="Въведи име за адреса.";return}
 stayPresets.push({...Object.fromEntries(stayControls.map(k=>[k,entry[k]||""])),label:label.trim().slice(0,80)});
 storePresets();presetRefresh();$("stay-status").textContent="Адресът е запазен и може да бъде избран с едно натискане.";
});
$("stay-presets").addEventListener("click",e=>{
 const btn=e.target.closest("button[data-action]");if(!btn)return;
 const i=Number(btn.dataset.index),preset=stayPresets[i];if(!preset)return;
 if(btn.dataset.action==="load"){
  $("stay-region").value=preset.domain;$("stay-region").dispatchEvent(new Event("change"));
  $("stay-municipality").value=preset.municipality;$("stay-municipality").dispatchEvent(new Event("change"));
  $("stay-city").value=preset.city;
  for(const k of ["address","addressNumber"])$("stay-form").elements.namedItem(k).value=preset[k]||"";
  $("stay-status").textContent="Зареден адрес: "+preset.label;
 }else if(btn.dataset.action==="rename"){
  const label=prompt("Ново име на адреса:",preset.label);
  if(label!==null&&label.trim()){preset.label=label.trim().slice(0,80);storePresets();presetRefresh();}
 }else if(btn.dataset.action==="delete"){
  if(confirm("Да премахна ли адрес „"+preset.label+"“?")){stayPresets.splice(i,1);storePresets();presetRefresh();}
 }
});
presetRefresh();
$("stay-form").onsubmit=async e=>{e.preventDefault();try{const file=$("stay-source").files[0];if(!file)throw Error("Избери ЕДП XML.");const xml=new DOMParser().parseFromString(await file.text(),"application/xml");if(xml.querySelector("parsererror"))throw Error("Невалиден входен XML.");const get=path=>path.split("/").reduce((n,k)=>n?.querySelector(":scope > "+k),xml.documentElement)?.textContent?.trim()||"";const vals=Object.fromEntries(new FormData(e.target).entries());
if(!stayLocations||!cityMunicipalities)throw Error("Номенклатурите не са заредени.");
if(!stayLocations.domain.some(i=>i.code===vals.domain)||
!stayLocations.municipality.some(i=>i.code===vals.municipality&&i.code.startsWith(vals.domain))||
!stayLocations.city.some(i=>i.code===vals.city&&cityMunicipalities[i.code]===vals.municipality))
throw Error("Невалиден избор на област, община или населено място.");
const ukn=get("declarationReference/ukn_eADD"),amount=get("fuel/fuelAmount"),kn=get("fuel/fuelKNCode"),tugs=[...xml.querySelectorAll("transport > transportation > tugcistern")].map(n=>n.textContent.trim()).filter(Boolean),tug=get("transport/transportation/tug");if(!ukn||!amount||!kn||(!tugs.length&&!tug))throw Error("Липсва УКН, количество, КН код или регистрационен номер.");const doc=document.implementation.createDocument(null,"stayTransportDeclaration",null),root=doc.documentElement;root.setAttribute("xmlns:xsi","http://www.w3.org/2001/XMLSchema-instance");root.setAttribute("xsi:noNamespaceSchemaLocation","baseDeclarationSchema_v1.3.xsd");const add=(p,n,v)=>{const e=doc.createElement(n);if(v!==undefined)e.textContent=v;p.append(e);return e};const ref=add(root,"declarationReference");add(ref,"ukn_eADD",ukn);add(ref,"date",vals.date.split("-").reverse().join("."));const fuel=add(root,"fuel");add(fuel,"fuelAmount",amount);add(fuel,"fuelKNCode",kn);const transport=add(root,"transport"),loc=add(transport,"location");for(const k of ["domain","municipality","city"])add(loc,k,vals[k]);const st=add(transport,"storage");add(st,"type",get("transport/storage/type")||"other_no_ESFP");add(st,"address",vals.address);add(st,"addressNumber",vals.addressNumber);const tr=add(transport,"transporter"),bg=add(tr,"bgCompany");add(bg,"eik",get("transport/transporter/bgCompany/eik"));const movement=add(transport,"transportation");movement.setAttribute("xsi:type","AutoTransportationType");if(tugs.length)tugs.forEach(v=>add(movement,"tugcistern",v));else add(movement,"tug",tug);const person={egn:get("receiverPerson/bgPerson/egn"),firstName:get("receiverPerson/bgPerson/firstName"),lastName:get("receiverPerson/bgPerson/lastName")};for(const [target,tag] of [[movement,"drivers"],[root,"deliverPerson"],[root,"receiverPerson"]]){const p=add(target,tag),bp=add(p,"bgPerson");for(const [k,v]of Object.entries(person))add(bp,k,v)}download(new Blob(['<?xml version="1.0" encoding="utf-8"?>\n'+new XMLSerializer().serializeToString(doc)],{type:"application/xml"}),file.name.replace(/\.xml$/i,"")+"_stay.xml");$("stay-status").textContent="XML е генериран. Провери кодовете и съдържанието преди подаване."}catch(err){$("stay-status").textContent=err.message}};
let pdfMode="images",files=[];$("pdf-tabs").onclick=e=>{const b=e.target.closest("[data-pdf]");if(!b)return;pdfMode=b.dataset.pdf;files=[];$("pdf-files").value="";$("pdf-files").accept=pdfMode==="images"?"image/*":".pdf,application/pdf";$("pdf-files").multiple=pdfMode!=="compress";$("pdf-run").textContent=pdfMode==="images"?"Създай PDF":pdfMode==="merge"?"Обедини PDF":"Оптимизирай PDF";$("pdf-status").textContent="";drawFiles();for(const el of $("pdf-tabs").querySelectorAll("button"))el.classList.toggle("active",el===b)};
function drawFiles(){$("pdf-files-list").innerHTML=files.map((f,i)=>'<div class="file"><span>'+esc(f.name)+'</span><span><button data-up="'+i+'">↑</button> <button data-down="'+i+'">↓</button> <button data-rm="'+i+'">Премахни</button></span></div>').join("")}
$("pdf-files").onchange=e=>{if(pdfMode==="compress")files=[...e.target.files].slice(0,1);else files.push(...e.target.files);drawFiles();e.target.value=""};
$("pdf-files-list").onclick=e=>{const b=e.target.closest("button");if(!b)return;const i=Number(b.dataset.up??b.dataset.down??b.dataset.rm);if(b.hasAttribute("data-rm"))files.splice(i,1);else{const j=i+(b.hasAttribute("data-up")?-1:1);if(j>=0&&j<files.length)[files[i],files[j]]=[files[j],files[i]]}drawFiles()};
$("pdf-clear").onclick=()=>{files=[];drawFiles()};
$("pdf-run").onclick=async()=>{const status=$("pdf-status");status.textContent="";if(!files.length){status.textContent="Избери файлове.";return}try{const {PDFDocument}=await import("https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm");const out=await PDFDocument.create();if(pdfMode==="images"){for(const file of files){let bytes=await file.arrayBuffer();let image;if(/png/i.test(file.type))image=await out.embedPng(bytes);else if(/jpe?g/i.test(file.type))image=await out.embedJpg(bytes);else{const bitmap=await createImageBitmap(file),canvas=document.createElement("canvas");canvas.width=bitmap.width;canvas.height=bitmap.height;canvas.getContext("2d").drawImage(bitmap,0,0);image=await out.embedPng(await (await fetch(canvas.toDataURL("image/png"))).arrayBuffer());bitmap.close()}const page=out.addPage([image.width,image.height]);page.drawImage(image,{x:0,y:0,width:image.width,height:image.height})}}else{for(const file of files){const src=await PDFDocument.load(await file.arrayBuffer());const pages=await out.copyPages(src,src.getPageIndices());pages.forEach(p=>out.addPage(p))}}const result=pdfMode==="compress"?await (async()=>{const src=await PDFDocument.load(await files[0].arrayBuffer());return src.save({useObjectStreams:true})})():await out.save();download(new Blob([result],{type:"application/pdf"}),pdfMode==="images"?"images.pdf":pdfMode==="merge"?"merged.pdf":"optimized.pdf");status.textContent="Готово. Проверете резултата; при оптимизация размерът не винаги намалява."}catch(err){status.textContent="Неуспешна обработка: "+err.message}};
