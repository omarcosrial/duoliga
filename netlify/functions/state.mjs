import { getStore } from "@netlify/blobs";

const STATE_KEY = "state-v2";
const STORE_NAME = "duoliga-data";

function mondayISO(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function defaultState() {
  return {
    version: 2,
    season: {
      name: "Temporada 1",
      language: "Inglês",
      startDate: mondayISO(),
      durationWeeks: 8,
      weeklyGoal: 5,
      penaltyAmount: 10,
      conversationSeconds: 300
    },
    members: [],
    checkins: [],
    missionCompletions: [],
    conversations: [],
    pokes: [],
    paidDebtIds: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, X-App-Code",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
    }
  });
}

function authorized(req) {
  const expected = process.env.APP_ACCESS_CODE;
  if (!expected) return true;
  return req.headers.get("x-app-code") === expected;
}

function cleanText(value, max = 120) {
  return String(value ?? "").trim().slice(0, max);
}

function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function validPin(value) {
  return /^\d{4}$/.test(String(value || ""));
}

function id(prefix = "id") {
  return `${prefix}_${crypto.randomUUID()}`;
}

async function hashPin(pin, salt) {
  const input = new TextEncoder().encode(`${salt}:${pin}`);
  const digest = await crypto.subtle.digest("SHA-256", input);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function publicState(state) {
  const copy = structuredClone(state);
  copy.members = copy.members.map(member => {
    const { pinHash, pinSalt, ...safe } = member;
    return { ...safe, pinSet: Boolean(pinHash && pinSalt) };
  });
  return copy;
}

async function snapshot(store) {
  const entry = await store.getWithMetadata(STATE_KEY, { type: "json", consistency: "strong" });
  if (entry?.data) return { data: entry.data, etag: entry.etag, exists: true };
  return { data: defaultState(), etag: null, exists: false };
}

async function mutate(store, mutator) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const current = await snapshot(store);
    const next = structuredClone(current.data);
    const result = await mutator(next);
    if (result?.error) return { error: result.error, status: result.status || 400 };
    next.updatedAt = new Date().toISOString();
    const write = current.exists
      ? await store.setJSON(STATE_KEY, next, { onlyIfMatch: current.etag })
      : await store.setJSON(STATE_KEY, next, { onlyIfNew: true });
    if (write.modified) return { data: next };
  }
  return { error: "Os dados mudaram ao mesmo tempo em outro aparelho. Tente novamente.", status: 409 };
}

function findMember(state, memberId) {
  return state.members.find(m => m.id === memberId);
}

