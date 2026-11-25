// =====================================================================
// Cloud sync (Supabase): log in once, same data on phone and laptop.
// Without logging in, everything is saved only in this browser.
// =====================================================================
const SB_URL = "https://acamdupxvvtvjlsznvgj.supabase.co";
const SB_KEY = "sb_publishable_XSpalAe3FBjzPoNFyirX3w_c0moM3b0"; // public key — data is protected by row-level security
const SYNC_KEYS = ["cryptobot_portfolio", "cryptobot_halal_list", "cryptobot_calcs", "cryptobot_riskpct"];

let sb = null, cloudUser = null, authReady = false, accountMode = "login";
let pendingPush = new Map(), pushTimer = null, lastPull = 0, lastSyncAt = null, syncState = "off", syncMsg = "";

// Every local save of a synced item is also sent to the cloud (when logged in)
const _localSet = lsSet;
lsSet = function(k, v){
  _localSet(k, v);
  if(cloudUser && SYNC_KEYS.includes(k)) queuePush(k, v);
};

function setSync(state, msg){
  syncState = state; syncMsg = msg;
  const dot = document.getElementById("syncDot"), txt = document.getElementById("syncText"), mb = document.getElementById("mAccountBtn");
  if(dot) dot.className = "dot " + ({ok:"ok", busy:"busy", err:"err"}[state] || "");
  if(txt) txt.textContent = msg;
  if(mb) mb.textContent = cloudUser ? "☁️" : "👤";
  const st = document.getElementById("acctStatus"); if(st) st.textContent = msg;
}
function friendlyErr(e){
  const m = (e && (e.message || e.error_description || e.msg)) || String(e || "");
  if(/invalid login credentials/i.test(m)) return "Wrong email or password.";
  if(/email not confirmed/i.test(m)) return "Please confirm your email first — open the email from Supabase (check Spam too) and tap the link.";
  if(/already registered|already been registered|user already exists/i.test(m)) return "An account with this email already exists — please log in.";
  if(/rate limit|too many/i.test(m)) return "Too many tries. Please wait a while (up to an hour) and try again.";
  if(/password should be|at least 6/i.test(m)) return "Password must be at least 6 characters.";
  if(/failed to fetch|network|load failed/i.test(m)) return "No internet connection — please check and try again.";
  if(/expired|invalid.*(link|token|otp)/i.test(m)) return "This link has expired. Please try again.";
  return m;
}

// ---------- Push (this device → cloud) ----------
function queuePush(k, v){
  pendingPush.set(k, v);
  clearTimeout(pushTimer);
  setSync("busy", "Saving to cloud…");
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
    rows.forEach(r => { if(!pendingPush.has(r.key)) pendingPush.set(r.key, r.value); });
    setSync("err", "Cloud save failed — will retry");
    return false;
  }
  lastSyncAt = new Date();
  setSync("ok", "Synced " + lastSyncAt.toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"}));
  return true;
}

