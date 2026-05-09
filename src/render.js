/**
 * Renderização — todas as funções que tocam no DOM com base no estado atual.
 * Não muta state. Apenas projeta state → DOM.
 */
import { $, $$, esc, formatDate, normalize, tagChipStyle, tagPickerStyle } from "./utils.js";
import { getState } from "./state.js";
import {
  CATS, RANKS, WEEKDAY_LABELS_SHORT, WEEKDAYS_PT_FULL,
  XP_TABLE
} from "./config.js";
import {
  levelFor, xpInLevelFor, xpNeededFor, xpRemainingFor, rankOf
} from "./ranks.js";
import {
  getCadence, isCadenceDayOf, wasDoneToday, nextCadenceDayLabel, recurringStreak
} from "./cadence.js";
import { computeXp } from "./missions.js";
import { REGIONS, refreshMap } from "./map.js";
import { getArchiveCount } from "./archive.js";

/* ---------- Estado de UI (filtros, navegação) ---------- */
export const ui = {
  currentCat: "razao",
  listFilter: "pending",
  searchQuery: "",
  activeTagFilter: null
};

/* ---------- PERFIL ---------- */
export function renderProfile(){
  const state = getState();
  const lv = levelFor(state.xp);
  const r = rankOf(lv);
  const idx = RANKS.indexOf(r) + 1;
  $("#rankTitle").textContent = r.name.toUpperCase();
  const img = $("#crestImg");
  const expected = `ranks/rank-${idx}.png`;
  if(img.dataset.cur !== expected){
    img.dataset.cur = expected;
    img.classList.remove("loaded");
    img.onload  = () => img.classList.add("loaded");
    img.onerror = () => img.classList.remove("loaded");
    img.src = expected;
  }
  $("#rankEssence").textContent = r.essence;
  $("#levelLabel").textContent  = "Nível " + lv;
  const inLv = xpInLevelFor(state.xp);
  const need = xpNeededFor(state.xp);
  $("#xpFill").style.width = Math.max(0, Math.min(100, inLv / need * 100)) + "%";
  $("#xpRemain").textContent = xpRemainingFor(state.xp) + " XP";
  $("#xpTotal").textContent = state.xp;
  $("#missionsDone").textContent = state.missionsDone;
  $("#streakLabel").textContent = state.streak;
  const taken = Object.values(state.regions).filter(v => v === "taken").length;
  $("#dominionLabel").textContent = taken + "/" + REGIONS.length;
  $("#mapDominion") && ($("#mapDominion").textContent = taken + " / " + REGIONS.length);
  $("#mapInertia")  && ($("#mapInertia").textContent  = state.inertiaDays + " dia(s) sem missão");

  // pips de Vigor
  const pips = $("#vigorPips");
  if(pips){
    pips.innerHTML = "";
    for(let i = 0; i < 3; i++){
      const s = document.createElement("span");
      if(i < state.vigor) s.className = "on";
      pips.appendChild(s);
    }
  }
}

/* ---------- CARDS DE MISSÃO ---------- */
function weightLabel(w){
  return w === "oficio" ? "Ofício" : w === "facanha" ? "Façanha" : "Empreitada";
}

