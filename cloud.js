// =====================================================================
// ---------- Cloud Sync (Supabase) ----------
// Paper portfolio, journal, halal list, calculator saves aur risk % ko
// login ke baad Supabase mein save karta hai, taake phone aur laptop
// dono par same data mile. Login ke baghair sab kuch pehle ki tarah
// sirf is browser mein save hota hai.
// =====================================================================
const SB_URL = "https://acamdupxvvtvjlsznvgj.supabase.co";
const SB_KEY = "sb_publishable_XSpalAe3FBjzPoNFyirX3w_c0moM3b0"; // public key — data Row Level Security se mehfooz hai
const SYNC_KEYS = ["cryptobot_portfolio", "cryptobot_halal_list", "cryptobot_calcs", "cryptobot_riskpct"];

let sb = null, cloudUser = null, cloudMode = "login";
let pendingPush = new Map(), pushTimer = null, lastPull = 0, lastSyncAt = null, cloudState = "off";

// Har local save ke baad (agar login hai) cloud par bhi bhejo
const _localSet = lsSet;
lsSet = function(k, v){
  _localSet(k, v);
  if(cloudUser && SYNC_KEYS.includes(k)) queuePush(k, v);
};

function setCloudStatus(state, text){
  cloudState = state;
  const el = document.getElementById("cloudStatus");
  const btn = document.getElementById("cloudBtn");
  if(btn) btn.textContent = cloudUser ? "☁️ " + cloudUser.email.split("@")[0] : "☁️ Login / Sync";
  if(!el) return;
  const color = {ok:"var(--green)", busy:"var(--muted)", err:"var(--red)", off:"var(--muted)"}[state] || "var(--muted)";
  el.style.color = color;
  el.textContent = text;
}

function cloudErr(e){
  const m = (e && (e.message || e.error_description || e.msg)) || String(e || "");
  if(/invalid login credentials/i.test(m)) return "Email ya password ghalat hai.";
  if(/email not confirmed/i.test(m)) return "Pehle email confirm karein — inbox (ya Spam) mein Supabase ki email ka link dabayein.";
  if(/already registered|already been registered|user already exists/i.test(m)) return "Is email se account pehle se bana hua hai — Login karein.";
  if(/rate limit|too many/i.test(m)) return "Bohot zyada koshishein — thori der (taqreeban 1 ghanta) baad try karein.";
  if(/password should be|at least 6/i.test(m)) return "Password kam se kam 6 characters ka ho.";
  if(/failed to fetch|network/i.test(m)) return "Internet ka masla — connection check karein.";
  if(/expired|invalid.*(link|token|otp)/i.test(m)) return "Link expire ho gaya — dobara try karein.";
  return m;
}

// ---------- Push (local → cloud) ----------
function queuePush(k, v){
  pendingPush.set(k, v);
  clearTimeout(pushTimer);
  setCloudStatus("busy", "☁️ Save ho raha hai…");
  pushTimer = setTimeout(flushPush, 800);
}
async function flushPush(){
  clearTimeout(pushTimer);
  if(!sb || !cloudUser || !pendingPush.size) return true;
  const now = new Date().toISOString();
  const rows = [...pendingPush].map(([key, value]) => ({ user_id: cloudUser.id, key, value, updated_at: now }));
  pendingPush.clear();
  const { error } = await sb.from("user_kv").upsert(rows, { onConflict: "user_id,key" });
  if(error){
    rows.forEach(r => { if(!pendingPush.has(r.key)) pendingPush.set(r.key, r.value); }); // dobara koshish ke liye
    setCloudStatus("err", "⚠️ Cloud save fail: " + cloudErr(error));
    return false;
  }
  lastSyncAt = new Date();
  setCloudStatus("ok", "☁️ Synced " + lastSyncAt.toLocaleTimeString());
  return true;
}

