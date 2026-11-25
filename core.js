// =====================================================================
// Crypto Coach — core: storage, formatting, market data, navigation, UI helpers
// =====================================================================
const API = "https://api.coingecko.com/api/v3";
let marketData = [], trendingData = [], extraPrices = {}, lastUpdate = null, autoTimer = null;
let currentPage = "home";

// ---------- Storage ----------
function lsGet(k, d){ try{ const r = localStorage.getItem(k); return r ? JSON.parse(r) : d; }catch(e){ return d; } }
function lsSet(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }

// ---------- Text & number helpers ----------
function esc(s){ return String(s ?? "").replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

// Reads numbers people type: "1000", "1,000", "1k", "2.5M", "1.2b"
function parseNum(v){
  if(typeof v === "number") return isFinite(v) ? v : NaN;
  const s = String(v ?? "").trim().replace(/[,\s$]/g, "").toLowerCase();
  if(!s) return NaN;
  const m = s.match(/^(-?\d*\.?\d+)(k|m|b)?$/);
  if(!m) return NaN;
  return parseFloat(m[1]) * ({k:1e3, m:1e6, b:1e9}[m[2]] || 1);
}
const num = v => { const x = parseNum(v); return isFinite(x) ? x : 0; };

// Money: $1,234.56 · $12.3K · $4.56M
function fmtUsd(n, opts){
  opts = opts || {};
  if(n == null || isNaN(n)) return "—";
  const a = Math.abs(n), s = n < 0 ? "-" : (opts.sign && n > 0 ? "+" : "");
  if(a < 1e-8) return s + "$0";
  if(a >= 1e9) return s + "$" + (a/1e9).toFixed(2) + "B";
  if(a >= 1e6) return s + "$" + (a/1e6).toFixed(2) + "M";
  if(opts.compact && a >= 1e4) return s + "$" + (a/1e3).toFixed(1) + "K";
  if(a >= 1) return s + "$" + a.toLocaleString("en-US", {minimumFractionDigits:2, maximumFractionDigits:2});
  return s + "$" + a.toPrecision(3);
}
// Coin prices need more digits for small coins
function fmtPrice(n){
  if(n == null || isNaN(n)) return "—";
  const a = Math.abs(n);
  if(a === 0) return "$0";
  if(a >= 1000) return "$" + n.toLocaleString("en-US", {maximumFractionDigits:2});
  if(a >= 1) return "$" + n.toFixed(a >= 100 ? 2 : 4).replace(/(\.\d\d\d*?)0+$/, "$1");
  return "$" + n.toPrecision(4);
}
// Coin amounts: 1,250 · 2.5K · 1.25M
function fmtQty(n){
  if(n == null || isNaN(n)) return "—";
  const a = Math.abs(n);
  if(a < 1e-12) return "0";
  if(a >= 1e9) return (n/1e9).toFixed(2).replace(/\.?0+$/, "") + "B";
  if(a >= 1e6) return (n/1e6).toFixed(2).replace(/\.?0+$/, "") + "M";
  if(a >= 1e4) return (n/1e3).toFixed(2).replace(/\.?0+$/, "") + "K";
  if(a >= 1) return n.toLocaleString("en-US", {maximumFractionDigits:4});
  return n.toPrecision(5);
}
function fmtPct(v, digits){ if(v == null || isNaN(v)) return "—"; return (v >= 0 ? "+" : "") + v.toFixed(digits ?? 2) + "%"; }
function chg(v){ return `<span class="chg ${v >= 0 ? 'up' : 'down'}">${fmtPct(v)}</span>`; }
function plain(n){ return n.toLocaleString("en-US", {maximumFractionDigits:8}); }
// Shows what a typed amount means, e.g. "1k" → "= 1,000"
function amountHint(raw, unit){
  const s = String(raw ?? "").trim(); if(!s) return "";
  const v = parseNum(s);
  if(isNaN(v)) return `<span class="down">Can't read this number. Try 1000, 1k or 2.5m</span>`;
  return /[kmb]/i.test(s) || /,/.test(s) ? `= ${plain(v)} ${unit || ""}` : "";
}

// K / M buttons next to amount boxes (iPhone number keypad has no letters)
function addSuffix(btn, s){
  const inp = btn.parentElement.querySelector("input"); if(!inp) return;
  let v = inp.value.trim().replace(/[kmb]$/i, "");
  if(!v) v = "1";
  inp.value = v + s;
  inp.dispatchEvent(new Event("input", { bubbles: true }));
}

// ---------- Coin helpers ----------
const SKIP = new Set(["USDT","USDC","DAI","FDUSD","TUSD","USDE","USDD","PYUSD","USD1","USDG","USDS","BUSD","FRAX","USDP","GUSD","LUSD","USDB","RLUSD","EURC","USD0","SUSDE","SUSDS","USDX","USDF","USDTB","BFUSD","USYC","BUIDL","XAUT","PAXG",
  "WBTC","WETH","STETH","WSTETH","WEETH","CBBTC","RETH","WBETH","METH","EZETH","RSETH","LBTC","SOLVBTC","BTCB","WBNB","JITOSOL","MSOL","BNSOL","CBETH","TBTC","WSOL","WTRX"]);
const h1 = c => c.price_change_percentage_1h_in_currency ?? 0;
const h24 = c => c.price_change_percentage_24h_in_currency ?? c.price_change_percentage_24h ?? 0;
const d7 = c => c.price_change_percentage_7d_in_currency ?? 0;
const vm = c => c.market_cap > 0 ? c.total_volume / c.market_cap : 0;
function isSkip(c){
  if(SKIP.has((c.symbol||"").toUpperCase())) return true;
  const p = c.current_price;
  return p > 0.97 && p < 1.03 && Math.abs(h24(c)) < 0.6 && Math.abs(d7(c)) < 1.2;
}
function tradable(){ return marketData.filter(c => !isSkip(c)); }
function sigScore(c){ return h1(c)*0.2 + h24(c)*0.5 + d7(c)*0.3; }
function signal(c){
  const s = sigScore(c);
  if(s > 6) return {label:"Strong uptrend", cls:"b-green", rank:4};
  if(s > 1.5) return {label:"Uptrend", cls:"b-green", rank:3};
  if(s > -1.5) return {label:"Sideways", cls:"b-amber", rank:2};
  return {label:"Downtrend", cls:"b-red", rank:1};
}
function flow(c){
  const r = vm(c), up = h24(c) >= 0;
  if(r >= 0.25) return {label: up ? "Heavy buying" : "Heavy selling", cls: up ? "up" : "down", r};
  if(r >= 0.10) return {label: up ? "Money flowing in" : "Money flowing out", cls: up ? "up" : "down", r};
  return {label:"Quiet", cls:"muted", r};
}
function riskLevel(c){
  if(c.market_cap < 100e6) return {label:"High risk", cls:"b-red"};
  if(c.market_cap < 1e9) return {label:"Medium risk", cls:"b-amber"};
  return {label:"Lower risk", cls:"b-gray"};
}
// Simple "top pick" score: trending up, money coming in, not already overheated
function pickScore(c){
  if(sigScore(c) <= 1.5 || h24(c) > 25 || d7(c) <= 0 || vm(c) < 0.06) return -1;
  return sigScore(c) + Math.min(vm(c), 0.5) * 20;
}
function coinIcon(src){ return `<img src="${esc(src||'')}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`; }

// ---------- Halal list ----------
let halalList = lsGet("cryptobot_halal_list", []);
const isHalal = s => halalList.includes((s||"").toUpperCase());
function setHalalList(list){ halalList = [...new Set(list.map(s => s.trim().toUpperCase()).filter(Boolean))]; lsSet("cryptobot_halal_list", halalList); }
function halalBadge(sym){
  return isHalal(sym) ? `<span class="badge b-blue">☪️ On your list</span>` : "";
}

// ---------- Paper portfolio ----------
let portfolio = lsGet("cryptobot_portfolio", { cash: 10000, positions: {}, history: [] });
function savePortfolio(){ lsSet("cryptobot_portfolio", portfolio); }
function priceOf(id){
  const c = marketData.find(x => x.id === id);
  if(c) return c.current_price;
  if(extraPrices[id]) return extraPrices[id];
  const p = portfolio.positions[id];
  return p ? p.cost/p.qty : null;
}
function portfolioStats(){
  let value = 0, cost = 0;
  Object.entries(portfolio.positions).forEach(([id,p]) => { value += p.qty * (priceOf(id) || 0); cost += p.cost; });
  const closed = portfolio.history.filter(h => h.pnl != null);
  const realized = closed.reduce((a,h) => a + h.pnl, 0);
  const wins = closed.filter(h => h.pnl > 0).length;
  return { cash: portfolio.cash, value, cost, total: portfolio.cash + value, open: value - cost, realized,
    closed: closed.length, winRate: closed.length ? Math.round(wins/closed.length*100) : null, openCount: Object.keys(portfolio.positions).length };
}
function getRiskPct(){ const v = parseFloat(lsGet("cryptobot_riskpct", 1)); return isFinite(v) && v > 0 ? v : 1; }

// ---------- Navigation ----------
const PAGES = { home:"Home", coins:"Find Coins", trades:"My Trades", calc:"Calculator", learn:"Learn", settings:"Settings" };
function go(page){
  if(!PAGES[page]) page = "home";
  // Don't touch the address bar while a login link (from email) is being read
  const authInUrl = /access_token|error_description|error_code/.test(location.hash);
  if(!authInUrl && location.hash !== "#" + page) history.replaceState(null, "", "#" + page);
  currentPage = page;
  Object.keys(PAGES).forEach(p => document.getElementById("page-" + p).classList.toggle("hidden", p !== page));
  document.querySelectorAll("[data-page]").forEach(b => b.classList.toggle("on", b.dataset.page === page));
  document.getElementById("pageH1").textContent = PAGES[page];
  document.getElementById("pageTitleM").textContent = PAGES[page];
  renderPage(page);
  window.scrollTo(0, 0);
}
function renderPage(page){
  page = page || currentPage;
  ({ home: renderHome, coins: renderCoins, trades: renderTrades, calc: renderCalcPage, learn: renderLearn, settings: renderSettings })[page]();
}

// ---------- Modal & toast ----------
let modalStack = 0;
function openModal(title, bodyHtml, opts){
  opts = opts || {};
  const root = document.getElementById("modalRoot");
  root.innerHTML = `<div class="overlay" onclick="if(event.target===this)closeModal()">
    <div class="sheet ${opts.wide ? 'wide' : ''}" role="dialog" aria-modal="true">
      <div class="sheetHead">${opts.icon || ""}<h3>${title}</h3><button class="closeX" onclick="closeModal()" aria-label="Close">✕</button></div>
      <div class="sheetBody" id="modalBody">${bodyHtml}</div>
    </div></div>`;
  document.body.style.overflow = "hidden";
  modalStack = 1;
}
function setModalBody(html){ const b = document.getElementById("modalBody"); if(b) b.innerHTML = html; }
function closeModal(){ document.getElementById("modalRoot").innerHTML = ""; document.body.style.overflow = ""; modalStack = 0; }
document.addEventListener("keydown", e => { if(e.key === "Escape" && modalStack) closeModal(); });
function toast(msg, kind){
  const el = document.createElement("div");
  el.className = "toast " + (kind || "");
  el.textContent = msg;
  document.getElementById("toasts").appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

// ---------- Market data ----------
async function fetchJSON(url){
  const r = await fetch(url);
  if(r.status === 429) throw new Error("CoinGecko's free limit was hit — wait 1 minute and try again.");
  if(!r.ok) throw new Error("Could not load data (" + r.status + ")");
  return r.json();
}
async function refreshAll(manual){
  const el = document.getElementById("dataTime");
  try{
    const [m, t] = await Promise.all([
      fetchJSON(`${API}/coins/markets?vs_currency=usd&order=volume_desc&per_page=150&page=1&price_change_percentage=1h,24h,7d&sparkline=false`),
      fetchJSON(`${API}/search/trending`)
    ]);
    marketData = m; trendingData = t.coins || [];
    const missing = Object.keys(portfolio.positions).filter(id => !marketData.find(c => c.id === id));
    if(missing.length){
      try{ const j = await fetchJSON(`${API}/simple/price?ids=${missing.map(encodeURIComponent).join(",")}&vs_currencies=usd`);
        missing.forEach(id => { if(j[id]?.usd) extraPrices[id] = j[id].usd; }); }catch(e){}
    }
    lastUpdate = new Date();
    el.textContent = "Prices updated " + lastUpdate.toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"});
    if(manual) toast("Prices updated", "ok");
    if(currentPage !== "calc" && currentPage !== "settings") renderPage();
    else if(currentPage === "calc") fillCoinList();
  }catch(e){
    el.textContent = "⚠️ " + e.message;
    if(manual || !marketData.length) toast(e.message, "err");
    if(!marketData.length) renderPage();
  }
}
function setupAutoRefresh(){
  if(autoTimer) clearInterval(autoTimer);
  const ms = parseInt(lsGet("cryptobot_refresh", 60000));
  if(ms > 0) autoTimer = setInterval(() => { if(document.visibilityState === "visible") refreshAll(); }, ms);
}

// ---------- Search (any coin on CoinGecko) ----------
let searchTimer = null;
function openSearch(){
  openModal("Search any coin", `
    <input class="input" id="searchInput" placeholder="Type a name or symbol, e.g. PUMP or Solana" autocomplete="off" oninput="onSearchType()">
    <div class="hint">Tap a coin to open its full research report.</div>
    <div id="searchOut" class="coinList" style="margin-top:10px"></div>`);
  setTimeout(() => document.getElementById("searchInput")?.focus(), 50);
}
function onSearchType(){
  clearTimeout(searchTimer);
  searchTimer = setTimeout(async () => {
    const q = document.getElementById("searchInput")?.value.trim();
    const out = document.getElementById("searchOut"); if(!out) return;
    if(!q || q.length < 2){ out.innerHTML = ""; return; }
    out.innerHTML = `<div class="empty">Searching…</div>`;
    try{
      const j = await fetchJSON(`${API}/search?query=${encodeURIComponent(q)}`);
      const coins = (j.coins || []).slice(0, 10);
      out.innerHTML = coins.length ? coins.map(c => `
        <div class="coinRow" style="grid-template-columns:1fr auto" onclick="openReport('${esc(c.id)}')">
          <div class="coinId">${coinIcon(c.thumb)}<div class="nm"><b>${esc((c.symbol||'').toUpperCase())}</b><span>${esc(c.name)}</span></div></div>
          <span class="badge b-gray">Rank #${c.market_cap_rank ?? '—'}</span>
        </div>`).join("") : `<div class="empty">No coin found for "${esc(q)}"</div>`;
    }catch(e){ out.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
  }, 400);
}

// ---------- Start ----------
function startApp(){
  document.querySelectorAll("[data-page]").forEach(b => b.addEventListener("click", () => go(b.dataset.page)));
  window.addEventListener("hashchange", () => { const p = location.hash.slice(1); if(PAGES[p] && p !== currentPage) go(p); });
  const first = location.hash.slice(1);
  go(PAGES[first] ? first : "home");
  refreshAll();
  setupAutoRefresh();
  if(typeof initCloud === "function") initCloud();
}
