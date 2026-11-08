const $ = (id) => document.getElementById(id);
let state = null, picks = [], lastRound = null;
const grid = $("numberGrid");

function money(n){ return Number(n).toFixed(2); }
function setNotice(message, kind=""){ $("notice").textContent=message; $("notice").className="notice "+kind; }
function renderGrid(drawn=[]){
  grid.innerHTML="";
  for(let n=1;n<=40;n++){
    const b=document.createElement("button");
    b.className="number";
    b.textContent=n;
    b.setAttribute("aria-label",`Число ${n}`);
    if(picks.includes(n)) b.classList.add("selected");
    if(drawn.includes(n)) b.classList.add("drawn");
    if(drawn.includes(n)&&picks.includes(n)) b.classList.add("hit");
    b.addEventListener("click",()=>{
      if(picks.includes(n)) picks=picks.filter(x=>x!==n);
      else if(picks.length<10) picks=[...picks,n].sort((a,b)=>a-b);
      else return setNotice("Можно выбрать не более 10 чисел.","bad");
      renderGrid(lastRound?.drawn||[]); renderPicks(); renderPayouts();
      setNotice(picks.length ? `Выбрано чисел: ${picks.length} из 10.` : "Выберите числа и нажмите «Играть».");
    });
    grid.appendChild(b);
  }
}
function renderPicks(){
  $("pickCount").textContent=picks.length;
  $("pickSlots").innerHTML="";
  for(let i=0;i<10;i++){
    const s=document.createElement("span");
    if(picks[i]!==undefined){s.className="filled";s.textContent=picks[i];}
    $("pickSlots").appendChild(s);
  }
}
function renderPayouts(){
  if(!state)return;
  const row=state.payoutTable[picks.length]||{};
  const max=Math.max(10,picks.length);
  $("payoutTable").innerHTML="";
  for(let i=0;i<=max;i++){
    const mult=row[i]??0, d=document.createElement("div");
    if(i===lastRound?.hits)d.classList.add("active");
    d.innerHTML=`<span>${i} совп.</span><strong>${mult}×</strong>`;
    $("payoutTable").appendChild(d);
  }
}
function renderHistory(){
  const el=$("history");
  if(!state.history.length){el.innerHTML='<span class="empty">Раундов пока нет</span>';return;}
  el.innerHTML="";
  state.history.forEach(r=>{
    const card=document.createElement("div");card.className="history-card";
    card.innerHTML=`<b>РАУНД #${r.id} · ${r.hits} ПОПАДАНИЙ</b><p>Выпало: ${r.drawn.join(" · ")}<br>Ставка: ${money(r.bet)} · Выплата: ${money(r.payout)}</p>`;
    el.appendChild(card);
  });
}
function renderState(){
  $("balance").textContent=money(state.balance);
  $("fairHash").textContent=state.serverSeedHash;
  renderHistory();renderPicks();renderPayouts();
}
async function api(url,body){
  const r=await fetch(url,{method:body?"POST":"GET",headers:{"Content-Type":"application/json"},body:body?JSON.stringify(body):undefined});
  const data=await r.json();
  if(!r.ok)throw new Error(data.error||"Ошибка сервера");
  return data;
}
async function init(){try{state=await api("/api/state");renderState();renderGrid();}catch(e){setNotice(e.message,"bad");}}
$("betMinus").onclick=()=>{$("bet").value=Math.max(.1,Number($("bet").value)-1).toFixed(2)};
$("betPlus").onclick=()=>{$("bet").value=Math.min(1000,Number($("bet").value)+1).toFixed(2)};
$("clear").onclick=()=>{picks=[];lastRound=null;renderGrid();renderPicks();renderPayouts();$("lastResult").innerHTML='<span class="field-label">ПОСЛЕДНИЙ РАУНД</span><b>—</b><small>Здесь появится результат</small>';setNotice("Выбор очищен.");};
$("autoPick").onclick=()=>{const a=Array.from({length:40},(_,i)=>i+1);for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}picks=a.slice(0,10).sort((x,y)=>x-y);renderGrid(lastRound?.drawn||[]);renderPicks();renderPayouts();setNotice("Случайно выбрано 10 чисел.");};
$("play").onclick=async()=>{
  if(!picks.length)return setNotice("Сначала выберите хотя бы одно число.","bad");
  const bet=Number($("bet").value);$("play").disabled=true;setNotice("Проводим раунд…");
  try{
    const r=await api("/api/play",{picks,bet});state=r;lastRound=r;renderState();renderGrid(r.drawn);
    $("lastResult").innerHTML=`<span class="field-label">РАУНД #${r.id}</span><b>${r.hits} / ${picks.length} ПОПАДАНИЙ</b><small>Выплата: ${money(r.payout)} · Множитель: ${r.multiplier}×</small>`;
    setNotice(r.payout>0?`Выплата ${money(r.payout)} виртуальных кредитов.`:"В этом раунде выплаты нет.",r.payout>0?"good":"");
  }catch(e){setNotice(e.message,"bad");}
  finally{$("play").disabled=false;}
};
$("resetDemo").onclick=async()=>{try{state=await api("/api/reset-demo",{});renderState();setNotice("Демо-баланс восстановлен: 1000.00.");}catch(e){setNotice(e.message,"bad");}};
$("verify").onclick=()=>{if(!lastRound)return setNotice("Сначала сыграйте раунд, чтобы проверить его данные.");setNotice(`Раунд #${lastRound.id}: хеш сервера ${lastRound.serverSeedHash}. Seed раскрывается только после ротации — в демо-сборке используется предварительный хеш.`);};
$("soundBtn").onclick=()=>setNotice("Звуковые эффекты пока отключены.");
init();
