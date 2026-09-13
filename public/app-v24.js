const root = document.querySelector('#app');

const LANGUAGE_OPTIONS = ['Inglês','Espanhol','Francês','Alemão','Italiano'];
const MISSIONS = [
  { title:'Grave um áudio de 1 minuto se apresentando', desc:'Conte seu nome, cidade, profissão, hobbies e por que está aprendendo o idioma.' },
  { title:'Aprenda 20 palavras novas', desc:'Escolha 20 palavras úteis para conversação e monte pelo menos 10 frases com elas.' },
  { title:'Conte como foi seu dia', desc:'Fale por 1 minuto sobre sua rotina, do café da manhã até a noite.' },
  { title:'Pedido no restaurante', desc:'Treine como pedir bebida, prato principal, sobremesa e pedir a conta.' },
  { title:'Como foi seu fim de semana', desc:'Explique algo que você fez, onde foi e com quem esteve.' },
  { title:'Defenda uma opinião', desc:'Escolha um tema simples e explique se concorda ou discorda.' },
  { title:'Planeje uma viagem', desc:'Diga para onde iria, como viajaria, onde ficaria e o que faria.' },
  { title:'Preparação para a final', desc:'Junte frases-chave e faça uma conversa livre mais segura.' }
];
const THEMES = [
  { name:'Restaurante', prompts:['Peça algo para comer.','Pergunte o preço.','Reclame de forma educada.','Peça a conta.'] },
  { name:'Viagem', prompts:['Escolha um destino.','Pergunte sobre hotel.','Fale da mala.','Combine um passeio.'] },
  { name:'Trabalho', prompts:['Explique sua profissão.','Fale de uma meta.','Peça ajuda.','Conte um problema do dia.'] },
  { name:'Família', prompts:['Apresente um parente.','Conte uma lembrança.','Pergunte sobre irmãos.','Fale de um encontro em família.'] },
  { name:'Compras', prompts:['Pergunte o preço.','Peça outro tamanho.','Diga que está caro.','Decida se vai comprar.'] },
  { name:'Filmes e séries', prompts:['Indique um filme.','Explique por que gostou.','Fale do gênero preferido.','Conte a história sem spoilers.'] },
  { name:'No aeroporto', prompts:['Pergunte pelo portão.','Fale da bagagem.','Pergunte o horário.','Resolva um atraso imaginário.'] },
  { name:'Situação inesperada', prompts:['Você perdeu o celular.','Peça ajuda.','Explique o ocorrido.','Combine como resolver.'] }
];
const POKES = [
  'Seu irmão está estudando enquanto você está aí dando desculpa. 😂',
  'O ranking não espera ninguém. Bora estudar! 👀',
  'Cinco minutinhos de estudo agora ou desculpa no domingo? 😏',
  'Hoje um pouco melhor que ontem. Vai nessa! 💪',
  'Disciplina hoje, fluência amanhã. 🔥'
];

let state = null;
let currentUserId = localStorage.getItem('duoliga-member') || '';
const AUTH_KEY = 'duoliga-auth-v24';
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
function currentWeek(){ return Math.min(Math.max(seasonWeek(),1), state?.season?.durationWeeks || 8); }
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
function completedWeeks(){ const w=seasonWeek(); if(w===0) return 0; if(w>state.season.durationWeeks) return state.season.durationWeeks; return Math.max(0,w-1); }
function totalXP(memberId){ return state.checkins.filter(c=>c.memberId===memberId).reduce((s,c)=>s+Number(c.xp||0),0); }
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
    const tops=state.members.map(m=>xpFor(m.id,w)); const top=Math.max(0,...tops);
    if(top>0 && xpFor(memberId,w)===top) points+=1;
    if(w<=completedWeeks() && count<4) points-=3;
  }
  return points;
}
function standings(){ return state.members.map(m=>({...m,score:scoreMember(m.id),streak:currentStreak(m.id),xp:totalXP(m.id),talks:state.conversations.filter(c=>c.participants.includes(m.id)).length})).sort((a,b)=>b.score-a.score||b.talks-a.talks||b.xp-a.xp); }
function automaticDebts(){
  const out=[]; const weeks=completedWeeks();
  for(let w=1;w<=weeks;w++) for(const m of state.members){ const days=checkinsFor(m.id,w).length; if(days<state.season.weeklyGoal){ const id=`auto_${w}_${m.id}`; out.push({id,memberId:m.id,week:w,amount:state.season.penaltyAmount,paid:state.paidDebtIds.includes(id),days}); } }
  return out;
}
function weekScore(memberId,w){
  let p=checkinsFor(memberId,w).length; const count=checkinsFor(memberId,w).length;
  if(count>=state.season.weeklyGoal) p+=2;
  if(count===7) p+=3;
  if(missionDone(memberId,w)) p+=2;
  p+=conversationsFor(memberId,w).length*3;
  p+=state.conversations.filter(c=>c.winnerId===memberId&&c.date>=weekRange(w).start&&c.date<=weekRange(w).end).length*2;
  const top=Math.max(0,...state.members.map(m=>xpFor(m.id,w))); if(top>0&&xpFor(memberId,w)===top) p+=1;
  if(w<=completedWeeks()&&count<4) p-=3;
  return p;
}
function achievements(memberId){
  const talks=state.conversations.filter(c=>c.participants.includes(memberId));
  const wins=state.conversations.filter(c=>c.winnerId===memberId).length;
  const noDebtWeeks=Math.max(0,completedWeeks()-automaticDebts().filter(d=>d.memberId===memberId).length);
  return [
    ['📅','7 dias seguidos',currentStreak(memberId)>=7,'Consistência por uma semana inteira'],
    ['⭐','1.000 XP',totalXP(memberId)>=1000,'Acumulou mil XP de estudos'],
    ['💬','Sobreviveu à primeira conversação',talks.length>=1,'Concluiu 5 minutos de conversa'],
    ['👑','Rei da Semana',wins>=1,'Venceu ao menos uma conversa'],
    ['💸','4 semanas sem pagar prenda',noDebtWeeks>=4,'Conseguiu escapar das multas'],
    ['🏁','Veterano',state.checkins.filter(c=>c.memberId===memberId).length>=25,'Fez 25 check-ins no app']
  ];
}
function activityFeed(){
  const arr=[];
  state.checkins.forEach(c=>arr.push({at:c.createdAt,icon:'✅',text:`${member(c.memberId)?.name||'Alguém'} registrou ${c.minutes} min e ${c.xp} XP.`}));
  state.conversations.forEach(c=>arr.push({at:c.createdAt,icon:'🗣️',text:`Conversa “${c.theme}” concluída por ${c.participants.map(x=>member(x)?.name).filter(Boolean).join(', ')}.`}));
  state.pokes.forEach(p=>arr.push({at:p.createdAt,icon:'👉',text:`${member(p.fromId)?.name||'Alguém'} cutucou ${member(p.toId)?.name||'alguém'}: “${p.message}”`}));
  return arr.sort((a,b)=>new Date(b.at)-new Date(a.at));
}
function feedHtml(x){ return `<div class="feed-item"><div class="feed-icon">${x.icon}</div><div><div class="feed-text">${esc(x.text)}</div><div class="feed-time">${new Date(x.at).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})}</div></div></div>`; }
function fmtTime(secs){ const m=Math.floor(secs/60); const s=secs%60; return `${pad(m)}:${pad(s)}`; }
function progressBoxes(count,total=7){ return `<div class="box-progress">${Array.from({length:total},(_,i)=>`<span class="${i<count?'done':''}"></span>`).join('')}</div>`; }