export function buildMissionEl(m, opts = {}){
  const el = document.createElement("div");
  el.className = "mission"
    + (m.doneAt ? " done" : "")
    + (m.recurring ? " recurring" : "");
  el.dataset.mid = m.id;
  const xp = computeXp(m, {}, getState().vigor);
  let dueLabel;
  if(opts.dueLabelOverride){
    dueLabel = opts.dueLabelOverride;
  } else if(m.recurring){
    const c = getCadence(m);
    if(c.type === "daily") dueLabel = "Diária";
    else if(c.type === "custom" && c.days && c.days.length){
      dueLabel = c.days.map(d => WEEKDAY_LABELS_SHORT[d]).join("·");
    } else dueLabel = "Recorrente";
  } else {
    dueLabel = m.due ? formatDate(m.due) : "sem prazo";
  }
  const tagHTML = m.tag ? `<span class="tag-chip" style="${tagChipStyle(m.tag)}">${esc(m.tag)}</span>` : "";
  let statusHTML = "";
  if(m.recurring){
    if(wasDoneToday(m)){
      statusHTML = `<span class="status-chip status-done" title="Selada hoje">✓ Feita hoje</span>`;
    } else if(isCadenceDayOf(m, new Date().toISOString().slice(0,10))){
      statusHTML = `<span class="status-chip status-due" title="Pendente para hoje">● Pendente hoje</span>`;
    } else {
      statusHTML = `<span class="status-chip status-rest" title="Fora do dia agendado">↻ ${nextCadenceDayLabel(m)}</span>`;
    }
  }
  const streak = m.recurring ? recurringStreak(m) : 0;
  const countHTML = m.recurring
    ? `<span class="count-chip" title="Selos · streak">↻ ${m.count || 0}${streak > 1 ? ` · 🔥${streak}` : ""}</span>`
    : "";
  const hasNotes = !!(m.notes && m.notes.trim());
  const attCount = Array.isArray(m.attachments) ? m.attachments.length : 0;
  const noteHTML = hasNotes ? `<span class="note-chip" title="Há anotações">✎</span>` : "";
  const attHTML  = attCount  ? `<span class="att-chip"  title="Anexos">📎 ${attCount}</span>` : "";
  const overdueChip = opts.overdueChip ? `<span class="badge-due">Atrasada</span>` : "";
  const catChip = opts.showCatChip
    ? `<span class="tag-chip" style="opacity:.85">${CATS[m.cat].icon} ${CATS[m.cat].label}</span>`
    : "";
  const checkSvg = m.recurring
    ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`
    : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"   stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><polyline points="20 6 9 17 4 12"/></svg>`;
  const checkTitle = m.recurring
    ? "Selar mais uma execução"
    : (m.doneAt ? "Reabrir missão" : "Selar como concluída");
  el.innerHTML = `
    <div class="check" data-id="${m.id}" title="${checkTitle}">
      ${checkSvg}
    </div>
    <div class="body" data-detail="${m.id}" title="Abrir notas e anexos">
      <h4>${esc(m.title)}</h4>
      <div class="meta">
        <span>${dueLabel}</span>
        ${statusHTML}
        ${overdueChip}
        ${countHTML}
        ${noteHTML}
        ${attHTML}
        ${catChip}
        ${tagHTML}
      </div>
    </div>
    <div class="badge">${xp} XP · ${weightLabel(m.weight)}</div>
    <div class="actions">
      <button class="delete" data-del="${m.id}" title="Excluir missão" aria-label="Excluir">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 14h10l1-14"/></svg>
      </button>
      <button class="edit" data-edit="${m.id}" title="Editar missão" aria-label="Editar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
      </button>
    </div>
  `;
  return el;
}

/* ---------- CABEÇALHO DA SEÇÃO ---------- */
export function renderSectionHeader(){
  $("#sectionTitle").textContent = CATS[ui.currentCat].label;
  $("#sectionSub").textContent   = CATS[ui.currentCat].sub;
}

function updateMissionCounts(){
  const state = getState();
  const inCat = state.missions.filter(m => m.cat === ui.currentCat);
  const pending = inCat.filter(m => !m.doneAt).length;
  const done    = inCat.filter(m =>  !!m.doneAt).length;
  const total   = inCat.length;
  const elP = $("#countPending"), elD = $("#countDone"), elA = $("#countAll");
  if(elP) elP.textContent = pending;
  if(elD) elD.textContent = done;
  if(elA) elA.textContent = total;
}

