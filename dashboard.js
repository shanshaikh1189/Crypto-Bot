const API = "https://api.coingecko.com/api/v3";
let marketData = [], trendingData = [], extraPrices = {};
let autoTimer = null, pendingBuy = null, scannerSort = {key:'vm', dir:-1};
const reportCache = {};
let currentReport = null;

// ---------- Storage helpers ----------
function lsGet(k, d){ try{ const r = localStorage.getItem(k); return r ? JSON.parse(r) : d; }catch(e){ return d; } }
function lsSet(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }

// ---------- Stablecoins / wrapped (no trading value) ----------
const SKIP = new Set(["USDT","USDC","DAI","FDUSD","TUSD","USDE","USDD","PYUSD","USD1","USDG","USDS","BUSD","FRAX","USDP","GUSD","LUSD","USDB","RLUSD","EURC","USD0","SUSDE","SUSDS","USDX","USDF","USDTB","BFUSD","USYC","BUIDL","XAUT","PAXG",
  "WBTC","WETH","STETH","WSTETH","WEETH","CBBTC","RETH","WBETH","METH","EZETH","RSETH","LBTC","SOLVBTC","BTCB","WBNB","JITOSOL","MSOL","BNSOL","CBETH","TBTC","WSOL","WTRX"]);
function isSkip(c){
  if(SKIP.has((c.symbol||"").toUpperCase())) return true;
  const p = c.current_price, d = h24(c), w = d7(c);
  return p > 0.97 && p < 1.03 && Math.abs(d) < 0.6 && Math.abs(w) < 1.2;
}

