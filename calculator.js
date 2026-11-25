// =====================================================================
// Average & Profit Calculator
// Amount boxes accept shortcuts: 1k = 1,000 · 2.5m = 2,500,000
// =====================================================================
const blankCalc = () => ({ coin:"", mode:"multi", fee:0.1, rows:[{ex:"", price:"", kind:"usd", val:""}], dAvg:"", dVal:"", dKind:"qty", sPrice:"", sPct:100, live:null });
let calc = Object.assign(blankCalc(), lsGet("cryptobot_calc_draft", {}));
if(!Array.isArray(calc.rows) || !calc.rows.length) calc.rows = blankCalc().rows;
let calcBuilt = false;

function renderCalcPage(){
  const el = document.getElementById("page-calc");
  if(!calcBuilt){
    el.innerHTML = `
    <div class="calcGrid">
      <div>
        <div class="card section">
          <h2>1 · Which coin?</h2>
          <div class="row" style="margin-top:10px">
            <input class="input" id="cCoin" list="coinList" placeholder="e.g. SOL, PUMP, AAVE" autocomplete="off" oninput="calcSet('coin', this.value.toUpperCase().trim())">
            <datalist id="coinList"></datalist>
            <button class="btn ghost" onclick="fetchLivePrice()">📡 Live price</button>
          </div>
          <div class="hint" id="liveInfo"></div>
          <div id="savedWrap" style="margin-top:6px"></div>
        </div>

        <div class="card section">
          <h2>2 · What did you buy?</h2>
          <div class="seg" id="modeSeg" style="margin:10px 0 14px">
            <button data-m="multi" onclick="calcSet('mode','multi',true)">I bought at different prices</button>
            <button data-m="direct" onclick="calcSet('mode','direct',true)">I know my average</button>
          </div>
          <div id="multiBox">
            <p class="sub" style="margin:0 0 10px;font-size:13.5px">Add one line for each time you bought. Type the amount in <b>dollars</b> or in <b>coins</b> — you can write <b>1k</b> for 1,000 or <b>2.5m</b> for 2,500,000.</p>
            <div id="buyRows"></div>
            <datalist id="exList"><option>Binance</option><option>Bybit</option><option>KuCoin</option><option>OKX</option><option>MEXC</option><option>Gate</option><option>Bitget</option><option>HTX</option><option>Coinbase</option></datalist>
            <button class="btn ghost" onclick="addRow()">＋ Add another buy</button>
          </div>
          <div id="directBox" class="hidden">
            <p class="sub" style="margin:0 0 10px;font-size:13.5px">Copy the "Avg. price" your exchange shows you.</p>
            <div class="grid g2" style="gap:10px">
              <div class="field"><label class="f">Average buy price ($)</label><input class="input" id="dAvg" inputmode="decimal" oninput="calcSet('dAvg', this.value)"></div>
              <div class="field"><label class="f">How much you bought</label>
                <div class="amt"><input class="input" id="dVal" inputmode="decimal" placeholder="e.g. 1k" oninput="calcSet('dVal', this.value)">
                <select class="input" id="dKind" onchange="calcSet('dKind', this.value)"><option value="qty">Coins</option><option value="usd">$</option></select></div>
                <div class="hint" id="dHint"></div></div>
            </div>
          </div>
          <div class="row" style="margin-top:12px;font-size:13px;color:var(--sub)">Exchange fee
            <input class="input" id="cFee" inputmode="decimal" style="width:80px;padding:7px 9px" oninput="calcSet('fee', this.value)"> %
            <span class="muted" style="font-size:12px">(Binance ≈ 0.1%)</span></div>
        </div>

        <div class="card section">
          <h2>3 · If I sell…</h2>
          <div class="grid g2" style="gap:10px;margin-top:10px">
            <div><label class="f">Sell price ($)</label>
              <div class="amt"><input class="input" id="sPrice" inputmode="decimal" placeholder="Price you want to sell at" oninput="calcSet('sPrice', this.value)">
              <button class="btn ghost" style="padding:0 12px" title="Use live price" onclick="useLiveForSell()">📡</button></div></div>
            <div><label class="f">How much to sell</label>
              <div class="seg" id="pctSeg">${[25,50,75,100].map(p => `<button data-p="${p}" onclick="calcSet('sPct',${p},true)">${p}%</button>`).join("")}</div></div>
          </div>
          <div id="sellResult"></div>
        </div>

        <div class="card section">
          <h2>🔁 Change my average</h2>
          <p class="lead">See what happens if you buy more.</p>
          <div class="grid g2" style="gap:10px">
            <div class="field"><label class="f">If I buy more at ($)</label><input class="input" id="wPrice" inputmode="decimal" oninput="computeCalc()"></div>
            <div class="field"><label class="f">Spending ($)</label><input class="input" id="wAmt" inputmode="decimal" placeholder="e.g. 500 or 1k" oninput="computeCalc()"></div>
          </div>
          <div class="note" id="whatIf"></div>
          <div class="grid g2" style="gap:10px;margin-top:14px">
            <div class="field"><label class="f">I want my average to be ($)</label><input class="input" id="tAvg" inputmode="decimal" oninput="computeCalc()"></div>
            <div class="field"><label class="f">Buying at ($)</label><input class="input" id="tPrice" inputmode="decimal" oninput="computeCalc()"></div>
          </div>
          <div class="note" id="targetAvg"></div>
        </div>
      </div>

      <div class="sticky">
        <div class="hero section">
          <div class="muted" style="font-size:12px;font-weight:700;letter-spacing:.4px" id="rTitle">YOUR AVERAGE BUY PRICE</div>
          <div class="bigNum" id="rAvg">—</div>
          <div class="sub" style="font-size:13px" id="rNote">Add your buys to see your average.</div>
          <div class="mini">
            <div><div class="k">Money in</div><div class="v" id="rCost">—</div></div>
            <div><div class="k">Coins</div><div class="v" id="rQty">—</div></div>
            <div><div class="k">Break-even</div><div class="v" id="rBE">—</div></div>
          </div>
          <div class="row" style="margin-top:14px">
            <button class="btn block" onclick="saveCalc()">💾 Save</button>
            <button class="btn ghost block" onclick="newCalc()">＋ New</button>
          </div>
        </div>
        <div id="liveBox" class="section"></div>
        <div class="card section hidden" id="exBox"><h2>🏦 By exchange</h2>
          <table class="t"><thead><tr><th>Exchange</th><th>Coins</th><th>Avg</th><th>Money in</th></tr></thead><tbody id="exBody"></tbody></table></div>
        <div class="card section"><h2>🎯 If the price moves</h2><p class="lead">Profit or loss if you sell everything.</p>
          <table class="t"><thead><tr><th>Move</th><th>Price</th><th>Profit / loss</th></tr></thead><tbody id="tgtBody"></tbody></table></div>
      </div>
    </div>`;
    calcBuilt = true;
  }
  fillCoinList();
  renderCalc();
}

