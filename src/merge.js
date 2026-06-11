/**
 * P7 — Merge por missão entre estado local e remoto.
 *
 * Substitui o last-write-wins de estado inteiro: cada missão é resolvida
 * individualmente pelo seu carimbo (updatedAt; fallback no maior entre
 * lastDoneAt/doneAt/createdAt). Missões presentes só de um lado entram —
 * exceto se houver tombstone mais novo que a missão em state.deletedIds
 * (razões: "deleted" = exclusão definitiva; "archived" = movida ao Arquivo
 * IDB — nesse caso o merge devolve a missão em toArchive para o chamador
 * arquivá-la localmente, propagando o arquivamento entre dispositivos).
 *
 * Recorrentes têm merge fino: xpHistory é unido por timestamp (selos feitos
 * offline em dispositivos distintos não se perdem), count = max(counts, len),
 * lastDoneAt = max. Escalares monotônicos (xp, missionsDone) usam max();
 * demais escalares (vigor, streak, regions, regionLog...) seguem LWW pelo
 * _updatedAt do estado. Tags são unidas preservando ordem.
 *
 * Tudo puro e testável: nada de DOM, rede ou estado global.
 */
import { TOMBSTONE_TTL_DAYS } from "./config.js";

/** Carimbo temporal de uma missão (ms). 0 se não determinável. */
export function missionStamp(m){
  if(!m) return 0;
  let best = 0;
  for(const k of ["updatedAt", "lastDoneAt", "doneAt", "createdAt"]){
    const t = Date.parse(m[k] || "");
    if(!isNaN(t) && t > best) best = t;
  }
  return best;
}

/** União de xpHistory por timestamp `at` (dedupe), ordenada asc. */
export function mergeXpHistory(a, b){
  const seen = new Set();
  const out = [];
  for(const e of [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])]){
    const k = String(e?.at || "");
    if(!k || seen.has(k)) continue;
    seen.add(k);
    out.push(e);
  }
  out.sort((x, y) => String(x.at).localeCompare(String(y.at)));
  return out;
}

/**
 * Normaliza campos de recorrente (xpHistory/count/lastDoneAt sempre presentes).
 * Em produção é no-op (migrate v3/v5 já garante); aqui assegura que missões
 * vindas de um lado só e missões merged convirjam estruturalmente — condição
 * para a idempotência detectada por statesEquivalent (corta loops de push).
 */
export function normalizeMission(m){
  if(!m || !m.recurring) return m;
  const out = { ...m };
  if(!Array.isArray(out.xpHistory)) out.xpHistory = [];
  if(typeof out.count !== "number") out.count = out.xpHistory.length;
  if(out.lastDoneAt === undefined) out.lastDoneAt = null;
  return out;
}

/** Resolve a mesma missão presente nos dois lados. */
export function mergeMission(a, b){
  const winner = missionStamp(b) > missionStamp(a) ? b : a;
  const m = { ...winner };
  if(a.recurring || b.recurring){
    const xh = mergeXpHistory(a.xpHistory, b.xpHistory);
    m.xpHistory = xh;
    m.count = Math.max(a.count || 0, b.count || 0, xh.length);
    const la = Date.parse(a.lastDoneAt || "") || 0;
    const lb = Date.parse(b.lastDoneAt || "") || 0;
    m.lastDoneAt = (la >= lb ? (a.lastDoneAt ?? null) : (b.lastDoneAt ?? null));
  }
  return m;
}

/** Tombstone vence se for tão ou mais novo que a última mutação da missão. */
export function isTombstoneActive(tomb, m){
  if(!tomb) return false;
  const t = Date.parse(tomb.at || "");
  if(isNaN(t)) return false;
  return t >= missionStamp(m);
}

/** Remove tombstones mais velhos que o TTL. Retorna novo objeto. */
export function pruneTombstones(tombs, nowISO, ttlDays = TOMBSTONE_TTL_DAYS){
  const now = Date.parse(nowISO || "") || Date.now();
  const limit = now - ttlDays * 24 * 60 * 60 * 1000;
  const out = {};
  for(const [id, t] of Object.entries(tombs || {})){
    const ts = Date.parse(t?.at || "");
    if(!isNaN(ts) && ts >= limit) out[id] = t;
  }
  return out;
}