/* ---------- LISTA POR CATEGORIA ---------- */
export function renderMissions(){
  updateMissionCounts();
  renderTagFilter();
  // banner discreto se houver missões arquivadas
  const banner = $("#archiveBanner");
  const archCount = getArchiveCount();
  if(banner){
    banner.classList.toggle("hide", archCount === 0);
    $("#archiveBannerCount").textContent = archCount;
  }

  const state = getState();
  const list = $("#missionList");
  list.innerHTML = "";
  const q = normalize(ui.searchQuery.trim());
  const arr = state.missions
    .filter(m => m.cat === ui.currentCat)
    .filter(m => ui.listFilter === "all" ? true : (ui.listFilter === "done" ? !!m.doneAt : !m.doneAt))
    .filter(m => ui.activeTagFilter ? (m.tag === ui.activeTagFilter) : true)
    .filter(m => !q ? true : (
      normalize(m.title).includes(q) ||
      normalize(m.desc || "").includes(q) ||
      normalize(m.notes || "").includes(q)
    ))
    .sort((a, b) => {
      if(!a.doneAt && !b.doneAt){
        if(a.due && b.due) return a.due.localeCompare(b.due);
        if(a.due) return -1;
        if(b.due) return 1;
        return b.createdAt.localeCompare(a.createdAt);
      }
      if(a.doneAt && b.doneAt) return b.doneAt.localeCompare(a.doneAt);
      return a.doneAt ? 1 : -1;
    });

  if(arr.length === 0){
    const reason = q || ui.activeTagFilter
      ? "Nenhum pergaminho compatível com o filtro"
      : `Nenhum pergaminho ${ui.listFilter === "done" ? "selado" : "em aberto"} aqui`;
    list.innerHTML = `<div class="empty">${reason}</div>`;
    return;
  }
  arr.forEach(m => list.appendChild(buildMissionEl(m)));
}

function renderTagFilter(){
  const wrap = $("#filterTags");
  if(!wrap) return;
  const state = getState();
  const usedInCat = new Set(
    state.missions.filter(m => m.cat === ui.currentCat && m.tag).map(m => m.tag)
  );
  const tags = state.tags.filter(t => usedInCat.has(t));
  wrap.innerHTML = "";
  if(tags.length === 0){ wrap.style.display = "none"; return; }
  wrap.style.display = "flex";
  tags.forEach(t => {
    const b = document.createElement("button");
    const sel = ui.activeTagFilter === t;
    b.className = "ftag" + (sel ? " sel" : "");
    b.textContent = t;
    b.setAttribute("style", tagPickerStyle(t, sel));
    b.addEventListener("click", () => {
      ui.activeTagFilter = sel ? null : t;
      renderMissions();
    });
    wrap.appendChild(b);
  });
  if(ui.activeTagFilter){
    const c = document.createElement("button");
    c.className = "ftag clear-all";
    c.textContent = "× limpar";
    c.addEventListener("click", () => { ui.activeTagFilter = null; renderMissions(); });
    wrap.appendChild(c);
  }
}

/* ---------- TELA HOJE ---------- */
function isToday(iso, t = new Date().toISOString().slice(0,10)){
  return !!iso && iso.slice(0, 10) === t;
}