async function api(path='/api/state',opts={}){
  const headers={...(opts.headers||{})}; const code=localStorage.getItem('duoliga-code'); if(code) headers['X-App-Code']=code;
  if(opts.body && !headers['Content-Type']) headers['Content-Type']='application/json';
  const res=await fetch(path,{...opts,headers}); let data={}; try{data=await res.json()}catch{}
  if(!res.ok){ const err=new Error(data.error||'Erro de conexão.'); err.status=res.status; throw err; }
  return data;
}
async function action(name,payload){ const data=await api('/api/state',{method:'POST',body:JSON.stringify({action:name,payload})}); state=data.state; render(); return data; }
function toast(msg,type=''){ clearTimeout(toastTimer); document.querySelector('.toast')?.remove(); const el=document.createElement('div'); el.className=`toast ${type}`; el.textContent=msg; document.body.append(el); toastTimer=setTimeout(()=>el.remove(),3200); }

function setAuthenticatedMember(memberId){
  currentUserId=memberId;
  localStorage.setItem('duoliga-member', memberId);
  localStorage.setItem(AUTH_KEY, memberId);
}
function clearAuthenticatedMember(){
  localStorage.removeItem('duoliga-member');
  localStorage.removeItem(AUTH_KEY);
  currentUserId='';
}
function isAuthenticatedMember(memberId){ return Boolean(memberId) && localStorage.getItem(AUTH_KEY)===memberId; }

async function load(){
  try{
    const data=await api();
    state=data.state;
    if(!currentUserId || !member(currentUserId) || !isAuthenticatedMember(currentUserId)){
      root.innerHTML=`<div class="screen-message"><div class="card"><div class="page-kicker">🏆 DuoLiga</div><h2 class="page-title">Bem-vindo ao desafio</h2><p class="page-desc">Crie seu perfil ou entre com sua senha de 4 dígitos.</p></div></div>`;
      showOnboarding();
      return;
    }
    render();
  }
  catch(e){ if(e.status===401) showAccessModal(); else { root.innerHTML=`<div class="screen-message"><div class="card"><h2>Não consegui conectar ao DuoLiga.</h2><p>${esc(e.message)}</p><button class="primary-btn" id="retry">Tentar novamente</button></div></div>`; document.querySelector('#retry')?.addEventListener('click',load); } }
}

function nav(){ return `<nav class="bottom-nav" aria-label="Navegação principal">
  ${[['home','🏠','Início'],['checkin','🗓️','Check-in'],['challenges','✅','Desafios'],['rank','🏆','Ranking'],['more','⋯','Mais']].map(([id,icon,label])=>`<button class="nav-btn ${currentView===id?'active':''}" data-view="${id}"><span class="nav-icon">${icon}</span>${label}</button>`).join('')}
</nav>`; }

function topbar(){
  const u=user();
  return `<header class="topbar"><div class="brand-wrap"><div class="brand-row"><div class="brand-mark">🏆</div><div><div class="logo-text">Duoliga</div><div class="top-sub">${esc(state.season.name)} · Semana ${currentWeek()}</div></div></div></div><div class="top-actions"><button class="top-icon" aria-label="Notificações">🔔</button><button class="user-chip" id="user-menu" aria-label="Trocar usuário">${avatar(u)}<span class="user-dot"></span></button></div></header>`;
}

