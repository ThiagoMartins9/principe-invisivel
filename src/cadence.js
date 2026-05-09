/**
 * Helpers de cadência para missões recorrentes — funções puras.
 *
 * m.cadence = { type: 'daily' | 'custom', days?: number[] }
 *  - daily  : todo dia conta como dia agendado
 *  - custom : days[] usa 0=Dom .. 6=Sáb
 */
import { WEEKDAY_LABELS_SHORT } from "./config.js";
import { today } from "./utils.js";

export function getCadence(m){
  return (m && m.cadence) ? m.cadence : { type: "daily", days: [] };
}

export function sanitizeCadence(c){
  if(!c || typeof c !== "object") return { type: "daily", days: [] };
  const type = (c.type === "custom") ? "custom" : "daily";
  const days = Array.isArray(c.days)
    ? c.days.filter(d => Number.isInteger(d) && d >= 0 && d <= 6).sort((a, b) => a - b)
    : [];
  if(type === "custom" && days.length === 0) return { type: "daily", days: [] };
  return { type, days };
}

export function isCadenceDayOf(m, isoDate){
  const c = getCadence(m);
  if(c.type === "daily") return true;
  if(c.type === "custom" && Array.isArray(c.days) && c.days.length){
    const dow = new Date(isoDate + "T00:00:00").getDay();
    return c.days.includes(dow);
  }
  return true;
}

export function wasDoneToday(m, _today = today()){
  return !!(m.recurring && m.lastDoneAt && m.lastDoneAt.slice(0, 10) === _today);
}

export function nextCadenceDayLabel(m, _today = today()){
  const c = getCadence(m);
  if(c.type === "daily") return "diária";
  if(c.type === "custom" && c.days && c.days.length){
    const todayDow = new Date(_today + "T00:00:00").getDay();
    for(let i = 1; i <= 7; i++){
      const d = (todayDow + i) % 7;
      if(c.days.includes(d)){
        if(i === 1) return "amanhã";
        return WEEKDAY_LABELS_SHORT[d];
      }
    }
  }
  return "—";
}

export function recurringStreak(m, _today = today()){
  if(!m.recurring) return 0;
  const hist = Array.isArray(m.xpHistory) ? m.xpHistory : [];
  const done = new Set(hist.map(e => String(e.at || "").slice(0, 10)));
  let streak = 0;
  const cursor = new Date(_today + "T00:00:00");
  for(let i = 0; i < 365; i++){
    const iso = cursor.toISOString().slice(0, 10);
    if(isCadenceDayOf(m, iso)){
      if(done.has(iso)) streak++;
      else if(iso === _today){ /* hoje em aberto: não quebra */ }
      else break;
    }
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function categoriesDoneOn(missions, isoDate){
  const isToday = (iso) => !!iso && iso.slice(0, 10) === isoDate;
  return new Set(
    missions
      .filter(x => isToday(x.doneAt) || (x.recurring && isToday(x.lastDoneAt)))
      .map(x => x.cat)
  );
}