function calcSet(key, val, rerender){
  calc[key] = val;
  if(key === "coin"){ calc.live = null; document.getElementById("liveInfo").textContent = ""; }
  if(rerender) renderCalc(); else computeCalc();
}
function rowSet(i, key, val){ calc.rows[i][key] = val; computeCalc(); }
function addRow(){
  const last = calc.rows[calc.rows.length-1] || {};
  calc.rows.push({ex: last.ex || "", price:"", kind: last.kind || "usd", val:""});
  renderCalc();
  const inputs = document.querySelectorAll("#buyRows .buyRow:last-child input");
  if(inputs[1]) inputs[1].focus();
}
function delRow(i){ calc.rows.splice(i, 1); if(!calc.rows.length) calc.rows = blankCalc().rows; renderCalc(); }

function renderCalc(){
  if(!calcBuilt) return;
  document.getElementById("cCoin").value = calc.coin;
  document.getElementById("cFee").value = calc.fee;
  document.querySelectorAll("#modeSeg button").forEach(b => b.classList.toggle("on", b.dataset.m === calc.mode));
  document.querySelectorAll("#pctSeg button").forEach(b => b.classList.toggle("on", +b.dataset.p === +calc.sPct));
  document.getElementById("multiBox").classList.toggle("hidden", calc.mode !== "multi");
  document.getElementById("directBox").classList.toggle("hidden", calc.mode !== "direct");
  document.getElementById("dAvg").value = calc.dAvg;
  document.getElementById("dVal").value = calc.dVal;
  document.getElementById("dKind").value = calc.dKind;
  document.getElementById("sPrice").value = calc.sPrice;
  document.getElementById("buyRows").innerHTML = calc.rows.map((r, i) => `
    <div class="buyRow">
      <div class="num">${i+1}</div>
      <div class="bEx"><label class="f">Exchange (optional)</label><input class="input" list="exList" placeholder="e.g. Binance" value="${esc(r.ex)}" oninput="rowSet(${i},'ex',this.value)"></div>
      <div class="bP"><label class="f">Buy price ($)</label><input class="input" inputmode="decimal" placeholder="0.00" value="${esc(r.price)}" oninput="rowSet(${i},'price',this.value)"></div>
      <div class="bA"><label class="f">Amount</label><div class="amt">
        <input class="input" inputmode="decimal" placeholder="${r.kind === 'usd' ? 'e.g. 500' : 'e.g. 1k'}" value="${esc(r.val)}" oninput="rowSet(${i},'val',this.value)">
        <select class="input" onchange="rowSet(${i},'kind',this.value); renderCalc()"><option value="usd" ${r.kind === 'usd' ? 'selected' : ''}>$</option><option value="qty" ${r.kind === 'qty' ? 'selected' : ''}>Coins</option></select>
      </div></div>
      <button class="del" title="Remove this buy" onclick="delRow(${i})">✕</button>
      <div class="out" id="rowOut${i}"></div>
    </div>`).join("");
  renderSaved();
  computeCalc();
}