function homeView(){
  const ranks=standings();
  const w=currentWeek();
  const mission=MISSIONS[w-1]||MISSIONS[0];
  const debts=automaticDebts();
  const paid=debts.filter(d=>d.paid).reduce((s,d)=>s+d.amount,0);
  const today=localDateISO();
  const podium=[ranks[1],ranks[0],ranks[2]].filter(Boolean);
  return `<section class="view ${currentView==='home'?'active':''}">
    <div class="hero-card">
      <div class="hero-head">
        <div>
          <div class="hero-title">${esc(state.season.name)} • Semana ${w}</div>
          <div class="hero-sub">Disciplina hoje, fluência amanhã. 💪</div>
        </div>
        <span class="lang-pill">${esc(state.season.language)}</span>
      </div>
      <div class="podium-grid">
        ${podium.map((m)=>{ const pos=ranks.indexOf(m)+1; return `<div class="podium-card pos${pos}"><div class="podium-place">${pos}º</div>${avatar(m,'md')}<strong>${esc(m.name)}</strong><div class="big-points">${m.score} pts</div><div class="podium-meta">🔥 ${m.streak} dias<br>🗣️ ${m.talks} conversas</div></div>`; }).join('')}
      </div>
      <div class="acc-box"><div><div class="tiny white">Prêmio acumulado</div><strong>${money(paid)}</strong></div><div class="coins">🪙</div></div>
    </div>

    <div class="card simple-card">
      <div class="section-head"><h3>Meta semanal</h3><span class="small-pill">${state.season.weeklyGoal} de 7 dias</span></div>
      <div class="members-goal">${state.members.map(m=>{ const c=checkinsFor(m.id,w).length; const did=state.checkins.some(x=>x.memberId===m.id&&x.date===today); return `<div class="member-goal-row">${avatar(m,'sm')}<div class="grow"><div class="member-goal-name">${esc(m.name)}</div>${progressBoxes(c)}<div class="member-subline">${c}/7 dias · ${xpFor(m.id,w)} XP</div></div>${!did&&m.id!==currentUserId?`<button class="small-action poke" data-to="${m.id}">Cutucar</button>`:`<span class="status-badge ${did?'ok':''}">${did?'Fez hoje':'Pendente'}</span>`}</div>`; }).join('')}</div>
    </div>

    <div class="two-col">
      <div class="card mission-card"><div class="section-head"><h3>Missão da semana</h3><span class="small-pill">Semana ${w}</span></div><div class="mission-highlight">🎯 ${esc(mission.title)}</div><p>${esc(mission.desc)}</p>${missionDone(currentUserId,w)?'<div class="notice success">Missão concluída. +2 pontos 🎯</div>':`<button class="primary-btn" id="complete-mission">Marcar missão como concluída</button>`}</div>
      <div class="card"><div class="section-head"><h3>Movimentação</h3><button class="linkish" data-view="rank">Ver tudo</button></div><div class="feed">${activityFeed().slice(0,5).map(feedHtml).join('') || '<div class="empty">Ainda não houve movimentação.</div>'}</div></div>
    </div>
  </section>`;
}

function checkinView(){
  const u=user();
  return `<section class="view ${currentView==='checkin'?'active':''}">
    <div class="card app-card">
      <div class="page-kicker">📅 Check-in Diário</div>
      <h2 class="page-title">Todo estudo conta! ${flagForLanguage(state.season.language)}</h2>
      <p class="page-desc">Registre seus minutos e o XP do Duolingo para somar pontos.</p>
      <form id="checkin-form" class="form-grid">
        <div class="field full"><label>Hoje</label><input class="input" id="date" type="date" value="${localDateISO()}" required></div>
        <div class="field"><label>Minutos estudados</label><input class="input" id="minutes" type="number" min="1" max="600" inputmode="numeric" placeholder="Ex.: 30" required></div>
        <div class="field"><label>XP conquistado</label><input class="input" id="xp" type="number" min="0" max="100000" inputmode="numeric" placeholder="Ex.: 50" required></div>
        <div class="field full"><label>Anexar print (opcional)</label><label class="upload-box"><input id="proof" type="file" accept="image/png,image/jpeg,image/webp" hidden><span>Selecionar imagem ou tirar uma foto</span><small>Use como comprovação do estudo.</small></label><div id="proof-preview"></div></div>
        <div class="field full"><button class="primary-btn">Confirmar check-in ✅</button></div>
      </form>
      <div class="today-progress">${avatar(u,'sm')}<div><strong>Seu progresso hoje</strong><div class="member-subline">🔥 ${currentStreak(u.id)} dias · ${checkinsFor(u.id,currentWeek()).reduce((s,x)=>s+Number(x.minutes||0),0)} min na semana · ${xpFor(u.id,currentWeek())} XP</div></div></div>
    </div>
  </section>`;
}

