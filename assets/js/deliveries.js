import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "../../config.js";
import { escapeHtml as escape } from "./dom.js";

const $ = id => document.getElementById(id);
const client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
let records = [], editId = null, activeDeclaration = "", currentPage = 0;
const PAGE_SIZE = 50;
const fields = ["delivered_on","document_date","ark","invoice_no","declaration_no","tractor","tanker","quantity_liters","counterparty","destination","notes"];
const prettyDate = date => date ? date.slice(8,10) + "." + date.slice(5,7) + "." + date.slice(0,4) : "—";
const safe = value => escape(String(value ?? ""));
const status = (message, bad = false) => {
  $("status").textContent = message;
  $("status").classList.toggle("bad", bad);
};

async function guard() {
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) throw Error("Необходим е вход в GTA Desk.");
  const { data, error: accessError } = await client.from("gtadesk_access").select("user_id").eq("user_id", user.id).maybeSingle();
  if (accessError || !data) throw Error("Нямате разрешен достъп.");
  $("account-email").textContent = user.email || "Одобрен потребител";
  $("guard").hidden = true;
  $("app").hidden = false;
  document.querySelector(".gta-unified-sidebar").hidden = false;
}

function formReset() {
  editId = null;
  $("delivery-form").reset();
  $("form-title").textContent = "Нова доставка";
  $("save").textContent = "Запиши доставка";
  $("cancel").hidden = true;
  $("delivery-form").elements.declaration_no.value = activeDeclaration || "";
  $("form-status").textContent = "";
}

function edit(record) {
  editId = record.id;
  for (const key of fields) $("delivery-form").elements[key].value = record[key] ?? "";
  $("form-title").textContent = "Редакция на доставка";
  $("save").textContent = "Запази промените";
  $("cancel").hidden = false;
  $("form-panel").scrollIntoView({ behavior: "smooth", block: "start" });
}

function normalized(value) {
  return String(value || "").trim().toLocaleLowerCase("bg");
}

function visibleRows() {
  const q = normalized($("search").value);
  const from = $("date-from").value;
  const to = $("date-to").value;
  return records.filter(r => {
    if (activeDeclaration && r.declaration_no !== activeDeclaration) return false;
    if (from && (!r.delivered_on || r.delivered_on < from)) return false;
    if (to && (!r.delivered_on || r.delivered_on > to)) return false;
    if (!q) return true;
    return [r.ark,r.invoice_no,r.declaration_no,r.tractor,r.tanker,r.counterparty,r.destination,r.notes,r.source_sheet]
      .some(v => normalized(v).includes(q));
  });
}

function render() {
  const grouped = new Map();
  for (const record of records) {
    const key = record.declaration_no;
    if (!grouped.has(key)) grouped.set(key, { count:0, liters:0 });
    const value = grouped.get(key);
    value.count++;
    value.liters += Number(record.quantity_liters || 0);
  }
  const groups = [...grouped].sort((a,b) => a[0].localeCompare(b[0], "bg", { numeric:true }));
  $("declaration-options").innerHTML = groups.map(([name]) => '<option value="' + safe(name) + '"></option>').join("");
  $("group-list").innerHTML =
    '<button type="button" class="group-card ' + (!activeDeclaration ? "selected" : "") + '" data-declaration=""><b>Всички</b><span>' + records.length + ' доставки</span></button>' +
    groups.map(([name, group]) => '<button type="button" class="group-card ' + (activeDeclaration === name ? "selected" : "") +
      '" data-declaration="' + safe(name) + '"><b>Декларация ' + safe(name) + '</b><span>' + group.count +
      ' доставки · ' + Math.round(group.liters).toLocaleString("bg-BG") + ' л</span></button>').join("");
  $("metrics").textContent = records.length + " доставки · " + groups.length + " декларации";
  $("active-group").textContent = activeDeclaration ? "Декларация " + activeDeclaration : "Всички декларации";
  const rows = visibleRows();
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  currentPage = Math.min(currentPage, pageCount - 1);
  const shown = rows.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  $("records-body").innerHTML = shown.map(record => '<tr>' +
    '<td>' + prettyDate(record.delivered_on) + '</td>' +
    '<td class="mono">' + safe(record.ark) + '</td>' +
    '<td>' + safe(record.invoice_no || "—") + '</td>' +
    '<td><span class="decl-label">' + safe(record.declaration_no) + '</span></td>' +
    '<td>' + safe(record.tractor || "—") + '</td>' +
    '<td>' + safe(record.tanker || "—") + '</td>' +
    '<td class="number">' + (record.quantity_liters == null ? "—" : Number(record.quantity_liters).toLocaleString("bg-BG",{ maximumFractionDigits:3 })) + '</td>' +
    '<td>' + safe(record.destination || "—") + '</td>' +
    '<td><div class="row-buttons"><button type="button" data-edit="' + record.id + '">Редакция</button><button type="button" data-move="' + record.id + '">Отдели</button><button type="button" class="danger" data-delete="' + record.id + '">Изтрий</button></div></td>' +
    '</tr>').join("") || '<tr><td colspan="9" class="empty">Няма намерени доставки.</td></tr>';
  $("pagination").textContent = rows.length + " записа · страница " + (currentPage+1) + " от " + pageCount;
  $("previous").disabled = currentPage === 0;
  $("next").disabled = currentPage >= pageCount-1;
  $("export").disabled = rows.length === 0;
}