// ---------- Pull (cloud → local) ----------
function reloadLocalState(){
  portfolio = lsGet("cryptobot_portfolio", { cash: 10000, positions: {}, history: [] });
  halalList = lsGet("cryptobot_halal_list", []);
  const hi = document.getElementById("halalListInput"); if(hi) hi.value = halalList.join(", ");
  renderAll();
  renderSaved();
}
async function pullFromCloud(firstLogin){
  if(!sb || !cloudUser) return;
  await flushPush();
  setCloudStatus("busy", "☁️ Cloud se data aa raha hai…");
  const { data, error } = await sb.from("user_kv").select("key,value,updated_at");
  if(error){ setCloudStatus("err", "⚠️ Sync fail: " + cloudErr(error)); return; }
  lastPull = Date.now();
  const cloudKeys = new Set();
  let backup = null;
  (data || []).forEach(row => {
    if(!SYNC_KEYS.includes(row.key)) return;
    cloudKeys.add(row.key);
    const localRaw = localStorage.getItem(row.key);
    const cloudRaw = JSON.stringify(row.value);
    if(localRaw !== null && localRaw !== cloudRaw){ backup = backup || {}; backup[row.key] = localRaw; }
    try{ localStorage.setItem(row.key, cloudRaw); }catch(e){}
  });
  if(backup){ try{ localStorage.setItem("cryptobot_backup_before_sync", JSON.stringify({ at: new Date().toISOString(), data: backup })); }catch(e){} }
  // Jo data sirf is device par hai (cloud mein nahi), usay cloud par bhej do
  let uploaded = 0;
  SYNC_KEYS.forEach(k => {
    if(cloudKeys.has(k)) return;
    const raw = localStorage.getItem(k);
    if(raw === null) return;
    try{ pendingPush.set(k, JSON.parse(raw)); uploaded++; }catch(e){}
  });
  reloadLocalState();
  if(uploaded) await flushPush();
  lastSyncAt = new Date();
  setCloudStatus("ok", "☁️ Synced " + lastSyncAt.toLocaleTimeString());
  if(firstLogin){
    const msg = cloudKeys.size === 0
      ? "✅ Login ho gaya. Is device ka data cloud par save kar diya — ab doosre device par isi email se login karein."
      : "✅ Login ho gaya. Aapka cloud data is device par aa gaya.";
    showCloudMsg(msg, "ok");
  }
}

// ---------- Auth ----------
async function cloudLogin(){
  const email = document.getElementById("cEmail").value.trim(), pass = document.getElementById("cPass").value;
  if(!email || !pass){ showCloudMsg("Email aur password dono likhein.", "err"); return; }
  showCloudMsg("⏳ Login ho raha hai…");
  const { error } = await sb.auth.signInWithPassword({ email, password: pass });
  if(error) showCloudMsg(cloudErr(error), "err");
}
async function cloudSignup(){
  const email = document.getElementById("cEmail").value.trim(), pass = document.getElementById("cPass").value;
  if(!email || !pass){ showCloudMsg("Email aur password dono likhein.", "err"); return; }
  if(pass.length < 6){ showCloudMsg("Password kam se kam 6 characters ka ho.", "err"); return; }
  showCloudMsg("⏳ Account ban raha hai…");
  const { data, error } = await sb.auth.signUp({ email, password: pass, options: { emailRedirectTo: location.origin + location.pathname } });
  if(error){ showCloudMsg(cloudErr(error), "err"); return; }
  if(!data.session){
    showCloudMsg("📧 Account ban gaya! Aapki email par confirm link bheja hai (Spam folder bhi dekhein). Link dabane ke baad yeh site khul jayegi aur aap login ho jayenge.", "ok");
  }
}
async function cloudForgot(){
  const email = document.getElementById("cEmail").value.trim();
  if(!email){ showCloudMsg("Pehle upar apni email likhein, phir 'Password bhool gaye' dabayein.", "err"); return; }
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
  showCloudMsg(error ? cloudErr(error) : "📧 Password reset ka link email par bhej diya. Link dabayein, site khulegi aur naya password poochegi.", error ? "err" : "ok");
}
async function cloudSetNewPassword(){
  const p = document.getElementById("cNewPass").value;
  if(p.length < 6){ showCloudMsg("Password kam se kam 6 characters ka ho.", "err"); return; }
  const { error } = await sb.auth.updateUser({ password: p });
  if(error){ showCloudMsg(cloudErr(error), "err"); return; }
  cloudMode = "account"; renderCloudModal();
  showCloudMsg("✅ Naya password set ho gaya.", "ok");
}
async function cloudLogout(){
  await flushPush();
  await sb.auth.signOut();
  showCloudMsg("Logout ho gaye. Is device par data mehfooz hai, lekin ab cloud se sync nahi hoga.", "ok");
}
async function cloudSyncNow(){ await pullFromCloud(false); showCloudMsg("✅ Sync ho gaya.", "ok"); }