function challengesView(){
  const w=currentWeek();
  const u=user();
  const mission=MISSIONS[w-1]||MISSIONS[0];
  const weekCount=checkinsFor(u.id,w).length;
  const ach=achievements(u.id);
  return `<section class="view ${currentView==='challenges'?'active':''}">
    <div class="card app-card">
      <div class="page-kicker">🎯 Meta Semanal</div>
      <h2 class="page-title">${state.season.weeklyGoal} de 7 dias</h2>
      <p class="page-desc">Mantenha a consistência e conquiste mais pontos!</p>
      ${progressBoxes(weekCount)}
      <div class="meta-summary">${weekCount}/7</div>
      <div class="point-grid">
        <div class="point-box"><strong>+100 pts</strong><span>por dia estudado</span></div>
        <div class="point-box"><strong>+50 pts</strong><span>bônus por sequência</span></div>
        <div class="point-box"><strong>+200 pts</strong><span>complete a missão</span></div>
        <div class="point-box"><strong>+100 pts</strong><span>por participação</span></div>
      </div>
    </div>

    <div class="card app-card">
      <div class="page-kicker">🎙️ Modo Conversação</div>
      <h2 class="page-title">Pratique, divirta-se e evolua!</h2>
      <p class="page-desc">Vocês têm 5 minutos para conversar sobre o tema sorteado.</p>
      <div class="theme-card"><div><div class="tiny blue">Tema da vez</div><strong id="theme-name">${esc(selectedTheme.name)}</strong></div><button class="small-action" id="random-theme">Sortear tema</button></div>
      <div class="chips">${THEMES.map(t=>`<button class="theme-chip ${selectedTheme.name===t.name?'active':''}" type="button" data-theme="${esc(t.name)}">${esc(t.name)}</button>`).join('')}</div>
      <div id="theme-prompts" class="prompt-list">${selectedTheme.prompts.map(p=>`<div class="prompt">🎯 ${esc(p)}</div>`).join('')}</div>
      <div class="timer-block"><div id="timer" class="timer">${fmtTime(conversation.remaining)}</div><div class="timer-sub">Tempo oficial de conversa</div><div class="timer-actions"><button class="primary-btn" id="timer-start">Começar</button><button class="ghost-btn" id="timer-pause">Pausar</button><button class="ghost-btn" id="timer-reset">Resetar</button></div></div>
      <div class="participant-picker"><div class="tiny muted">Quem participou?</div>${state.members.map(m=>`<label class="check-person"><input class="talk-person" type="checkbox" value="${m.id}" ${m.id===currentUserId?'checked':''}>${avatar(m,'sm')}<span>${esc(m.name)}</span></label>`).join('')}</div>
      <div id="vote-area" style="display:${conversation.finished?'block':'none'}"><div class="section-head"><h3>Quem se saiu melhor?</h3></div><div id="vote-options" class="vote-list"></div><button class="primary-btn" id="save-talk">Salvar conversação</button></div>
    </div>

    <div class="card app-card">
      <div class="page-kicker">🎯 Missão da Semana</div>
      <h2 class="page-title">${esc(mission.title)}</h2>
      <p class="page-desc">${esc(mission.desc)}</p>
      ${missionDone(currentUserId,w)?'<div class="notice success">Missão concluída ✅</div>':'<button class="primary-btn" id="complete-mission">Enviar missão</button>'}
      <div class="section-head" style="margin-top:20px"><h3>Conquistas</h3><span class="small-pill">${ach.filter(a=>a[2]).length}/${ach.length}</span></div>
      <div class="badge-grid">${ach.map(a=>`<div class="badge ${a[2]?'':'locked'}"><div class="emoji">${a[0]}</div><strong>${esc(a[1])}</strong><span>${esc(a[3])}</span></div>`).join('')}</div>
    </div>
  </section>`;
}

function rankView(){
  const ranks=standings();
  const debts=automaticDebts();
  const all=debts.reduce((s,d)=>s+d.amount,0), paid=debts.filter(d=>d.paid).reduce((s,d)=>s+d.amount,0);
  const weeks = Array.from({length:Math.min(currentWeek(), state.season.durationWeeks)}, (_,i)=>i+1);
  return `<section class="view ${currentView==='rank'?'active':''}">
    <div class="card app-card">
      <div class="page-kicker">🏆 Ranking da temporada</div>
      <h2 class="page-title">Classificação geral</h2>
      <div class="rank-list">${ranks.map((m,i)=>`<div class="rank-row"><div class="rank-pos">${i+1}º</div>${avatar(m,'sm')}<div class="rank-main"><strong>${esc(m.name)}</strong><span>🔥 ${m.streak} dias · 🗣️ ${m.talks} conversas · ${m.xp} XP</span></div><div class="rank-score"><strong>${m.score}</strong><span>pontos</span></div></div>`).join('')}</div>
    </div>

    <div class="card app-card">
      <div class="section-head"><h3>Histórico</h3><span class="small-pill">8 semanas</span></div>
      <div class="history-grid">${weeks.map(w=>`<div class="week-card"><div class="week-head"><strong>Semana ${w}</strong><span>${weekRange(w).start} a ${weekRange(w).end}</span></div><div class="week-body">${state.members.map(m=>`<div class="week-member"><strong>${esc(m.name)}</strong><span>${checkinsFor(m.id,w).length}/7 dias</span><span>${xpFor(m.id,w)} XP</span><span>${weekScore(m.id,w)} pts</span></div>`).join('')}</div></div>`).join('')}</div>
    </div>

    <div class="card app-card">
      <div class="section-head"><h3>Retrospectiva do cofrinho</h3><span class="small-pill">${money(all-paid)} pendente</span></div>
      <div class="money-row"><strong>${money(paid)}</strong><span>Cofrinho confirmado</span></div>
    </div>
  </section>`;
}