/* ---------- Igualdade estrutural (para decidir aplicar/pushar) ---------- */
function stableStringify(v){
  if(v === null || typeof v !== "object") return JSON.stringify(v);
  if(Array.isArray(v)) return "[" + v.map(stableStringify).join(",") + "]";
  const keys = Object.keys(v).sort();
  return "{" + keys.map(k => JSON.stringify(k) + ":" + stableStringify(v[k])).join(",") + "}";
}

/**
 * Compara dois estados ignorando _updatedAt, ordem de chaves, ordem do array
 * de missões (canonizado por id) e ordem de tags. O payload faz roundtrip por
 * jsonb no Postgres, que reordena chaves — JSON.stringify direto não serve.
 */
export function statesEquivalent(a, b){
  return canonState(a) === canonState(b);
}

function canonState(s){
  if(!s || typeof s !== "object") return stableStringify(s);
  const c = { ...s };
  delete c._updatedAt;
  if(Array.isArray(c.missions)){
    c.missions = [...c.missions].sort((x, y) => String(x.id).localeCompare(String(y.id)));
  }
  if(Array.isArray(c.tags)) c.tags = [...c.tags].sort();
  return stableStringify(c);
}

/* ---------- Merge principal ---------- */
/**
 * @param {object} local  estado local (getState())
 * @param {object} remote payload remoto (Supabase)
 * @param {string} nowISO injetável para testes determinísticos
 * @returns {{ state: object, toArchive: object[] }}
 */
export function mergeStates(local, remote, nowISO = new Date().toISOString()){
  const a = local || {}, b = remote || {};
  const aUpd = Date.parse(a._updatedAt || "") || 0;
  const bUpd = Date.parse(b._updatedAt || "") || 0;
  const base = aUpd >= bUpd ? a : b;   // escalares (vigor, streak, regions…): LWW
  const out = { ...base };

  // 1) Tombstones: união, vence o `at` mais novo por id.
  const tombs = {};
  for(const src of [a.deletedIds, b.deletedIds]){
    if(!src || typeof src !== "object") continue;
    for(const [id, t] of Object.entries(src)){
      if(!tombs[id] || (Date.parse(t?.at || "") || 0) > (Date.parse(tombs[id].at || "") || 0)){
        tombs[id] = { ...t };
      }
    }
  }

  // 2) Missões: LWW individual + tombstones + merge fino de recorrentes.
  const aMap = new Map((Array.isArray(a.missions) ? a.missions : []).map(m => [m.id, m]));
  const bMap = new Map((Array.isArray(b.missions) ? b.missions : []).map(m => [m.id, m]));
  const ids = new Set([...aMap.keys(), ...bMap.keys()]);
  const missions = [];
  const toArchive = [];
  for(const id of ids){
    const ma = aMap.get(id), mb = bMap.get(id);
    const m = (ma && mb) ? mergeMission(ma, mb) : normalizeMission(ma || mb);
    const tomb = tombs[id];
    if(tomb && isTombstoneActive(tomb, m)){
      if(tomb.reason === "archived") toArchive.push(m);
      continue;
    }
    if(tomb) delete tombs[id]; // missão mutada após o tombstone → ressuscita
    missions.push(m);
  }
  // Ordem determinística (a renderização ordena por conta própria).
  missions.sort((x, y) => {
    const xo = (typeof x.order === "number" && isFinite(x.order)) ? x.order : Infinity;
    const yo = (typeof y.order === "number" && isFinite(y.order)) ? y.order : Infinity;
    if(xo !== yo) return xo - yo;
    return String(x.id).localeCompare(String(y.id));
  });
  out.missions = missions;

  // 3) Acumuladores monotônicos: max() preserva progresso feito offline
  //    dos dois lados (não soma — limitação documentada em MELHORIAS.md).
  out.xp = Math.max(a.xp || 0, b.xp || 0);
  out.missionsDone = Math.max(a.missionsDone || 0, b.missionsDone || 0);

  // 4) Tags: união preservando a ordem (lado-base primeiro).
  const other = base === a ? b : a;
  const seen = new Set();
  out.tags = [...(base.tags || []), ...(other.tags || [])].filter(t => {
    if(seen.has(t)) return false;
    seen.add(t);
    return true;
  });

  // 5) Tombstones podados pelo TTL.
  out.deletedIds = pruneTombstones(tombs, nowISO);

  out._updatedAt = nowISO;
  return { state: out, toArchive };
}
