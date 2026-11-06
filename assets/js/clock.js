/* Digital clock for Europe/Sofia — shared by all pages. */
(() => {
  "use strict";
  const clocks = [...document.querySelectorAll("[data-gta-clock]")];
  if (!clocks.length) return;
  const date = new Intl.DateTimeFormat("bg-BG", {timeZone:"Europe/Sofia",year:"numeric",month:"2-digit",day:"2-digit"});
  const time = new Intl.DateTimeFormat("bg-BG", {timeZone:"Europe/Sofia",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"});
  const parts = format => Object.fromEntries(format.formatToParts(new Date()).map(p => [p.type,p.value]));
  function refresh() {
    const d=parts(date), t=parts(time), day=d.day+"."+d.month+"."+d.year, hour=t.hour+":"+t.minute+":"+t.second;
    for (const clock of clocks) {
      clock.querySelector(".gta-clock-date").textContent=day;
      clock.querySelector(".gta-clock-time").textContent=hour;
      clock.setAttribute("datetime",d.year+"-"+d.month+"-"+d.day+"T"+hour);
      clock.title="Дата и час в София, България (Europe/Sofia)";
    }
  }
  refresh();
  window.setInterval(refresh,1000);
  document.addEventListener("visibilitychange",()=>{if(!document.hidden)refresh();});
  window.addEventListener("pageshow",refresh);
})();