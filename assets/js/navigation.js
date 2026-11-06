/* GTA Desk navigation controller: one route state for sidebar links and ZaraEx tabs. */
(() => {
  "use strict";
  const TABS = ["loads", "settings", "stay", "pdf"];
  const validTabs = new Set(TABS);
  const sidebar = document.querySelector(".gta-unified-sidebar");
  if (!sidebar) return;

  const isZaraex = document.body.classList.contains("gta-zaraex-page");
  const isDashboard = document.body.classList.contains("gta-dashboard-page");
  const isCertifications = document.body.classList.contains("gta-certs-page");
  const isDeliveries = document.body.classList.contains("gta-deliveries-page");
  const dashboardPath = new URL("./dashboard.html", document.baseURI).pathname;
  const certificationsPath = new URL("./certifications.html", document.baseURI).pathname;
  const deliveriesPath = new URL("./deliveries.html", document.baseURI).pathname;
  let currentTab = null;

  function requestedTab() {
    const queryTab = new URLSearchParams(window.location.search).get("tab");
    if (validTabs.has(queryTab)) return queryTab;
    const legacyHashTab = window.location.hash.slice(1);
    return validTabs.has(legacyHashTab) ? legacyHashTab : "loads";
  }

  function syncNavigation() {
    const tab = requestedTab();
    if (isZaraex) {
      const contexts = {
        loads: ["Товарения", "Създаване на товарения и подготовка на XML експорти."],
        settings: ["Номенклатури", "Управление на продукти, транспортни фирми, МПС, шофьори и петролни бази."],
        stay: ["НАП · Престой", "Генериране на декларации за престой в XML формат."],
        pdf: ["PDF инструменти", "Обединяване, компресиране и създаване на PDF файлове."]
      };
      const heading = document.getElementById("workspace-title");
      const description = document.getElementById("workspace-description");
      if (heading) heading.textContent = contexts[tab][0];
      if (description) description.textContent = contexts[tab][1];
      const tabs = document.getElementById("tabs");
      if (tabs) tabs.hidden = !["loads","settings"].includes(tab);
      for (const button of document.querySelectorAll("#tabs [data-tab]")) {
        button.hidden = !["loads","settings"].includes(button.dataset.tab);
      }
      for (const name of TABS) {
        const section = document.getElementById(name);
        if (section) section.hidden = name !== tab;
      }
      for (const button of document.querySelectorAll("#tabs [data-tab]")) {
        const selected = button.dataset.tab === tab;
        button.classList.toggle("active", selected);
        button.setAttribute("aria-pressed", String(selected));
      }
    }

    for (const link of sidebar.querySelectorAll(".gta-sidebar-link")) {
      const url = new URL(link.href, document.baseURI);
      const active = (isZaraex && link.dataset.tabTarget === tab) ||
        (isDashboard && url.pathname === dashboardPath) ||
        (isCertifications && url.pathname === certificationsPath) ||
        (isDeliveries && url.pathname === deliveriesPath);
      link.classList.toggle("active", active);
      if (active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    }

    if (isZaraex && currentTab !== tab) {
      currentTab = tab;
      document.dispatchEvent(new CustomEvent("gtadesk:tabchange", { detail: { tab } }));
    }
  }

  function navigateToTab(tab) {
    if (!isZaraex || !validTabs.has(tab)) return;
    const previousTab = requestedTab();
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);
    url.hash = ""; // Never navigate to a section ID: native fragments cause scroll jumps.
    if (url.href !== window.location.href) {
      window.history.pushState({ gtaTab: tab }, "", url.href);
    }
    syncNavigation();
    if (previousTab !== tab) window.scrollTo(0, 0);
  }

  if (isZaraex) {
    sidebar.addEventListener("click", event => {
      const link = event.target.closest?.("a.gta-sidebar-link[data-tab-target]");
      if (!link || event.defaultPrevented || event.button !== 0 ||
          event.metaKey || event.ctrlKey || event.shiftKey || event.altKey ||
          link.hasAttribute("download") || (link.target && link.target !== "_self")) return;
      const destination = new URL(link.href, document.baseURI);
      if (destination.origin !== window.location.origin ||
          destination.pathname !== window.location.pathname) return;
      event.preventDefault();
      navigateToTab(link.dataset.tabTarget);
    });

    document.getElementById("tabs")?.addEventListener("click", event => {
      const button = event.target.closest?.("[data-tab]");
      if (button) navigateToTab(button.dataset.tab);
    });

    window.addEventListener("popstate", syncNavigation);
    window.addEventListener("hashchange", syncNavigation); // Existing #tab links remain usable.
  }

  // Synchronous initial state, before the asynchronous Supabase authentication.
  syncNavigation();
  window.GtaDeskNavigation = Object.freeze({
    sync: syncNavigation,
    navigateToTab,
    requestedTab
  });
})();
