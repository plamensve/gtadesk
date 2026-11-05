import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const script = readFileSync(fileURLToPath(new URL("../assets/js/navigation.js", import.meta.url)), "utf8");
const site = "https://gtadesk.com/";

function setup(page, url) {
  const handlers = {};
  const sections = {};
  const cls = () => {
    const values = new Set();
    return {
      toggle(name, enabled) { if (enabled) values.add(name); else values.delete(name); },
      contains(name) { return values.has(name); }
    };
  };
  const links = [
    ["dashboard.html", null],
    ["zaraex.html?tab=loads", "loads"],
    ["zaraex.html?tab=settings", "settings"],
    ["zaraex.html?tab=stay", "stay"],
    ["certifications.html", null],
    ["zaraex.html?tab=pdf", "pdf"]
  ].map(([href, tab]) => {
    const attributes = {};
    return {
      href: site + href, dataset: tab ? { tabTarget: tab } : {},
      classList: cls(), target: "",
      setAttribute(key, val) { attributes[key] = val; },
      removeAttribute(key) { delete attributes[key]; },
      getAttribute(key) { return attributes[key]; },
      hasAttribute() { return false; }
    };
  });
  const buttons = ["loads", "settings", "stay", "pdf"].map(tab => {
    sections[tab] = { hidden: tab !== "loads" };
    return { dataset: { tab }, classList: cls(), setAttribute() {} };
  });
  const sidebar = { querySelectorAll() { return links; }, addEventListener(e, cb) { handlers[`sidebar:${e}`] = cb; } };
  const tabBar = { addEventListener(e, cb) { handlers[`tabs:${e}`] = cb; } };
  const doc = {
    baseURI: url,
    body: { classList: { contains(name) { return name === page; } } },
    querySelector() { return sidebar; },
    querySelectorAll() { return buttons; },
    getElementById(name) { return sections[name] ?? (name === "tabs" ? tabBar : null); },
    dispatchEvent() {}
  };
  const win = {
    location: new URL(url),
    history: {
      entries: [],
      pushState(_state, _title, dest) {
        this.entries.push(dest);
        win.location = new URL(dest);
      }
    },
    addEventListener(type, callback) { handlers[type] = callback; },
    scrollTo() {}
  };
  class CustomEvent { constructor(_type, options) { this.detail = options.detail; } }
  vm.runInNewContext(script, { document: doc, window: win, URL, URLSearchParams, CustomEvent });
  return { sections, links, handlers, win };
}

test("direct catalog link opens only catalogs and selects the sidebar item", () => {
  const ui = setup("gta-zaraex-page", site + "zaraex.html?tab=settings");
  assert.equal(ui.sections.settings.hidden, false);
  assert.equal(ui.sections.loads.hidden, true);
  assert.equal(ui.links[2].classList.contains("active"), true);
  assert.equal(ui.links[2].getAttribute("aria-current"), "page");
});

test("sidebar switches sections without native navigation or scroll fragments", () => {
  const ui = setup("gta-zaraex-page", site + "zaraex.html?tab=settings");
  let prevented = false;
  ui.handlers["sidebar:click"]({
    target: { closest: () => ui.links[5] }, defaultPrevented: false, button: 0,
    preventDefault() { prevented = true; }
  });
  assert.equal(prevented, true);
  assert.equal(ui.win.location.search, "?tab=pdf");
  assert.equal(ui.win.location.hash, "");
  assert.equal(ui.sections.pdf.hidden, false);
  assert.equal(ui.sections.settings.hidden, true);
  assert.equal(ui.win.history.entries.length, 1);

  ui.win.location = new URL(site + "zaraex.html?tab=settings");
  ui.handlers.popstate();
  assert.equal(ui.sections.settings.hidden, false);
  assert.equal(ui.links[2].classList.contains("active"), true);

  ui.handlers["tabs:click"]({ target: { closest: () => ({ dataset: { tab: "stay" } }) } });
  assert.equal(ui.win.location.search, "?tab=stay");
  assert.equal(ui.sections.stay.hidden, false);
});

test("legacy hash routes still work and standalone pages highlight the right menu", () => {
  const legacy = setup("gta-zaraex-page", site + "zaraex.html#stay");
  assert.equal(legacy.sections.stay.hidden, false);
  assert.equal(legacy.links.filter(link => link.classList.contains("active")).length, 1);
  assert.equal(setup("gta-dashboard-page", site + "dashboard.html").links[0].classList.contains("active"), true);
  assert.equal(setup("gta-certs-page", site + "certifications.html").links[4].classList.contains("active"), true);
});
