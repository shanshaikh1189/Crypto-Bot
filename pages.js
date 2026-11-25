// =====================================================================
// Pages: Home, Find Coins, My Trades, Learn, Settings
// =====================================================================
function loadingBox(){ return `<div class="card empty">⏳ Loading live prices…</div>`; }

// ---------------- HOME ----------------
function marketMood(){
  const btc = marketData.find(c => (c.symbol||"").toLowerCase() === "btc");
  const list = tradable(), breadth = list.length ? Math.round(list.filter(c => h24(c) > 0).length / list.length * 100) : 0;
  if(!btc) return null;
  let m;
  if(h24(btc) > 0 && d7(btc) > 0 && breadth >= 55) m = {icon:"🟢", t:"Market looks healthy", s:"Bitcoin is up and most coins are green. A good day to look for trades — still always use a stop-loss."};
  else if(h24(btc) < 0 && d7(btc) < 0) m = {icon:"🔴", t:"Market is weak", s:"Bitcoin is down today and this week. Most coins follow Bitcoin, so trade less today — or just watch."};
  else m = {icon:"🟡", t:"Market is mixed", s:"No clear direction. Be picky and only take the very best setups."};
  return {...m, btc, breadth};
}
function renderHome(){
  const el = document.getElementById("page-home");
  const st = portfolioStats();
  if(!marketData.length){ el.innerHTML = loadingBox(); return; }
  const mood = marketMood();
  const picks = tradable().map(c => ({c, s: pickScore(c)})).filter(x => x.s > 0).sort((a,b) => b.s - a.s).slice(0, 6).map(x => x.c);
  const trend = trendingData.slice(0, 8);
  el.innerHTML = `
    <div class="grid" style="grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);gap:16px" id="homeTop">
      <div class="hero">
        <div class="mood"><div class="big">${mood ? mood.icon : "⏳"}</div>
          <div><div class="muted" style="font-size:12px;font-weight:700;letter-spacing:.4px">MARKET TODAY</div>
            <h2 style="margin:0">${mood ? mood.t : "Loading…"}</h2></div></div>
        <p class="sub" style="margin:10px 0 12px;font-size:14px">${mood ? mood.s : ""}</p>
        ${mood ? `<div class="row wrap" style="gap:16px;font-size:13px">
          <span>Bitcoin <b>${fmtPrice(mood.btc.current_price)}</b> ${chg(h24(mood.btc))} today</span>
          <span>${mood.breadth}% of coins are up today</span></div>` : ""}
      </div>
      <div class="card" style="cursor:pointer" onclick="go('trades')">
        <h2>💼 My practice account</h2>
        <div class="grid" style="gap:10px;margin-top:10px;grid-template-columns:1fr 1fr">
          <div><div class="muted" style="font-size:12px">Total value</div><div style="font-size:22px;font-weight:800">${fmtUsd(st.total)}</div></div>
          <div><div class="muted" style="font-size:12px">Open profit / loss</div><div style="font-size:22px;font-weight:800" class="${st.open >= 0 ? 'up' : 'down'}">${fmtUsd(st.open, {sign:true})}</div></div>
          <div><div class="muted" style="font-size:12px">Open trades</div><div style="font-weight:700">${st.openCount}</div></div>
          <div><div class="muted" style="font-size:12px">Win rate</div><div style="font-weight:700">${st.winRate != null ? st.winRate + "% of " + st.closed : "No closed trades yet"}</div></div>
        </div>
        <div class="link" style="margin-top:12px">Open my trades →</div>
      </div>
    </div>

    <div class="sectionHead"><h3>⭐ Top picks right now</h3><button class="link" onclick="coinFilter='strong';go('coins')">See all coins →</button></div>
    <p class="sub" style="margin:-4px 0 12px;font-size:13px">Coins going up, with money flowing in, that haven't already jumped too much today. Tap one to research it.</p>
    ${picks.length ? `<div class="picks">${picks.map(c => { const s = signal(c), f = flow(c); return `
      <div class="pickCard" onclick="openReport('${esc(c.id)}')">
        <div class="coinId">${coinIcon(c.image)}<div class="nm"><b>${esc(c.symbol.toUpperCase())}</b><span>${esc(c.name)}</span></div></div>
        <div class="row" style="justify-content:space-between"><b class="mono">${fmtPrice(c.current_price)}</b>${chg(h24(c))}</div>
        <div class="row wrap" style="gap:6px"><span class="badge ${s.cls}">${s.label}</span><span class="badge b-brand">${f.label}</span>${halalBadge(c.symbol)}</div>
        <div class="link">Research →</div>
      </div>`; }).join("")}</div>`
      : `<div class="card empty">No strong setups right now. That's normal — waiting is also a smart move.</div>`}

    ${trend.length ? `<div class="sectionHead"><h3>🔥 People are searching for</h3></div>
    <div class="chips">${trend.map(t => `<button class="chip" onclick="openReport('${esc(t.item.id)}')">${esc(t.item.symbol.toUpperCase())} ${t.item.data?.price_change_percentage_24h?.usd != null ? `<span class="${t.item.data.price_change_percentage_24h.usd >= 0 ? 'up' : 'down'}">${fmtPct(t.item.data.price_change_percentage_24h.usd, 1)}</span>` : ""}</button>`).join("")}</div>` : ""}

    <div class="grid g3" style="margin-top:22px">
      <div class="card" style="cursor:pointer" onclick="go('learn')"><h2>📘 New here?</h2><p class="lead" style="margin:0">Read the 5-minute guide: how to find a coin, check it and plan a trade.</p></div>
      <div class="card" style="cursor:pointer" onclick="go('calc')"><h2>🧮 Average & profit</h2><p class="lead" style="margin:0">Bought at different prices? Get your average and profit in seconds.</p></div>
      <div class="card" style="cursor:pointer" onclick="go('settings')"><h2>☪️ Halal list</h2><p class="lead" style="margin:0">${halalList.length ? halalList.length + " coins on your list." : "Add the coins you verified as halal."}</p></div>
    </div>`;
  if(window.innerWidth < 900) document.getElementById("homeTop").style.gridTemplateColumns = "1fr";
}

// ---------------- FIND COINS ----------------
let coinFilter = "all", coinSort = "flow", coinText = "";
const FILTERS = [
  ["all","All coins"], ["strong","📈 Going up"], ["flow","💸 Money flowing in"], ["gainers","🚀 Top gainers"], ["trending","🔥 Trending"], ["halal","☪️ My halal list"]
];
function renderCoins(){
  const el = document.getElementById("page-coins");
  el.innerHTML = `
    <div class="row wrap" style="margin-bottom:12px">
      <input class="input" style="flex:1;min-width:200px" placeholder="Filter this list by name, e.g. SOL" value="${esc(coinText)}" oninput="coinText=this.value;renderCoinList()">
      <select class="input" style="width:auto" onchange="coinSort=this.value;renderCoinList()">
        ${[["flow","Sort: money flow"],["h24","Sort: 24h change"],["signal","Sort: trend strength"],["mcap","Sort: biggest coins"]].map(([v,l]) => `<option value="${v}" ${coinSort===v?'selected':''}>${l}</option>`).join("")}
      </select>
      <button class="btn ghost" onclick="openSearch()">🔎 Coin not here?</button>
    </div>
    <div class="chips" style="margin-bottom:12px">${FILTERS.map(([k,l]) => `<button class="chip ${coinFilter===k?'on':''}" onclick="coinFilter='${k}';renderCoins()">${l}</button>`).join("")}</div>
    <details class="note" style="margin-bottom:14px"><summary style="cursor:pointer;font-weight:700;color:var(--text)">What do these labels mean?</summary>
      <p style="margin:8px 0 0"><b>Trend</b> — is the price going up over the last hours/days? <b>Money flow</b> — how much trading happened today compared to the coin's size. More flow = more people buying or selling it.
      <b>High risk</b> — small coins move fast both ways. Tap any coin for a full report with a ready trade plan. Stablecoins (USDT, USDC…) are hidden.</p></details>
    <div class="listHead"><span>Coin</span><span>Price</span><span>24h</span><span>Trend</span><span>Money flow</span><span></span></div>
    <div class="coinList" id="coinListBox"></div>`;
  renderCoinList();
}
function coinsForFilter(){
  let list = tradable();
  if(coinFilter === "strong") list = list.filter(c => signal(c).rank >= 3);
  if(coinFilter === "flow") list = list.filter(c => vm(c) >= 0.10 && h24(c) >= 0);
  if(coinFilter === "gainers") list = list.filter(c => c.total_volume > 200000).sort((a,b) => h24(b) - h24(a)).slice(0, 25);
  if(coinFilter === "halal") list = list.filter(c => isHalal(c.symbol));
  if(coinFilter === "trending"){
    list = trendingData.map(t => { const it = t.item, m = marketData.find(c => c.id === it.id);
      return m || { id: it.id, symbol: it.symbol, name: it.name, image: it.small || it.thumb, current_price: it.data?.price,
        price_change_percentage_24h: it.data?.price_change_percentage_24h?.usd, market_cap: 0, total_volume: 0 }; });
  }
  return list;
}
function renderCoinList(){
  const box = document.getElementById("coinListBox"); if(!box) return;
  if(!marketData.length){ box.innerHTML = loadingBox(); return; }
  let list = coinsForFilter();
  const q = coinText.trim().toLowerCase();
  if(q) list = list.filter(c => (c.symbol||"").toLowerCase().includes(q) || (c.name||"").toLowerCase().includes(q));
  if(coinFilter !== "gainers" && coinFilter !== "trending"){
    const key = { flow: vm, h24, signal: sigScore, mcap: c => c.market_cap }[coinSort];
    list = [...list].sort((a,b) => key(b) - key(a));
  }
  if(!list.length){
    box.innerHTML = `<div class="card empty">${coinFilter === "halal" ? "No coins from your halal list are in today's top 150. Add coins in Settings, or use 🔎 search." : "Nothing matches right now."}</div>`;
    return;
  }
  box.innerHTML = list.map(c => {
    const s = signal(c), f = flow(c), price = c.current_price;
    return `<div class="coinRow" onclick="openReport('${esc(c.id)}')">
      <div class="coinId cId">${coinIcon(c.image)}<div class="nm"><b>${esc((c.symbol||'').toUpperCase())}</b><span>${esc(c.name)}</span></div></div>
      <div class="cPrice mono"><b>${fmtPrice(price)}</b></div>
      <div class="cChg">${chg(h24(c))}</div>
      <div class="cSig row wrap" style="gap:6px"><span class="badge ${s.cls}">${s.label}</span>${c.market_cap && c.market_cap < 100e6 ? `<span class="badge b-red">High risk</span>` : ""}${halalBadge(c.symbol)}</div>
      <div class="flow cFlow">${c.market_cap ? `<span class="${f.cls}">${f.label} · ${(f.r*100).toFixed(0)}%</span><div class="bar"><i style="width:${Math.min(100, f.r*250)}%"></i></div>` : `<span class="muted">Not in top 150</span>`}</div>
      <div class="arrow">›</div>
    </div>`;
  }).join("");
}

// ---------------- MY TRADES ----------------
function renderTrades(){
  const el = document.getElementById("page-trades"), st = portfolioStats();
  const ids = Object.keys(portfolio.positions);
  el.innerHTML = `
    <div class="note" style="margin-bottom:14px">💡 This is a <b>practice account</b> with $10,000 of pretend money. Practise here until you are consistently winning — then think about real money.</div>
    <div class="grid g4">
      <div class="stat"><div class="k">Total value</div><div class="v">${fmtUsd(st.total)}</div><div class="n">Started with $10,000</div></div>
      <div class="stat"><div class="k">Cash</div><div class="v">${fmtUsd(st.cash)}</div><div class="n">Ready to use</div></div>
      <div class="stat"><div class="k">Open profit / loss</div><div class="v ${st.open >= 0 ? 'up' : 'down'}">${fmtUsd(st.open, {sign:true})}</div><div class="n">${st.openCount} open trade${st.openCount === 1 ? "" : "s"}</div></div>
      <div class="stat"><div class="k">Closed trades</div><div class="v ${st.realized >= 0 ? 'up' : 'down'}">${fmtUsd(st.realized, {sign:true})}</div><div class="n">${st.winRate != null ? `Won ${st.winRate}% of ${st.closed}` : "None yet"}</div></div>
    </div>

    <div class="sectionHead"><h3>Open trades</h3><button class="btn sm" onclick="go('coins')">＋ Find a coin</button></div>
    ${ids.length ? `<div class="grid" style="gap:10px">${ids.map(posCard).join("")}</div>`
      : `<div class="card empty">No open trades. Go to <b>Find Coins</b>, open a coin's report and press <b>Practice buy</b>.</div>`}

    <div class="sectionHead"><h3>Journal</h3><span class="muted" style="font-size:12px">Read this every week: what worked, what didn't?</span></div>
    ${portfolio.history.length ? `<div class="journal">${portfolio.history.slice(0, 60).map(h => `
      <div class="jRow">
        <div><span class="badge ${h.side === 'BUY' ? 'b-green' : 'b-red'}">${esc(h.side)}</span> <b>${esc(h.symbol.toUpperCase())}</b></div>
        <div class="muted mono" style="font-size:12px">${fmtPrice(h.price)}</div>
        <div class="nt">${esc(h.note || "—")} <span class="muted" style="font-size:11.5px">· ${esc(h.t)}</span></div>
        <div class="mono" style="text-align:right">${h.pnl == null ? `<span class="muted">Spent ${fmtUsd(h.qty*h.price)}</span>` : `<b class="${h.pnl >= 0 ? 'up' : 'down'}">${fmtUsd(h.pnl, {sign:true})}</b>`}</div>
      </div>`).join("")}</div>` : `<div class="card empty">Your buys and sells will appear here with your notes.</div>`}

    <div style="margin-top:22px"><button class="btn ghost sm" onclick="resetPortfolio()">↺ Start over with $10,000</button></div>`;
}
function posCard(id){
  const p = portfolio.positions[id], cur = priceOf(id), value = p.qty*cur, pnl = value - p.cost, avg = p.cost/p.qty;
  let status = `<span class="badge b-gray">Running</span>`;
  if(p.sl && cur <= p.sl) status = `<span class="badge b-red">🛑 Stop-loss hit — sell</span>`;
  else if(p.tp && cur >= p.tp) status = `<span class="badge b-green">🎯 Target hit — take profit</span>`;
  let range = `<div class="note" style="margin:0">⚠️ No stop-loss set. <button class="link" onclick="openEditModal('${esc(id)}')">Set one now</button></div>`;
  if(p.sl && p.tp && p.tp > p.sl){
    const pos = Math.max(0, Math.min(100, (cur - p.sl)/(p.tp - p.sl)*100));
    range = `<div class="range"><span class="pin" style="left:${pos}%"></span></div>
      <div class="rangeLbl"><span>Stop ${fmtPrice(p.sl)}</span><span>Now ${fmtPrice(cur)}</span><span>Target ${fmtPrice(p.tp)}</span></div>`;
  }
  return `<div class="posCard">
    <div class="posTop">
      <div class="row"><b style="font-size:17px">${esc(p.symbol.toUpperCase())}</b>${status}</div>
      <div class="mono" style="font-size:18px;font-weight:800"><span class="${pnl >= 0 ? 'up' : 'down'}">${fmtUsd(pnl, {sign:true})} (${fmtPct(pnl/p.cost*100, 1)})</span></div>
    </div>
    <div class="posNums">
      <div><div class="k">Bought at (avg)</div><div class="v">${fmtPrice(avg)}</div></div>
      <div><div class="k">Price now</div><div class="v">${fmtPrice(cur)}</div></div>
      <div><div class="k">Coins</div><div class="v">${fmtQty(p.qty)}</div></div>
      <div><div class="k">Value</div><div class="v">${fmtUsd(value)}</div></div>
    </div>
    ${range}
    <div class="row wrap" style="margin-top:12px;gap:8px">
      <button class="btn ghost sm" onclick="openReport('${esc(id)}')">📋 Report</button>
      <button class="btn ghost sm" onclick="openEditModal('${esc(id)}')">✏️ Stop / target</button>
      <button class="btn ghost sm" onclick="openSellModal('${esc(id)}', 0.5)">Sell half</button>
      <button class="btn sm red" onclick="openSellModal('${esc(id)}', 1)">Sell all</button>
    </div>
  </div>`;
}

// ---------------- LEARN ----------------
function renderLearn(){
  document.getElementById("page-learn").innerHTML = `
    <div class="hero" style="margin-bottom:18px"><h2 style="margin:0 0 6px">Your daily routine (15 minutes)</h2>
      <p class="sub" style="margin:0">Follow these steps every time. Good trading is mostly about rules and patience — not about finding a "magic" coin.</p></div>
    <div class="steps">
      <div class="step"><b>Check the market mood</b><span>Look at <b>Home → Market today</b>. If it says the market is weak, trade less or just watch. Most coins follow Bitcoin.</span></div>
      <div class="step"><b>Find 3–5 candidates</b><span>Use <b>Home → Top picks</b> or <b>Find Coins</b> with the filters "Going up" and "Money flowing in". The best coins show up in more than one list.</span></div>
      <div class="step"><b>Check halal first</b><span>If a coin isn't on your halal list, check it with your screening service (Sharlife, Saraf, Practical Islamic Finance, HalalScreener). Not halal → skip it.</span></div>
      <div class="step"><b>Open the report</b><span>Tap the coin. "Good setup" = most checks passed. "Wait" = use less money or wait for a dip. "Skip" = don't trade it today. Always check the next token unlock.</span></div>
      <div class="step"><b>Plan before you buy</b><span>Write down your buy price, stop-loss and targets <i>before</i> buying. The report does this for you, plus how much to put in.</span></div>
      <div class="step"><b>Practice buy + write why</b><span>Press "Practice buy with this plan" and write one line about why. This journal is how you learn.</span></div>
      <div class="step"><b>Manage the trade</b><span>Target 1 hit → sell half and move your stop to your buy price (now you can't lose). Stop-loss hit → sell, no arguing. Read your journal every week.</span></div>
    </div>

    <div class="sectionHead"><h3>🛡️ The 6 golden rules</h3></div>
    <div class="grid g2">
      <div class="card"><b>1. Risk only 1–2% per trade</b><p class="lead" style="margin:4px 0 0">If the stop-loss hits, you should lose at most 1–2% of your account. The report calculates the right amount for you.</p></div>
      <div class="card"><b>2. Never move your stop-loss down</b><p class="lead" style="margin:4px 0 0">Only move it up to lock in profit. Moving it down turns small losses into big ones.</p></div>
      <div class="card"><b>3. Reward at least 2× the risk</b><p class="lead" style="margin:4px 0 0">If you risk $10, aim to make $20+. Then you can be wrong half the time and still grow.</p></div>
      <div class="card"><b>4. Don't chase pumps</b><p class="lead" style="margin:4px 0 0">If a coin is already up 30%+ today, you're late. Wait for it to come back down.</p></div>
      <div class="card"><b>5. Avoid big token unlocks</b><p class="lead" style="margin:4px 0 0">When lots of locked coins are released, early investors often sell and the price drops.</p></div>
      <div class="card"><b>6. 30 practice trades first</b><p class="lead" style="margin:4px 0 0">Only use real money once your practice results are good — and start small.</p></div>
    </div>

    <div class="sectionHead"><h3>📖 Words you'll see</h3></div>
    <div class="acc">
      ${[
        ["Stop-loss","The price where you sell to stop a loss from growing. Decide it before you buy."],
        ["Target / take-profit","The price where you sell (part) for profit."],
        ["Average buy price","If you bought at different prices: total money spent ÷ total coins. The Calculator does it for you."],
        ["Market cap","Coin price × coins already released. Shows how big the coin is."],
        ["Fully-diluted value (FDV)","Coin price × all coins that will ever exist. If it's much bigger than the market cap, many coins are still locked."],
        ["Token unlock","When locked coins (team, investors) are released. Often brings selling pressure."],
        ["Money flow","Today's trading ÷ market cap. Higher = more activity in the coin."],
        ["RSI","A 0–100 meter. Above 70 = bought too much already (hot). Below 30 = sold a lot (cold)."],
        ["Floor (support)","A price where the coin stopped falling before."],
        ["Ceiling (resistance)","A price where the coin stopped rising before."],
        ["Risk / reward","How much you can lose vs. how much you can make. Aim for reward ≥ 2× risk."]
      ].map(([t,d]) => `<details><summary>${t}</summary><p>${d}</p></details>`).join("")}
    </div>`;
}

// ---------------- SETTINGS ----------------
function renderSettings(){
  document.getElementById("page-settings").innerHTML = `
    <div class="grid g2">
      <div class="card" id="accountCard"></div>
      <div class="card">
        <h2>☪️ My halal list</h2>
        <p class="lead">Add coins you've checked with your screening service. They get a ☪️ tag everywhere, and you can filter by them.</p>
        <form class="row" onsubmit="event.preventDefault();addHalal()">
          <input class="input" id="halalAdd" placeholder="Coin symbol, e.g. BTC (or several: BTC, ETH)" autocomplete="off">
          <button class="btn" type="submit">Add</button>
        </form>
        <div class="chips" style="margin-top:12px" id="halalTags"></div>
        <div class="linkRow" style="margin-top:12px">
          <a href="https://halalscreener.app/en/" target="_blank" rel="noopener">HalalScreener</a>
          <a href="https://sharlife.my/" target="_blank" rel="noopener">Sharlife</a>
        </div>
      </div>
      <div class="card">
        <h2>🎛️ Trading settings</h2>
        <div class="field" style="margin-top:12px"><label class="f">Risk per trade</label>
          <select class="input" onchange="lsSet('cryptobot_riskpct', this.value); toast('Saved','ok')">
            ${[0.5,1,1.5,2,3].map(v => `<option value="${v}" ${v == getRiskPct() ? 'selected' : ''}>${v}% of my account ${v === 1 ? "(recommended)" : ""}</option>`).join("")}
          </select>
          <div class="hint">Used by the report to tell you how much to put into a trade.</div></div>
        <div class="field"><label class="f">Refresh prices</label>
          <select class="input" onchange="lsSet('cryptobot_refresh', this.value); setupAutoRefresh(); toast('Saved','ok')">
            ${[[0,"Only when I press Refresh"],[60000,"Every minute"],[180000,"Every 3 minutes"],[300000,"Every 5 minutes"]].map(([v,l]) => `<option value="${v}" ${v == lsGet("cryptobot_refresh", 60000) ? 'selected' : ''}>${l}</option>`).join("")}
          </select></div>
      </div>
      <div class="card">
        <h2>📱 Use it like an app</h2>
        <p class="lead">On iPhone: open this site in <b>Safari</b> → tap <b>Share</b> → <b>Add to Home Screen</b>. It opens full-screen like an app.</p>
        <div class="note">After adding it, log in once inside the app icon — it remembers you from then on.</div>
        <div style="margin-top:12px"><button class="btn ghost sm" onclick="resetPortfolio()">↺ Reset practice account</button></div>
      </div>
    </div>`;
  renderHalalTags();
  if(typeof renderAccountCard === "function") renderAccountCard();
}
function renderHalalTags(){
  const el = document.getElementById("halalTags"); if(!el) return;
  el.innerHTML = halalList.length ? halalList.map(s => `<span class="tag">${esc(s)}<button onclick="removeHalal('${esc(s)}')" aria-label="Remove">✕</button></span>`).join("")
    : `<span class="muted" style="font-size:13px">Your list is empty.</span>`;
}
function addHalal(){
  const inp = document.getElementById("halalAdd");
  const add = inp.value.split(/[,\s]+/).map(s => s.trim().toUpperCase()).filter(Boolean);
  if(!add.length) return;
  setHalalList([...halalList, ...add]); inp.value = ""; renderHalalTags(); toast("Added to your halal list ✅", "ok");
}
function removeHalal(s){ setHalalList(halalList.filter(x => x !== s)); renderHalalTags(); }
