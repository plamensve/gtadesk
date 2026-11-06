import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const script = readFileSync(new URL("../assets/js/clock.js", import.meta.url), "utf8");

function at(utc) {
  const d = { textContent:"" }, t = { textContent:"" }, clock = {
    querySelector(selector) { return selector === ".gta-clock-date" ? d : t; },
    setAttribute(key,value) { this[key]=value; }
  };
  const OriginalDate = Date;
  class FixedDate extends OriginalDate { constructor(...args) { super(...(args.length ? args : [utc])); } }
  const document = { querySelectorAll() { return [clock]; }, addEventListener() {}, hidden:false };
  vm.runInNewContext(script, { document, Date:FixedDate, Intl, window: { setInterval() {}, addEventListener() {} } });
  return { date:d.textContent, time:t.textContent, dateTime:clock.datetime };
}

test("clock shows Bulgarian winter time even when host is UTC", () => {
  assert.deepEqual(at("2026-11-06T13:23:45Z"), { date:"06.11.2026", time:"15:23:45", dateTime:"2026-11-06T15:23:45" });
});

test("clock handles summer daylight-saving time in Sofia", () => {
  assert.deepEqual(at("2026-07-06T12:13:14Z"), { date:"06.07.2026", time:"15:13:14", dateTime:"2026-07-06T15:13:14" });
});
