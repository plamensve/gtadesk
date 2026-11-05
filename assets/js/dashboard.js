import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "../../config.js";
const home = new URL("./", location.href);
const login = () => location.replace(home.href);
try {
 const client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
 const {data:{user},error} = await client.auth.getUser();
 if(error || !user) {login();}
 else {
  const {data:allowed,error:policyError} = await client.from("gtadesk_access").select("user_id").eq("user_id",user.id).maybeSingle();
  if(policyError || !allowed) {await client.auth.signOut();login();}
  else {
   document.getElementById("account-email").textContent=user.email || "Одобрен потребител";
   document.getElementById("loading").hidden=true;
   document.getElementById("app").hidden=false;
   client.auth.onAuthStateChange(event=>{if(event==="SIGNED_OUT") login();});
   async function logout(){await client.auth.signOut();login();}
   document.getElementById("logout").addEventListener("click",logout);
   document.getElementById("mobile-logout").addEventListener("click",logout);
  }
 }
} catch {login();}
