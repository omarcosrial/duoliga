const root = document.querySelector('#app');

const MISSIONS = [
  { title:'Apresentação sem cola', desc:'Fale por 1 minuto: nome, idade, cidade, trabalho e um hobby. Pode gravar no celular para se ouvir depois.' },
  { title:'20 palavras úteis', desc:'Aprenda 20 palavras que você realmente usaria numa conversa e crie uma frase com pelo menos 10 delas.' },
  { title:'Meu dia em 1 minuto', desc:'Conte como foi seu dia, do começo ao fim, tentando não voltar para o português.' },
  { title:'Pedido no restaurante', desc:'Treine frases para pedir comida, bebida, sobremesa, perguntar preço e pedir a conta.' },
  { title:'Turista perdido', desc:'Treine como pedir e dar direções para chegar a um lugar da cidade.' },
  { title:'Uma história do passado', desc:'Conte uma lembrança engraçada ou marcante usando frases no passado.' },
  { title:'Defenda sua opinião', desc:'Escolha um tema simples e explique por 1 minuto por que você concorda ou discorda.' },
  { title:'Preparação para a final', desc:'Separe 10 assuntos e 20 frases de apoio para chegar forte à conversa final da temporada.' }
];

const THEMES = [
  {name:'Restaurante', prompts:['Peça uma bebida e um prato.','Pergunte o preço de algo.','Faça uma reclamação educada.','Peça a conta.']},
  {name:'Viagem', prompts:['Diga para onde quer viajar.','Pergunte sobre hotel e transporte.','Conte o que levaria na mala.','Combine um passeio.']},
  {name:'Família', prompts:['Apresente alguém da família.','Conte uma lembrança engraçada.','Pergunte sobre irmãos ou pais.','Fale de um encontro em família.']},
  {name:'Trabalho', prompts:['Explique o que você faz.','Conte um problema do trabalho.','Peça ajuda a um colega.','Fale de um objetivo profissional.']},
  {name:'Compras', prompts:['Pergunte o preço.','Peça outro tamanho ou cor.','Diga que está caro.','Decida se vai comprar.']},
  {name:'Fim de semana', prompts:['Conte seus planos.','Convide alguém para sair.','Negocie horário e lugar.','Fale do que fez no último domingo.']},
  {name:'Futebol e esportes', prompts:['Fale do seu time ou esporte.','Compare dois jogadores.','Conte uma partida marcante.','Convide alguém para jogar.']},
  {name:'Filmes e séries', prompts:['Indique um filme.','Explique por que gostou.','Conte a história sem spoilers.','Pergunte o gênero favorito.']},
  {name:'No aeroporto', prompts:['Pergunte onde fica o portão.','Fale sobre bagagem.','Pergunte horário do voo.','Resolva um atraso imaginário.']},
  {name:'Situação inesperada', prompts:['Você perdeu o celular.','Peça ajuda.','Explique onde esteve por último.','Combine como resolver o problema.']}
];

const POKES = [
  'Seu irmão já estudou hoje. Vai deixar barato? 😂',
  'O ranking não espera ninguém. Bora estudar! 👀',
  '5 minutinhos de estudo agora ou desculpa no domingo? 😏',
  'A coroa da semana está escapando… 👑',
  'Passando para lembrar que fluência não cai do céu 😂'
];

let state = null;
let currentUserId = localStorage.getItem('duoliga-member') || '';
let currentView = 'home';
let selectedTheme = THEMES[0];
let proofFile = null;
let conversation = { running:false, endAt:0, remaining:300, interval:null, finished:false };
let toastTimer = null;