export function renderToday(){
  const state = getState();
  const t = new Date().toISOString().slice(0, 10);

  const overdue = state.missions
    .filter(m => !m.doneAt && !m.recurring && m.due && m.due < t)
    .sort((a, b) => a.due.localeCompare(b.due));
  const dueToday = state.missions
    .filter(m => !m.doneAt && !m.recurring && m.due === t);
  const recurringOpen = state.missions
    .filter(m => m.recurring && !isToday(m.lastDoneAt, t));
  const doneToday = state.missions
    .filter(m => isToday(m.doneAt, t) || (m.recurring && isToday(m.lastDoneAt, t)));

  let xpToday = 0;
  for(const m of state.missions){
    if(isToday(m.doneAt, t) && typeof m.xpAwarded === "number") xpToday += m.xpAwarded;
    if(m.recurring && Array.isArray(m.xpHistory)){
      for(const e of m.xpHistory){ if(isToday(e.at, t)) xpToday += (e.xp || 0); }
    }
  }

  const dt = new Date(t + "T00:00:00");
  $("#todayDate").textContent = `${formatDate(t)} · ${WEEKDAYS_PT_FULL[dt.getDay()]}`;
  const pendingTotal = overdue.length + dueToday.length + recurringOpen.length;
  $("#todayPendingCount").textContent = pendingTotal;
  $("#todayDoneCount").textContent = doneToday.length;
  $("#todayXpToday").textContent = xpToday;
  $("#todayBoxOverdue").classList.toggle("urgent", overdue.length > 0);

  const list = $("#todayList");
  list.innerHTML = "";

  const renderGroup = (title, arr, extraClass = "", opts = {}) => {
    if(arr.length === 0) return;
    const wrap = document.createElement("div");
    wrap.className = "today-group " + extraClass;
    const h = document.createElement("h4");
    h.className = "today-group-title";
    h.innerHTML = `${title} <span class="badge-count">${arr.length}</span>`;
    wrap.appendChild(h);
    arr.forEach(m => wrap.appendChild(buildMissionEl(m, opts)));
    list.appendChild(wrap);
  };

  renderGroup("Atrasadas", overdue, "overdue", { overdueChip: true, showCatChip: true });
  renderGroup("Vence hoje", dueToday, "", { showCatChip: true });
  renderGroup("Recorrentes pendentes", recurringOpen, "", { showCatChip: true });
  renderGroup("Concluídas hoje", doneToday, "", { showCatChip: true });

  if(pendingTotal === 0 && doneToday.length === 0){
    list.innerHTML = `
      <div class="today-empty">
        <span class="ic">📜</span>
        Nenhum pergaminho com prazo, nem missão recorrente em aberto. Bom dia para registrar uma nova empreitada.
      </div>`;
  }

  renderWeekChart();
}

/* ---------- GRÁFICO SEMANAL ---------- */
export function renderWeekChart(){
  const host = $("#weekChartSvg");
  if(!host) return;
  const state = getState();
  const t = new Date().toISOString().slice(0, 10);
  const days = [];
  for(let i = 6; i >= 0; i--){
    const d = new Date(t + "T00:00:00");
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    days.push({
      iso,
      isToday: iso === t,
      label: WEEKDAY_LABELS_SHORT[d.getDay()],
      counts: { razao: 0, virtu: 0, armas: 0 }
    });
  }
  const indexByIso = new Map(days.map((d, i) => [d.iso, i]));
  for(const m of state.missions){
    if(!m.recurring && m.doneAt){
      const k = m.doneAt.slice(0, 10);
      const i = indexByIso.get(k);
      if(i !== undefined && days[i].counts[m.cat] !== undefined) days[i].counts[m.cat]++;
    }
    if(m.recurring && Array.isArray(m.xpHistory)){
      for(const e of m.xpHistory){
        const k = String(e.at || "").slice(0, 10);
        const i = indexByIso.get(k);
        if(i !== undefined && days[i].counts[m.cat] !== undefined) days[i].counts[m.cat]++;
      }
    }
  }

  const W = 280, H = 120;
  const padX = 8, padBottom = 18, padTop = 14;
  const slot = (W - padX * 2) / 7;
  const barW = slot - 6;
  const max = Math.max(1, ...days.map(d => d.counts.razao + d.counts.virtu + d.counts.armas));
  const usableH = H - padTop - padBottom;
  const yScale = usableH / max;

  let svg = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" aria-label="Selos por categoria, últimos 7 dias">`;
  days.forEach((d, i) => {
    const x = padX + i * slot + 3;
    const baseline = H - padBottom;
    let y = baseline;
    if(d.isToday){
      svg += `<rect class="week-bar today-marker" x="${x - 3}" y="${padTop - 2}" width="${barW + 6}" height="${baseline - padTop + 4}" rx="3"/>`;
    }
    for(const k of ["razao", "virtu", "armas"]){
      const c = d.counts[k];
      if(c <= 0) continue;
      const h = c * yScale;
      y -= h;
      svg += `<rect class="week-bar ${k}" x="${x}" y="${y.toFixed(2)}" width="${barW.toFixed(2)}" height="${h.toFixed(2)}" rx="2"/>`;
    }
    const total = d.counts.razao + d.counts.virtu + d.counts.armas;
    if(total > 0){
      svg += `<text class="week-total" x="${(x + barW / 2).toFixed(2)}" y="${(y - 3).toFixed(2)}" text-anchor="middle">${total}</text>`;
    }
    svg += `<text class="week-label ${d.isToday ? "today" : ""}" x="${(x + barW / 2).toFixed(2)}" y="${H - 4}" text-anchor="middle">${d.label}</text>`;
  });
  svg += `</svg>`;
  host.innerHTML = svg;
}