function moreView(){
  const u=user();
  const debts=automaticDebts();
  const pending=debts.filter(d=>!d.paid);
  const w=currentWeek();
  return `<section class="view ${currentView==='more'?'active':''}">
    <div class="card app-card">
      <div class="profile-mini">${avatar(u,'xl')}<div><h2 class="page-title" style="margin:0">${esc(u.name)}</h2><p class="page-desc">${scoreMember(u.id)} pontos · 🔥 ${currentStreak(u.id)} dias · 🗣️ ${state.conversations.filter(c=>c.participants.includes(u.id)).length} conversas</p></div></div>
      <div class="actions-row"><button class="ghost-btn" id="choose-photo">📷 Alterar foto</button><button class="ghost-btn" id="change-user">Trocar usuário</button><button class="danger-btn" id="delete-profile">🗑️ Excluir perfil</button></div>
      <input id="avatar-file" type="file" accept="image/png,image/jpeg,image/webp" hidden>
      <form id="profile-form" class="field" style="margin-top:14px"><label>Nome no ranking</label><input class="input" id="profile-name" value="${esc(u.name)}" maxlength="30"><button class="primary-btn" style="margin-top:10px">Salvar perfil</button></form>
    </div>

    <div class="card app-card">
      <div class="section-head"><h3>Prendas / Devedores</h3><span class="small-pill">Semana ${w}</span></div>
      <div class="debt-list">${pending.length?pending.map(d=>{const m=member(d.memberId);return `<div class="debt ${d.paid?'paid':''}"><div><strong>${esc(m?.name||'Participante')} deve ${money(d.amount)}</strong><span>${d.days}/7 dias · não bateu a meta</span></div><button class="small-action debt-toggle" data-id="${d.id}">${d.paid?'Desmarcar':'Marcar pago'}</button></div>`}).join(''):'<div class="empty">Nenhuma prenda pendente. Aleluia! 😇</div>'}</div>
      <div class="section-head" style="margin-top:16px"><h3>Cutucar</h3></div>
      <div class="cutucar-list">${state.members.filter(m=>m.id!==currentUserId).map(m=>`<div class="cutucar-row">${avatar(m,'sm')}<div class="grow"><strong>${esc(m.name)}</strong><div class="member-subline">Envie uma provocação amigável.</div></div><button class="small-action poke" data-to="${m.id}">Cutucar</button></div>`).join('')}</div>
    </div>

    <div class="card app-card">
      <div class="section-head"><h3>Configuração da temporada</h3><span class="small-pill">5 min fixos</span></div>
      <form id="season-form" class="form-grid">
        <div class="field"><label>Nome da temporada</label><input class="input" id="season-name" value="${esc(state.season.name)}"></div>
        <div class="field"><label>Idioma da temporada</label><select class="select" id="season-language">${LANGUAGE_OPTIONS.map(l=>`<option ${state.season.language===l?'selected':''}>${l}</option>`).join('')}</select></div>
        <div class="field"><label>Início da temporada</label><input class="input" id="season-start" type="date" value="${state.season.startDate}"></div>
        <div class="field"><label>Meta semanal</label><input class="input" id="season-goal" type="number" min="1" max="7" value="${state.season.weeklyGoal}"></div>
        <div class="field"><label>Valor da prenda (R$)</label><input class="input" id="season-penalty" type="number" min="0" max="500" value="${state.season.penaltyAmount}"></div>
        <div class="field"><label>Conversação presencial</label><div class="fake-input">5 minutos · fixo</div></div>
        <div class="field full"><button class="primary-btn">Salvar temporada</button></div>
      </form>
      <div class="sep"></div>
      <div class="notice">👤 Novos participantes devem se cadastrar pela tela inicial e criar a própria senha de 4 dígitos.</div>
    </div>
  </section>`;
}

function render(){
  if(!state) return;
  if(!currentUserId || !member(currentUserId)){
    root.innerHTML=`<div class="screen-message"><div class="card"><div class="page-kicker">🏆 DuoLiga</div><h2 class="page-title">Bem-vindo ao desafio</h2><p class="page-desc">Crie ou escolha seu perfil para entrar.</p></div></div>`;
    showOnboarding();
    return;
  }
  root.innerHTML = `${topbar()}<main class="views">${homeView()}${checkinView()}${challengesView()}${rankView()}${moreView()}</main>${nav()}`;
  bind();
}

function bind(){
  document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{ currentView=b.dataset.view; render(); }));
  document.querySelector('#user-menu')?.addEventListener('click',showOnboarding);
  document.querySelector('#change-user')?.addEventListener('click',showOnboarding);
  document.querySelector('#delete-profile')?.addEventListener('click',deleteCurrentProfile);
  document.querySelectorAll('.poke').forEach(b=>b.addEventListener('click',async()=>{ const msg=POKES[Math.floor(Math.random()*POKES.length)]; try{ await action('poke',{fromId:currentUserId,toId:b.dataset.to,message:msg}); toast('Cutucada enviada 😂','success'); }catch(e){ toast(e.message,'error'); } }));
  document.querySelectorAll('[data-theme]').forEach(b=>b.addEventListener('click',()=>{ const found=THEMES.find(t=>t.name===b.dataset.theme); if(found){ selectedTheme=found; currentView='challenges'; render(); } }));
  document.querySelector('#random-theme')?.addEventListener('click',()=>{ selectedTheme=THEMES[Math.floor(Math.random()*THEMES.length)]; render(); });
  document.querySelector('#proof')?.addEventListener('change',e=>{ proofFile=e.target.files?.[0]||null; if(proofFile){ const url=URL.createObjectURL(proofFile); document.querySelector('#proof-preview').innerHTML=`<img class="proof-preview" src="${url}" alt="Prévia do print">`; }});
  document.querySelector('#checkin-form')?.addEventListener('submit',submitCheckin);
  document.querySelectorAll('#complete-mission').forEach(b=>b.addEventListener('click',async()=>{ try{ await action('completeMission',{memberId:currentUserId,week:currentWeek()}); toast('Missão concluída! +2 pontos 🎯','success'); }catch(e){ toast(e.message,'error'); } }));
  document.querySelectorAll('.talk-person').forEach(x=>x.addEventListener('change',voteOptions));
  document.querySelector('#timer-start')?.addEventListener('click',startTimer);
  document.querySelector('#timer-pause')?.addEventListener('click',pauseTimer);
  document.querySelector('#timer-reset')?.addEventListener('click',resetTimer);
  document.querySelector('#save-talk')?.addEventListener('click',saveTalk);
  if(conversation.finished) voteOptions();
  document.querySelectorAll('.debt-toggle').forEach(b=>b.addEventListener('click',async()=>{ try{ await action('toggleDebt',{debtId:b.dataset.id}); toast('Cofrinho atualizado.','success'); }catch(e){ toast(e.message,'error'); } }));
  document.querySelector('#choose-photo')?.addEventListener('click',()=>document.querySelector('#avatar-file').click());
  document.querySelector('#avatar-file')?.addEventListener('change',updatePhoto);
  document.querySelector('#profile-form')?.addEventListener('submit',async e=>{ e.preventDefault(); const name=document.querySelector('#profile-name').value.trim(); try{ await action('updateMember',{memberId:currentUserId,name}); toast('Perfil atualizado.','success'); }catch(err){ toast(err.message,'error'); } });
  document.querySelector('#season-form')?.addEventListener('submit',async e=>{ e.preventDefault(); try{ await action('updateSeason',{name:document.querySelector('#season-name').value,language:document.querySelector('#season-language').value,startDate:document.querySelector('#season-start').value,weeklyGoal:Number(document.querySelector('#season-goal').value),penaltyAmount:Number(document.querySelector('#season-penalty').value)}); toast('Temporada atualizada.','success'); }catch(err){ toast(err.message,'error'); } });
}