function pad(n){ return String(n).padStart(2,'0'); }
function localDateISO(d=new Date()){ return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function dateUTC(s){ const [y,m,d]=String(s).split('-').map(Number); return Date.UTC(y,m-1,d); }
function addDays(s,n){ const t=dateUTC(s)+n*86400000; const d=new Date(t); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}`; }
function diffDays(a,b){ return Math.floor((dateUTC(a)-dateUTC(b))/86400000); }
function esc(v=''){ return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function money(v){ return Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}); }
function initials(name='?'){ return name.trim().split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase(); }
function member(id){ return state?.members.find(m=>m.id===id); }
function user(){ return member(currentUserId) || state?.members[0]; }
function avatar(m,cls=''){ if(!m) return ''; return m.photoUrl ? `<img class="avatar ${cls}" src="${esc(m.photoUrl)}" alt="Foto de ${esc(m.name)}">` : `<div class="avatar avatar-fallback ${cls}" aria-label="${esc(m.name)}">${esc(initials(m.name))}</div>`; }

function seasonWeek(date=localDateISO()){
  if(!state) return 0;
  const delta=diffDays(date,state.season.startDate);
  if(delta<0) return 0;
  return Math.floor(delta/7)+1;
}
function weekRange(w){ return {start:addDays(state.season.startDate,(w-1)*7),end:addDays(state.season.startDate,(w-1)*7+6)}; }
function checkinsFor(memberId,w){ const r=weekRange(w); return state.checkins.filter(c=>c.memberId===memberId&&c.date>=r.start&&c.date<=r.end); }
function conversationsFor(memberId,w){ const r=weekRange(w); return state.conversations.filter(c=>c.participants.includes(memberId)&&c.date>=r.start&&c.date<=r.end); }
function missionDone(memberId,w){ return state.missionCompletions.some(x=>x.memberId===memberId&&x.week===w); }
function xpFor(memberId,w){ return checkinsFor(memberId,w).reduce((s,c)=>s+Number(c.xp||0),0); }
function currentStreak(memberId){
  const dates=[...new Set(state.checkins.filter(c=>c.memberId===memberId).map(c=>c.date))].sort().reverse();
  if(!dates.length) return 0;
  const today=localDateISO(); const yesterday=addDays(today,-1);
  if(dates[0]!==today && dates[0]!==yesterday) return 0;
  let streak=1;
  for(let i=1;i<dates.length;i++){ if(diffDays(dates[i-1],dates[i])===1) streak++; else break; }
  return streak;
}
function completedWeeks(){
  const w=seasonWeek();
  if(w===0) return 0;
  if(w>state.season.durationWeeks) return state.season.durationWeeks;
  return Math.max(0,w-1);
}
function scoreMember(memberId){
  let points=state.checkins.filter(c=>c.memberId===memberId).length;
  const maxWeek=Math.min(Math.max(seasonWeek(),1),state.season.durationWeeks);
  for(let w=1;w<=maxWeek;w++){
    const count=checkinsFor(memberId,w).length;
    if(count>=state.season.weeklyGoal) points+=2;
    if(count===7) points+=3;
    if(missionDone(memberId,w)) points+=2;
    points+=conversationsFor(memberId,w).length*3;
    points+=state.conversations.filter(c=>c.winnerId===memberId && c.date>=weekRange(w).start && c.date<=weekRange(w).end).length*2;
    const xps=state.members.map(m=>({id:m.id,xp:xpFor(m.id,w)})); const top=Math.max(0,...xps.map(x=>x.xp));
    if(top>0 && xpFor(memberId,w)===top) points+=1;
    if(w<=completedWeeks() && count<4) points-=3;
  }
  return points;
}
function totalXP(memberId){ return state.checkins.filter(c=>c.memberId===memberId).reduce((s,c)=>s+Number(c.xp||0),0); }
function standings(){ return state.members.map(m=>({...m,score:scoreMember(m.id),streak:currentStreak(m.id),xp:totalXP(m.id),talks:state.conversations.filter(c=>c.participants.includes(m.id)).length})).sort((a,b)=>b.score-a.score||b.talks-a.talks||b.xp-a.xp); }
function automaticDebts(){
  const out=[]; const weeks=completedWeeks();
  for(let w=1;w<=weeks;w++) for(const m of state.members){ const days=checkinsFor(m.id,w).length; if(days<state.season.weeklyGoal){ const id=`auto_${w}_${m.id}`; out.push({id,memberId:m.id,week:w,amount:state.season.penaltyAmount,paid:state.paidDebtIds.includes(id),days}); } }
  return out;
}
function weekScore(memberId,w){
  let p=checkinsFor(memberId,w).length; const count=checkinsFor(memberId,w).length;
  if(count>=state.season.weeklyGoal)p+=2;if(count===7)p+=3;if(missionDone(memberId,w))p+=2;
  p+=conversationsFor(memberId,w).length*3;
  p+=state.conversations.filter(c=>c.winnerId===memberId&&c.date>=weekRange(w).start&&c.date<=weekRange(w).end).length*2;
  const top=Math.max(0,...state.members.map(m=>xpFor(m.id,w))); if(top>0&&xpFor(memberId,w)===top)p+=1;
  if(w<=completedWeeks()&&count<4)p-=3; return p;
}
function achievements(memberId){
  const checkins=state.checkins.filter(c=>c.memberId===memberId); const talks=state.conversations.filter(c=>c.participants.includes(memberId));
  const wins=state.conversations.filter(c=>c.winnerId===memberId).length;
  const noDebtWeeks=Math.max(0,completedWeeks()-automaticDebts().filter(d=>d.memberId===memberId).length);
  return [
    ['🔥','7 dias seguidos',currentStreak(memberId)>=7,'Constância de uma semana inteira'],
    ['⚡','1.000 XP',totalXP(memberId)>=1000,'Acumulou mil XP'],
    ['🗣️','Primeira conversa',talks.length>=1,'Completou 5 minutos falando'],
    ['👑','Rei da conversa',wins>=1,'Venceu uma votação presencial'],
    ['💸','Mão fechada',noDebtWeeks>=4,'4 semanas sem gerar prenda'],
    ['🏁','Veterano',checkins.length>=25,'Fez 25 check-ins']
  ];
}

async function api(path='/api/state',opts={}){
  const headers={...(opts.headers||{})}; const code=localStorage.getItem('duoliga-code'); if(code) headers['X-App-Code']=code;
  if(opts.body && !headers['Content-Type']) headers['Content-Type']='application/json';
  const res=await fetch(path,{...opts,headers}); let data={}; try{data=await res.json()}catch{}
  if(!res.ok){ const err=new Error(data.error||'Erro de conexão.'); err.status=res.status; throw err; }
  return data;
}
async function action(name,payload){ const data=await api('/api/state',{method:'POST',body:JSON.stringify({action:name,payload})}); state=data.state; render(); return data; }
function toast(msg,type=''){ clearTimeout(toastTimer); document.querySelector('.toast')?.remove(); const el=document.createElement('div'); el.className=`toast ${type}`; el.textContent=msg; document.body.append(el); toastTimer=setTimeout(()=>el.remove(),3300); }

async function load(){
  try{ const data=await api(); state=data.state; render(); if(!currentUserId || !member(currentUserId)) showMemberPicker(); }
  catch(e){ if(e.status===401) showAccessModal(); else root.innerHTML=`<div class="card error"><strong>Não consegui conectar ao banco do app.</strong><p>${esc(e.message)}</p><button class="primary-btn" id="retry">Tentar novamente</button></div>`,document.querySelector('#retry')?.addEventListener('click',load); }
}

function nav(){ return `<nav class="bottom-nav" aria-label="Navegação principal">
  ${[['home','🏠','Início'],['checkin','✅','Estudar'],['talk','🗣️','Conversar'],['rank','🏆','Ranking'],['profile','👤','Perfil']].map(([id,icon,label])=>`<button class="nav-btn ${currentView===id?'active':''}" data-view="${id}"><span class="nav-icon">${icon}</span>${label}</button>`).join('')}
</nav>`; }

function topbar(){ const u=user(); return `<header class="topbar"><div class="brand"><div class="brand-mark">D</div><div><h1>DuoLiga</h1><p>${esc(state.season.language)} · ${esc(state.season.name)} · 8 semanas</p></div></div><div class="top-actions"><span class="pill">Semana ${Math.min(Math.max(seasonWeek(),1),8)}/8</span><button class="icon-btn ghost-btn" id="user-menu" aria-label="Trocar usuário">${avatar(u)}</button></div></header>`; }

function homeView(){
  const ranks=standings(); const w=Math.min(Math.max(seasonWeek(),1),8); const mission=MISSIONS[w-1]||MISSIONS[7]; const debts=automaticDebts(); const paid=debts.filter(d=>d.paid).reduce((s,d)=>s+d.amount,0); const pending=debts.filter(d=>!d.paid).reduce((s,d)=>s+d.amount,0); const today=localDateISO();
  const podium=[ranks[1],ranks[0],ranks[2]].filter(Boolean);
  return `<section id="view-home" class="view ${currentView==='home'?'active':''}">
    <div class="hero-grid">
      <div class="card"><div class="section-title"><div><div class="eyebrow">Ranking da temporada</div><h2>Quem está na frente?</h2></div><span class="pill green">${esc(state.season.language)}</span></div>
        <div class="podium">${podium.map((m,i)=>{const actual=ranks.indexOf(m);return `<div class="podium-item ${actual===0?'first':''}"><div class="medal">${['🥇','🥈','🥉'][actual]||'🏅'}</div>${avatar(m)}<div class="podium-name">${esc(m.name)}</div><div class="score">${m.score}</div><div class="podium-meta">🔥 ${m.streak} · 🗣️ ${m.talks}</div></div>`}).join('')}</div>
        <div class="stats"><div class="stat"><strong>${state.checkins.length}</strong><span>check-ins</span></div><div class="stat"><strong>${state.conversations.length}</strong><span>conversas</span></div><div class="stat"><strong>${state.missionCompletions.length}</strong><span>missões</span></div></div>
      </div>
      <div class="card"><div class="eyebrow">Cofrinho das prendas</div><div class="money">${money(paid)}</div><div class="muted tiny">Já marcado como pago · ${money(pending)} ainda pendente</div><div class="sep"></div><div class="section-title"><h3>Meta da semana</h3><span class="pill">${state.season.weeklyGoal}/7 dias</span></div><div class="member-progress">${state.members.map(m=>{const c=checkinsFor(m.id,w).length;const pct=Math.min(100,c/7*100);const did=state.checkins.some(x=>x.memberId===m.id&&x.date===today);return `<div class="member-line">${avatar(m)}<div><div class="member-name">${esc(m.name)}</div><div class="progress-wrap"><div class="progress"><span style="width:${pct}%"></span></div><div class="member-sub">${c}/7 dias · ${xpFor(m.id,w)} XP</div></div></div>${!did&&m.id!==currentUserId?`<button class="small-btn poke" data-to="${m.id}">Cutucar</button>`:`<span class="pill ${did?'green':''}">${did?'Fez hoje':'Pendente'}</span>`}</div>`}).join('')}</div></div>
    </div>
    <div class="grid-2"><div class="card mission"><div class="eyebrow">Missão da semana ${w}</div><h3>${esc(mission.title)}</h3><p>${esc(mission.desc)}</p>${missionDone(currentUserId,w)?'<span class="pill green">✓ Missão concluída</span>':`<button class="primary-btn" id="complete-mission">Marcar como concluída · +2 pts</button>`}</div>
      <div class="card"><div class="section-title"><h3>Movimentação</h3><button class="small-btn" data-view="rank">Ver tudo</button></div><div class="feed">${activityFeed().slice(0,5).map(feedHtml).join('')||'<div class="empty">O desafio ainda está silencioso. Faça o primeiro check-in!</div>'}</div></div></div>
  </section>`;
}

function activityFeed(){
  const arr=[];
  state.checkins.forEach(c=>arr.push({at:c.createdAt,icon:'✅',text:`${member(c.memberId)?.name||'Alguém'} registrou ${c.minutes} min e ${c.xp} XP.`}));
  state.conversations.forEach(c=>arr.push({at:c.createdAt,icon:'🗣️',text:`Conversa “${c.theme}” concluída por ${c.participants.map(x=>member(x)?.name).filter(Boolean).join(', ')}.`}));
  state.pokes.forEach(p=>arr.push({at:p.createdAt,icon:'👉',text:`${member(p.fromId)?.name||'Alguém'} cutucou ${member(p.toId)?.name||'alguém'}: “${p.message}”`}));
  return arr.sort((a,b)=>new Date(b.at)-new Date(a.at));
}
function feedHtml(x){ return `<div class="feed-item"><div class="feed-icon">${x.icon}</div><div><div class="feed-text">${esc(x.text)}</div><div class="feed-time">${new Date(x.at).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})}</div></div></div>`; }

function checkinView(){
  const u=user(); const today=localDateISO(); const existing=state.checkins.find(c=>c.memberId===u.id&&c.date===today);
  return `<section id="view-checkin" class="view ${currentView==='checkin'?'active':''}"><div class="page-head"><div><h2>Check-in diário</h2><p>Registre o estudo do Duolingo. Um check-in por dia.</p></div><span class="pill green">${avatar(u)} ${esc(u.name)}</span></div><div class="card"><form id="checkin-form" class="form-grid">
    <div class="field"><label for="date">Data</label><input class="input" id="date" type="date" value="${existing?.date||today}" max="${today}" required></div>
    <div class="field"><label for="minutes">Minutos estudados</label><input class="input" id="minutes" type="number" min="1" max="600" value="${existing?.minutes||15}" required></div>
    <div class="field"><label for="xp">XP conquistado</label><input class="input" id="xp" type="number" min="0" max="100000" value="${existing?.xp||0}" required></div>
    <div class="field"><label>Sequência atual</label><div class="input" style="display:flex;align-items:center">🔥 ${currentStreak(u.id)} dias</div></div>
    <div class="field full"><label>Print de comprovação (opcional)</label><div class="filebox"><input id="proof" type="file" accept="image/png,image/jpeg,image/webp"><div class="tiny muted">A imagem é comprimida antes do envio.</div>${existing?.proofUrl?`<img class="proof-preview" src="${esc(existing.proofUrl)}" alt="Print do Duolingo">`:''}<div id="proof-preview"></div></div></div>
    <div class="field full"><button class="primary-btn" type="submit">${existing?'Atualizar check-in':'Registrar check-in'} · +1 pt</button></div>
  </form></div></section>`;
}

function talkView(){
  const canVote=conversation.finished;
  return `<section id="view-talk" class="view ${currentView==='talk'?'active':''}"><div class="page-head"><div><h2>Modo Conversação</h2><p>5 minutos presenciais. Só conta quando o cronômetro zerar.</p></div><span class="pill green">🗣️ +3 pts por participante</span></div><div class="talk-layout">
    <div class="card"><div class="section-title"><h3>Quem vai conversar?</h3><button class="small-btn" id="random-theme">🎲 Sortear tema</button></div><div class="participant-list">${state.members.map(m=>`<label class="check-person"><input type="checkbox" class="talk-person" value="${m.id}" checked>${avatar(m)}<strong>${esc(m.name)}</strong></label>`).join('')}</div><div class="theme-box"><div class="eyebrow">Tema sorteado</div><h3 id="theme-name">${esc(selectedTheme.name)}</h3><div class="prompt-list" id="theme-prompts">${selectedTheme.prompts.map(p=>`<div class="prompt">🎯 ${esc(p)}</div>`).join('')}</div></div></div>
    <div class="card"><div class="eyebrow">Conversa oficial</div><div class="timer" id="timer">${fmtTime(conversation.remaining)}</div><div class="timer-label">Falem o máximo possível em ${esc(state.season.language)}.</div><div class="timer-actions"><button class="primary-btn" id="timer-start" ${conversation.running||conversation.finished?'disabled':''}>▶ Iniciar 5 minutos</button><button class="ghost-btn" id="timer-pause" ${!conversation.running?'disabled':''}>⏸ Pausar</button><button class="danger-btn" id="timer-reset">↺ Abandonar</button></div>
      <div id="vote-area" style="margin-top:18px;${canVote?'':'display:none'}"><div class="sep"></div><div class="section-title"><h3>Quem se saiu melhor?</h3><span class="pill">+2 pts</span></div><div class="vote-list" id="vote-list"></div><div class="actions" style="margin-top:12px"><button class="primary-btn" id="save-talk">Salvar conversação</button></div></div>
    </div></div></section>`;
}
function fmtTime(sec){ sec=Math.max(0,Math.floor(sec)); return `${pad(Math.floor(sec/60))}:${pad(sec%60)}`; }
function voteOptions(){ const ids=[...document.querySelectorAll('.talk-person:checked')].map(x=>x.value); const area=document.querySelector('#vote-list'); if(!area)return; area.innerHTML=ids.map(id=>{const m=member(id);return `<div class="vote-option"><input type="radio" name="winner" id="win-${id}" value="${id}"><label for="win-${id}">${avatar(m)}<strong>${esc(m.name)}</strong></label></div>`}).join('')+`<div class="vote-option"><input type="radio" name="winner" id="win-tie" value=""><label for="win-tie"><div class="avatar avatar-fallback">🤝</div><strong>Empate</strong></label></div>`; }

function rankView(){ const ranks=standings(), debts=automaticDebts(); const all=debts.reduce((s,d)=>s+d.amount,0), paid=debts.filter(d=>d.paid).reduce((s,d)=>s+d.amount,0); return `<section id="view-rank" class="view ${currentView==='rank'?'active':''}"><div class="page-head"><div><h2>Ranking & histórico</h2><p>A temporada inteira em um só lugar.</p></div><span class="pill">${state.season.name}</span></div><div class="grid-2" style="margin-top:0"><div class="card"><div class="section-title"><h3>Classificação geral</h3><span class="pill green">${state.season.language}</span></div><div class="rank-list">${ranks.map((m,i)=>`<div class="rank-row"><div class="rank-pos">${i+1}º</div>${avatar(m)}<div class="rank-main"><strong>${esc(m.name)}</strong><span>🔥 ${m.streak} dias · 🗣️ ${m.talks} · ⚡ ${m.xp} XP</span></div><div class="rank-score"><strong>${m.score}</strong><span>pontos</span></div></div>`).join('')}</div></div><div class="card"><div class="section-title"><h3>DEVEDORES 😂</h3><span class="pill red">${money(all-paid)} pendente</span></div><div class="debt-list">${debts.length?debts.map(d=>{const m=member(d.memberId);return `<div class="debt ${d.paid?'paid':''}"><div><strong>${esc(m?.name||'Participante')} · Semana ${d.week}</strong><span>${d.days}/7 dias · prenda por não bater a meta</span></div><b>${money(d.amount)}</b><button class="small-btn debt-toggle" data-id="${d.id}">${d.paid?'Desmarcar':'Marcar pago'}</button></div>`}).join(''):'<div class="empty">Ninguém deve nada. Por enquanto. 😇</div>'}</div><div class="sep"></div><div class="money" style="font-size:26px">${money(paid)}</div><div class="tiny muted">Cofrinho confirmado</div></div></div>
  <div class="card" style="margin-top:16px"><div class="section-title"><h3>Histórico por semana</h3><span class="pill">8 semanas</span></div><div class="history-grid">${Array.from({length:8},(_,i)=>i+1).map(w=>weekCard(w)).join('')}</div></div></section>`; }
function weekCard(w){ const r=weekRange(w); return `<div class="week-card"><div class="week-head"><strong>Semana ${w}</strong><span class="tiny muted">${new Date(dateUTC(r.start)).toLocaleDateString('pt-BR',{timeZone:'UTC'})} — ${new Date(dateUTC(r.end)).toLocaleDateString('pt-BR',{timeZone:'UTC'})}</span></div><div class="week-body">${state.members.map(m=>`<div class="week-member"><strong>${esc(m.name)}</strong><span>✅ ${checkinsFor(m.id,w).length}/7</span><span>⚡ ${xpFor(m.id,w)}</span><span class="hide-sm">🗣️ ${conversationsFor(m.id,w).length}</span><span class="pill">${weekScore(m.id,w)} pts</span></div>`).join('')}</div></div>`; }

function profileView(){ const u=user(); const ach=achievements(u.id); return `<section id="view-profile" class="view ${currentView==='profile'?'active':''}"><div class="page-head"><div><h2>Perfil & temporada</h2><p>Personalize sua foto e ajuste o desafio.</p></div><button class="ghost-btn" id="change-user">Trocar usuário</button></div><div class="grid-2" style="margin-top:0"><div class="card"><div class="profile-top"><div class="profile-photo-wrap">${avatar(u,'xl')}<button class="small-btn" id="choose-photo">📷 Alterar</button><input id="avatar-file" type="file" accept="image/png,image/jpeg,image/webp" hidden></div><div class="profile-meta"><h2>${esc(u.name)}</h2><p>${scoreMember(u.id)} pontos · 🔥 ${currentStreak(u.id)} dias</p><span class="pill green">🗣️ ${state.conversations.filter(c=>c.participants.includes(u.id)).length} conversas</span></div></div><div class="sep"></div><form id="profile-form" class="field"><label for="profile-name">Nome no ranking</label><input class="input" id="profile-name" value="${esc(u.name)}" maxlength="30"><button class="primary-btn" style="margin-top:10px">Salvar perfil</button></form></div><div class="card"><div class="section-title"><h3>Conquistas</h3><span class="pill">${ach.filter(a=>a[2]).length}/${ach.length}</span></div><div class="badge-grid">${ach.map(a=>`<div class="badge ${a[2]?'':'locked'}"><div class="emoji">${a[0]}</div><strong>${esc(a[1])}</strong><span>${esc(a[3])}</span></div>`).join('')}</div></div></div>
  <div class="card" style="margin-top:16px"><div class="section-title"><h3>Configuração da temporada</h3><span class="pill">Todos estudam o mesmo idioma</span></div><form id="season-form" class="form-grid"><div class="field"><label>Nome da temporada</label><input class="input" id="season-name" value="${esc(state.season.name)}"></div><div class="field"><label>Idioma</label><input class="input" id="season-language" value="${esc(state.season.language)}" placeholder="Ex.: Inglês"></div><div class="field"><label>Início</label><input class="input" id="season-start" type="date" value="${state.season.startDate}"></div><div class="field"><label>Meta semanal</label><select class="select" id="season-goal">${[4,5,6,7].map(n=>`<option value="${n}" ${n===state.season.weeklyGoal?'selected':''}>${n} de 7 dias</option>`).join('')}</select></div><div class="field"><label>Prenda automática</label><input class="input" id="season-penalty" type="number" min="0" max="500" value="${state.season.penaltyAmount}"></div><div class="field"><label>Duração da conversa</label><div class="input" style="display:flex;align-items:center">5 minutos · fixo</div></div><div class="field full"><button class="primary-btn">Salvar temporada</button></div></form><div class="sep"></div><form id="add-member-form" class="actions"><input class="input" style="flex:1;min-width:180px" id="new-member" placeholder="Novo participante"><button class="ghost-btn">+ Adicionar participante</button></form></div></section>`; }

function render(){
  if(!state)return;
  root.innerHTML=`${topbar()}${homeView()}${checkinView()}${talkView()}${rankView()}${profileView()}${nav()}`;
  bind();
}

function bind(){
  document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{currentView=b.dataset.view;render();}));
  document.querySelector('#user-menu')?.addEventListener('click',showMemberPicker);
  document.querySelector('#change-user')?.addEventListener('click',showMemberPicker);
  document.querySelector('#complete-mission')?.addEventListener('click',async()=>{try{await action('completeMission',{memberId:currentUserId,week:Math.min(Math.max(seasonWeek(),1),8)});toast('Missão concluída! +2 pontos 🎯','success')}catch(e){toast(e.message,'error')}});
  document.querySelectorAll('.poke').forEach(b=>b.addEventListener('click',async()=>{const msg=POKES[Math.floor(Math.random()*POKES.length)];try{await action('poke',{fromId:currentUserId,toId:b.dataset.to,message:msg});toast('Cutucada enviada dentro do app 😂','success')}catch(e){toast(e.message,'error')}}));
  document.querySelector('#proof')?.addEventListener('change',async e=>{proofFile=e.target.files?.[0]||null;if(proofFile){const url=URL.createObjectURL(proofFile);document.querySelector('#proof-preview').innerHTML=`<img class="proof-preview" src="${url}" alt="Prévia do print">`;}});
  document.querySelector('#checkin-form')?.addEventListener('submit',submitCheckin);
  document.querySelector('#random-theme')?.addEventListener('click',()=>{selectedTheme=THEMES[Math.floor(Math.random()*THEMES.length)];document.querySelector('#theme-name').textContent=selectedTheme.name;document.querySelector('#theme-prompts').innerHTML=selectedTheme.prompts.map(p=>`<div class="prompt">🎯 ${esc(p)}</div>`).join('');});
  document.querySelectorAll('.talk-person').forEach(x=>x.addEventListener('change',voteOptions));
  document.querySelector('#timer-start')?.addEventListener('click',startTimer); document.querySelector('#timer-pause')?.addEventListener('click',pauseTimer); document.querySelector('#timer-reset')?.addEventListener('click',resetTimer); document.querySelector('#save-talk')?.addEventListener('click',saveTalk); if(conversation.finished)voteOptions();
  document.querySelectorAll('.debt-toggle').forEach(b=>b.addEventListener('click',async()=>{try{await action('toggleDebt',{debtId:b.dataset.id});toast('Cofrinho atualizado.','success')}catch(e){toast(e.message,'error')}}));
  document.querySelector('#choose-photo')?.addEventListener('click',()=>document.querySelector('#avatar-file').click()); document.querySelector('#avatar-file')?.addEventListener('change',updatePhoto);
  document.querySelector('#profile-form')?.addEventListener('submit',async e=>{e.preventDefault();const name=document.querySelector('#profile-name').value.trim();try{await action('updateMember',{memberId:currentUserId,name});toast('Perfil atualizado.','success')}catch(err){toast(err.message,'error')}});
  document.querySelector('#season-form')?.addEventListener('submit',async e=>{e.preventDefault();try{await action('updateSeason',{name:document.querySelector('#season-name').value,language:document.querySelector('#season-language').value,startDate:document.querySelector('#season-start').value,weeklyGoal:Number(document.querySelector('#season-goal').value),penaltyAmount:Number(document.querySelector('#season-penalty').value)});toast('Temporada atualizada.','success')}catch(err){toast(err.message,'error')}});
  document.querySelector('#add-member-form')?.addEventListener('submit',async e=>{e.preventDefault();const name=document.querySelector('#new-member').value.trim();if(!name)return;try{await action('addMember',{name});toast(`${name} entrou no desafio!`,'success')}catch(err){toast(err.message,'error')}});
}

async function submitCheckin(e){
  e.preventDefault(); const btn=e.submitter; btn.disabled=true; btn.textContent='Salvando…';
  try{ let proofUrl=''; if(proofFile){ const dataUrl=await compressImage(proofFile,900,.7,false); const up=await api('/api/media',{method:'POST',body:JSON.stringify({dataUrl,kind:'proof'})}); proofUrl=up.url; }
    await action('checkin',{memberId:currentUserId,date:document.querySelector('#date').value,minutes:Number(document.querySelector('#minutes').value),xp:Number(document.querySelector('#xp').value),proofUrl}); proofFile=null; toast('Check-in registrado. Mais um dia no placar! ✅','success'); currentView='home'; render();
  }catch(err){toast(err.message,'error');btn.disabled=false;btn.textContent='Registrar check-in';}
}

function startTimer(){
  const selected=[...document.querySelectorAll('.talk-person:checked')]; if(selected.length<2){toast('Selecione pelo menos 2 participantes.','error');return;}
  conversation.running=true; conversation.finished=false; conversation.endAt=Date.now()+conversation.remaining*1000; renderTimerControls();
  clearInterval(conversation.interval); conversation.interval=setInterval(()=>{conversation.remaining=Math.max(0,Math.ceil((conversation.endAt-Date.now())/1000)); const t=document.querySelector('#timer'); if(t)t.textContent=fmtTime(conversation.remaining); if(conversation.remaining<=0){clearInterval(conversation.interval);conversation.running=false;conversation.finished=true;document.querySelector('#vote-area').style.display='block';voteOptions();renderTimerControls();toast('Tempo! Agora votem em quem se saiu melhor. 🗣️','success');}},250);
}
function pauseTimer(){ if(!conversation.running)return;conversation.remaining=Math.max(0,Math.ceil((conversation.endAt-Date.now())/1000));conversation.running=false;clearInterval(conversation.interval);renderTimerControls(); }
function resetTimer(){ clearInterval(conversation.interval);conversation={running:false,endAt:0,remaining:300,interval:null,finished:false}; const t=document.querySelector('#timer');if(t)t.textContent='05:00';document.querySelector('#vote-area').style.display='none';renderTimerControls(); }
function renderTimerControls(){ const s=document.querySelector('#timer-start'),p=document.querySelector('#timer-pause');if(s)s.disabled=conversation.running||conversation.finished;if(p)p.disabled=!conversation.running; }
async function saveTalk(){ const participants=[...document.querySelectorAll('.talk-person:checked')].map(x=>x.value);const winner=document.querySelector('input[name="winner"]:checked');if(!winner){toast('Escolha um vencedor ou empate.','error');return;}try{await action('conversation',{participants,winnerId:winner.value,theme:selectedTheme.name,date:localDateISO()});resetTimer();toast('Conversação contabilizada! +3 pontos para cada participante.','success');currentView='home';render()}catch(e){toast(e.message,'error')} }

async function updatePhoto(e){ const f=e.target.files?.[0]; if(!f)return; try{toast('Preparando foto…'); const dataUrl=await compressImage(f,320,.78,true);const up=await api('/api/media',{method:'POST',body:JSON.stringify({dataUrl,kind:'avatar'})});await action('updateMember',{memberId:currentUserId,photoUrl:up.url});toast('Foto de perfil atualizada! 📷','success')}catch(err){toast(err.message,'error')} }
function compressImage(file,maxSize=900,quality=.75,square=false){ return new Promise((resolve,reject)=>{ if(!file.type.startsWith('image/'))return reject(new Error('Escolha uma imagem válida.'));const img=new Image();const url=URL.createObjectURL(file);img.onload=()=>{let sw=img.width,sh=img.height,sx=0,sy=0;if(square){const side=Math.min(sw,sh);sx=(sw-side)/2;sy=(sh-side)/2;sw=sh=side;}const scale=Math.min(1,maxSize/Math.max(sw,sh));const cw=Math.max(1,Math.round(sw*scale)),ch=Math.max(1,Math.round(sh*scale));const c=document.createElement('canvas');c.width=cw;c.height=ch;const ctx=c.getContext('2d');ctx.drawImage(img,sx,sy,sw,sh,0,0,cw,ch);URL.revokeObjectURL(url);resolve(c.toDataURL('image/jpeg',quality));};img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Não consegui ler essa imagem.'));};img.src=url;}); }

function showAccessModal(){
  root.innerHTML=`<div class="modal-backdrop"><div class="modal"><div class="eyebrow">DuoLiga privada</div><h2>Digite o código da família</h2><p>O código é definido nas variáveis de ambiente do Netlify e impede alterações casuais por quem encontrar o link.</p><form id="access-form" class="field"><label>Código de acesso</label><input class="input" id="access-code" type="password" autocomplete="current-password" required><button class="primary-btn" style="margin-top:10px">Entrar</button><div id="access-msg" class="tiny"></div></form></div></div>`;
  document.querySelector('#access-form').addEventListener('submit',async e=>{e.preventDefault();localStorage.setItem('duoliga-code',document.querySelector('#access-code').value);try{await load()}catch{} });
}
function showMemberPicker(){
  const old=document.querySelector('.modal-backdrop');if(old)old.remove();const wrap=document.createElement('div');wrap.className='modal-backdrop';wrap.innerHTML=`<div class="modal"><div class="eyebrow">Quem está usando?</div><h2>Escolha seu perfil</h2><p>Este aparelho continuará lembrando sua escolha. Você pode trocar a qualquer momento.</p><div class="picker">${state.members.map(m=>`<button type="button" data-member="${m.id}">${avatar(m)}<strong>${esc(m.name)}</strong></button>`).join('')}</div></div>`;document.body.append(wrap);wrap.querySelectorAll('[data-member]').forEach(b=>b.addEventListener('click',()=>{currentUserId=b.dataset.member;localStorage.setItem('duoliga-member',currentUserId);wrap.remove();render();}));
}

if('serviceWorker' in navigator){ navigator.serviceWorker.register('/sw.js').catch(()=>{}); }
load();
