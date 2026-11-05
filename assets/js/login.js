import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
  import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "../../config.js";
  const el = id => document.getElementById(id);
  const form = el("login-form"), loginButton = el("login-button");
  const message = el("message");
  let client, checkSequence = 0;
  function status(text, error = false) {
    message.textContent = text;
    message.classList.toggle("info", !error);
  }
  function showLogin(text = "", error = false) {
    el("dashboard-view").hidden = true;
    el("login-view").hidden = false;
    el("current-user").textContent = "";
    status(text, error);
  }
  function showDashboard(email) {
    // Access is checked above. Open the separate application dashboard.
    window.location.replace(new URL("./dashboard.html", window.location.href).href);
  }
  async function checkAccess() {
    const current = ++checkSequence;
    try {
      const {data: {user}, error} = await client.auth.getUser();
      if (current !== checkSequence) return;
      if (error || !user) { showLogin(); return; }
      const {data, error: accessError} = await client.from("gtadesk_access")
        .select("user_id").eq("user_id", user.id).maybeSingle();
      if (current !== checkSequence) return;
      if (accessError || !data) {
        await client.auth.signOut();
        if (current === checkSequence) showLogin("Нямате разрешен достъп до GTA Desk.", true);
        return;
      }
      showDashboard(user.email);
    } catch {
      if (current === checkSequence) showLogin("Неуспешна проверка. Опитайте отново.", true);
    }
  }
  el("toggle-password").addEventListener("click", () => {
    const field = el("password"), revealing = field.type === "password";
    field.type = revealing ? "text" : "password";
    el("toggle-password").textContent = revealing ? "Скрий" : "Покажи";
    el("toggle-password").setAttribute("aria-pressed", String(revealing));
  });
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (!client) return;
    const email = el("email").value.trim();
    const password = el("password").value;
    loginButton.disabled = true;
    status("Проверка на данните...");
    try {
      const {error} = await client.auth.signInWithPassword({email, password});
      if (error) { status("Невалиден имейл или парола.", true); return; }
      await checkAccess();
    } catch {
      status("Грешка при свързване. Моля, опитайте отново.", true);
    } finally { loginButton.disabled = false; }
  });
  el("logout-button").addEventListener("click", async () => {
    el("logout-button").disabled = true;
    ++checkSequence;
    try { await client.auth.signOut(); }
    finally { showLogin(); el("logout-button").disabled = false; }
  });
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY || !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(SUPABASE_URL)) {
    showLogin("Входът временно не е конфигуриран.", true);
  } else {
    try {
      client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
      loginButton.disabled = false;
      client.auth.onAuthStateChange(event => {
        if (event === "SIGNED_OUT") { ++checkSequence; showLogin(); }
      });
      await checkAccess();
    } catch {
      showLogin("Услугата за вход не е достъпна.", true);
    }
  }
