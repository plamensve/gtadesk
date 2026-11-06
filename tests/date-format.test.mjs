import test from "node:test";
import assert from "node:assert/strict";
import {formatDateDMY,parseDateDMY} from "../assets/js/date-format.js";
test("All dates are DD/MM/YYYY in the UI",()=>{
 assert.equal(formatDateDMY("2026-11-06"),"06/11/2026");
 assert.equal(formatDateDMY("2026-11-06T11:12:00Z"),"06/11/2026");
 assert.equal(formatDateDMY(null),"");
});
test("Calendar storage stays ISO and validates actual days",()=>{
 assert.equal(parseDateDMY("06/11/2026"),"2026-11-06");
 assert.equal(parseDateDMY("29/02/2024"),"2024-02-29");
 assert.equal(parseDateDMY("31/02/2026"),null);
 assert.equal(parseDateDMY("29/02/2026"),null);
 assert.equal(parseDateDMY("11/06/26"),null);
 assert.equal(parseDateDMY(""),"");
});
