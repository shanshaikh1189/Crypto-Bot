// =====================================================================
// Coin research report + paper trading actions (buy, sell, edit SL/TP)
// =====================================================================
const reportCache = {};
let currentReport = null;

const sma = (arr, n) => arr.length < n ? null : arr.slice(-n).reduce((a,b) => a+b, 0) / n;
function rsi(p, n){
  n = n || 14;
  if(p.length < n+1) return null;
  let g = 0, l = 0;
  for(let i = p.length-n; i < p.length; i++){ const d = p[i]-p[i-1]; if(d >= 0) g += d; else l -= d; }
  if(l === 0) return 100;
  return 100 - 100 / (1 + (g/n)/(l/n));
}
function chartSvg(prices, sup, res){
  const w = 600, h = 150, pad = 8;
  const min = Math.min(...prices, sup), max = Math.max(...prices, res);
  const x = i => pad + i*(w-2*pad)/(prices.length-1);
  const y = v => h-pad - (v-min)/(max-min || 1)*(h-2*pad);
  const pts = prices.map((v,i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const up = prices[prices.length-1] >= prices[0], col = up ? "#22c55e" : "#f43f5e";
  return `<div class="chart"><svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="width:100%;height:150px;display:block">
    <defs><linearGradient id="fillG" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".25"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient></defs>
    <polygon points="${pad},${h} ${pts} ${w-pad},${h}" fill="url(#fillG)"/>
    <line x1="0" x2="${w}" y1="${y(res)}" y2="${y(res)}" stroke="#f43f5e" stroke-dasharray="5 5" vector-effect="non-scaling-stroke"/>
    <line x1="0" x2="${w}" y1="${y(sup)}" y2="${y(sup)}" stroke="#22c55e" stroke-dasharray="5 5" vector-effect="non-scaling-stroke"/>
    <polyline points="${pts}" fill="none" stroke="${col}" stroke-width="2.5" vector-effect="non-scaling-stroke"/>
  </svg>
  <div class="row wrap" style="font-size:12px;gap:14px;margin-top:6px">
    <span class="down">- - Ceiling (30-day high) ${fmtPrice(res)}</span><span class="up">- - Floor (14-day low) ${fmtPrice(sup)}</span>
  </div></div>`;
}

async function openReport(id){
  openModal("Researching…", `<div class="empty">⏳ Getting coin details and the last 30 days of prices…</div>`, {wide:true});
  try{
    let data = reportCache[id];
    if(!data || Date.now() - data.at > 180000){
      const [d, chart] = await Promise.all([
        fetchJSON(`${API}/coins/${encodeURIComponent(id)}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`),
        fetchJSON(`${API}/coins/${encodeURIComponent(id)}/market_chart?vs_currency=usd&days=30&interval=daily`)
      ]);
      data = { d, chart, at: Date.now() };
      reportCache[id] = data;
    }
    currentReport = { id, data };
    renderReport();
  }catch(e){
    setModalBody(`<div class="empty">❌ ${esc(e.message)}</div>`);
  }
}

function analyse(id, data){
  const d = data.d, md = d.market_data || {};
  const prices = (data.chart.prices || []).map(p => p[1]);
  const vols = (data.chart.total_volumes || []).map(v => v[1]);
  const price = md.current_price?.usd ?? prices[prices.length-1];
  const sym = (d.symbol || "").toUpperCase();
  const mcap = md.market_cap?.usd || 0, fdv = md.fully_diluted_valuation?.usd || 0;
  const circ = md.circulating_supply || 0, total = md.total_supply || 0, maxS = md.max_supply || 0;
  const base = maxS || total, circPct = base ? circ/base*100 : null, mcFdv = fdv ? mcap/fdv : null;
  const vol24 = md.total_volume?.usd || 0, vmr = mcap ? vol24/mcap : 0;
  const c24 = md.price_change_percentage_24h ?? 0, c7 = md.price_change_percentage_7d ?? 0, c30 = md.price_change_percentage_30d ?? 0;
  const s20 = sma(prices, 20), r14 = rsi(prices, 14);
  const volAvg = sma(vols.slice(0,-1), 14), volX = volAvg ? vols[vols.length-1]/volAvg : null;
  const support = Math.min(...prices.slice(-15)), resistance = Math.max(...prices);

  let sl = Math.max(support*0.98, price*0.85), slWhy = "2% below the 14-day floor, so a quick dip doesn't knock you out.";
  if(sl >= price*0.97){ sl = price*0.97; slWhy = "Price is very close to the floor, so a minimum 3% stop is used."; }
  else if(sl === price*0.85) slWhy = "The floor is far away, so the stop is capped at 15% to limit risk.";
  const risk = price - sl;
  const tp1 = price + risk*1.5, tp2 = price + risk*2.5, tp3 = price + risk*4;
  const rrToRes = resistance > price ? (resistance-price)/risk : 0;
  const riskPct = getRiskPct(), eq = portfolioStats().total, riskUsd = eq*riskPct/100;
  let posUsd = riskUsd / (risk/price); const capped = posUsd > eq*0.2; if(capped) posUsd = eq*0.2;

  const checks = [];
  const add = (ok, title, why) => checks.push({ok, title, why});
  add(s20 ? price > s20 : null, "Price is in an uptrend", s20 ? `Price ${fmtPrice(price)} is ${price > s20 ? "above" : "below"} its 20-day average (${fmtPrice(s20)}). Trading with the trend is easier.` : "Not enough data.");
  add(c24 > 0 && c7 > 0, "Price went up today and this week", `24h ${fmtPct(c24,1)}, 7 days ${fmtPct(c7,1)}.`);
  add(r14 == null ? null : (r14 >= 40 && r14 <= 68), "Not too hot, not too cold (RSI 40–68)", r14 == null ? "Not enough data." : r14 > 68 ? `RSI is ${r14.toFixed(0)} — the coin already ran a lot. Buying now is late and risky.` : r14 < 40 ? `RSI is ${r14.toFixed(0)} — weak. It may keep falling.` : `RSI is ${r14.toFixed(0)} — healthy.`);
  add(volX == null ? null : volX >= 1.2, "More trading than usual today", volX == null ? "No data." : `Today's volume is ${volX.toFixed(1)}× the 14-day average. Moves without volume often fail.`);
  add(vmr >= 0.08, "Money is flowing into this coin", `Daily trading is ${(vmr*100).toFixed(1)}% of its market cap (8%+ means active).`);
  add(rrToRes >= 2, "Room to grow: reward at least 2× the risk", `Your risk to the stop is ${(risk/price*100).toFixed(1)}%. The next ceiling is ${rrToRes.toFixed(1)}× that away.`);
  add(circPct == null ? null : circPct >= 50, "Most coins are already released (50%+)", circPct == null ? "No supply data." : `${circPct.toFixed(0)}% of all coins are out. The other ${(100-circPct).toFixed(0)}% can still be unlocked and sold later.`);
  add(mcFdv == null ? null : mcFdv >= 0.5, "Low risk of new coins flooding in", mcFdv == null ? "No data." : `Market cap ÷ fully-diluted value = ${mcFdv.toFixed(2)}. ${mcFdv < 0.5 ? "Many coins are still locked — future unlocks can push the price down." : "Fine."}`);
  add(isHalal(sym) ? true : null, "On your halal list", isHalal(sym) ? "Yes." : "Not on your list — check it with your screening service first.");
  const scored = checks.filter(c => c.ok !== null), pass = scored.filter(c => c.ok).length;
  let verdict;
  if(!isHalal(sym) && halalList.length) verdict = {cls:"bad", icon:"⛔", t:"Check halal status first", s:`${pass} of ${scored.length} checks passed, but this coin is not on your halal list.`};
  else if(pass/scored.length >= 0.75) verdict = {cls:"good", icon:"✅", t:"Good setup", s:`${pass} of ${scored.length} checks passed. You can consider a trade — always with a stop-loss.`};
  else if(pass/scored.length >= 0.5) verdict = {cls:"mid", icon:"🟡", t:"Wait for a better moment", s:`${pass} of ${scored.length} checks passed. Use a smaller amount, or wait for the price to dip near the floor.`};
  else verdict = {cls:"bad", icon:"🔴", t:"Skip for now", s:`Only ${pass} of ${scored.length} checks passed. Keep it on your watchlist.`};
  return { d, md, sym, price, prices, mcap, fdv, circ, total, maxS, circPct, mcFdv, vol24, c24, c7, c30, r14, volX, support, resistance,
    sl, slWhy, risk, tp1, tp2, tp3, riskPct, eq, riskUsd, posUsd, capped, checks, verdict };
}

function renderReport(){
  const { id, data } = currentReport, A = analyse(id, data), d = A.d;
  const slug = encodeURIComponent(id), symU = encodeURIComponent(A.sym);
  const home = d.links?.homepage?.[0] || "";
  const desc = (d.description?.en || "").replace(/<[^>]+>/g, "").split(". ").slice(0, 2).join(". ").slice(0, 320).replace(/([^.!?])$/, "$1.");
  const head = document.querySelector(".sheetHead h3");
  if(head) head.innerHTML = `<span class="row" style="gap:10px"><img src="${esc(d.image?.small||'')}" style="width:28px;height:28px;border-radius:50%" alt="">${esc(d.name)} <span class="muted" style="font-size:14px">${esc(A.sym)} · #${d.market_cap_rank ?? '—'}</span></span>`;
  const pctOf = v => fmtPct((v/A.price-1)*100, 1);
  setModalBody(`
    <div class="row wrap" style="justify-content:space-between;margin-bottom:12px">
      <div><div class="bigNum">${fmtPrice(A.price)}</div>
        <div class="row wrap" style="gap:12px;font-size:13px"><span>24h ${chg(A.c24)}</span><span>7d ${chg(A.c7)}</span><span>30d ${chg(A.c30)}</span></div></div>
      <div class="row wrap">${halalBadge(A.sym)}</div>
    </div>
    <div class="verdict ${A.verdict.cls}"><div class="vi">${A.verdict.icon}</div><div><h4>${A.verdict.t}</h4><p>${A.verdict.s}</p></div></div>
    ${desc ? `<p class="sub" style="font-size:13.5px;margin:0 0 14px">${esc(desc)}</p>` : ""}

    <div class="sectionHead" style="margin-top:4px"><h3>📈 Last 30 days</h3></div>
    ${A.prices.length > 2 ? chartSvg(A.prices, A.support, A.resistance) : `<div class="empty">No chart data</div>`}

    <div class="sectionHead"><h3>🎯 Trade plan</h3><span class="muted" style="font-size:12px">Based on risk vs. reward</span></div>
    <div class="plan">
      <div class="planBox"><div class="k">Buy around</div><div class="v">${fmtPrice(A.price)}</div><div class="n">Even better near the floor ${fmtPrice(A.support)}</div></div>
      <div class="planBox" style="border-color:rgba(244,63,94,.4)"><div class="k">Stop-loss (exit if wrong)</div><div class="v down">${fmtPrice(A.sl)}</div><div class="n">${pctOf(A.sl)} · ${A.slWhy}</div></div>
      <div class="planBox" style="border-color:rgba(34,197,94,.4)"><div class="k">Target 1 · sell half</div><div class="v up">${fmtPrice(A.tp1)}</div><div class="n">${pctOf(A.tp1)} · then move stop to your buy price</div></div>
      <div class="planBox"><div class="k">Target 2 · sell 30%</div><div class="v up">${fmtPrice(A.tp2)}</div><div class="n">${pctOf(A.tp2)}</div></div>
      <div class="planBox"><div class="k">Target 3 · sell the rest</div><div class="v up">${fmtPrice(A.tp3)}</div><div class="n">${pctOf(A.tp3)}</div></div>
      <div class="planBox"><div class="k">Next ceiling</div><div class="v">${fmtPrice(A.resistance)}</div><div class="n">Price often slows down here</div></div>
    </div>
    <div class="card" style="margin-top:12px;padding:14px">
      <div class="row wrap" style="justify-content:space-between">
        <b>How much to put in?</b>
        <label class="row" style="gap:6px;font-size:13px">Risk per trade
          <select class="input" style="width:auto;padding:6px 8px" onchange="lsSet('cryptobot_riskpct', this.value); renderReport()">
            ${[0.5,1,1.5,2,3].map(v => `<option value="${v}" ${v == A.riskPct ? 'selected' : ''}>${v}%</option>`).join("")}
          </select></label>
      </div>
      <p class="sub" style="margin:8px 0 0;font-size:13.5px">If the stop-loss hits you lose about <b>${fmtUsd(A.riskUsd)}</b> (${A.riskPct}% of your ${fmtUsd(A.eq)}).
        So put in <b class="up">${fmtUsd(A.posUsd)}</b>${A.capped ? " (capped at 20% of your account — never put too much in one coin)" : ""}.</p>
    </div>
    <div class="row wrap" style="margin-top:14px">
      <button class="btn green" onclick='planBuy(${JSON.stringify(id)}, ${JSON.stringify(d.symbol||"")}, ${A.price}, ${A.posUsd}, ${A.sl}, ${A.tp2})'>🧪 Practice buy with this plan</button>
      <button class="btn ghost" onclick='sendToCalc(${JSON.stringify(A.sym)}, ${A.price})'>🧮 Open in calculator</button>
    </div>

    <div class="sectionHead"><h3>✅ Checklist</h3><span class="muted" style="font-size:12px">${A.checks.filter(c=>c.ok).length} passed</span></div>
    <div class="checks">${A.checks.map(c => `<div class="check"><span class="ci">${c.ok === true ? "✅" : c.ok === false ? "❌" : "❔"}</span><div><b>${c.title}</b><div>${c.why}</div></div></div>`).join("")}</div>

    <div class="sectionHead"><h3>🧱 Coin supply</h3></div>
    <div class="plan">
      <div class="planBox"><div class="k">Market cap</div><div class="v">${fmtUsd(A.mcap)}</div><div class="n">Value of coins already out</div></div>
      <div class="planBox"><div class="k">Fully-diluted value</div><div class="v">${fmtUsd(A.fdv)}</div><div class="n">Value if every coin was out</div></div>
      <div class="planBox"><div class="k">Coins released</div><div class="v">${A.circPct != null ? A.circPct.toFixed(0) + "%" : "—"}</div><div class="n">${fmtQty(A.circ)} of ${A.maxS ? fmtQty(A.maxS) : fmtQty(A.total) + (A.maxS ? "" : " (no max limit)")}</div></div>
    </div>
    <div class="note" style="margin-top:10px">🔓 <b>Check the next token unlock</b> before buying — big unlocks often push the price down. Use the links below.</div>

    <div class="sectionHead"><h3>🔗 Research links</h3></div>
    <div class="linkRow">
      <a href="https://www.tradingview.com/symbols/${symU}USDT/" target="_blank" rel="noopener">📊 TradingView chart</a>
      <a href="https://coinmarketcap.com/currencies/${slug}/" target="_blank" rel="noopener">CoinMarketCap</a>
      <a href="https://coinmarketcap.com/token-unlocks/" target="_blank" rel="noopener">🔓 Unlock calendar</a>
      <a href="https://tokenomist.ai/${slug}" target="_blank" rel="noopener">Tokenomist</a>
      <a href="https://dropstab.com/coins/${slug}/vesting" target="_blank" rel="noopener">Dropstab</a>
      <a href="https://www.coingecko.com/en/coins/${slug}" target="_blank" rel="noopener">CoinGecko</a>
      <a href="https://halalscreener.app/en/stock/CRYPTO:${symU}" target="_blank" rel="noopener">☪️ HalalScreener</a>
      ${home ? `<a href="${esc(home)}" target="_blank" rel="noopener">🌐 Official site</a>` : ""}
    </div>
    <p class="muted" style="font-size:12px;margin-top:14px">This plan comes from simple rules — not a guarantee. If a link opens the wrong page, search the coin name on that site.</p>`);
}
function planBuy(id, symbol, price, amount, sl, tp){
  openBuyModal(id, symbol, price, { amount, sl, tp, note: "Followed the report plan. Why I like it: " });
}

// ---------- Paper buy ----------
let pendingBuy = null;
function openBuyModal(id, symbol, price, pre){
  pre = pre || {};
  pendingBuy = { id, symbol, price };
  const amt = Math.floor(Math.min(pre.amount ?? 500, portfolio.cash));
  openModal(`Practice buy · ${esc(symbol.toUpperCase())}`, `
    <div class="note" style="margin-bottom:14px">Practice money only. Price now: <b>${fmtPrice(price)}</b> · Cash available: <b>${fmtUsd(portfolio.cash)}</b></div>
    <div class="field"><label class="f">How much to spend ($)</label>
      <div class="amt"><input class="input" id="bAmt" inputmode="decimal" value="${amt}" oninput="buyPreview()"><button type="button" class="kBtn" onclick="addSuffix(this,'k')">K</button><button type="button" class="kBtn" onclick="addSuffix(this,'m')">M</button></div><div class="hint" id="bAmtHint"></div></div>
    <div class="grid g2" style="gap:10px">
      <div class="field"><label class="f">Stop-loss price</label><input class="input" id="bSL" inputmode="decimal" value="${+(pre.sl || price*0.95).toPrecision(5)}" oninput="buyPreview()"></div>
      <div class="field"><label class="f">Target price</label><input class="input" id="bTP" inputmode="decimal" value="${+(pre.tp || price*1.08).toPrecision(5)}" oninput="buyPreview()"></div>
    </div>
    <div class="note" id="bPreview" style="margin-bottom:14px"></div>
    <div class="field"><label class="f">Why are you taking this trade? (your journal)</label>
      <textarea class="input" id="bNote" rows="2" placeholder="e.g. Uptrend, money flowing in, near the floor, RSI 55">${esc(pre.note || "")}</textarea></div>
    <button class="btn green block" onclick="confirmBuy()">Confirm practice buy</button>`);
  buyPreview();
}
function buyPreview(){
  if(!pendingBuy) return;
  const amt = num(document.getElementById("bAmt").value), sl = num(document.getElementById("bSL").value), tp = num(document.getElementById("bTP").value);
  document.getElementById("bAmtHint").innerHTML = amountHint(document.getElementById("bAmt").value, "dollars");
  const p = pendingBuy.price, el = document.getElementById("bPreview");
  if(!amt){ el.textContent = "Enter an amount."; return; }
  const lose = sl ? amt*(1 - sl/p) : null, win = tp ? amt*(tp/p - 1) : null, eq = portfolioStats().total;
  el.innerHTML = `You get <b>${fmtQty(amt/p)}</b> ${esc(pendingBuy.symbol.toUpperCase())}.
    ${lose != null ? `If the stop hits you lose <b class="down">${fmtUsd(lose)}</b> (${(lose/eq*100).toFixed(1)}% of your account).` : ""}
    ${win != null ? `If the target hits you make <b class="up">${fmtUsd(win)}</b>.` : ""}
    ${lose && win ? `Reward is <b>${(win/lose).toFixed(1)}×</b> the risk ${win/lose >= 2 ? "👍" : "— aim for 2× or more"}.` : ""}`;
}
function confirmBuy(){
  if(!pendingBuy) return;
  const amt = num(document.getElementById("bAmt").value), sl = num(document.getElementById("bSL").value), tp = num(document.getElementById("bTP").value);
  const note = document.getElementById("bNote").value.trim();
  if(!amt || amt <= 0){ toast("Enter how much to spend", "err"); return; }
  if(amt > portfolio.cash + 1e-9){ toast("Not enough practice cash", "err"); return; }
  if(sl && sl >= pendingBuy.price){ toast("Stop-loss must be below the buy price", "err"); return; }
  const qty = amt / pendingBuy.price;
  const pos = portfolio.positions[pendingBuy.id] || { symbol: pendingBuy.symbol, qty: 0, cost: 0 };
  pos.qty += qty; pos.cost += amt; pos.symbol = pendingBuy.symbol;
  if(sl) pos.sl = sl; if(tp) pos.tp = tp;
  portfolio.positions[pendingBuy.id] = pos;
  portfolio.cash -= amt;
  portfolio.history.unshift({ t: new Date().toLocaleString(), id: pendingBuy.id, symbol: pendingBuy.symbol, side: "BUY", qty, price: pendingBuy.price, pnl: null, note });
  savePortfolio(); closeModal(); pendingBuy = null;
  toast("Practice buy saved ✅", "ok");
  go("trades");
}

// ---------- Sell & edit ----------
function openSellModal(id, fraction){
  const pos = portfolio.positions[id]; if(!pos) return;
  const price = priceOf(id), qty = pos.qty*fraction, costPart = pos.cost*fraction, pnl = qty*price - costPart;
  openModal(`Sell ${fraction < 1 ? "half of" : "all"} ${esc(pos.symbol.toUpperCase())}`, `
    <div class="result ${pnl >= 0 ? 'up' : 'down'}" style="margin-top:0">
      <div class="sub" style="font-size:13px">Selling ${fmtQty(qty)} at ${fmtPrice(price)}</div>
      <div class="bigNum ${pnl >= 0 ? 'up' : 'down'}">${fmtUsd(pnl, {sign:true})}</div>
      <div class="sub" style="font-size:13px">${fmtPct(pnl/costPart*100)} · you get back ${fmtUsd(qty*price)}</div>
    </div>
    <div class="field" style="margin-top:14px"><label class="f">Why are you selling? (journal)</label>
      <textarea class="input" id="sNote" rows="2" placeholder="${fraction < 1 ? 'Target 1 hit — took half profit' : 'e.g. Stop-loss hit / target reached'}"></textarea></div>
    <button class="btn ${pnl >= 0 ? 'green' : 'red'} block" onclick="confirmSell('${esc(id)}', ${fraction})">Confirm sell</button>`);
}
function confirmSell(id, fraction){
  const pos = portfolio.positions[id]; if(!pos) return;
  const price = priceOf(id), qty = pos.qty*fraction, costPart = pos.cost*fraction, pnl = qty*price - costPart;
  const note = document.getElementById("sNote").value.trim();
  portfolio.cash += qty*price;
  portfolio.history.unshift({ t: new Date().toLocaleString(), id, symbol: pos.symbol, side: fraction < 1 ? "SELL ½" : "SELL", qty, price, pnl, note });
  if(fraction >= 1) delete portfolio.positions[id]; else { pos.qty -= qty; pos.cost -= costPart; }
  savePortfolio(); closeModal();
  toast(pnl >= 0 ? `Sold with ${fmtUsd(pnl)} profit 🎉` : `Sold with ${fmtUsd(-pnl)} loss`, pnl >= 0 ? "ok" : "");
  renderPage();
}
function openEditModal(id){
  const pos = portfolio.positions[id]; if(!pos) return;
  openModal(`Stop-loss & target · ${esc(pos.symbol.toUpperCase())}`, `
    <p class="sub" style="margin-top:0;font-size:13.5px">Tip: open the coin's report to see the suggested stop-loss and targets.</p>
    <div class="field"><label class="f">Stop-loss price (exit if price falls here)</label><input class="input" id="eSL" inputmode="decimal" value="${pos.sl ?? ""}"></div>
    <div class="field"><label class="f">Target price (take profit here)</label><input class="input" id="eTP" inputmode="decimal" value="${pos.tp ?? ""}"></div>
    <div class="row"><button class="btn block" onclick="saveEdit('${esc(id)}')">Save</button><button class="btn ghost" onclick="openReport('${esc(id)}')">📋 Report</button></div>`);
}
function saveEdit(id){
  const pos = portfolio.positions[id]; if(!pos) return;
  pos.sl = num(document.getElementById("eSL").value) || null;
  pos.tp = num(document.getElementById("eTP").value) || null;
  savePortfolio(); closeModal(); toast("Saved ✅", "ok"); renderPage();
}
function resetPortfolio(){
  openModal("Start over?", `<p class="sub">This deletes all practice trades and your journal, and gives you $10,000 practice cash again.</p>
    <div class="row"><button class="btn red block" onclick="doReset()">Yes, start over</button><button class="btn ghost block" onclick="closeModal()">Cancel</button></div>`);
}
function doReset(){ portfolio = { cash: 10000, positions: {}, history: [] }; savePortfolio(); closeModal(); toast("Practice account reset", "ok"); renderPage(); }
