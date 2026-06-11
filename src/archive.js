/**
 * Arquivamento de missões antigas (P3.6).
 *
 * Estratégia:
 *  - Missões ÚNICAS (não recorrentes) concluídas há mais de ARCHIVE_AFTER_DAYS
 *    são movidas de state.missions para um array no IndexedDB.
 *  - Recorrentes nunca arquivam (são por natureza recorrentes).
 *  - O estado em localStorage continua compacto. Auto-arquivamento roda
 *    no init() e pode ser disparado manualmente pelo usuário.
 *  - Tela de Arquivo permite buscar e restaurar.
 */
import { ARCHIVE_AFTER_DAYS, IDB_ARCHIVE_KEY } from "./config.js";
import { idbGet, idbSet } from "./idb.js";
import { getState, save } from "./state.js";
import { $, esc, formatDate, normalize, toast } from "./utils.js";

let _archiveCache = null; // cache em memória do array completo

export async function loadArchive(){
  if(_archiveCache !== null) return _archiveCache;
  const arr = await idbGet(IDB_ARCHIVE_KEY);
  _archiveCache = Array.isArray(arr) ? arr : [];
  return _archiveCache;
}

export async function saveArchive(arr){
  _archiveCache = arr;
  await idbSet(IDB_ARCHIVE_KEY, arr);
}

/** Quantidade de missões arquivadas (síncrono — usa cache). */
export function getArchiveCount(){
  return _archiveCache ? _archiveCache.length : 0;
}

/**
 * Verifica e arquiva missões elegíveis. Pura no sentido de ter uma versão
 * sem efeitos para teste (`splitForArchive`).
 */
export function splitForArchive(missions, cutoffISO){
  const cutoff = new Date(cutoffISO + "T00:00:00").getTime();
  const toArchive = [];
  const toKeep = [];
  for(const m of missions){
    if(m.recurring){ toKeep.push(m); continue; }
    if(!m.doneAt){ toKeep.push(m); continue; }
    const doneTs = Date.parse(m.doneAt);
    if(isNaN(doneTs)){ toKeep.push(m); continue; }
    if(doneTs < cutoff) toArchive.push(m);
    else toKeep.push(m);
  }
  return { toArchive, toKeep };
}

export function cutoffDate(daysAgo = ARCHIVE_AFTER_DAYS, _now = new Date()){
  const d = new Date(_now);
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

/** Roda no init: move missões antigas para IDB e remove do state. */
export async function autoArchive(){
  const state = getState();
  await loadArchive();
  const cutoff = cutoffDate();
  const { toArchive, toKeep } = splitForArchive(state.missions, cutoff);
  if(toArchive.length === 0) return 0;
  const next = (_archiveCache || []).concat(toArchive);
  // mais antigas no fim — útil para listagem reversa
  await saveArchive(next);
  state.missions = toKeep;
  // P7: tombstones "archived" propagam o arquivamento aos outros dispositivos.
  if(!state.deletedIds || typeof state.deletedIds !== "object") state.deletedIds = {};
  const now = new Date().toISOString();
  for(const m of toArchive){
    state.deletedIds[m.id] = { at: now, reason: "archived" };
  }
  save();
  return toArchive.length;
}

/** Restaura missão do arquivo de volta para state.missions. */
export async function restoreFromArchive(id){
  await loadArchive();
  const idx = _archiveCache.findIndex(m => m.id === id);
  if(idx < 0) return false;
  const [m] = _archiveCache.splice(idx, 1);
  await saveArchive(_archiveCache);
  const state = getState();
  // P7: restaurar derruba o tombstone; o carimbo novo vence cópias remotas dele.
  if(state.deletedIds) delete state.deletedIds[m.id];
  m.updatedAt = new Date().toISOString();
  state.missions.unshift(m);
  save();
  document.dispatchEvent(new CustomEvent("principe:state-changed"));
  return true;
}

/** Remove permanentemente do arquivo (sem opção de retorno). */
export async function purgeFromArchive(id){
  await loadArchive();
  _archiveCache = _archiveCache.filter(m => m.id !== id);
  await saveArchive(_archiveCache);
}

/* ---------- TELA DE ARQUIVO ---------- */
let _archiveSearch = "";

export async function renderArchive(){
  await loadArchive();
  const list = $("#archiveList");
  const empty = $("#archiveEmpty");
  if(!list) return;
  const q = normalize(_archiveSearch.trim());
  const arr = (_archiveCache || [])
    .filter(m => !q || normalize(m.title).includes(q) || normalize(m.desc || "").includes(q))
    .sort((a, b) => (b.doneAt || "").localeCompare(a.doneAt || ""));
  if(arr.length === 0){
    list.innerHTML = "";
    empty.classList.remove("hide");
    empty.textContent = q ? "Nenhum pergaminho compatível com a busca." : "A arca ainda está vazia.";
    return;
  }
  empty.classList.add("hide");
  list.innerHTML = "";
  for(const m of arr){
    const el = document.createElement("div");
    el.className = "mission";
    el.innerHTML = `
      <div class="check" style="background:var(--gold-deep);color:var(--bg);border-color:var(--gold-deep)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><polyline points="20 6 9 17 4 12"/></svg>
      </div>
      <div class="body">
        <h4>${esc(m.title)}</h4>
        <div class="meta">
          <span>Selada em ${formatDate((m.doneAt || "").slice(0, 10))}</span>
          ${m.tag ? `<span class="tag-chip">${esc(m.tag)}</span>` : ""}
        </div>
      </div>
      <div class="actions">
        <button data-restore="${m.id}" title="Restaurar para a lista" aria-label="Restaurar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>
        </button>
      </div>
    `;
    list.appendChild(el);
  }
}

export function bindArchiveEvents(){
  $("#archiveSearch")?.addEventListener("input", (e) => {
    _archiveSearch = e.target.value || "";
    renderArchive();
  });
  $("#archiveList")?.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-restore]");
    if(!btn) return;
    const id = btn.dataset.restore;
    const ok = await restoreFromArchive(id);
    if(ok){
      toast("Pergaminho restaurado");
      renderArchive();
    }
  });
  $("#archiveBack")?.addEventListener("click", () => {
    document.dispatchEvent(new CustomEvent("principe:goto-nav", { detail: { target: "razao" } }));
  });
  $("#archiveBannerOpen")?.addEventListener("click", () => {
    document.dispatchEvent(new CustomEvent("principe:goto-nav", { detail: { target: "archive" } }));
  });
  $("#btnArchive")?.addEventListener("click", () => {
    document.dispatchEvent(new CustomEvent("principe:goto-nav", { detail: { target: "archive" } }));
  });
  $("#archiveExport")?.addEventListener("click", async () => {
    await loadArchive();
    const json = JSON.stringify(_archiveCache, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `principe-arquivo-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast("Arquivo exportado");
  });

  // Listener para o evento principe:render-archive (disparado pelo setNav)
  document.addEventListener("principe:render-archive", renderArchive);
}