// ---------- Field helpers ----------
const h1 = c => c.price_change_percentage_1h_in_currency ?? 0;
const h24 = c => c.price_change_percentage_24h_in_currency ?? c.price_change_percentage_24h ?? 0;
const d7 = c => c.price_change_percentage_7d_in_currency ?? 0;
const vm = c => c.market_cap > 0 ? c.total_volume / c.market_cap : 0;
function esc(s){ return String(s ?? "").replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function fmt(n){
  if(n === undefined || n === null || isNaN(n)) return "-";
  const a = Math.abs(n);
  if(a < 1e-8) return "0";
  if(a >= 1e9) return (n/1e9).toFixed(2)+"B";
  if(a >= 1e6) return (n/1e6).toFixed(2)+"M";
  if(a >= 1000) return n.toLocaleString(undefined,{minimumFractionDigits:2, maximumFractionDigits:2});
  if(a >= 1) return n.toFixed(2);
  if(a === 0) return "0";
  return n.toPrecision(4);
}
function fmtP(n){
  if(n === undefined || n === null || isNaN(n)) return "-";
  const a = Math.abs(n);
  if(a >= 1000) return n.toLocaleString(undefined,{maximumFractionDigits:2});
  if(a >= 1) return n.toFixed(a >= 100 ? 2 : 4).replace(/(\.\d\d\d*?)0+$/, "$1");
  if(a === 0) return "0";
  return n.toPrecision(4);
}
function pctSpan(v){
  if(v === undefined || v === null || isNaN(v)) return `<span class="small">-</span>`;
  return `<span class="${v>=0?'pos':'neg'}">${v>=0?'+':''}${v.toFixed(2)}%</span>`;
}
function coinCell(c){ return `<span class="coin"><img src="${esc(c.image)}" onerror="this.style.display='none'">${esc((c.symbol||'').toUpperCase())}</span>`; }
function reportBtn(id){ return `<button class="miniBtn an" onclick="openReport('${esc(id)}')">📋 Report</button>`; }

// ---------- Halal list ----------
let halalList = lsGet("cryptobot_halal_list", []);
function saveHalalList(){
  halalList = document.getElementById("halalListInput").value.split(",").map(s=>s.trim().toUpperCase()).filter(Boolean);
  lsSet("cryptobot_halal_list", halalList);
  renderAll();
  alert("Halal list save ho gayi (" + halalList.length + " coins).");
}
const isHalal = s => halalList.includes((s||"").toUpperCase());
function halalBadge(symbol){
  const sym = (symbol||"").toUpperCase();
  const link = `https://halalscreener.app/en/stock/CRYPTO:${encodeURIComponent(sym)}`;
  return isHalal(sym) ? `<span class="badge halal">☪️ List</span>` : `<a class="link" href="${link}" target="_blank">☪️ check</a>`;
}

// ---------- Signal ----------
function sigScore(c){ return h1(c)*0.2 + h24(c)*0.5 + d7(c)*0.3; }
function classifySignal(c){
  const s = sigScore(c);
  if(s > 6) return {label:"Strong Bullish", cls:"strongbull"};
  if(s > 1.5) return {label:"Bullish", cls:"bull"};
  if(s > -1.5) return {label:"Neutral", cls:"neutral"};
  return {label:"Bearish / Avoid", cls:"bear"};
}
function rotationRead(c){
  const r = vm(c);
  if(r >= 0.25) return h24(c) >= 0 ? "🟢 Bohot tez inflow" : "🔴 Bohot tez selling";
  if(r >= 0.10) return h24(c) >= 0 ? "🟢 Inflow" : "🔴 Outflow";
  return "⚪ Normal activity";
}
function baseCoins(){
  let list = marketData.filter(c => !isSkip(c));
  if(document.getElementById("halalOnly").checked) list = list.filter(c => isHalal(c.symbol));
  return list;
}

// ---------- Portfolio ----------
let portfolio = lsGet("cryptobot_portfolio", { cash: 10000, positions: {}, history: [] });
function savePortfolio(){ lsSet("cryptobot_portfolio", portfolio); }
function resetPortfolio(){
  if(!confirm("Portfolio reset karein? Saari positions aur journal mit jayega.")) return;
  portfolio = { cash: 10000, positions: {}, history: [] }; savePortfolio(); renderPortfolio();
}
function priceOf(id){
  const c = marketData.find(x => x.id === id);
  if(c) return c.current_price;
  if(extraPrices[id]) return extraPrices[id];
  const pos = portfolio.positions[id];
  return pos ? pos.cost/pos.qty : null;
}
function equity(){
  let v = portfolio.cash;
  Object.entries(portfolio.positions).forEach(([id,p]) => v += p.qty * (priceOf(id) || 0));
  return v;
}
function openBuyModal(id, symbol, price, prefill){
  prefill = prefill || {};
  pendingBuy = { id, symbol, price };
  document.getElementById("buyModalTitle").textContent = "Paper Buy " + symbol.toUpperCase();
  document.getElementById("buyModalPrice").textContent = "$" + fmtP(price);
  document.getElementById("buyModalCash").textContent = "$" + fmt(portfolio.cash);
  document.getElementById("buyAmount").value = Math.floor(Math.min(prefill.amount ?? 500, portfolio.cash));
  document.getElementById("buySL").value = prefill.sl ? +prefill.sl.toPrecision(5) : +(price*0.95).toPrecision(5);
  document.getElementById("buyTP").value = prefill.tp ? +prefill.tp.toPrecision(5) : +(price*1.08).toPrecision(5);
  document.getElementById("buyNote").value = prefill.note || "";
  document.getElementById("buyModalBg").style.display = "flex";
}
function closeBuyModal(){ document.getElementById("buyModalBg").style.display = "none"; pendingBuy = null; }
function confirmBuy(){
  if(!pendingBuy) return;
  const amt = parseFloat(document.getElementById("buyAmount").value);
  const sl = parseFloat(document.getElementById("buySL").value);
  const tp = parseFloat(document.getElementById("buyTP").value);
  const note = document.getElementById("buyNote").value.trim();
  if(!amt || amt <= 0){ alert("Sahi amount likhein"); return; }
  if(amt > portfolio.cash){ alert("Itna cash available nahi hai"); return; }
  if(sl && sl >= pendingBuy.price){ alert("Stop-Loss entry price se neeche hona chahiye"); return; }
  const qty = amt / pendingBuy.price;
  const pos = portfolio.positions[pendingBuy.id] || { symbol: pendingBuy.symbol, qty: 0, cost: 0 };
  pos.qty += qty; pos.cost += amt; pos.symbol = pendingBuy.symbol;
  if(sl) pos.sl = sl; if(tp) pos.tp = tp;
  portfolio.positions[pendingBuy.id] = pos;
  portfolio.cash -= amt;
  portfolio.history.unshift({ t: new Date().toLocaleString(), id: pendingBuy.id, symbol: pendingBuy.symbol, side: "BUY", qty, price: pendingBuy.price, pnl: null, note });
  savePortfolio(); closeBuyModal(); renderPortfolio();
}
function sellPosition(id, fraction){
  const pos = portfolio.positions[id]; if(!pos) return;
  const price = priceOf(id);
  const qty = pos.qty * fraction, costPart = pos.cost * fraction;
  const proceeds = qty * price, pnl = proceeds - costPart;
  const note = prompt("Kyun bech rahe hain? (journal note — khaali bhi chhor sakte hain)", fraction < 1 ? "TP1 par aadha profit book" : "") || "";
  portfolio.cash += proceeds;
  portfolio.history.unshift({ t: new Date().toLocaleString(), id, symbol: pos.symbol, side: fraction < 1 ? "SELL 50%" : "SELL", qty, price, pnl, note });
  if(fraction >= 1){ delete portfolio.positions[id]; } else { pos.qty -= qty; pos.cost -= costPart; }
  savePortfolio(); renderPortfolio();
}
function editSLTP(id){
  const pos = portfolio.positions[id]; if(!pos) return;
  const sl = prompt(pos.symbol.toUpperCase() + " — Stop-Loss price (Report ke Trade Plan se):", pos.sl ?? "");
  if(sl === null) return;
  const tp = prompt(pos.symbol.toUpperCase() + " — Take-Profit (TP1) price:", pos.tp ?? "");
  if(tp === null) return;
  pos.sl = parseFloat(sl) || null; pos.tp = parseFloat(tp) || null;
  savePortfolio(); renderPortfolio();
}
function renderPortfolio(){
  let posValue = 0, totalCost = 0;
  const tbody = document.querySelector("#positionsTable tbody");
  tbody.innerHTML = "";
  const ids = Object.keys(portfolio.positions);
  if(!ids.length) tbody.innerHTML = `<tr><td colspan="7" class="small">Koi open position nahi.</td></tr>`;
  ids.forEach(id => {
    const pos = portfolio.positions[id];
    const cur = priceOf(id), value = pos.qty * cur, pnl = value - pos.cost, avg = pos.cost/pos.qty;
    posValue += value; totalCost += pos.cost;
    let status = `<span class="small">Chal raha hai</span>`;
    if(pos.sl && cur <= pos.sl) status = `<span class="badge bear">🛑 SL hit — bechein</span>`;
    else if(pos.tp && cur >= pos.tp) status = `<span class="badge strongbull">🎯 TP hit — profit lein</span>`;
    const tr = document.createElement("tr");
    tr.innerHTML = `<td class="coin">${esc(pos.symbol.toUpperCase())}</td>
      <td>$${fmtP(avg)}</td><td>$${fmtP(cur)}</td>
      <td class="small"><span class="neg">${pos.sl?'$'+fmtP(pos.sl):'-'}</span> / <span class="pos">${pos.tp?'$'+fmtP(pos.tp):'-'}</span></td>
      <td class="${pnl>=0?'pos':'neg'}">${pnl>=0?'+':''}$${fmt(pnl)} (${((pnl/pos.cost)*100).toFixed(1)}%)</td>
      <td>${status}</td>
      <td><button class="miniBtn an" onclick="openReport('${esc(id)}')">📋</button>
        <button class="miniBtn" title="SL/TP set karein" onclick="editSLTP('${esc(id)}')">✏️</button>
        <button class="miniBtn sell" onclick="sellPosition('${esc(id)}',0.5)">50%</button>
        <button class="miniBtn sell" onclick="sellPosition('${esc(id)}',1)">Sell</button></td>`;
    tbody.appendChild(tr);
  });

  const hb = document.querySelector("#historyTable tbody");
  hb.innerHTML = "";
  portfolio.history.slice(0,50).forEach(h => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td class="small">${esc(h.t)}</td><td>${esc(h.symbol.toUpperCase())}</td>
      <td class="${h.side==='BUY'?'pos':'neg'}">${esc(h.side)}</td><td>$${fmtP(h.price)}</td>
      <td>${h.pnl==null?'-':`<span class="${h.pnl>=0?'pos':'neg'}">${h.pnl>=0?'+':''}$${fmt(h.pnl)}</span>`}</td>
      <td class="small" style="white-space:normal; max-width:220px">${esc(h.note||'')}</td>`;
    hb.appendChild(tr);
  });

  const closed = portfolio.history.filter(h => h.pnl != null);
  const realized = closed.reduce((a,h)=>a+h.pnl,0);
  const wins = closed.filter(h=>h.pnl>0).length;
  const openPnl = posValue - totalCost;
  document.getElementById("portfolioKpis").innerHTML = `
    <div class="kpi"><div class="label">Cash</div><div class="val">$${fmt(portfolio.cash)}</div></div>
    <div class="kpi"><div class="label">Positions Value</div><div class="val">$${fmt(posValue)}</div></div>
    <div class="kpi"><div class="label">Total Equity</div><div class="val">$${fmt(portfolio.cash+posValue)}</div></div>
    <div class="kpi"><div class="label">Open P&amp;L</div><div class="val ${openPnl>=0?'pos':'neg'}">${openPnl>=0?'+':''}$${fmt(openPnl)}</div></div>
    <div class="kpi"><div class="label">Realized P&amp;L</div><div class="val ${realized>=0?'pos':'neg'}">${realized>=0?'+':''}$${fmt(realized)}</div></div>
    <div class="kpi"><div class="label">Win Rate</div><div class="val">${closed.length ? Math.round(wins/closed.length*100)+'%' : '-'}</div><div class="small">${closed.length} closed trades</div></div>`;
}

// ---------- Tabs ----------
const TABS = ["scanner","signals","hunter","gainers","trending","halal","guide"];
function switchTab(name){
  TABS.forEach(t => document.getElementById("tab-"+t).style.display = (t===name) ? "block" : "none");
  document.querySelectorAll(".tab").forEach(el => el.classList.toggle("active", el.dataset.tab === name));
}

// ---------- Tables ----------
function sortScanner(key){
  scannerSort = { key, dir: scannerSort.key === key ? -scannerSort.dir : -1 };
  renderScanner();
}
function renderScanner(){
  const getters = { price:c=>c.current_price, h1, h24, d7, score:sigScore, vm, mcap:c=>c.market_cap };
  const g = getters[scannerSort.key];
  const list = [...baseCoins()].sort((a,b)=>(g(a)-g(b))*scannerSort.dir);
  const tb = document.querySelector("#scannerTable tbody"); tb.innerHTML = "";
  list.forEach(c => {
    const s = classifySignal(c);
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${coinCell(c)}</td><td>$${fmtP(c.current_price)}</td>
      <td>${pctSpan(h1(c))}</td><td>${pctSpan(h24(c))}</td><td>${pctSpan(d7(c))}</td>
      <td><span class="badge ${s.cls}">${s.label}</span></td>
      <td>${(vm(c)*100).toFixed(1)}% <span class="small">${rotationRead(c).split(' ')[0]}</span></td>
      <td>$${fmt(c.market_cap)}</td><td>${halalBadge(c.symbol)}</td><td>${reportBtn(c.id)}</td>`;
    tb.appendChild(tr);
  });
}
function renderSignals(){
  const tpPct = parseFloat(document.getElementById("tpPct").value) || 6;
  const slPct = parseFloat(document.getElementById("slPct").value) || 4;
  const tb = document.querySelector("#signalsTable tbody"); tb.innerHTML = "";
  [...baseCoins()].sort((a,b)=>b.total_volume-a.total_volume).slice(0,20).forEach(c => {
    const s = classifySignal(c), e = c.current_price;
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${coinCell(c)}</td><td>$${fmtP(e)}</td><td>${pctSpan(h1(c))}</td><td>${pctSpan(h24(c))}</td><td>${pctSpan(d7(c))}</td>
      <td><span class="badge ${s.cls}">${s.label}</span></td><td>$${fmtP(e)}</td>
      <td class="pos">$${fmtP(e*(1+tpPct/100))}</td><td class="neg">$${fmtP(e*(1-slPct/100))}</td>
      <td>${halalBadge(c.symbol)}</td><td>${reportBtn(c.id)}</td>`;
    tb.appendChild(tr);
  });
}
function renderHunter(){
  const tb = document.querySelector("#hunterTable tbody"); tb.innerHTML = "";
  [...baseCoins()].filter(c=>c.market_cap>0).sort((a,b)=>vm(b)-vm(a)).slice(0,20).forEach(c => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${coinCell(c)}</td><td>$${fmtP(c.current_price)}</td><td>${pctSpan(h24(c))}</td>
      <td>$${fmt(c.total_volume)}</td><td>$${fmt(c.market_cap)}</td><td>${(vm(c)*100).toFixed(1)}%</td>
      <td class="small">${rotationRead(c)}</td><td>${halalBadge(c.symbol)}</td><td>${reportBtn(c.id)}</td>`;
    tb.appendChild(tr);
  });
}
function riskTag(c){
  if(c.market_cap < 100e6) return `<span class="badge bear">High Risk</span>`;
  if(c.market_cap < 1e9) return `<span class="badge neutral">Medium</span>`;
  return `<span class="badge bull">Lower</span>`;
}
function renderGainers(){
  const tb = document.querySelector("#gainersTable tbody"); tb.innerHTML = "";
  [...baseCoins()].filter(c=>c.total_volume>200000).sort((a,b)=>h24(b)-h24(a)).slice(0,20).forEach((c,i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${i+1}</td><td>${coinCell(c)}</td><td>$${fmtP(c.current_price)}</td><td>${pctSpan(h24(c))}</td><td>${pctSpan(h1(c))}</td>
      <td>$${fmt(c.total_volume)}</td><td>${riskTag(c)}</td><td>${halalBadge(c.symbol)}</td><td>${reportBtn(c.id)}</td>`;
    tb.appendChild(tr);
  });
}
function renderTrending(){
  const tb = document.querySelector("#trendingTable tbody"); tb.innerHTML = "";
  trendingData.forEach((t,i) => {
    const it = t.item; const ch = it.data?.price_change_percentage_24h?.usd;
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${i+1}</td><td><span class="coin"><img src="${esc(it.thumb)}" onerror="this.style.display='none'">${esc(it.symbol.toUpperCase())}</span></td>
      <td>#${it.market_cap_rank ?? '-'}</td><td>${pctSpan(ch)}</td><td>${reportBtn(it.id)}</td>`;
    tb.appendChild(tr);
  });
}
function renderAll(){ renderScanner(); renderSignals(); renderHunter(); renderGainers(); renderTrending(); renderPortfolio(); }