function voteOptions(){
  const selected=[...document.querySelectorAll('.talk-person:checked')].map(x=>x.value);
  const wrap=document.querySelector('#vote-options');
  if(!wrap) return;
  if(selected.length<2){ wrap.innerHTML='<div class="empty">Selecione pelo menos 2 participantes para liberar a votação.</div>'; return; }
  wrap.innerHTML = [...selected, 'tie'].map(id=> id==='tie' ? `<div class="vote-option"><input type="radio" id="vote-tie" name="winner" value=""><label for="vote-tie">🤝 Empate</label></div>` : `<div class="vote-option"><input type="radio" id="vote-${id}" name="winner" value="${id}"><label for="vote-${id}">${avatar(member(id),'sm')}<span>${esc(member(id)?.name||'Participante')}</span></label></div>`).join('');
}
async function submitCheckin(e){
  e.preventDefault(); const btn=e.submitter; btn.disabled=true; btn.textContent='Salvando…';
  try{ let proofUrl=''; if(proofFile){ const dataUrl=await compressImage(proofFile,900,.7,false); const up=await api('/api/media',{method:'POST',body:JSON.stringify({dataUrl,kind:'proof'})}); proofUrl=up.url; }
    await action('checkin',{memberId:currentUserId,date:document.querySelector('#date').value,minutes:Number(document.querySelector('#minutes').value),xp:Number(document.querySelector('#xp').value),proofUrl}); proofFile=null; toast('Check-in registrado ✅','success'); currentView='home'; render();
  }catch(err){ toast(err.message,'error'); btn.disabled=false; btn.textContent='Confirmar check-in ✅'; }
}
function startTimer(){ const selected=[...document.querySelectorAll('.talk-person:checked')]; if(selected.length<2){ toast('Selecione pelo menos 2 participantes.','error'); return; } conversation.running=true; conversation.finished=false; conversation.endAt=Date.now()+conversation.remaining*1000; renderTimerControls(); clearInterval(conversation.interval); conversation.interval=setInterval(()=>{ conversation.remaining=Math.max(0,Math.ceil((conversation.endAt-Date.now())/1000)); const t=document.querySelector('#timer'); if(t) t.textContent=fmtTime(conversation.remaining); if(conversation.remaining<=0){ clearInterval(conversation.interval); conversation.running=false; conversation.finished=true; document.querySelector('#vote-area').style.display='block'; voteOptions(); renderTimerControls(); toast('Tempo! Agora votem em quem se saiu melhor. 🗣️','success'); } },250); }
function pauseTimer(){ if(!conversation.running) return; conversation.remaining=Math.max(0,Math.ceil((conversation.endAt-Date.now())/1000)); conversation.running=false; clearInterval(conversation.interval); renderTimerControls(); }
function resetTimer(){ clearInterval(conversation.interval); conversation={running:false,endAt:0,remaining:300,interval:null,finished:false}; render(); }
function renderTimerControls(){ const s=document.querySelector('#timer-start'),p=document.querySelector('#timer-pause'); if(s) s.disabled=conversation.running||conversation.finished; if(p) p.disabled=!conversation.running; }
async function saveTalk(){ const participants=[...document.querySelectorAll('.talk-person:checked')].map(x=>x.value); const winner=document.querySelector('input[name="winner"]:checked'); if(!winner){ toast('Escolha um vencedor ou empate.','error'); return; } try{ await action('conversation',{participants,winnerId:winner.value,theme:selectedTheme.name,date:localDateISO()}); resetTimer(); toast('Conversação contabilizada!','success'); currentView='home'; render(); }catch(e){ toast(e.message,'error'); } }
async function deleteCurrentProfile(){
  const u=user();
  if(!u) return;
  const ok=window.confirm(`Excluir o perfil de ${u.name}?\n\nIsso também apagará os check-ins, missões e dados pessoais desse perfil. Essa ação não pode ser desfeita.`);
  if(!ok) return;
  try{
    const data=await api('/api/state',{method:'POST',body:JSON.stringify({action:'deleteMember',payload:{memberId:u.id}})});
    state=data.state;
    clearAuthenticatedMember();
    currentView='home';
    render();
    toast('Perfil excluído.','success');
  }catch(err){
    toast(err.message,'error');
  }
}
async function updatePhoto(e){ const f=e.target.files?.[0]; if(!f) return; try{ toast('Preparando foto…'); const dataUrl=await compressImage(f,320,.78,true); const up=await api('/api/media',{method:'POST',body:JSON.stringify({dataUrl,kind:'avatar'})}); await action('updateMember',{memberId:currentUserId,photoUrl:up.url}); toast('Foto de perfil atualizada 📷','success'); }catch(err){ toast(err.message,'error'); } }
function compressImage(file,maxSize=900,quality=.75,square=false){ return new Promise((resolve,reject)=>{ if(!file.type.startsWith('image/')) return reject(new Error('Escolha uma imagem válida.')); const img=new Image(); const url=URL.createObjectURL(file); img.onload=()=>{ let sw=img.width,sh=img.height,sx=0,sy=0; if(square){ const side=Math.min(sw,sh); sx=(sw-side)/2; sy=(sh-side)/2; sw=sh=side; } const scale=Math.min(1,maxSize/Math.max(sw,sh)); const cw=Math.max(1,Math.round(sw*scale)), ch=Math.max(1,Math.round(sh*scale)); const c=document.createElement('canvas'); c.width=cw; c.height=ch; const ctx=c.getContext('2d'); ctx.drawImage(img,sx,sy,sw,sh,0,0,cw,ch); URL.revokeObjectURL(url); resolve(c.toDataURL('image/jpeg',quality)); }; img.onerror=()=>{ URL.revokeObjectURL(url); reject(new Error('Não consegui ler essa imagem.')); }; img.src=url; }); }

