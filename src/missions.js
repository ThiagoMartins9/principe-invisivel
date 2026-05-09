/**
 * Lógica de missões: criação, conclusão, reabertura, exclusão, XP.
 * Helpers de cadência ficam em cadence.js (puros, testáveis).
 */
import { getState, save } from "./state.js";
import { rankOf, levelFor } from "./ranks.js";
import {
  BASE_XP, WEIGHTS,
  VIGOR_BONUS, VIGOR_MAX, VIGOR_USES,
  POMODORO_BONUS, FINISH_IN_BATTLE
} from "./config.js";
import { today, toast } from "./utils.js";
import { categoriesDoneOn } from "./cadence.js";
import { paintRegions } from "./map.js";
import { sfxComplete } from "./audio.js";
import { askConfirm } from "./modal.js";
import { burstSparks, showLevelUp } from "./fx.js";

/** XP de uma missão. Pura. */
export function computeXp(mission, opts = {}, vigor = 0){
  const base = BASE_XP * (WEIGHTS[mission.weight] ?? 1);
  let mult = 1;
  if(opts.usingVigor)   mult += VIGOR_BONUS * Math.min(vigor, VIGOR_MAX);
  if(opts.pomodoro)     mult += POMODORO_BONUS;
  if(opts.battleFinish) mult += FINISH_IN_BATTLE;
  return Math.round(base * mult);
}

export function completeMission(id, ctx = {}){
  const state = getState();
  const m = state.missions.find(x => x.id === id);
  if(!m) return 0;
  if(!m.recurring && m.doneAt) return 0;

  const lvBefore = levelFor(state.xp);
  const rBefore  = rankOf(lvBefore);

  const ctxFinal = { ...ctx };
  if(m._pomodoroDone){
    ctxFinal.pomodoro = true;
    delete m._pomodoroDone;
  }

  const usingVigor = (m.cat !== "armas") && state.vigorRemaining > 0;
  const xp = computeXp(m, { ...ctxFinal, usingVigor }, state.vigor);

  if(m.recurring){
    m.count = (m.count || 0) + 1;
    m.lastDoneAt = new Date().toISOString();
    m.xpHistory = Array.isArray(m.xpHistory) ? m.xpHistory : [];
    m.xpHistory.push({ at: m.lastDoneAt, xp });
  } else {
    m.doneAt = new Date().toISOString();
    m.xpAwarded = xp;
  }
  state.xp += xp;
  state.missionsDone += 1;

  if(m.cat === "armas"){
    state.vigor = Math.min(VIGOR_MAX, state.vigor + 1);
    state.vigorRemaining = VIGOR_USES;
    toast("Vigor restaurado · ×1,25 nas próximas " + VIGOR_USES);
  } else if(usingVigor){
    state.vigorRemaining = Math.max(0, state.vigorRemaining - 1);
    if(state.vigorRemaining === 0) state.vigor = 0;
  }

  const t = today();
  if(state.lastDoneDate === t){ /* mantém */ }
  else if(state.lastDoneDate){
    const last = new Date(state.lastDoneDate + "T00:00:00");
    const now  = new Date(t + "T00:00:00");
    const diff = Math.floor((now - last) / (1000 * 60 * 60 * 24));
    state.streak = (diff === 1) ? state.streak + 1 : 1;
  } else state.streak = 1;
  state.lastDoneDate = t;
  state.inertiaDays = 0;

  let paint = 1;
  if(state.streak >= 3) paint += 1;
  const todayCats = categoriesDoneOn(state.missions, t);
  if(todayCats.size >= 3) paint += 1;
  paintRegions(paint);

  const lvAfter = levelFor(state.xp);
  const rAfter  = rankOf(lvAfter);

  save();
  document.dispatchEvent(new CustomEvent("principe:state-changed"));
  sfxComplete();
  toast(`+${xp} XP · ${m.title.length > 32 ? m.title.slice(0, 32) + "…" : m.title}`);

  if(m.recurring){
    requestAnimationFrame(() => {
      const card = document.querySelector(`.mission[data-mid="${m.id}"]`);
      if(card){
        card.classList.add("bumped");
        setTimeout(() => card.classList.remove("bumped"), 480);
      }
    });
  }

  if(lvAfter > lvBefore){
    burstSparks();
    if(rAfter.name !== rBefore.name) showLevelUp(rAfter);
  }

  return xp;
}

export async function reopenMission(id){
  const state = getState();
  const m = state.missions.find(x => x.id === id);
  if(!m || !m.doneAt) return;

  const credited = (typeof m.xpAwarded === "number") ? m.xpAwarded : 0;
  if(credited > 0){
    const ok = await askConfirm(
      "Reabrir Pergaminho?",
      `Esta missão concedeu <b>${credited} XP</b>. Reabrir vai devolver o XP ao Reino e remover o selo de "Concluída". As regiões já pintadas no mapa permanecerão.`,
      { confirmText: "Reabrir e devolver XP", cancelText: "Manter concluída" }
    );
    if(!ok) return;
  }

  m.doneAt = null;
  if(credited > 0){
    state.xp = Math.max(0, state.xp - credited);
    state.missionsDone = Math.max(0, state.missionsDone - 1);
    delete m.xpAwarded;
    toast(`−${credited} XP · pergaminho reaberto`);
  }
  save();
  document.dispatchEvent(new CustomEvent("principe:state-changed"));
}

export async function deleteMission(id, removeAttachmentFiles){
  const state = getState();
  const m = state.missions.find(x => x.id === id);
  if(!m) return;
  const ok = await askConfirm(
    "Excluir Pergaminho?",
    `Vai apagar permanentemente: <b>${m.title}</b>. Anexos vinculados também serão removidos.`,
    { confirmText: "Excluir", cancelText: "Manter", danger: true }
  );
  if(!ok) return;
  if(typeof removeAttachmentFiles === "function" && Array.isArray(m.attachments)){
    for(const a of m.attachments){
      try{ await removeAttachmentFiles(a); }catch(_){}
    }
  }
  state.missions = state.missions.filter(x => x.id !== id);
  if(state.battle.linkedId === id) state.battle.linkedId = null;
  save();
  document.dispatchEvent(new CustomEvent("principe:state-changed"));
}

export function checkInertia(){
  const state = getState();
  if(!state.lastDoneDate) return;
  const last = new Date(state.lastDoneDate + "T00:00:00");
  const now  = new Date(today() + "T00:00:00");
  const diff = Math.floor((now - last) / (1000 * 60 * 60 * 24));
  if(diff > 1){
    const lost = diff - 1;
    const taken = Object.keys(state.regions).filter(k => state.regions[k] === "taken");
    let removed = 0;
    const removedRids = [];
    for(let i = taken.length - 1; i >= 0 && removed < lost; i--){
      const rid = taken[i];
      delete state.regions[rid];
      removedRids.push(rid);
      removed++;
    }
    // Reflete a perda no regionLog: remove a entrada mais recente de cada rid cedido.
    if(Array.isArray(state.regionLog) && removedRids.length){
      for(const rid of removedRids){
        for(let i = state.regionLog.length - 1; i >= 0; i--){
          if(state.regionLog[i].rid === rid){
            state.regionLog.splice(i, 1);
            break;
          }
        }
      }
    }
    state.inertiaDays = diff;
    if(removed > 0) toast(`Inércia: ${removed} região(ões) cedidas.`);
  } else {
    state.inertiaDays = diff;
  }
  save();
}