// ---------- Indicators ----------
const sma = (arr, n) => arr.length < n ? null : arr.slice(-n).reduce((a,b)=>a+b,0)/n;
function rsi(p, n=14){
  if(p.length < n+1) return null;
  let g=0, l=0;
  for(let i=p.length-n; i<p.length; i++){ const d = p[i]-p[i-1]; if(d>=0) g+=d; else l-=d; }
  if(l === 0) return 100;
  return 100 - 100/(1 + (g/n)/(l/n));
}
function sparkline(prices, sup, res){
  const w=520, h=120, pad=6;
  const min = Math.min(...prices, sup), max = Math.max(...prices, res);
  const x = i => pad + i*(w-2*pad)/(prices.length-1);
  const y = v => h-pad - (v-min)/(max-min||1)*(h-2*pad);
  const pts = prices.map((v,i)=>`${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const up = prices[prices.length-1] >= prices[0];
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="width:100%;height:120px;background:var(--panel2);border-radius:10px">
    <line x1="0" x2="${w}" y1="${y(res)}" y2="${y(res)}" stroke="#ef4444" stroke-dasharray="4 4" stroke-width="1" vector-effect="non-scaling-stroke"/>
    <line x1="0" x2="${w}" y1="${y(sup)}" y2="${y(sup)}" stroke="#22c55e" stroke-dasharray="4 4" stroke-width="1" vector-effect="non-scaling-stroke"/>
    <polyline points="${pts}" fill="none" stroke="${up?'#4ade80':'#f87171'}" stroke-width="2" vector-effect="non-scaling-stroke"/>
  </svg>
  <div class="small" style="display:flex;gap:16px;margin-top:4px"><span style="color:#f87171">- - Resistance (30d high) $${fmtP(res)}</span><span style="color:#4ade80">- - Support (14d low) $${fmtP(sup)}</span></div>`;
}

// ---------- Coin Report (research panel) ----------
function closeReport(){ document.getElementById("reportBg").style.display = "none"; currentReport = null; }
async function openReport(id){
  document.getElementById("searchResults").style.display = "none";
  const bg = document.getElementById("reportBg"), box = document.getElementById("reportBox");
  bg.style.display = "flex";
  box.innerHTML = `<span class="close" onclick="closeReport()">✕</span><h3>⏳ Research ho rahi hai…</h3><div class="small">CoinGecko se coin details aur 30 din ka chart la rahe hain.</div>`;
  try{
    let data = reportCache[id];
    if(!data || Date.now() - data.at > 180000){
      const [dRes, cRes] = await Promise.all([
        fetch(`${API}/coins/${encodeURIComponent(id)}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`),
        fetch(`${API}/coins/${encodeURIComponent(id)}/market_chart?vs_currency=usd&days=30&interval=daily`)
      ]);
      if(dRes.status === 429 || cRes.status === 429) throw new Error("CoinGecko ki free limit lag gayi — 1 minute baad dobara try karein");
      if(!dRes.ok || !cRes.ok) throw new Error("Data nahi mila (" + dRes.status + "/" + cRes.status + ")");
      data = { d: await dRes.json(), chart: await cRes.json(), at: Date.now() };
      reportCache[id] = data;
    }
    currentReport = { id, data };
    renderReport();
  }catch(e){
    box.innerHTML = `<span class="close" onclick="closeReport()">✕</span><h3>❌ Report load nahi hui</h3><div class="small">${esc(e.message)}</div>`;
  }
}

function renderReport(){
  const { id, data } = currentReport; const d = data.d, md = d.market_data || {};
  const prices = (data.chart.prices||[]).map(p=>p[1]);
  const vols = (data.chart.total_volumes||[]).map(v=>v[1]);
  const price = md.current_price?.usd ?? prices[prices.length-1];
  const sym = (d.symbol||"").toUpperCase();
  const mcap = md.market_cap?.usd || 0, fdv = md.fully_diluted_valuation?.usd || 0;
  const circ = md.circulating_supply || 0, total = md.total_supply || 0, maxS = md.max_supply || 0;
  const supplyBase = maxS || total;
  const circPct = supplyBase ? circ/supplyBase*100 : null;
  const mcFdv = fdv ? mcap/fdv : null;
  const vol24 = md.total_volume?.usd || 0;
  const vmr = mcap ? vol24/mcap : 0;
  const c24 = md.price_change_percentage_24h ?? 0, c7 = md.price_change_percentage_7d ?? 0, c30 = md.price_change_percentage_30d ?? 0;
  const athChg = md.ath_change_percentage?.usd;

  const s20 = sma(prices, 20), r14 = rsi(prices, 14);
  const volNow = vols[vols.length-1], volAvg = sma(vols.slice(0,-1), 14);
  const volX = volAvg ? volNow/volAvg : null;
  const last14 = prices.slice(-15);
  const support = Math.min(...last14), resistance = Math.max(...prices);

  let sl = Math.max(support*0.98, price*0.85);
  let slNote = "14-din ke support se 2% neeche (wahan stop-hunt ke baad bhi bach jayein).";
  if(sl >= price*0.97){ sl = price*0.97; slNote = "Price support ke bohot qareeb hai, isliye minimum 3% ka SL rakha."; }
  if(sl === price*0.85) slNote = "Support bohot door tha, isliye SL 15% par cap kiya (zyada risk mat lein).";
  const risk = price - sl;
  const tp1 = price + risk*1.5, tp2 = price + risk*2.5, tp3 = price + risk*4;
  const rrToRes = resistance > price ? (resistance-price)/risk : 0;
  const riskPct = parseFloat(lsGet("cryptobot_riskpct", 1));
  const eq = equity();
  const riskUsd = eq * riskPct/100;
  let posUsd = riskUsd / (risk/price);
  const capped = posUsd > eq*0.2; if(capped) posUsd = eq*0.2;

  const checks = [];
  const add = (ok, title, why) => checks.push({ok, title, why});
  add(s20 ? price > s20 : null, "Trend upar hai (price 20-din average se upar)", s20 ? `Price $${fmtP(price)} vs SMA20 $${fmtP(s20)}. Trend ke saath trade karna aasaan hota hai.` : "Data kam hai.");
  add(c24 > 0 && c7 > 0, "Momentum positive (24h aur 7d dono green)", `24h ${c24.toFixed(1)}%, 7d ${c7.toFixed(1)}%.`);
  add(r14 == null ? null : (r14 >= 40 && r14 <= 68), "RSI healthy zone mein (40–68)", r14==null ? "Data kam hai." : (r14 > 68 ? `RSI ${r14.toFixed(0)} — overbought, coin pehle hi bohot chal chuka, late entry ka risk.` : r14 < 40 ? `RSI ${r14.toFixed(0)} — kamzor/oversold, abhi girne wala chaku pakadne jaisa ho sakta hai.` : `RSI ${r14.toFixed(0)} — na zyada garam na thanda.`));
  add(volX == null ? null : volX >= 1.2, "Volume normal se zyada (aaj ≥ 1.2x average)", volX==null ? "-" : `Aaj ka volume 14-din average ka ${volX.toFixed(2)}x hai. Volume ke baghair move kamzor hota hai.`);
  add(vmr >= 0.08, "Money rotation (Vol/MCap ≥ 8%)", `Vol/MCap ${(vmr*100).toFixed(1)}% — ${vmr>=0.25?'bohot active':vmr>=0.08?'active':'thanda'}.`);
  add(rrToRes >= 2, "Resistance tak kam se kam 1:2 Risk:Reward", `SL tak risk ${(risk/price*100).toFixed(1)}%, pehli rukawat (30d high) tak ${rrToRes.toFixed(1)}R ka faasla.`);
  add(circPct == null ? null : circPct >= 50, "Zyada tar supply market mein aa chuki (≥ 50%)", circPct==null ? "Max/total supply ka data nahi." : `${circPct.toFixed(0)}% supply circulate ho rahi hai. Baqi ${(100-circPct).toFixed(0)}% aage unlock ho kar bik sakti hai.`);
  add(mcFdv == null ? null : mcFdv >= 0.5, "Market Cap / FDV ≥ 0.5 (dilution kam)", mcFdv==null ? "FDV data nahi." : `MC/FDV = ${mcFdv.toFixed(2)}. ${mcFdv<0.5?'FDV market cap se kaafi bara hai — future unlocks price daba sakte hain.':'Theek hai.'}`);
  add(isHalal(sym) ? true : null, "Aapki Halal list mein hai", isHalal(sym) ? "Haan." : "List mein nahi — pehle apni screening services se verify karein.");
  const scored = checks.filter(c => c.ok !== null);
  const pass = scored.filter(c => c.ok).length;
  let verdict;
  if(!isHalal(sym) && halalList.length) verdict = {cls:"bad", t:`⛔ ${pass}/${scored.length} — Pehle halal verify karein, uske baghair entry na lein.`};
  else if(pass/scored.length >= 0.75) verdict = {cls:"good", t:`✅ ${pass}/${scored.length} — Setup acha hai. Plan ke saath (SL zaroor) entry soch sakte hain.`};
  else if(pass/scored.length >= 0.5) verdict = {cls:"mid", t:`🟡 ${pass}/${scored.length} — Mixed. Chhoti position ya behtar entry (support ke paas) ka intezar karein.`};
  else verdict = {cls:"bad", t:`🔴 ${pass}/${scored.length} — Kamzor setup. Watchlist mein rakhein, abhi entry na lein.`};

  const desc = (d.description?.en || "").replace(/<[^>]+>/g, "").slice(0, 380);
  const cats = (d.categories||[]).filter(Boolean).slice(0,5).join(", ");
  const home = d.links?.homepage?.[0] || "";
  const slug = encodeURIComponent(id);

  document.getElementById("reportBox").innerHTML = `
    <span class="close" onclick="closeReport()">✕</span>
    <h3 style="display:flex;align-items:center;gap:10px"><img src="${esc(d.image?.small||'')}" style="width:28px;height:28px;border-radius:50%" onerror="this.style.display='none'">
      ${esc(d.name)} (${esc(sym)}) <span class="small">Rank #${d.market_cap_rank ?? '-'}</span></h3>
    <div class="small" style="margin-bottom:10px">${esc(cats)}${d.genesis_date ? ' · Launch: '+esc(d.genesis_date) : ''}</div>
    ${desc ? `<div class="desc">${esc(desc)}${desc.length>=380?'…':''}</div>` : ''}

    <div class="verdict ${verdict.cls}">${verdict.t}</div>

    <div class="sectionTitle">📊 Price & Chart (30 din)</div>
    <div class="cards">
      <div class="card"><div class="t">Price</div><div class="v">$${fmtP(price)}</div><div class="n">24h ${pctSpan(c24)} · 7d ${pctSpan(c7)} · 30d ${pctSpan(c30)}</div></div>
      <div class="card"><div class="t">All-Time High se faasla</div><div class="v ${athChg<0?'neg':'pos'}">${athChg!=null?athChg.toFixed(1)+'%':'-'}</div><div class="n">ATH $${fmtP(md.ath?.usd)}</div></div>
      <div class="card"><div class="t">RSI (14)</div><div class="v">${r14!=null?r14.toFixed(0):'-'}</div><div class="n">&lt;30 oversold · &gt;70 overbought</div></div>
      <div class="card"><div class="t">Volume aaj vs average</div><div class="v">${volX?volX.toFixed(2)+'x':'-'}</div><div class="n">24h vol $${fmt(vol24)}</div></div>
    </div>
    ${prices.length > 2 ? sparkline(prices, support, resistance) : ''}

    <div class="sectionTitle">🧱 Tokenomics (supply & unlocks)</div>
    <div class="cards">
      <div class="card"><div class="t">Market Cap</div><div class="v">$${fmt(mcap)}</div></div>
      <div class="card"><div class="t">FDV (poori supply ki value)</div><div class="v">$${fmt(fdv)}</div><div class="n">MC/FDV: <b class="${mcFdv!=null&&mcFdv<0.5?'neg':'pos'}">${mcFdv!=null?mcFdv.toFixed(2):'-'}</b></div></div>
      <div class="card"><div class="t">Circulating Supply</div><div class="v">${fmt(circ)}</div><div class="n">${circPct!=null?circPct.toFixed(0)+'% of '+(maxS?'max':'total'):'max supply unknown'}</div></div>
      <div class="card"><div class="t">Total / Max Supply</div><div class="v">${fmt(total)} / ${maxS?fmt(maxS):'∞'}</div><div class="n">${maxS?'':'Max supply nahi — naye coins bante rehte hain (inflation)'}</div></div>
    </div>
    <div class="small" style="line-height:1.8">Agla <b>token unlock</b> kab hai? Yeh sites check karein (bada unlock qareeb ho to entry avoid ya chhoti karein):
      <a class="link" href="https://coinmarketcap.com/currencies/${slug}/" target="_blank">CoinMarketCap</a> ·
      <a class="link" href="https://coinmarketcap.com/token-unlocks/" target="_blank">CMC Unlocks Calendar</a> ·
      <a class="link" href="https://tokenomist.ai/${slug}" target="_blank">Tokenomist</a> ·
      <a class="link" href="https://dropstab.com/coins/${slug}/vesting" target="_blank">Dropstab Vesting</a> ·
      <a class="link" href="https://www.coingecko.com/en/coins/${slug}" target="_blank">CoinGecko</a> ·
      <a class="link" href="https://www.tradingview.com/symbols/${encodeURIComponent(sym)}USDT/" target="_blank">TradingView chart</a>
      ${home ? ` · <a class="link" href="${esc(home)}" target="_blank">Official site</a>` : ''} ·
      <a class="link" href="https://halalscreener.app/en/stock/CRYPTO:${encodeURIComponent(sym)}" target="_blank">☪️ HalalScreener</a>
      <br><span class="small">(Agar koi link sahi page na khole to us site par coin ka naam search kar lein.)</span></div>

    <div class="sectionTitle">✅ Entry Checklist</div>
    ${checks.map(c => `<div class="check"><span class="ic">${c.ok===true?'✅':c.ok===false?'❌':'❔'}</span><div><b>${c.title}</b><div class="small">${c.why}</div></div></div>`).join("")}

    <div class="sectionTitle">🎯 Trade Plan (professional style — Risk:Reward se)</div>
    <div class="cards">
      <div class="card"><div class="t">Entry</div><div class="v">$${fmtP(price)}</div><div class="n">Ya behtar: support $${fmtP(support)} ke qareeb limit order</div></div>
      <div class="card"><div class="t">Stop-Loss</div><div class="v neg">$${fmtP(sl)}</div><div class="n">-${(risk/price*100).toFixed(1)}% · ${slNote}</div></div>
      <div class="card"><div class="t">TP1 (1.5R) — 50% bechein</div><div class="v pos">$${fmtP(tp1)}</div><div class="n">+${((tp1/price-1)*100).toFixed(1)}% · phir SL ko entry par le aayein</div></div>
      <div class="card"><div class="t">TP2 (2.5R) — 30% bechein</div><div class="v pos">$${fmtP(tp2)}</div><div class="n">+${((tp2/price-1)*100).toFixed(1)}%</div></div>
      <div class="card"><div class="t">TP3 (4R) — baqi 20%</div><div class="v pos">$${fmtP(tp3)}</div><div class="n">+${((tp3/price-1)*100).toFixed(1)}% · trailing SL ke saath</div></div>
      <div class="card"><div class="t">Pehli rukawat (30d high)</div><div class="v">$${fmtP(resistance)}</div><div class="n">${rrToRes>0?rrToRes.toFixed(1)+'R door':'Price is se upar hai (breakout)'}</div></div>
    </div>
    <div class="card" style="margin-bottom:10px">
      <div class="t">Position Size Calculator</div>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:6px;font-size:13px">
        Har trade mein equity ka kitna % risk? <input type="number" id="riskPctInput" value="${riskPct}" step="0.5" min="0.25" max="5" style="width:70px" onchange="lsSet('cryptobot_riskpct', this.value); renderReport()"> %
      </div>
      <div class="n" style="font-size:12.5px;margin-top:8px">Equity $${fmt(eq)} × ${riskPct}% = <b>$${fmt(riskUsd)}</b> max nuksaan agar SL hit ho.
        Is liye position size = <b class="pos">$${fmt(posUsd)}</b>${capped?' (20% equity par cap — ek coin mein is se zyada na lagayein)':''}.</div>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn green" onclick='planBuy(${JSON.stringify(id)}, ${JSON.stringify(d.symbol||"")}, ${price}, ${posUsd}, ${sl}, ${tp1})'>🧪 Is plan se Paper Buy</button>
      <button class="btn secondary" onclick='sendToCalc(${JSON.stringify(sym)}, ${price})'>🧮 Calculator mein kholein</button>
      <button class="btn secondary" onclick="closeReport()">Band karein</button>
    </div>
    <div class="small" style="margin-top:10px">Yeh plan rules se bana hai, guarantee nahi. Chart khud bhi TradingView par dekh lein.</div>`;
}
function planBuy(id, symbol, price, amount, sl, tp){
  closeReport();
  openBuyModal(id, symbol, price, { amount, sl, tp, note: "Report plan: SL $"+fmtP(sl)+", TP1 $"+fmtP(tp)+". Reason: " });
}

// ---------- Search ----------
let searchTimer = null;
function onSearchInput(){
  clearTimeout(searchTimer);
  const q = document.getElementById("searchBox").value.trim();
  if(q.length < 2){ document.getElementById("searchResults").style.display = "none"; return; }
  searchTimer = setTimeout(doSearch, 450);
}
async function doSearch(){
  const q = document.getElementById("searchBox").value.trim(); if(!q) return;
  const out = document.getElementById("searchResults");
  out.style.display = "block"; out.innerHTML = `<div class="small">Dhoond rahe hain…</div>`;
  try{
    const res = await fetch(`${API}/search?query=${encodeURIComponent(q)}`);
    const j = await res.json();
    const coins = (j.coins||[]).slice(0,8);
    out.innerHTML = coins.length ? coins.map(c => `<div onclick="openReport('${esc(c.id)}')"><img src="${esc(c.thumb)}" onerror="this.style.display='none'"><b>${esc(c.symbol)}</b> <span class="small">${esc(c.name)} · #${c.market_cap_rank ?? '-'}</span></div>`).join("") : `<div class="small">Kuch nahi mila</div>`;
  }catch(e){ out.innerHTML = `<div class="small">Search fail: ${esc(e.message)}</div>`; }
}
document.addEventListener("click", e => { if(!e.target.closest(".searchWrap")) document.getElementById("searchResults").style.display = "none"; });

// ---------- Fetch ----------
async function fetchMarkets(){
  const res = await fetch(`${API}/coins/markets?vs_currency=usd&order=volume_desc&per_page=150&page=1&price_change_percentage=1h,24h,7d&sparkline=false`);
  if(!res.ok) throw new Error("markets " + res.status);
  return res.json();
}
async function fetchTrending(){
  const res = await fetch(`${API}/search/trending`);
  if(!res.ok) throw new Error("trending " + res.status);
  return (await res.json()).coins || [];
}
async function fetchHeldPrices(){
  const missing = Object.keys(portfolio.positions).filter(id => !marketData.find(c => c.id === id));
  if(!missing.length) return;
  try{
    const res = await fetch(`${API}/simple/price?ids=${missing.map(encodeURIComponent).join(",")}&vs_currencies=usd`);
    const j = await res.json();
    missing.forEach(id => { if(j[id]?.usd) extraPrices[id] = j[id].usd; });
  }catch(e){}
}
async function refreshAll(){
  const st = document.getElementById("status");
  st.textContent = "⏳ Data fetch ho rahi hai…"; st.className = "status";
  try{
    const [m, t] = await Promise.all([fetchMarkets(), fetchTrending()]);
    marketData = m; trendingData = t;
    await fetchHeldPrices();
    renderAll();
    st.textContent = "✅ Updated: " + new Date().toLocaleTimeString(); st.className = "status ok";
  }catch(e){
    st.textContent = "❌ Data load nahi hui (internet, ya CoinGecko limit — 1 min baad try karein). " + e.message; st.className = "status err";
  }
}
function setupAutoRefresh(){
  if(autoTimer) clearInterval(autoTimer);
  const ms = parseInt(document.getElementById("autoRefresh").value);
  if(ms > 0) autoTimer = setInterval(refreshAll, ms);
}

// ---------- Guide ----------
document.getElementById("tab-guide").innerHTML = `
<h3>Pehle yeh samjhein: tabs alag alag coins kyun dikhate hain?</h3>
<p>Har tab ek alag <b>sawal</b> ka jawab hai, isliye har ek ki list alag hai:</p>
<ul>
<li><b>Signals</b> = "Sabse zyada trade hone wale 20 coins ka trend kya hai?" (bade coins: BTC, ETH, SOL…)</li>
<li><b>Money Rotation</b> = "Apne size ke hisab se kis coin mein sabse zyada paisa ghoom raha hai?" (sirf top 20)</li>
<li><b>Top Gainers</b> = "24 ghante mein sabse zyada kaun bhaaga?"</li>
</ul>
<p>Isliye ek coin Gainers mein ho sakta hai lekin Signals ki top-20 volume list mein nahi. <b>🧭 Scanner</b> tab mein har coin ka Signal, Vol/MCap aur 24h ek hi row mein milta hai, aur <b>📋 Report</b> har coin ka poora jawab ek jagah deti hai.</p>

<h3>Roz ka 7-step routine</h3>
<div class="box"><b>Step 1 — Market ka mood (2 min):</b> Scanner mein BTC dekhein. Agar BTC 24h aur 7d dono mein laal hai, to us din naye trade kam lein ya bilkul na lein. Altcoins aksar BTC ke peeche chalte hain.</div>
<div class="box"><b>Step 2 — Candidates dhoondein (5 min):</b> Top Gainers, Trending aur Scanner (Vol/MCap se sort) dekhein. 3–5 coins chunein jo kam se kam do jagah dikh rahe hon.</div>
<div class="box"><b>Step 3 — Halal filter:</b> Jo coin aapki list mein nahi, usay pehle apni screening services par check karein. Halal nahi → wahin chhor dein.</div>
<div class="box"><b>Step 4 — 📋 Report kholein:</b> Checklist score dekhein. 75%+ ✅ = acha setup, 50–75% = intezaar ya chhoti position, 50% se kam = skip. Token unlock links zaroor kholein.</div>
<div class="box"><b>Step 5 — Plan likhein (entry se PEHLE):</b> Entry, Stop-Loss, TP1/TP2/TP3 aur position size Report se lein. Agar SL tak ka nuksaan aapko bura lagta hai, size kam karein — SL hata kar nahi.</div>
<div class="box"><b>Step 6 — Paper Buy + note:</b> "Is plan se Paper Buy" dabayein aur note mein <i>kyun</i> liya likhein.</div>
<div class="box"><b>Step 7 — Manage karein:</b> "🎯 TP hit" aaye to 50% bechein aur baqi ka SL entry par le aayein. "🛑 SL hit" aaye to bina bahas bechein. Hafte mein ek baar journal parhein.</div>

<h3>Golden rules</h3>
<ul>
<li>Ek trade mein equity ka <b>1–2% se zyada risk nahi</b> (risk = SL hit hone par nuksaan, poori position nahi).</li>
<li><b>Stop-Loss kabhi neeche na khiskayein.</b> Sirf upar (profit lock karne ke liye).</li>
<li>Kam se kam <b>1:2 Risk:Reward</b> — warna 50% trades jeet kar bhi nuksaan ho sakta hai.</li>
<li>Jo coin 24h mein 30%+ bhaag chuka aur RSI 70+ hai, us ke peeche na bhaagein (FOMO).</li>
<li>Bade <b>token unlock</b> se pehle entry avoid karein.</li>
<li>Kam se kam <b>30 paper trades</b> ke baad hi asal paisa — wo bhi chhota.</li>
</ul>

<h3>Lafzon ka matlab (Glossary)</h3>
<ul>
<li><b>Market Cap</b> = price × circulating supply.</li>
<li><b>FDV</b> = price × max supply. FDV bohot zyada ho to aage bohot coins unlock ho kar bikenge.</li>
<li><b>Token Unlock</b> = team/investors ke locked coins ka release — aksar selling pressure laata hai.</li>
<li><b>Vol/MCap</b> = 24h trading ÷ market cap. Zyada = zyada activity (money rotation).</li>
<li><b>RSI</b> = 0–100 ka meter: 70+ "bohot khareeda gaya", 30- "bohot becha gaya".</li>
<li><b>SMA20</b> = pichle 20 din ki average price. Price upar = uptrend.</li>
<li><b>Support / Resistance</b> = jahan price pehle girte girte ruki / upar jaate jaate ruki.</li>
<li><b>R (Risk unit)</b> = Entry − SL. "2R target" = jitna risk, uska do guna profit.</li>
<li><b>Average Buy Price</b> = total lagaya paisa ÷ total coins. Alag alag price par khareedne se yahi asal entry banti hai (🧮 Calculator tab).</li>
</ul>`;