function showAccessModal(){
  root.innerHTML=`<div class="modal-backdrop"><div class="modal"><div class="eyebrow">DuoLiga privada</div><h2>Digite o código da família</h2><p>Esse código protege o app no Netlify. Depois de entrar, ele ficará salvo neste aparelho.</p><form id="access-form" class="field"><label>Código de acesso</label><input class="input" id="access-code" type="password" required><button class="primary-btn" style="margin-top:10px">Entrar</button></form></div></div>`;
  document.querySelector('#access-form').addEventListener('submit',async e=>{ e.preventDefault(); localStorage.setItem('duoliga-code',document.querySelector('#access-code').value); try{ await load(); }catch{} });
}
function showPinLogin(target){
  document.querySelector('.modal-backdrop')?.remove();
  const wrap=document.createElement('div'); wrap.className='modal-backdrop';
  wrap.innerHTML=`<div class="modal pin-modal"><button class="modal-back" type="button" id="pin-back">← Voltar</button><div class="pin-profile">${avatar(target,'xl')}<div><div class="eyebrow">Entrar no perfil</div><h2>${esc(target.name)}</h2><p>Digite sua senha de 4 dígitos.</p></div></div><form id="pin-login-form" class="field" style="margin-top:18px"><label>Senha</label><input class="input pin-input" id="login-pin" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="off" placeholder="••••" required><button class="primary-btn" style="margin-top:10px">Entrar</button><div id="pin-msg" class="tiny"></div></form></div>`;
  document.body.append(wrap);
  wrap.querySelector('#pin-back').addEventListener('click',()=>{wrap.remove();showOnboarding();});
  const input=wrap.querySelector('#login-pin'); input.focus();
  input.addEventListener('input',()=>{ input.value=input.value.replace(/\D/g,'').slice(0,4); });
  wrap.querySelector('#pin-login-form').addEventListener('submit',async e=>{
    e.preventDefault();
    const pin=input.value;
    const btn=e.submitter;
    if(!/^\d{4}$/.test(pin)){ wrap.querySelector('#pin-msg').textContent='Digite exatamente 4 números.'; return; }
    btn.disabled=true; btn.textContent='Verificando…';
    try{
      const data=await api('/api/state',{method:'POST',body:JSON.stringify({action:'verifyPin',payload:{memberId:target.id,pin}})});
      state=data.state;
      setAuthenticatedMember(target.id);
      wrap.remove(); render(); toast(`Bem-vindo, ${target.name}!`,'success');
    }catch(err){ btn.disabled=false; btn.textContent='Entrar'; wrap.querySelector('#pin-msg').textContent=err.message; input.value=''; input.focus(); }
  });
}

function showPinSetup(target){
  document.querySelector('.modal-backdrop')?.remove();
  const wrap=document.createElement('div'); wrap.className='modal-backdrop';
  wrap.innerHTML=`<div class="modal pin-modal"><button class="modal-back" type="button" id="pin-back">← Voltar</button><div class="pin-profile">${avatar(target,'xl')}<div><div class="eyebrow">Proteja seu perfil</div><h2>${esc(target.name)}</h2><p>Este perfil foi criado antes da senha. Cadastre agora uma senha de 4 dígitos.</p></div></div><form id="pin-setup-form" class="form-grid" style="margin-top:18px"><div class="field full"><label>Crie a senha</label><input class="input pin-input" id="setup-pin" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" placeholder="••••" required></div><div class="field full"><label>Confirme a senha</label><input class="input pin-input" id="setup-pin-confirm" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" placeholder="••••" required></div><div class="field full"><button class="primary-btn">Salvar senha e entrar</button><div id="pin-msg" class="tiny"></div></div></form></div>`;
  document.body.append(wrap);
  wrap.querySelector('#pin-back').addEventListener('click',()=>{wrap.remove();showOnboarding();});
  const pin=wrap.querySelector('#setup-pin'), confirm=wrap.querySelector('#setup-pin-confirm');
  [pin,confirm].forEach(el=>el.addEventListener('input',()=>{el.value=el.value.replace(/\D/g,'').slice(0,4);}));
  pin.focus();
  wrap.querySelector('#pin-setup-form').addEventListener('submit',async e=>{
    e.preventDefault(); const value=pin.value;
    if(!/^\d{4}$/.test(value)){wrap.querySelector('#pin-msg').textContent='A senha precisa ter exatamente 4 números.';return;}
    if(value!==confirm.value){wrap.querySelector('#pin-msg').textContent='As duas senhas não são iguais.';confirm.value='';confirm.focus();return;}
    const btn=e.submitter; btn.disabled=true; btn.textContent='Salvando…';
    try{
      const data=await api('/api/state',{method:'POST',body:JSON.stringify({action:'setPin',payload:{memberId:target.id,pin:value}})});
      state=data.state; setAuthenticatedMember(target.id); wrap.remove(); render(); toast('Senha cadastrada com sucesso. 🔒','success');
    }catch(err){btn.disabled=false;btn.textContent='Salvar senha e entrar';wrap.querySelector('#pin-msg').textContent=err.message;}
  });
}

