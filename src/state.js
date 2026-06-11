/**
 * Singleton de estado da Crônica.
 *
 * - state é uma referência LET exportada que pode ser substituída inteira
 *   (em pull do Supabase, em import, em reset). Por isso outros módulos
 *   devem ler via getState() em vez de capturar a referência.
 * - save() persiste no localStorage e dispara o sync (P4) via callback.
 * - migrate() faz upgrades de schema preservando dados.
 */
import {
  STATE_KEY, SCHEMA_VERSION,
  DEFAULT_TAGS, OLD_DEFAULT_TAGS,
  XP_TABLE, XP_BASE, XP_GROWTH
} from "./config.js";

/** Hook de sync — main.js define para conectar com supabase.js (push debounced). */
let _onSaveHook = null;
export function onSave(fn){ _onSaveHook = fn; }

/** Flag levantada quando estamos aplicando dados remotos (sync). save() não dispara push. */
let _applyingRemote = false;
export function setApplyingRemote(v){ _applyingRemote = !!v; }
export function isApplyingRemote(){ return _applyingRemote; }

export function defaultState(){
  return {
    xp: 0,
    missionsDone: 0,
    vigor: 0,
    vigorRemaining: 0,
    streak: 0,
    lastDoneDate: null,
    inertiaDays: 0,
    tags: [...DEFAULT_TAGS],
    missions: [],
    regions: {},
    sound: true,
    battle: { linkedId: null, lastResult: null },
    regionLog: [],
    deletedIds: {},
    schemaVersion: SCHEMA_VERSION,
    _updatedAt: null
  };
}

let _state = load();
export function getState(){ return _state; }
export function setState(next){ _state = next; }

export function load(){
  try{
    const raw = localStorage.getItem(STATE_KEY);
    if(!raw) return defaultState();
    const parsed = JSON.parse(raw);
    return { ...defaultState(), ...parsed };
  }catch(e){ return defaultState(); }
}

export function save(){
  if(!_applyingRemote){
    _state._updatedAt = new Date().toISOString();
  }
  try{ localStorage.setItem(STATE_KEY, JSON.stringify(_state)); }catch(e){}
  if(_onSaveHook) _onSaveHook();
}

/* ---------- Migrações de schema ---------- */
export function migrate(){
  const state = _state;
  let changed = false;

  if(!state.schemaVersion || state.schemaVersion < 2){
    state.tags = state.tags.filter(t => !OLD_DEFAULT_TAGS.includes(t));
    for(const t of DEFAULT_TAGS){
      if(!state.tags.includes(t)) state.tags.push(t);
    }
    state.schemaVersion = 2; changed = true;
  }
  if(state.schemaVersion < 3){
    for(const m of state.missions){
      if(typeof m.recurring  === "undefined") m.recurring  = false;
      if(typeof m.count      === "undefined") m.count      = 0;
      if(typeof m.lastDoneAt === "undefined") m.lastDoneAt = null;
    }
    state.schemaVersion = 3; changed = true;
  }
  if(state.schemaVersion < 4){
    for(const m of state.missions){
      if(typeof m.notes !== "string")    m.notes = "";
      if(!Array.isArray(m.attachments))  m.attachments = [];
    }
    state.schemaVersion = 4; changed = true;
  }
  if(state.schemaVersion < 5){
    for(const m of state.missions){
      if(m.recurring && !Array.isArray(m.xpHistory)) m.xpHistory = [];
    }
    state.schemaVersion = 5; changed = true;
  }
  if(state.schemaVersion < 6){
    // Migração da curva linear → exponencial leve.
    const xpOld = state.xp || 0;
    const lvOld = Math.floor(xpOld / 50) + 1;
    const inLvOld = xpOld % 50;
    const need = XP_BASE + Math.floor((lvOld - 1) * XP_GROWTH);
    state.xp = (XP_TABLE[lvOld] ?? 0) + Math.round(inLvOld * need / 50);
    for(const m of state.missions){
      if(m.recurring && !m.cadence){
        m.cadence = { type: "daily", days: [] };
      }
    }
    state.schemaVersion = 6; changed = true;
  }
  if(state.schemaVersion < 7){
    if(!state._updatedAt) state._updatedAt = new Date().toISOString();
    state.schemaVersion = 7; changed = true;
  }
  if(state.schemaVersion < 8){
    // P5 — log cronológico de conquista de regiões para a Crônica Narrada.
    // Regiões já tomadas não recebem timestamp retroativo (não há fonte fidedigna),
    // ficam como "tempos imemoriais": presentes em state.regions, ausentes do log.
    if(!Array.isArray(state.regionLog)) state.regionLog = [];
    state.schemaVersion = 8; changed = true;
  }
  if(state.schemaVersion < 9){
    // P6 — ordem manual de missões (drag-and-drop). Atribui m.order preservando
    // exatamente a ordem visual vigente até aqui (pendentes: due asc, depois
    // createdAt desc; concluídas ao fim por doneAt desc). O order só compete
    // dentro de cada categoria na renderização, então a numeração global basta.
    assignMissingOrders(state.missions);
    state.schemaVersion = 9; changed = true;
  }
  if(state.schemaVersion < 10){
    // P7 — tombstones de exclusão/arquivamento para o merge por missão.
    if(!state.deletedIds || typeof state.deletedIds !== "object" || Array.isArray(state.deletedIds)){
      state.deletedIds = {};
    }
    state.schemaVersion = 10; changed = true;
  }

  if(changed) save();
}

/* ---------- Ordem manual (P6) ---------- */
/**
 * Garante que toda missão tenha m.order numérico, preservando a ordem visual
 * legada (pré-v9) para as que não têm: pendentes por due asc (sem due ao fim,
 * por createdAt desc), concluídas depois, por doneAt desc.
 * Idempotente: missões que já têm order não são tocadas. Pura (recebe o array).
 */
export function assignMissingOrders(missions){
  if(!Array.isArray(missions)) return;
  const missing = missions.filter(m => typeof m.order !== "number" || !isFinite(m.order));
  if(missing.length === 0) return;
  const max = missions
    .filter(m => typeof m.order === "number" && isFinite(m.order))
    .reduce((acc, m) => Math.max(acc, m.order), -1);
  const legacyCmp = (a, b) => {
    if(!a.doneAt && !b.doneAt){
      if(a.due && b.due) return a.due.localeCompare(b.due);
      if(a.due) return -1;
      if(b.due) return 1;
      return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
    }
    if(a.doneAt && b.doneAt) return String(b.doneAt).localeCompare(String(a.doneAt));
    return a.doneAt ? 1 : -1;
  };
  [...missing].sort(legacyCmp).forEach((m, i) => { m.order = max + 1 + i; });
}

/** Carimba a missão como mutada agora — base do merge por missão (P7). */
export function touchMission(m){
  if(m) m.updatedAt = new Date().toISOString();
}

/** Menor order existente − 1 (novas missões entram no topo da categoria). */
export function nextTopOrder(){
  const arr = (_state.missions || []).filter(m => typeof m.order === "number" && isFinite(m.order));
  if(arr.length === 0) return 0;
  return arr.reduce((acc, m) => Math.min(acc, m.order), Infinity) - 1;
}