// Core maths: weighted average = total paid ÷ total coins
function calcPosition(){
  const f = num(calc.fee)/100, byEx = {};
  let qty = 0, gross = 0, used = 0;
  if(calc.mode === "direct"){
    const avg = num(calc.dAvg), v = num(calc.dVal);
    const q = calc.dKind === "usd" ? (avg ? v/avg : 0) : v;
    if(q > 0 && avg > 0){ qty = q; gross = q*avg; used = 1; }
  } else {
    calc.rows.forEach((r, i) => {
      const p = num(r.price), v = num(r.val), out = document.getElementById("rowOut" + i);
      const bad = (String(r.val).trim() && isNaN(parseNum(r.val))) || (String(r.price).trim() && isNaN(parseNum(r.price)));
      let q = 0;
      if(p > 0 && v > 0) q = r.kind === "usd" ? v/p : v;
      if(out) out.innerHTML = bad ? `<span class="down">Can't read a number here — try 1000, 1k or 2.5m</span>`
        : q ? `= <b>${fmtQty(q)}</b> coins (${plain(+q.toPrecision(8))}) for <b>${fmtUsd(q*p)}</b>` : "";
      if(!q) return;
      used++; qty += q; gross += q*p;
      const k = (r.ex || "").trim() || "Not set";
      byEx[k] = byEx[k] || {q:0, g:0}; byEx[k].q += q; byEx[k].g += q*p;
    });
  }
  const cost = gross*(1+f);
  return { qty, gross, cost, f, used, avg: qty ? gross/qty : 0, avgCost: qty ? cost/qty : 0, byEx };
}