async function load() {
  status("Зареждане на доставките...");
  const list = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await client.from("gta_deliveries").select("*")
      .order("created_at", { ascending: false }).range(offset, offset + 999);
    if (error) throw error;
    list.push(...data);
    if (data.length < 1000) break;
  }
  records = list;
  render();
  status("Данните са актуални.");
}

$("delivery-form").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const payload = Object.fromEntries(fields.map(key => [key, String(form.elements[key].value).trim()]));
  for (const key of ["delivered_on","document_date"]) payload[key] ||= null;
  payload.quantity_liters = payload.quantity_liters ? Number(payload.quantity_liters) : null;
  if (payload.quantity_liters !== null && (!Number.isFinite(payload.quantity_liters) || payload.quantity_liters < 0)) {
    $("form-status").textContent = "Невалидно количество."; return;
  }
  $("save").disabled = true;
  $("form-status").textContent = "Записване...";
  try {
    const query = editId
      ? client.from("gta_deliveries").update(payload).eq("id", editId).select("id")
      : client.from("gta_deliveries").insert(payload).select("id");
    const { data, error } = await query.single();
    if (error) throw error;
    if (!data) throw Error("Записът не беше потвърден.");
    formReset();
    await load();
    status("Доставката е записана успешно.");
  } catch (error) {
    $("form-status").textContent = "Грешка при запис: " + error.message;
  } finally { $("save").disabled = false; }
});

$("cancel").addEventListener("click", formReset);
$("new-delivery").addEventListener("click", () => {
  formReset(); $("form-panel").scrollIntoView({ behavior:"smooth" });
});
$("reload").addEventListener("click", () => load().catch(error => status(error.message, true)));
$("group-list").addEventListener("click", event => {
  const btn = event.target.closest("[data-declaration]");
  if (!btn) return;
  activeDeclaration = btn.dataset.declaration;
  currentPage = 0;
  render();
  formReset();
});
for (const id of ["search","date-from","date-to"]) {
  $(id).addEventListener("input", () => { currentPage=0; render(); });
}
$("clear-filters").addEventListener("click", () => {
  $("search").value = ""; $("date-from").value = ""; $("date-to").value = "";
  activeDeclaration = ""; currentPage=0; render();
});
$("previous").addEventListener("click", () => { currentPage--;render(); });
$("next").addEventListener("click", () => { currentPage++;render(); });
$("records-body").addEventListener("click", async event => {
  const button = event.target.closest("button[data-edit],button[data-move],button[data-delete]");
  if (!button) return;
  const id = button.dataset.edit || button.dataset.move || button.dataset.delete;
  const record = records.find(r => r.id === id);
  if (!record) return;
  if (button.dataset.edit) { edit(record); return; }
  if (button.dataset.move) {
    edit(record);
    $("delivery-form").elements.declaration_no.focus();
    $("form-status").textContent = "Промени номера на декларацията и натисни „Запази промените“.";
    return;
  }
  if (!window.confirm("Да се изтрие ли доставката с АРК " + record.ark + "?")) return;
  button.disabled = true;
  try {
    const { data, error } = await client.from("gta_deliveries").delete().eq("id", id).select("id").single();
    if (error) throw error;
    if (!data) throw Error("Неуспешно изтриване.");
    if (editId === id) formReset();
    await load();
    status("Доставката е изтрита.");
  } catch (error) { status("Неуспешно изтриване: " + error.message, true); }
  finally { button.disabled = false; }
});

function csvValue(value) {
  const str = String(value ?? "");
  return '"' + str.replaceAll('"','""') + '"';
}
$("export").addEventListener("click", () => {
  const headers = ["Дата на доставка","Дата на документ","АРК","Фактура №","Декларация №","Влекач","Цистерна","Литри","Контрагент","Населено място","Бележки"];
  const data = visibleRows().map(r => fields.map(key => csvValue(r[key])).join(";"));
  const text = "\uFEFF" + headers.map(csvValue).join(";") + "\r\n" + data.join("\r\n");
  const url = URL.createObjectURL(new Blob([text],{type:"text/csv;charset=utf-8"}));
  const anchor = document.createElement("a");
  anchor.href=url; anchor.download = activeDeclaration ? "декларация-" + activeDeclaration.replace(/[^a-zA-Z0-9_-]/g,"_") + ".csv" : "доставки-декларации.csv";
  document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$("logout").addEventListener("click", async () => { await client.auth.signOut(); location.replace("./"); });
client.auth.onAuthStateChange(event => { if (event === "SIGNED_OUT") location.replace("./"); });
try { await guard(); await load(); }
catch (error) {
  $("guard").textContent = error.message;
  if (!$("app").hidden) status(error.message,true);
  else setTimeout(() => location.replace("./"), 2500);
}