function showOnboarding(){
  const old=document.querySelector('.modal-backdrop'); if(old) old.remove();
  const isFirstMember = state.members.length===0;
  const fixedLanguage = state.season.language || 'Inglês';
  const languageField = isFirstMember
    ? `<select class="select" id="signup-language">${LANGUAGE_OPTIONS.map(l=>`<option ${fixedLanguage===l?'selected':''}>${l}</option>`).join('')}</select><small class="tiny muted">O primeiro participante define o idioma da temporada. Depois ele fica igual para todos.</small>`
    : `<div class="fake-input">${flagForLanguage(fixedLanguage)} ${esc(fixedLanguage)}</div><input type="hidden" id="signup-language" value="${esc(fixedLanguage)}"><small class="tiny muted">Idioma já definido para esta temporada.</small>`;
  const wrap=document.createElement('div'); wrap.className='modal-backdrop';
  wrap.innerHTML=`<div class="modal"><div class="eyebrow">Bem-vindo ao DuoLiga</div><h2>Cadastre-se para entrar no desafio</h2><p>${isFirstMember?'Você será o primeiro participante e poderá definir o idioma da temporada.':'Crie seu perfil para participar do mesmo idioma escolhido pelo grupo.'}</p>
    <form id="signup-form" class="form-grid" style="margin-top:14px">
      <div class="field full"><label>Seu nome</label><input class="input" id="signup-name" placeholder="Ex.: MJ" required maxlength="30"></div>
      <div class="field full"><label>Idioma da temporada</label>${languageField}</div>
      <div class="field"><label>Crie uma senha de 4 dígitos</label><input class="input pin-input" id="signup-pin" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" placeholder="••••" required></div>
      <div class="field"><label>Confirme a senha</label><input class="input pin-input" id="signup-pin-confirm" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" placeholder="••••" required></div>
      <div class="field full"><small class="tiny muted">Use apenas números. Essa senha será pedida sempre que alguém entrar no seu perfil em um aparelho novo.</small></div>
      <div class="field full"><button class="primary-btn">Criar meu perfil</button><div id="signup-msg" class="tiny"></div></div>
    </form>
    ${state.members.length?`<div class="sep"></div><div class="section-head"><h3>Ou entrar com um perfil já existente</h3></div><div class="picker">${state.members.map(m=>`<button type="button" data-member="${m.id}">${avatar(m)}<strong>${esc(m.name)}</strong><small>${m.pinSet?'🔒 Senha ativa':'⚠️ Criar senha'}</small></button>`).join('')}</div>`:''}
  </div>`;
  document.body.append(wrap);
  wrap.querySelectorAll('[data-member]').forEach(b=>b.addEventListener('click',()=>{
    const target=member(b.dataset.member); if(!target) return;
    target.pinSet ? showPinLogin(target) : showPinSetup(target);
  }));
  const pin=wrap.querySelector('#signup-pin'), confirm=wrap.querySelector('#signup-pin-confirm');
  [pin,confirm].forEach(el=>el?.addEventListener('input',()=>{el.value=el.value.replace(/\D/g,'').slice(0,4);}));
  wrap.querySelector('#signup-form').addEventListener('submit',async e=>{
    e.preventDefault();
    const name=wrap.querySelector('#signup-name').value.trim();
    const language=wrap.querySelector('#signup-language').value;
    const pinValue=pin.value;
    const submit=e.submitter;
    const msg=wrap.querySelector('#signup-msg');
    if(!name) return;
    if(!/^\d{4}$/.test(pinValue)){msg.textContent='Crie uma senha com exatamente 4 números.';return;}
    if(pinValue!==confirm.value){msg.textContent='As duas senhas não são iguais.';confirm.value='';confirm.focus();return;}
    submit.disabled=true; submit.textContent='Criando perfil…'; msg.textContent='';
    try{
      let response = await api('/api/state',{method:'POST',body:JSON.stringify({action:'addMember',payload:{name,pin:pinValue}})});
      state=response.state;
      const newest=state.members[state.members.length-1];
      if(!newest) throw new Error('Não foi possível criar o perfil.');
      setAuthenticatedMember(newest.id);
      if(isFirstMember && language && state.season.language!==language){
        response = await api('/api/state',{method:'POST',body:JSON.stringify({action:'updateSeason',payload:{language}})});
        state=response.state;
      }
      wrap.remove(); render(); toast(`Bem-vindo, ${name}! 🔒`,'success');
    }catch(err){ submit.disabled=false; submit.textContent='Criar meu perfil'; msg.textContent=err.message; }
  });
}
function flagForLanguage(language){ return ({'Inglês':'🇺🇸','Espanhol':'🇪🇸','Francês':'🇫🇷','Alemão':'🇩🇪','Italiano':'🇮🇹'}[language] || '🌎'); }

load();