function computeCalc(){
  if(!calcBuilt) return;
  lsSet("cryptobot_calc_draft", calc);
  const P = calcPosition(), sym = calc.coin || "coins";
  const dh = document.getElementById("dHint"); if(dh) dh.innerHTML = amountHint(calc.dVal, calc.dKind === "usd" ? "dollars" : "coins");
  document.getElementById("rTitle").textContent = (calc.coin ? calc.coin + " · " : "") + "YOUR AVERAGE BUY PRICE";
  const be = P.qty ? P.avgCost/(1-P.f) : 0;
  if(!P.qty){
    ["rAvg","rCost","rQty","rBE"].forEach(id => document.getElementById(id).textContent = "—");
    document.getElementById("rNote").textContent = calc.mode === "multi" ? "Add at least one buy with a price and an amount." : "Enter your average price and amount.";
  } else {
    document.getElementById("rAvg").textContent = fmtPrice(P.avg);
    document.getElementById("rNote").textContent = calc.mode === "multi" ? `Average of ${P.used} buy${P.used === 1 ? "" : "s"} — bigger buys count more.` : "The average you entered.";
    document.getElementById("rCost").textContent = fmtUsd(P.cost);
    document.getElementById("rQty").textContent = fmtQty(P.qty);
    document.getElementById("rBE").textContent = fmtPrice(be);
  }

  // By exchange
  const exKeys = Object.keys(P.byEx), exBox = document.getElementById("exBox");
  exBox.classList.toggle("hidden", !(calc.mode === "multi" && exKeys.length > 1));
  document.getElementById("exBody").innerHTML = exKeys.map(k => { const e = P.byEx[k];
    return `<tr><td>${esc(k)}</td><td>${fmtQty(e.q)}</td><td>${fmtPrice(e.g/e.q)}</td><td>${fmtUsd(e.g*(1+P.f))}</td></tr>`; }).join("");

  // Live price card
  const lb = document.getElementById("liveBox");
  if(calc.live && P.qty){
    const val = P.qty*calc.live*(1-P.f), pnl = val - P.cost, pct = pnl/P.cost*100;
    lb.innerHTML = `<div class="result ${pnl >= 0 ? 'up' : 'down'}" style="margin:0">
      <div class="sub" style="font-size:13px">📡 At today's price ${fmtPrice(calc.live)}, if you sell everything:</div>
      <div class="bigNum ${pnl >= 0 ? 'up' : 'down'}">${fmtUsd(pnl, {sign:true})} <span style="font-size:16px">(${fmtPct(pct)})</span></div>
      <div class="sub" style="font-size:13px">${calc.live >= be ? "You're above break-even ✅" : `Price needs to rise ${((be/calc.live-1)*100).toFixed(2)}% to break even`}</div></div>`;
  } else lb.innerHTML = "";

  // Sell result
  const sp = num(calc.sPrice), pctSell = num(calc.sPct) || 100, sr = document.getElementById("sellResult");
  if(!P.qty) sr.innerHTML = `<div class="hint" style="margin-top:12px">Add your buys first (step 2).</div>`;
  else if(!sp) sr.innerHTML = `<div class="hint" style="margin-top:12px">Enter a sell price, or press 📡 to use today's price.</div>`;
  else {
    const q = P.qty*pctSell/100, proceeds = q*sp, fee = proceeds*P.f, costPart = q*P.avgCost;
    const pnl = proceeds - fee - costPart, pct = pnl/costPart*100;
    sr.innerHTML = `<div class="result ${pnl >= 0 ? 'up' : 'down'}">
      <div class="sub" style="font-size:13px">Selling ${pctSell}% (${fmtQty(q)} ${esc(sym)}) at ${fmtPrice(sp)}</div>
      <div class="bigNum ${pnl >= 0 ? 'up' : 'down'}">${pnl >= 0 ? "Profit " : "Loss "}${fmtUsd(Math.abs(pnl))} <span style="font-size:16px">(${fmtPct(pct)})</span></div>
      <div class="mini">
        <div><div class="k">You receive</div><div class="v">${fmtUsd(proceeds - fee)}</div></div>
        <div><div class="k">You paid</div><div class="v">${fmtUsd(costPart)}</div></div>
        <div><div class="k">Coins left</div><div class="v">${fmtQty(P.qty - q)}</div></div>
      </div>
      <div class="muted" style="font-size:12px;margin-top:8px">Includes about ${fmtUsd(q*P.avg*P.f + fee)} in fees.</div></div>`;
  }

  // Targets table
  const tb = document.getElementById("tgtBody");
  tb.innerHTML = !P.qty ? `<tr><td colspan="3" class="muted">Add your buys first.</td></tr>` :
    [-20,-10,-5,5,10,20,30,50,100].map(m => {
      const price = P.avg*(1+m/100), pnl = P.qty*price*(1-P.f) - P.cost;
      return `<tr><td class="${m >= 0 ? 'up' : 'down'}"><b>${m > 0 ? "+" : ""}${m}%</b></td><td>${fmtPrice(price)}</td><td class="${pnl >= 0 ? 'up' : 'down'}">${fmtUsd(pnl, {sign:true})}</td></tr>`;
    }).join("");

  // Buy more → new average
  const wp = num(document.getElementById("wPrice").value), wa = num(document.getElementById("wAmt").value), wi = document.getElementById("whatIf");
  if(P.qty && wp > 0 && wa > 0){
    const nq = P.qty + wa/wp, ng = P.gross + wa, nAvg = ng/nq, ch = (nAvg/P.avg-1)*100;
    wi.innerHTML = `New average: <b class="${ch <= 0 ? 'up' : 'down'}">${fmtPrice(nAvg)}</b> (was ${fmtPrice(P.avg)}, ${fmtPct(ch)}). You'd have ${fmtQty(nq)} coins and ${fmtUsd(ng*(1+P.f))} in total.`;
  } else wi.innerHTML = P.qty ? "Fill both boxes to see your new average." : "Add your buys first.";

  // Reverse: target average
  const ta = num(document.getElementById("tAvg").value), tp = num(document.getElementById("tPrice").value), tg = document.getElementById("targetAvg");
  if(P.qty && ta > 0 && tp > 0){
    const lower = ta < P.avg;
    if(ta === P.avg || (lower && tp >= ta) || (!lower && tp <= ta)){
      tg.innerHTML = `<span class="warnc">Not possible: to bring your average ${lower ? "down" : "up"} to ${fmtPrice(ta)}, you must buy ${lower ? "below" : "above"} ${fmtPrice(ta)}.</span>`;
    } else {
      const x = (P.gross - ta*P.qty)/(ta - tp);
      tg.innerHTML = `Buy <b>${fmtQty(x)} coins</b> at ${fmtPrice(tp)} — that's <b>${fmtUsd(x*tp)}</b> more — to get an average of ${fmtPrice(ta)}.
        ${lower ? `<br><span class="warnc">⚠️ Buying more of a falling coin only makes sense if it was your plan from the start.</span>` : ""}`;
    }
  } else tg.innerHTML = P.qty ? "Fill both boxes to see how much more you'd need to buy." : "Add your buys first.";
}

