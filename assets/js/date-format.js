/** Date presentation always uses DD.MM.YYYY; storage and filtering remain ISO YYYY-MM-DD. */
export function formatDateDMY(value){
  const iso=String(value??"").slice(0,10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso)?iso.slice(8,10)+"."+iso.slice(5,7)+"."+iso.slice(0,4):"";
}
export function parseDateDMY(value){
  const text=String(value??"").trim();
  if(!text)return "";
  const match=/^(\d{2})\.(\d{2})\.(\d{4})$/.exec(text);
  if(!match)return null;
  const day=Number(match[1]),month=Number(match[2]),year=Number(match[3]);
  if(year<1000||month<1||month>12||day<1||day>31)return null;
  const check=new Date(Date.UTC(year,month-1,day));
  if(check.getUTCFullYear()!==year||check.getUTCMonth()+1!==month||check.getUTCDate()!==day)return null;
  return [match[3],match[2],match[1]].join("-");
}

/**
 * Wrap native date inputs in an explicit DD.MM.YYYY text editor and a calendar
 * trigger. The native input preserves ISO values, built-in date parsing and
 * application filters, but is not used for visible formatting.
 */
export function installDayMonthYearInputs(root=document){
  const controls=[];
  for(const native of root.querySelectorAll('input[type="date"]')){
    if(native.dataset.dateDisplayReady==="true")continue;
    native.dataset.dateDisplayReady="true";
    const wrapper=root.createElement("span");
    wrapper.className="date-display-wrap";
    const display=root.createElement("input");
    display.type="text";
    display.inputMode="numeric";
    display.className="date-display-input";
    display.placeholder="DD.MM.YYYY";
    display.maxLength=10;
    display.autocomplete="off";
    display.spellcheck=false;
    display.required=native.required;
    native.required=false; // Only the visible DD.MM.YYYY control participates in validation.
    display.setAttribute("aria-label",(native.closest(".field")?.querySelector("label")?.textContent||native.id||"Дата")+" — ден/месец/година");
    const picker=root.createElement("button");
    picker.type="button";
    picker.className="date-display-picker";
    picker.setAttribute("aria-label","Избери дата от календар");
    picker.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/></svg>';
    let isTyping=false;
    const synchronize=()=>{
      display.value=formatDateDMY(native.value);
      display.setCustomValidity("");
    };
    display.addEventListener("input",()=>{
      isTyping=true;
      const parsed=parseDateDMY(display.value);
      const invalid=parsed===null;
      display.setCustomValidity(invalid?"Използвай DD.MM.YYYY и реална календарна дата.":"");
      const next=parsed||"";
      if(native.value!==next){
        native.value=next;
        native.dispatchEvent(new Event("input",{bubbles:true}));
        native.dispatchEvent(new Event("change",{bubbles:true}));
      }
      isTyping=false;
    });
    display.addEventListener("blur",()=>{
      if(!display.value.trim())synchronize();
      else if(parseDateDMY(display.value)!==null)synchronize();
    });
    native.addEventListener("input",()=>{if(!isTyping)synchronize();});
    native.addEventListener("change",()=>{if(!isTyping)synchronize();});
    picker.addEventListener("click",()=>{
      if(typeof native.showPicker==="function")native.showPicker();
      else native.focus();
    });
    wrapper.append(display,picker);
    native.insertAdjacentElement("afterend",wrapper);
    native.classList.add("date-native-input");
    native.tabIndex=-1;
    synchronize();
    controls.push({native,display,synchronize});
  }
  return ()=>{for(const c of controls)c.synchronize();};
}
