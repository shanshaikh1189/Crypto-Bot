// =====================================================================
// ---------- Average & Profit Calculator ----------
// =====================================================================
function switchView(v){
  document.getElementById("view-dash").style.display = v === "dash" ? "block" : "none";
  document.getElementById("view-calc").style.display = v === "calc" ? "block" : "none";
  document.querySelectorAll(".vbtn").forEach(b => b.classList.toggle("active", b.dataset.view === v));
  if(v === "calc") fillCoinList();
  lsSet("cryptobot_view", v);
}
const blankCalc = () => ({ coin:"", mode:"multi", fee:0.1, rows:[{ex:"", price:"", kind:"usd", val:""}], dAvg:"", dVal:"", dKind:"qty", sPrice:"", sPct:100, live:null });
let calc = Object.assign(blankCalc(), lsGet("cryptobot_calc_draft", {}));
if(!Array.isArray(calc.rows) || !calc.rows.length) calc.rows = blankCalc().rows;

function fmtQ(n){
  if(n == null || isNaN(n)) return "-";
  if(Math.abs(n) < 1e-12) return "0";
  const a = Math.abs(n);
  if(a >= 1000) return n.toLocaleString(undefined,{maximumFractionDigits:2});
  if(a >= 1) return n.toLocaleString(undefined,{maximumFractionDigits:4});
  return n.toPrecision(5);
}
const money = n => (n<0?'-':'') + '$' + fmt(Math.abs(n));
const signMoney = n => (n>=0?'+':'-') + '$' + fmt(Math.abs(n));
const num = v => { const x = parseFloat(v); return isFinite(x) ? x : 0; };