// ---------- UI ----------
function openCloud(){
  if(!sb){ alert("Cloud sync abhi load nahi hua (internet check karein aur page refresh karein)."); return; }
  if(cloudMode !== "recovery") cloudMode = cloudUser ? "account" : "login";
  renderCloudModal();
  document.getElementById("cloudBg").style.display = "flex";
}
function closeCloud(){ document.getElementById("cloudBg").style.display = "none"; }
function showCloudMsg(t, kind){
  const el = document.getElementById("cloudMsg"); if(!el) return;
  el.style.color = kind === "err" ? "var(--red)" : kind === "ok" ? "var(--green)" : "var(--muted)";
  el.textContent = t;
}
function renderCloudModal(){
  const box = document.getElementById("cloudBox");
  const inp = 'style="width:100%;padding:9px 10px;font-size:14px;border-radius:8px;margin-bottom:10px"';
  let body;
  if(cloudMode === "recovery"){
    body = `<p class="small" style="font-size:12.5px">Naya password likhein:</p>
      <input type="password" id="cNewPass" placeholder="Naya password (6+ characters)" ${inp}>
      <button class="btn" style="width:100%" onclick="cloudSetNewPassword()">Password save karein</button>`;
  } else if(cloudUser){
    body = `<div class="card" style="margin-bottom:12px"><div class="t">Login hain</div><div class="v" style="font-size:14px;word-break:break-all">${esc(cloudUser.email)}</div>
        <div class="n">${lastSyncAt ? "Aakhri sync: " + lastSyncAt.toLocaleString() : "Sync ho raha hai…"}</div></div>
      <p class="small" style="font-size:12.5px;line-height:1.6">Aapke paper trades, journal, halal list, calculator ke saved hisab aur risk % cloud mein save ho rahe hain.
        Phone ya laptop par yahi email/password daal kar login karein — same data milega.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn" style="flex:1" onclick="cloudSyncNow()">🔄 Abhi sync karein</button>
        <button class="btn secondary" style="flex:1" onclick="cloudLogout()">Logout</button>
      </div>`;
  } else {
    body = `<p class="small" style="font-size:12.5px;line-height:1.6">Login karne se aapka data cloud (Supabase) mein save hoga aur <b>phone + laptop dono</b> par same milega.
        Pehli dafa? Email aur naya password likh kar <b>Naya account</b> dabayein.</p>
      <input type="email" id="cEmail" placeholder="Email" autocomplete="email" ${inp}>
      <input type="password" id="cPass" placeholder="Password (6+ characters)" autocomplete="current-password" ${inp}>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn" style="flex:1" onclick="cloudLogin()">Login</button>
        <button class="btn secondary" style="flex:1" onclick="cloudSignup()">Naya account</button>
      </div>
      <div style="margin-top:10px"><a class="link" href="javascript:void(0)" onclick="cloudForgot()">Password bhool gaye?</a></div>`;
  }
  box.innerHTML = `<span class="close" onclick="closeCloud()">✕</span><h3>☁️ Cloud Sync</h3>${body}
    <div id="cloudMsg" class="small" style="margin-top:12px;font-size:12.5px;line-height:1.5"></div>`;
}

// ---------- Init ----------
function initCloud(){
  // Email link se wapas aaye aur koi error hai (jaise link expire)
  const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
  const linkErr = hash.get("error_description");
  if(!window.supabase || !window.supabase.createClient){ setCloudStatus("off", "☁️ Cloud sync load nahi hua"); return; }
  sb = window.supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  setCloudStatus("off", "☁️ Sirf is device par save (login nahi)");
  sb.auth.onAuthStateChange((event, session) => {
    const user = session ? session.user : null;
    // Supabase ke callback ke andar seedha doosri calls nahi karni chahiye — isliye setTimeout
    setTimeout(async () => {
      if(event === "PASSWORD_RECOVERY"){
        cloudUser = user; cloudMode = "recovery"; openCloud(); return;
      }
      if(user && (!cloudUser || cloudUser.id !== user.id)){
        cloudUser = user;
        if(location.hash.includes("access_token")) history.replaceState(null, "", location.pathname + location.search);
        const modalOpen = document.getElementById("cloudBg").style.display === "flex";
        await pullFromCloud(event === "SIGNED_IN");
        if(modalOpen && cloudMode !== "recovery"){ cloudMode = "account"; renderCloudModal(); showCloudMsg(cloudState === "ok" ? "✅ Login ho gaya, data sync ho gaya." : "", "ok"); }
      } else if(!user && cloudUser){
        cloudUser = null; pendingPush.clear();
        setCloudStatus("off", "☁️ Sirf is device par save (login nahi)");
        if(document.getElementById("cloudBg").style.display === "flex"){ cloudMode = "login"; renderCloudModal(); showCloudMsg("Logout ho gaye.", "ok"); }
      }
    }, 0);
  });
  if(linkErr){
    history.replaceState(null, "", location.pathname + location.search);
    setTimeout(() => { openCloud(); showCloudMsg("Email link kaam nahi kiya: " + cloudErr({ message: linkErr }), "err"); }, 300);
  }
  // Doosre device par kaam karke wapas aaye to taaza data lo
  document.addEventListener("visibilitychange", () => {
    if(!cloudUser) return;
    if(document.visibilityState === "hidden") flushPush();
    else if(Date.now() - lastPull > 30000) pullFromCloud(false);
  });
  window.addEventListener("pagehide", () => { if(cloudUser) flushPush(); });
}