// ---- Live price ----
function fillCoinList(){
  const dl = document.getElementById("coinList"); if(!dl) return;
  dl.innerHTML = [...new Set(tradable().map(c => (c.symbol||"").toUpperCase()))].map(s => `<option value="${esc(s)}">`).join("");
}
async function getLivePrice(sym){
  sym = (sym||"").trim().toUpperCase(); if(!sym) return null;
  const hit = marketData.filter(c => (c.symbol||"").toUpperCase() === sym).sort((a,b) => b.market_cap - a.market_cap)[0];
  if(hit) return { price: hit.current_price, name: hit.name };
  const s = await fetchJSON(`${API}/search?query=${encodeURIComponent(sym)}`);
  const c = (s.coins||[]).find(x => (x.symbol||"").toUpperCase() === sym) || (s.coins||[])[0];
  if(!c) return null;
  const p = await fetchJSON(`${API}/simple/price?ids=${encodeURIComponent(c.id)}&vs_currencies=usd`);
  return p[c.id]?.usd ? { price: p[c.id].usd, name: c.name } : null;
}
async function fetchLivePrice(){
  const info = document.getElementById("liveInfo");
  if(!calc.coin){ info.innerHTML = `<span class="warnc">Type the coin name first.</span>`; return; }
  info.textContent = "⏳ Getting today's price…";
  try{
    const r = await getLivePrice(calc.coin);
    if(!r){ info.innerHTML = `<span class="warnc">Couldn't find "${esc(calc.coin)}". Check the spelling.</span>`; return; }
    calc.live = r.price;
    info.innerHTML = `✅ ${esc(r.name)} is <b>${fmtPrice(r.price)}</b> right now (average across exchanges — yours may differ slightly).`;
    computeCalc();
  }catch(e){ info.innerHTML = `<span class="warnc">${esc(e.message)}</span>`; }
}
async function useLiveForSell(){
  if(!calc.live) await fetchLivePrice();
  if(calc.live){ calc.sPrice = String(+calc.live.toPrecision(6)); document.getElementById("sPrice").value = calc.sPrice; computeCalc(); }
}