function calcSet(key, val, rerender){
  calc[key] = val;
  if(key === "coin") calc.live = null;
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
function delRow(i){
  calc.rows.splice(i,1);
  if(!calc.rows.length) calc.rows = blankCalc().rows;
  renderCalc();
}

function renderCalc(){
  document.getElementById("cCoin").value = calc.coin;
  document.getElementById("cFee").value = calc.fee;
  document.querySelectorAll("#modeSeg button").forEach(b => b.classList.toggle("on", b.dataset.m === calc.mode));
  document.querySelectorAll("#pctSeg button").forEach(b => b.classList.toggle("on", +b.dataset.p === +calc.sPct));
  document.getElementById("multiBox").style.display = calc.mode === "multi" ? "block" : "none";
  document.getElementById("directBox").style.display = calc.mode === "direct" ? "block" : "none";
  document.getElementById("dAvg").value = calc.dAvg;
  document.getElementById("dVal").value = calc.dVal;
  document.getElementById("dKind").value = calc.dKind;
  document.getElementById("sPrice").value = calc.sPrice;
  document.getElementById("buyRows").innerHTML = calc.rows.map((r,i) => `
    <div class="buyRow">
      <div class="num">${i+1}</div>
      <div class="exCell"><input type="text" list="exList" placeholder="Exchange" value="${esc(r.ex)}" oninput="rowSet(${i},'ex',this.value)"></div>
      <div><input type="number" step="any" placeholder="Price" value="${esc(r.price)}" oninput="rowSet(${i},'price',this.value)"></div>
      <div class="amtCell"><div class="amtWrap">
        <input type="number" step="any" placeholder="${r.kind==='usd'?'$ amount':'Coins'}" value="${esc(r.val)}" oninput="rowSet(${i},'val',this.value)">
        <select onchange="rowSet(${i},'kind',this.value); renderCalc()"><option value="usd" ${r.kind==='usd'?'selected':''}>$</option><option value="qty" ${r.kind==='qty'?'selected':''}>Coins</option></select>
      </div></div>
      <div class="out" id="rowOut${i}">-</div>
      <button class="del" title="Hatayein" onclick="delRow(${i})">✕</button>
    </div>`).join("");
  renderSaved();
  computeCalc();
}

// Core math: returns {qty, gross (sum p*q), cost (incl. buy fee), avg, avgCost, byEx}
function calcPosition(){
  const f = num(calc.fee)/100;
  const byEx = {};
  let qty = 0, gross = 0;
  if(calc.mode === "direct"){
    const avg = num(calc.dAvg), v = num(calc.dVal);
    const q = calc.dKind === "usd" ? (avg ? v/avg : 0) : v;
    qty = q; gross = q*avg;
  } else {
    calc.rows.forEach((r,i) => {
      const p = num(r.price), v = num(r.val);
      let q = 0;
      if(p > 0 && v > 0) q = r.kind === "usd" ? v/p : v;
      const out = document.getElementById("rowOut"+i);
      if(out) out.innerHTML = q ? `<b>${fmtQ(q)}</b> coins<br><span class="small">= $${fmt(q*p)}</span>` : `<span class="small">price + amount</span>`;
      if(!q) return;
      qty += q; gross += q*p;
      const k = (r.ex || "Not set").trim() || "Not set";
      byEx[k] = byEx[k] || {q:0, g:0}; byEx[k].q += q; byEx[k].g += q*p;
    });
  }
  const cost = gross*(1+f);
  return { qty, gross, cost, f, avg: qty ? gross/qty : 0, avgCost: qty ? cost/qty : 0, byEx };
}

function computeCalc(){
  lsSet("cryptobot_calc_draft", calc);
  const P = calcPosition();
  const sym = calc.coin || "Coin";
  document.getElementById("rCoinTitle").textContent = `${sym} — Average Buy Price`;
  const be = P.qty ? P.avgCost/(1-P.f) : 0;
  if(!P.qty){
    ["rAvg","rCost","rQty","rBE"].forEach(id => document.getElementById(id).textContent = "—");
    document.getElementById("rAvgNote").textContent = calc.mode === "multi" ? "Kam se kam ek buy ki price aur amount daalein." : "Average price aur amount daalein.";
  } else {
    document.getElementById("rAvg").textContent = "$" + fmtP(P.avg);
    const nBuys = calc.mode === "multi" ? calc.rows.filter(r => num(r.price) && num(r.val)).length : 1;
    document.getElementById("rAvgNote").textContent = calc.mode === "multi" ? `${nBuys} buys ka weighted average (jahan zyada paisa laga, us price ka asar zyada).` : "Aapki di hui average price.";
    document.getElementById("rCost").textContent = "$" + fmt(P.cost);
    document.getElementById("rQty").textContent = fmtQ(P.qty);
    document.getElementById("rBE").textContent = "$" + fmtP(be);
  }

  // Exchange breakdown
  const exKeys = Object.keys(P.byEx);
  const exBox = document.getElementById("exBox");
  if(calc.mode === "multi" && exKeys.length > 1){
    exBox.style.display = "block";
    document.getElementById("exBody").innerHTML = exKeys.map(k => { const e = P.byEx[k];
      return `<tr><td>${esc(k)}</td><td>${fmtQ(e.q)}</td><td>$${fmtP(e.g/e.q)}</td><td>$${fmt(e.g*(1+P.f))}</td></tr>`; }).join("");
  } else exBox.style.display = "none";

  // Live
  const liveBox = document.getElementById("liveBox");
  if(calc.live && P.qty){
    liveBox.style.display = "block";
    const val = P.qty*calc.live*(1-P.f), pnl = val - P.cost, pct = pnl/P.cost*100;
    document.getElementById("liveNow").innerHTML = `
      <div class="resultCard ${pnl>=0?'up':'down'}" style="margin:6px 0 0">
        <div class="small">Live price $${fmtP(calc.live)} par abhi bechein to</div>
        <div class="big ${pnl>=0?'pos':'neg'}">${signMoney(pnl)} <span style="font-size:16px">(${pct>=0?'+':''}${pct.toFixed(2)}%)</span></div>
        <div class="small">Holding ki value: $${fmt(val)} · ${calc.live >= be ? 'Break-even se upar ✅' : `Break-even tak ${((be/calc.live-1)*100).toFixed(2)}% aur chahiye`}</div>
      </div>`;
  } else liveBox.style.display = "none";

  // Sell result
  const sp = num(calc.sPrice), pctSell = num(calc.sPct) || 100;
  const sr = document.getElementById("sellResult");
  if(!P.qty) sr.innerHTML = `<div class="hint">Pehle buys daalein.</div>`;
  else if(!sp) sr.innerHTML = `<div class="hint">Sell price daalein (ya 📡 se live price lein).</div>`;
  else {
    const q = P.qty*pctSell/100;
    const proceeds = q*sp, fee = proceeds*P.f, costPart = q*P.avgCost;
    const pnl = proceeds - fee - costPart, pct = pnl/costPart*100;
    sr.innerHTML = `
      <div class="resultCard ${pnl>=0?'up':'down'}">
        <div class="small">${fmtQ(q)} ${esc(sym)} ($${fmtP(sp)} par ${pctSell}% holding) bechne par</div>
        <div class="big ${pnl>=0?'pos':'neg'}">${pnl>=0?'🟢 Profit ':'🔴 Loss '}${signMoney(pnl)} <span style="font-size:16px">(${pct>=0?'+':''}${pct.toFixed(2)}%)</span></div>
        <div class="mini3">
          <div><div class="t">Milega (fee ke baad)</div><div class="v">$${fmt(proceeds-fee)}</div></div>
          <div><div class="t">Is hisse ki laagat</div><div class="v">$${fmt(costPart)}</div></div>
          <div><div class="t">Baqi coins</div><div class="v">${fmtQ(P.qty-q)}</div></div>
        </div>
        <div class="small" style="margin-top:8px">Fees: buy + sell ≈ $${fmt(q*P.avg*P.f + fee)} · Sell price average se ${((sp/P.avg-1)*100).toFixed(2)}% ${sp>=P.avg?'upar':'neeche'} hai.</div>
      </div>`;
  }

  // Targets
  const tb = document.getElementById("tgtBody");
  if(!P.qty) tb.innerHTML = `<tr><td colspan="3" class="small">Buys daalein.</td></tr>`;
  else {
    const moves = [-20,-10,-5,5,10,20,30,50,100];
    tb.innerHTML = moves.map(m => {
      const price = P.avg*(1+m/100);
      const pnl = P.qty*price*(1-P.f) - P.cost;
      return `<tr><td class="${m>=0?'pos':'neg'}">${m>0?'+':''}${m}%</td><td>$${fmtP(price)}</td><td class="${pnl>=0?'pos':'neg'}">${signMoney(pnl)}</td></tr>`;
    }).join("");
  }

  // What-if: buy more
  const wp = num(document.getElementById("wPrice").value), wa = num(document.getElementById("wAmt").value);
  const wi = document.getElementById("whatIf");
  if(P.qty && wp > 0 && wa > 0){
    const nq = P.qty + wa/wp, ng = P.gross + wa;
    const nAvg = ng/nq, ch = (nAvg/P.avg-1)*100;
    wi.innerHTML = `Naya average: <b class="${ch<=0?'pos':'neg'}">$${fmtP(nAvg)}</b> (abhi $${fmtP(P.avg)} se ${ch.toFixed(2)}%) · Total coins ${fmtQ(nq)} · Total lagaya ~$${fmt(ng*(1+P.f))}`;
  } else wi.innerHTML = P.qty ? "" : "Pehle buys daalein.";

  // Reverse: target average
  const ta = num(document.getElementById("tAvg").value), tp = num(document.getElementById("tPrice").value);
  const tg = document.getElementById("targetAvg");
  if(P.qty && ta > 0 && tp > 0){
    const lower = ta < P.avg;
    if((lower && !(tp < ta)) || (!lower && !(tp > ta)) || ta === P.avg){
      tg.innerHTML = `<span class="warn">Yeh mumkin nahi: average $${fmtP(ta)} ${lower?'neeche':'upar'} laane ke liye khareed price $${fmtP(ta)} se ${lower?'kam':'zyada'} honi chahiye.</span>`;
    } else {
      const x = (P.gross - ta*P.qty)/(ta - tp); // coins needed
      tg.innerHTML = `Average $${fmtP(ta)} karne ke liye $${fmtP(tp)} par <b>${fmtQ(x)} coins</b> khareedne honge = <b>$${fmt(x*tp)}</b> aur lagane honge.
        ${lower ? '<br><span class="warn">⚠️ Girte coin mein average karna tabhi theek hai jab plan pehle se ho — warna nuksaan barhta hai.</span>' : ''}`;
    }
  } else tg.innerHTML = "";
}

// ---- Live price ----
function fillCoinList(){
  const syms = [...new Set(marketData.filter(c=>!isSkip(c)).map(c => (c.symbol||"").toUpperCase()))].slice(0,150);
  document.getElementById("coinList").innerHTML = syms.map(s => `<option value="${esc(s)}">`).join("");
}
async function getLivePrice(sym){
  sym = (sym||"").trim().toUpperCase(); if(!sym) return null;
  const hit = marketData.filter(c => (c.symbol||"").toUpperCase() === sym).sort((a,b)=>b.market_cap-a.market_cap)[0];
  if(hit) return { price: hit.current_price, name: hit.name, id: hit.id };
  const s = await (await fetch(`${API}/search?query=${encodeURIComponent(sym)}`)).json();
  const c = (s.coins||[]).find(x => (x.symbol||"").toUpperCase() === sym) || (s.coins||[])[0];
  if(!c) return null;
  const p = await (await fetch(`${API}/simple/price?ids=${encodeURIComponent(c.id)}&vs_currencies=usd`)).json();
  return p[c.id]?.usd ? { price: p[c.id].usd, name: c.name, id: c.id } : null;
}
async function fetchLivePrice(){
  const info = document.getElementById("liveInfo");
  if(!calc.coin){ info.innerHTML = `<span class="warn">Pehle coin ka naam likhein.</span>`; return; }
  info.textContent = "⏳ Live price la rahe hain…";
  try{
    const r = await getLivePrice(calc.coin);
    if(!r){ info.innerHTML = `<span class="warn">"${esc(calc.coin)}" CoinGecko par nahi mila. Spelling check karein.</span>`; return; }
    calc.live = r.price;
    info.innerHTML = `✅ ${esc(r.name)} live price: <b>$${fmtP(r.price)}</b> (CoinGecko average — aapke exchange par thora farq ho sakta hai)`;
    computeCalc();
  }catch(e){ info.innerHTML = `<span class="warn">Price nahi mili (internet ya CoinGecko limit). ${esc(e.message)}</span>`; }
}
async function useLiveForSell(){
  if(!calc.live) await fetchLivePrice();
  if(calc.live){ calc.sPrice = +calc.live.toPrecision(6); document.getElementById("sPrice").value = calc.sPrice; computeCalc(); }
}

// ---- Save / load ----
function savedCalcs(){ return lsGet("cryptobot_calcs", {}); }
function saveCalc(){
  if(!calc.coin){ alert("Save karne ke liye coin ka naam likhein."); return; }
  const all = savedCalcs(); const copy = JSON.parse(JSON.stringify(calc)); copy.live = null; copy.savedAt = new Date().toLocaleString();
  all[calc.coin] = copy; lsSet("cryptobot_calcs", all); renderSaved();
  document.getElementById("liveInfo").innerHTML = `💾 ${esc(calc.coin)} ka hisab save ho gaya.`;
}
function loadCalc(k){
  const c = savedCalcs()[k]; if(!c) return;
  calc = Object.assign(blankCalc(), c); calc.live = null; renderCalc();
  document.getElementById("liveInfo").innerHTML = `📂 ${esc(k)} khul gaya (save: ${esc(c.savedAt||'-')}). 📡 dabakar live P&L dekhein.`;
}
function deleteCalc(k, ev){
  ev.stopPropagation();
  if(!confirm(k + " ka saved hisab delete karein?")) return;
  const all = savedCalcs(); delete all[k]; lsSet("cryptobot_calcs", all); renderSaved();
}
function newCalc(){ calc = blankCalc(); ["wPrice","wAmt","tAvg","tPrice"].forEach(id => document.getElementById(id).value = ""); document.getElementById("liveInfo").textContent = ""; renderCalc(); }
function renderSaved(){
  const all = savedCalcs(), keys = Object.keys(all);
  document.getElementById("savedChips").innerHTML = keys.length
    ? keys.map(k => `<span class="chip ${k===calc.coin?'on':''}" onclick='loadCalc(${JSON.stringify(k)})'>${esc(k)}<span class="x" onclick='deleteCalc(${JSON.stringify(k)}, event)'>✕</span></span>`).join("")
    : `<span class="small">Abhi koi save nahi.</span>`;
}
function sendToCalc(sym, price){
  closeReport();
  const all = savedCalcs();
  if(all[sym]) loadCalc(sym);
  else { calc = blankCalc(); calc.coin = sym; calc.rows[0].price = +(+price).toPrecision(6); renderCalc(); }
  calc.live = price; computeCalc();
  switchView("calc");
}