// ---------- Pull (cloud → this device) ----------
function reloadLocalState(){
  portfolio = lsGet("cryptobot_portfolio", { cash: 10000, positions: {}, history: [] });
  halalList = lsGet("cryptobot_halal_list", []);
  if(typeof renderPage === "function") renderPage();
}
async function pullFromCloud(firstLogin){
  if(!sb || !cloudUser) return;
  await flushPush();
  setSync("busy", "Syncing…");
  const { data, error } = await sb.from("user_kv").select("key,value,updated_at");
  if(error){ setSync("err", "Sync failed: " + friendlyErr(error)); return; }
  lastPull = Date.now();
  const cloudKeys = new Set(); let backup = null;
  (data || []).forEach(row => {
    if(!SYNC_KEYS.includes(row.key)) return;
    cloudKeys.add(row.key);
    const localRaw = localStorage.getItem(row.key), cloudRaw = JSON.stringify(row.value);
    if(localRaw !== null && localRaw !== cloudRaw){ backup = backup || {}; backup[row.key] = localRaw; }
    try{ localStorage.setItem(row.key, cloudRaw); }catch(e){}
  });
  if(backup){ try{ localStorage.setItem("cryptobot_backup_before_sync", JSON.stringify({ at: new Date().toISOString(), data: backup })); }catch(e){} }
  // Items that exist only on this device go up to the cloud
  let uploaded = 0;
  SYNC_KEYS.forEach(k => {
    if(cloudKeys.has(k)) return;
    const raw = localStorage.getItem(k); if(raw === null) return;
    try{ pendingPush.set(k, JSON.parse(raw)); uploaded++; }catch(e){}
  });
  reloadLocalState();
  if(uploaded) await flushPush();
  lastSyncAt = new Date();
  setSync("ok", "Synced " + lastSyncAt.toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"}));
  if(firstLogin) toast(cloudKeys.size ? "Logged in — your data is here ✅" : "Logged in — this device's data is now saved to the cloud ✅", "ok");
}

// ---------- Account card (Settings page) ----------
function renderAccountCard(){
  const el = document.getElementById("accountCard"); if(!el) return;
  if(!sb){ el.innerHTML = `<h2>☁️ Account & sync</h2><p class="lead">Cloud sync couldn't load. Check your internet and refresh the page.</p>`; return; }
  if(!authReady){ el.innerHTML = `<h2>☁️ Account & sync</h2><p class="lead">Checking if you're logged in…</p>`; return; }
  if(accountMode === "recovery"){
    el.innerHTML = `<h2>🔑 Choose a new password</h2>
      <form onsubmit="event.preventDefault();setNewPassword()">
        <div class="field" style="margin-top:12px"><label class="f">New password</label>
          <input class="input" type="password" id="newPass" autocomplete="new-password" minlength="6" placeholder="At least 6 characters"></div>
        <button class="btn block" type="submit">Save new password</button>
      </form><div class="hint" id="acctMsg"></div>`;
    return;
  }
  if(cloudUser){
    el.innerHTML = `<h2>☁️ Account & sync</h2>
      <div class="note" style="margin:10px 0"><div class="muted" style="font-size:12px">Logged in as</div><b style="word-break:break-all">${esc(cloudUser.email)}</b>
        <div class="row" style="margin-top:6px;font-size:12.5px"><span class="dot ${syncState === 'ok' ? 'ok' : syncState === 'err' ? 'err' : 'busy'}"></span><span id="acctStatus">${esc(syncMsg)}</span></div></div>
      <p class="lead">Your practice trades, journal, halal list, saved calculator coins and risk setting are saved in the cloud. Log in with the same email on your phone and laptop to see the same data.
        You stay logged in on this device until you log out.</p>
      <div class="row"><button class="btn block" onclick="syncNow()">↻ Sync now</button><button class="btn ghost block" onclick="logout()">Log out</button></div>`;
    return;
  }
  const remembered = lsGet("cryptobot_remember_email", "");
  el.innerHTML = `<h2>☁️ Log in to sync</h2>
    <p class="lead">Log in to keep the same data on your phone and laptop. New here? Enter your email and a password, then tap <b>Create account</b>.</p>
    <form id="loginForm" onsubmit="event.preventDefault();login()" autocomplete="on">
      <div class="field"><label class="f" for="lEmail">Email</label>
        <input class="input" type="email" id="lEmail" name="email" autocomplete="username" inputmode="email" value="${esc(remembered)}" placeholder="you@example.com" required></div>
      <div class="field"><label class="f" for="lPass">Password</label>
        <div class="amt"><input class="input" type="password" id="lPass" name="password" autocomplete="current-password" placeholder="At least 6 characters" required>
        <button type="button" class="btn ghost" style="padding:0 12px" onclick="const p=document.getElementById('lPass');p.type=p.type==='password'?'text':'password'">👁</button></div></div>
      <label class="row" style="font-size:13.5px;color:var(--sub);margin-bottom:14px;gap:8px"><input type="checkbox" id="lRemember" ${remembered || !lsGet("cryptobot_remember_set", false) ? "checked" : ""} style="width:18px;height:18px"> Remember my email on this device</label>
      <div class="row"><button class="btn block" type="submit">Log in</button><button class="btn ghost block" type="button" onclick="signup()">Create account</button></div>
    </form>
    <div class="row" style="justify-content:space-between;margin-top:10px"><button class="link" onclick="forgotPassword()">Forgot password?</button></div>
    <div class="hint" id="acctMsg"></div>
    <p class="muted" style="font-size:12px;margin:10px 0 0">Tip: when your phone asks "Save password?", tap <b>Save</b>. Next time it fills it in for you.</p>`;
}
function acctMsg(t, kind){
  const el = document.getElementById("acctMsg"); if(!el) return;
  el.className = "hint " + (kind === "err" ? "down" : kind === "ok" ? "up" : "");
  el.textContent = t;
}
function rememberEmail(email){
  const box = document.getElementById("lRemember");
  lsSet("cryptobot_remember_set", true);
  if(box && box.checked) lsSet("cryptobot_remember_email", email); else _localSet("cryptobot_remember_email", "");
}

// ---------- Auth actions ----------
async function login(){
  const email = document.getElementById("lEmail").value.trim(), pass = document.getElementById("lPass").value;
  if(!email || !pass){ acctMsg("Enter your email and password.", "err"); return; }
  rememberEmail(email);
  acctMsg("Logging in…");
  const { error } = await sb.auth.signInWithPassword({ email, password: pass });
  if(error) acctMsg(friendlyErr(error), "err");
}
async function signup(){
  const email = document.getElementById("lEmail").value.trim(), pass = document.getElementById("lPass").value;
  if(!email || !pass){ acctMsg("Enter your email and choose a password.", "err"); return; }
  if(pass.length < 6){ acctMsg("Password must be at least 6 characters.", "err"); return; }
  rememberEmail(email);
  acctMsg("Creating your account…");
  const { data, error } = await sb.auth.signUp({ email, password: pass, options: { emailRedirectTo: location.origin + location.pathname } });
  if(error){ acctMsg(friendlyErr(error), "err"); return; }
  if(!data.session) acctMsg("📧 Almost done! We sent you an email (check Spam too). Tap the link inside and you'll be logged in.", "ok");
}
async function forgotPassword(){
  const email = (document.getElementById("lEmail")?.value || "").trim();
  if(!email){ acctMsg("Type your email above first, then tap 'Forgot password?'.", "err"); return; }
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
  acctMsg(error ? friendlyErr(error) : "📧 We sent you a link to reset your password.", error ? "err" : "ok");
}
async function setNewPassword(){
  const p = document.getElementById("newPass").value;
  if(p.length < 6){ acctMsg("Password must be at least 6 characters.", "err"); return; }
  const { error } = await sb.auth.updateUser({ password: p });
  if(error){ acctMsg(friendlyErr(error), "err"); return; }
  accountMode = "login"; renderAccountCard(); toast("New password saved ✅", "ok");
}
async function logout(){
  await flushPush();
  await sb.auth.signOut();
  toast("Logged out. Your data stays on this device.", "ok");
}
async function syncNow(){ await pullFromCloud(false); toast("Synced ✅", "ok"); renderAccountCard(); }

// ---------- Start ----------
async function onUser(user, event){
  if(user && (!cloudUser || cloudUser.id !== user.id)){
    cloudUser = user;
    if(/access_token/.test(location.hash)){ history.replaceState(null, "", location.pathname + "#home"); }
    setSync("busy", "Syncing…");
    renderAccountCard();
    await pullFromCloud(event === "SIGNED_IN");
    renderAccountCard();
  } else if(!user && cloudUser){
    cloudUser = null; pendingPush.clear();
    setSync("off", "Not logged in · tap to log in");
    renderAccountCard();
  }
}
function initCloud(){
  const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
  const linkErr = hash.get("error_description");
  if(!window.supabase || !window.supabase.createClient){ authReady = true; setSync("err", "Cloud sync unavailable"); return; }
  sb = window.supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storage: window.localStorage } });
  setSync("busy", "Checking login…");
  sb.auth.onAuthStateChange((event, session) => {
    const user = session ? session.user : null;
    // Supabase advises not to call other Supabase functions inside this callback directly
    setTimeout(async () => {
      if(!authReady){ authReady = true; if(!user) setSync("off", "Not logged in · tap to log in"); }
      if(event === "PASSWORD_RECOVERY"){
        cloudUser = user; accountMode = "recovery"; go("settings"); renderAccountCard(); return;
      }
      await onUser(user, event);
      if(currentPage === "settings") renderAccountCard();
    }, 0);
  });
  if(linkErr){
    history.replaceState(null, "", location.pathname + "#settings");
    setTimeout(() => { go("settings"); acctMsg("The email link didn't work: " + friendlyErr({ message: linkErr }), "err"); }, 400);
  }
  // Coming back to the tab (e.g. after using the other device) → fetch fresh data
  document.addEventListener("visibilitychange", () => {
    if(!cloudUser) return;
    if(document.visibilityState === "hidden") flushPush();
    else if(Date.now() - lastPull > 30000) pullFromCloud(false);
  });
  window.addEventListener("pagehide", () => { if(cloudUser) flushPush(); });
}