// ---- Save / load ----
function savedCalcs(){ return lsGet("cryptobot_calcs", {}); }
function saveCalc(){
  if(!calc.coin){ toast("Type the coin name first, then save", "err"); return; }
  const all = savedCalcs(), copy = JSON.parse(JSON.stringify(calc));
  copy.live = null; copy.savedAt = new Date().toLocaleString();
  all[calc.coin] = copy; lsSet("cryptobot_calcs", all); renderSaved();
  toast(`${calc.coin} saved 💾`, "ok");
}
function loadCalc(k){
  const c = savedCalcs()[k]; if(!c) return;
  calc = Object.assign(blankCalc(), c); calc.live = null;
  ["wPrice","wAmt","tAvg","tPrice"].forEach(id => { const e = document.getElementById(id); if(e) e.value = ""; });
  renderCalc();
  document.getElementById("liveInfo").innerHTML = `Opened ${esc(k)} (saved ${esc(c.savedAt || "")}). Press 📡 Live price to see your profit now.`;
}
function deleteCalc(k, ev){
  ev.stopPropagation();
  openModal("Delete saved coin?", `<p class="sub">Delete your saved numbers for <b>${esc(k)}</b>?</p>
    <div class="row"><button class="btn red block" onclick='doDeleteCalc(${JSON.stringify(k)})'>Delete</button><button class="btn ghost block" onclick="closeModal()">Cancel</button></div>`);
}
function doDeleteCalc(k){ const all = savedCalcs(); delete all[k]; lsSet("cryptobot_calcs", all); closeModal(); renderSaved(); }
function newCalc(){
  calc = blankCalc();
  ["wPrice","wAmt","tAvg","tPrice"].forEach(id => { const e = document.getElementById(id); if(e) e.value = ""; });
  const li = document.getElementById("liveInfo"); if(li) li.textContent = "";
  renderCalc();
}
function renderSaved(){
  const w = document.getElementById("savedWrap"); if(!w) return;
  const keys = Object.keys(savedCalcs());
  w.innerHTML = keys.length ? `<div class="muted" style="font-size:12px;font-weight:600;margin:6px 0">YOUR SAVED COINS</div>
    <div class="chips">${keys.map(k => `<span class="chip ${k === calc.coin ? 'on' : ''}" onclick='loadCalc(${JSON.stringify(k)})'>${esc(k)} <span onclick='deleteCalc(${JSON.stringify(k)}, event)' style="margin-left:4px;opacity:.7">✕</span></span>`).join("")}</div>` : "";
}
function sendToCalc(sym, price){
  closeModal();
  go("calc");
  if(savedCalcs()[sym]) loadCalc(sym);
  else { calc = blankCalc(); calc.coin = sym; calc.rows[0].price = String(+(+price).toPrecision(6)); renderCalc(); }
  calc.live = price;
  computeCalc();
}
