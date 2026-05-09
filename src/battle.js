/**
 * Pomodoro de Batalha — fases, timer, vínculo de missão.
 * O bônus em si fica em missions.js (computeXp lê opts.battleFinish/pomodoro).
 */
import { $, $$, esc, toast, formatDate, tagChipStyle } from "./utils.js";
import { getState, save } from "./state.js";
import { sfxBattleStart, sfxBattleEnd, sfxAbort, sfxTick } from "./audio.js";
import { burstSparks } from "./fx.js";
import { renderBattleTask } from "./render.js";

export const battle = {
  running: false, paused: false,
  totalSec: 25 * 60, leftSec: 25 * 60,
  phase: "foco", min: 25, intervalId: null, startedAt: null
};

export function setBattlePhase(min){
  battle.min = min;
  battle.totalSec = min * 60;
  battle.leftSec  = min * 60;
  battle.phase = (min === 5)  ? "trégua"
                : (min === 15) ? "vigília curta"
                : (min >= 50)  ? "cerco"
                : "foco";
  $("#ringPhase").textContent = battle.phase
    .split(" ")
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  drawRing();
}

export function drawRing(){
  const pct = ((battle.totalSec - battle.leftSec) / battle.totalSec) * 100;
  $("#ring").style.setProperty("--p", pct.toFixed(2));
  const m = Math.floor(battle.leftSec / 60).toString().padStart(2, "0");
  const s = (battle.leftSec % 60).toString().padStart(2, "0");
  $("#ringTime").textContent = `${m}:${s}`;
}

export function startBattle(){
  if(battle.running) return;
  battle.running = true;
  battle.startedAt = Date.now();
  sfxBattleStart();
  $("#btnStart").textContent = "Em batalha…";
  $("#btnStart").classList.add("ghost");
  $("#btnStart").classList.remove("gold");
  battle.intervalId = setInterval(() => {
    battle.leftSec--;
    drawRing();
    if(battle.leftSec % 60 === 0 && battle.leftSec > 0) sfxTick();
    if(battle.leftSec <= 0) finishBattle(true);
  }, 1000);
}

export function abortBattle(){
  if(!battle.running) return;
  clearInterval(battle.intervalId);
  battle.running = false; battle.intervalId = null;
  battle.leftSec = battle.totalSec;
  drawRing();
  sfxAbort();
  $("#btnStart").textContent = "Iniciar Batalha";
  $("#btnStart").classList.remove("ghost");
  $("#btnStart").classList.add("gold");
  toast("Render-se: nenhum bônus.");
}

export function finishBattle(completed){
  clearInterval(battle.intervalId);
  battle.running = false; battle.intervalId = null;
  battle.leftSec = battle.totalSec; drawRing();
  $("#btnStart").textContent = "Iniciar Batalha";
  $("#btnStart").classList.remove("ghost");
  $("#btnStart").classList.add("gold");
  if(!completed) return;
  sfxBattleEnd();
  const state = getState();
  const linked = state.missions.find(m => m.id === state.battle.linkedId && !m.doneAt);
  if(linked && battle.phase !== "trégua"){
    linked._pomodoroDone = true;
    save();
    toast("Pomodoro vencido! Conclua a missão para ×1,5 ou +missão na batalha para ×2.");
  } else {
    toast("Batalha vencida.");
  }
  burstSparks();
}

export function openLinkModal(){
  const state = getState();
  const list = $("#linkList");
  const arr = state.missions.filter(m => !m.doneAt && m.cat !== "armas");
  if(arr.length === 0){
    list.innerHTML = `<div class="empty">Nenhuma missão pendente para vincular</div>`;
  } else {
    list.innerHTML = arr.map(m => `
      <div class="mission" data-link="${m.id}" style="cursor:pointer">
        <div class="check"></div>
        <div class="body">
          <h4>${esc(m.title)}</h4>
          <div class="meta">${m.due ? formatDate(m.due) : "sem prazo"}${m.tag ? ` · <span class="tag-chip" style="${tagChipStyle(m.tag)}">${esc(m.tag)}</span>` : ""}</div>
        </div>
        <div class="badge">${m.weight}</div>
      </div>
    `).join("");
  }
  $("#modalLink").classList.add("show");
}

export function closeLinkModal(){
  $("#modalLink").classList.remove("show");
}

export function bindBattleEvents(){
  $$(".seg button", $("#phasePicker")).forEach(b => b.addEventListener("click", () => {
    if(battle.running) return;
    $$(".seg button", $("#phasePicker")).forEach(x => x.classList.remove("active"));
    b.classList.add("active");
    setBattlePhase(parseInt(b.dataset.min, 10));
  }));
  $("#btnStart").addEventListener("click", startBattle);
  $("#btnAbort").addEventListener("click", abortBattle);
  $("#btnLink").addEventListener("click", openLinkModal);
  $("#btnLinkCancel").addEventListener("click", closeLinkModal);
  $("#btnLinkClear").addEventListener("click", () => {
    getState().battle.linkedId = null;
    save();
    renderBattleTask();
    closeLinkModal();
  });
  $("#linkList").addEventListener("click", (e) => {
    const it = e.target.closest("[data-link]");
    if(!it) return;
    getState().battle.linkedId = it.dataset.link;
    save();
    renderBattleTask();
    closeLinkModal();
    toast("Missão vinculada à batalha");
  });
  $("#modalLink").addEventListener("click", (e) => {
    if(e.target.id === "modalLink") closeLinkModal();
  });
}