/* ---------- LISTA DE PATENTES ---------- */
export function renderRanks(){
  const ul = $("#ranksList");
  if(!ul) return;
  const lv = levelFor(getState().xp);
  ul.innerHTML = RANKS.map(r => {
    const cur = (lv >= r.min && lv <= r.max) ? "cur" : "";
    const range = r.max === Infinity ? `${r.min}+` : `${r.min}–${r.max}`;
    return `<li class="${cur}"><span class="lv">Nv ${range}</span><span class="nm">${r.name}</span></li>`;
  }).join("");
}

/* ---------- BATALHA TASK ---------- */
export function renderBattleTask(){
  const state = getState();
  const linked = state.missions.find(m => m.id === state.battle.linkedId && !m.doneAt);
  const el = $("#battleTask");
  if(!el) return;
  if(linked){
    el.innerHTML = `Batalha por <b>${esc(linked.title)}</b> — ${weightLabel(linked.weight)}${linked._pomodoroDone ? ' · <span style="color:var(--gold-soft)">Pomodoro vencido</span>' : ''}`;
  } else {
    el.textContent = "Nenhuma missão vinculada à batalha.";
  }
}

/* ---------- NAV ---------- */
export function setNav(target){
  $$(".nav button").forEach(b => b.classList.toggle("active", b.dataset.nav === target));
  [
    "screen-list", "screen-map", "screen-battle", "screen-today",
    "screen-archive", "screen-chronicles", "screen-chronicle-read"
  ].forEach(id => { const el = $("#" + id); if(el) el.classList.add("hide"); });
  if(target === "today"){
    $("#screen-today").classList.remove("hide");
    renderToday();
  } else if(target === "map"){
    $("#screen-map").classList.remove("hide");
    refreshMap(); renderRanks();
  } else if(target === "battle"){
    $("#screen-battle").classList.remove("hide");
    renderBattleTask();
  } else if(target === "archive"){
    $("#screen-archive").classList.remove("hide");
    document.dispatchEvent(new CustomEvent("principe:render-archive"));
  } else if(target === "chronicles"){
    $("#screen-chronicles").classList.remove("hide");
    document.dispatchEvent(new CustomEvent("principe:render-chronicles"));
  } else if(target === "chronicle-read"){
    $("#screen-chronicle-read").classList.remove("hide");
  } else {
    ui.currentCat = (target === "razao") ? "razao" : (target === "virtu" ? "virtu" : "armas");
    ui.activeTagFilter = null;
    renderSectionHeader();
    renderMissions();
    $("#screen-list").classList.remove("hide");
  }
}

/* ---------- RENDER ALL ---------- */
export function renderAll(){
  renderProfile();
  renderSectionHeader();
  renderMissions();
  renderRanks();
  renderBattleTask();
  refreshMap();
  if($("#screen-today") && !$("#screen-today").classList.contains("hide")){
    renderToday();
  }
}