async function applyAction(state, action, payload = {}) {
  if (action === "checkin") {
    const member = findMember(state, payload.memberId);
    if (!member) return { error: "Participante inválido." };
    if (!validDate(payload.date)) return { error: "Data inválida." };
    const minutes = Math.max(1, Math.min(600, Number(payload.minutes) || 0));
    const xp = Math.max(0, Math.min(100000, Number(payload.xp) || 0));
    const proofUrl = cleanText(payload.proofUrl, 500);
    const existing = state.checkins.find(c => c.memberId === member.id && c.date === payload.date);
    if (existing) {
      existing.minutes = minutes;
      existing.xp = xp;
      existing.proofUrl = proofUrl || existing.proofUrl || "";
      existing.updatedAt = new Date().toISOString();
    } else {
      state.checkins.push({ id: id("checkin"), memberId: member.id, date: payload.date, minutes, xp, proofUrl, createdAt: new Date().toISOString() });
    }
    return {};
  }

  if (action === "completeMission") {
    const member = findMember(state, payload.memberId);
    const week = Math.max(1, Math.min(state.season.durationWeeks, Number(payload.week) || 0));
    if (!member || !week) return { error: "Missão inválida." };
    const exists = state.missionCompletions.some(m => m.memberId === member.id && m.week === week);
    if (!exists) state.missionCompletions.push({ id: id("mission"), memberId: member.id, week, completedAt: new Date().toISOString() });
    return {};
  }

  if (action === "conversation") {
    const participants = [...new Set((payload.participants || []).filter(x => findMember(state, x)))];
    if (participants.length < 2) return { error: "Selecione pelo menos 2 participantes." };
    const winnerId = payload.winnerId && participants.includes(payload.winnerId) ? payload.winnerId : "";
    state.conversations.push({
      id: id("talk"),
      date: validDate(payload.date) ? payload.date : new Date().toISOString().slice(0, 10),
      theme: cleanText(payload.theme, 80) || "Conversa livre",
      participants,
      winnerId,
      durationSeconds: 300,
      createdAt: new Date().toISOString()
    });
    return {};
  }

  if (action === "poke") {
    const from = findMember(state, payload.fromId);
    const to = findMember(state, payload.toId);
    if (!from || !to || from.id === to.id) return { error: "Cutucada inválida." };
    state.pokes.push({ id: id("poke"), fromId: from.id, toId: to.id, message: cleanText(payload.message, 180), createdAt: new Date().toISOString() });
    state.pokes = state.pokes.slice(-60);
    return {};
  }

  if (action === "toggleDebt") {
    const debtId = cleanText(payload.debtId, 120);
    if (!debtId) return { error: "Dívida inválida." };
    const i = state.paidDebtIds.indexOf(debtId);
    if (i >= 0) state.paidDebtIds.splice(i, 1);
    else state.paidDebtIds.push(debtId);
    return {};
  }

  if (action === "updateMember") {
    const member = findMember(state, payload.memberId);
    if (!member) return { error: "Participante inválido." };
    const name = cleanText(payload.name, 30);
    if (name) member.name = name;
    if (typeof payload.photoUrl === "string") member.photoUrl = cleanText(payload.photoUrl, 500);
    return {};
  }

  if (action === "setPin") {
    const member = findMember(state, payload.memberId);
    if (!member) return { error: "Participante inválido." };
    if (member.pinHash && member.pinSalt) return { error: "Este perfil já possui uma senha cadastrada.", status: 409 };
    const pin = String(payload.pin || "");
    if (!validPin(pin)) return { error: "A senha deve ter exatamente 4 números." };
    member.pinSalt = crypto.randomUUID();
    member.pinHash = await hashPin(pin, member.pinSalt);
    member.pinSetAt = new Date().toISOString();
    return {};
  }

  if (action === "deleteMember") {
    const member = findMember(state, payload.memberId);
    if (!member) return { error: "Participante inválido." };

    state.members = state.members.filter(m => m.id !== member.id);
    state.checkins = state.checkins.filter(c => c.memberId !== member.id);
    state.missionCompletions = state.missionCompletions.filter(m => m.memberId !== member.id);
    state.pokes = state.pokes.filter(p => p.fromId !== member.id && p.toId !== member.id);
    state.paidDebtIds = state.paidDebtIds.filter(debtId => !String(debtId).endsWith(`_${member.id}`));
    state.conversations = state.conversations
      .map(c => ({ ...c, participants: c.participants.filter(pid => pid !== member.id), winnerId: c.winnerId === member.id ? "" : c.winnerId }))
      .filter(c => c.participants.length >= 2);
    return {};
  }

  if (action === "addMember") {
    const name = cleanText(payload.name, 30);
    const pin = String(payload.pin || "");
    if (!name) return { error: "Informe o nome do participante." };
    if (!validPin(pin)) return { error: "Crie uma senha de exatamente 4 números." };
    if (state.members.length >= 10) return { error: "Limite de 10 participantes." };
    const pinSalt = crypto.randomUUID();
    const pinHash = await hashPin(pin, pinSalt);
    state.members.push({ id: id("member"), name, photoUrl: "", pinSalt, pinHash, pinSetAt: new Date().toISOString(), createdAt: new Date().toISOString() });
    return {};
  }

  if (action === "updateSeason") {
    const name = cleanText(payload.name, 40);
    const language = cleanText(payload.language, 40);
    if (name) state.season.name = name;
    if (language) state.season.language = language;
    if (validDate(payload.startDate)) state.season.startDate = payload.startDate;
    state.season.weeklyGoal = Math.max(1, Math.min(7, Number(payload.weeklyGoal) || state.season.weeklyGoal));
    state.season.penaltyAmount = Math.max(0, Math.min(500, Number(payload.penaltyAmount) || state.season.penaltyAmount));
    return {};
  }

  return { error: "Ação desconhecida." };
}

export default async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type, X-App-Code", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" } });
  if (!authorized(req)) return json({ error: "Código de acesso incorreto.", code: "UNAUTHORIZED" }, 401);

  const store = getStore({ name: STORE_NAME, consistency: "strong" });

  if (req.method === "GET") {
    const current = await snapshot(store);
    if (!current.exists) await store.setJSON(STATE_KEY, current.data, { onlyIfNew: true });
    return json({ state: publicState(current.data), secured: Boolean(process.env.APP_ACCESS_CODE) });
  }

  if (req.method === "POST") {
    let body;
    try { body = await req.json(); } catch { return json({ error: "JSON inválido." }, 400); }

    if (body.action === "verifyPin") {
      const current = await snapshot(store);
      const member = findMember(current.data, body.payload?.memberId);
      if (!member) return json({ error: "Participante inválido." }, 404);
      if (!member.pinHash || !member.pinSalt) return json({ error: "Este perfil ainda precisa criar uma senha de 4 dígitos.", code: "PIN_NOT_SET" }, 409);
      const pin = String(body.payload?.pin || "");
      if (!validPin(pin)) return json({ error: "Digite os 4 números da senha." }, 400);
      const candidate = await hashPin(pin, member.pinSalt);
      if (candidate !== member.pinHash) return json({ error: "Senha incorreta." }, 401);
      return json({ state: publicState(current.data), verified: true, memberId: member.id });
    }

    const result = await mutate(store, state => applyAction(state, body.action, body.payload));
    if (result.error) return json({ error: result.error }, result.status || 400);
    return json({ state: publicState(result.data) });
  }

  return json({ error: "Método não permitido." }, 405);
};
