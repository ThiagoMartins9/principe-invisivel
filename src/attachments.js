/**
 * Anexos por missão — IndexedDB local + Storage remoto (quando logado).
 * Estratégia: arquivos ≤ 25 MB cacheiam no IDB para acesso offline imediato;
 * arquivos > 25 MB só vivem no Storage. Logado, todo arquivo sobe pro Storage.
 */
import { $, esc, formatSize, toast, uid } from "./utils.js";
import { getState, save } from "./state.js";
import { ATT_MAX_SIZE, ATT_MAX_TOTAL, ATT_CACHE_LOCAL_LIMIT } from "./config.js";
import { idbGet, idbSet, idbDel } from "./idb.js";
import { askConfirm } from "./modal.js";
import {
  isLogged, sbUploadAttachment, sbDownloadAttachment, sbDeleteAttachment, setSyncPill
} from "./supabase.js";

let detailId = null;
let detailDirtyTimer = null;

export function getDetailId(){ return detailId; }

function readAsDataURL(file){
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload  = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export function openDetail(id){
  const m = getState().missions.find(x => x.id === id);
  if(!m) return;
  detailId = id;
  if(typeof m.notes !== "string") m.notes = "";
  if(!Array.isArray(m.attachments)) m.attachments = [];
  $("#detailTitle").value = m.title || "";
  $("#detailNotes").value = m.notes;
  renderDetailMeta(m);
  renderDetailAttachments(m);
  $("#detailStatus").textContent = "Salvo";
  $("#detailStatus").classList.remove("dirty");
  $("#modalDetail").classList.add("show");
  setTimeout(() => $("#detailNotes").focus(), 60);
}

export function closeDetail(){
  if(detailDirtyTimer){
    clearTimeout(detailDirtyTimer);
    detailDirtyTimer = null;
    persistDetail();
  }
  detailId = null;
  $("#modalDetail").classList.remove("show");
}

function renderDetailMeta(m){
  const pieces = [];
  pieces.push(m.weight === "oficio" ? "Ofício" : m.weight === "facanha" ? "Façanha" : "Empreitada");
  if(m.recurring) pieces.push("Recorrente");
  if(m.due) pieces.push("Prazo: " + (m.due.split("-").reverse().join("/")));
  if(m.tag) pieces.push(esc(m.tag));
  pieces.push(m.doneAt ? "Concluída" : "Pendente");
  $("#detailMeta").innerHTML = pieces.map(p => `<span>${p}</span>`).join('<span style="opacity:.4">·</span>');
}

export function renderDetailAttachments(m){
  const list = $("#detailList");
  list.innerHTML = "";
  const arr = Array.isArray(m.attachments) ? m.attachments : [];
  if(arr.length === 0) return;
  for(const a of arr){
    const el = document.createElement("div");
    el.className = "attach";
    el.dataset.attId = a.id;
    const origin = a.storage_path
      ? `<span title="Sincronizado na nuvem" style="color:var(--emerald);font-size:11px">☁</span>`
      : `<span title="Apenas neste dispositivo" style="color:var(--muted-2);font-size:11px">⌂</span>`;
    const showProgress = !a.storage_path && isLogged();
    const progressHTML = showProgress ? `<span class="progress"><i></i></span>` : "";
    el.innerHTML = `
      <span class="ic">${attachIcon(a)}</span>
      <span class="nm" title="${esc(a.name)}">${esc(a.name)}</span>
      ${progressHTML}
      <span class="sz">${origin} ${formatSize(a.size)}</span>
      <span class="acts">
        <button data-att-dl="${a.id}" title="Baixar / abrir" aria-label="Baixar">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/></svg>
        </button>
        <button data-att-rm="${a.id}" title="Remover anexo" aria-label="Remover">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12"/><path d="M18 6L6 18"/></svg>
        </button>
      </span>
    `;
    list.appendChild(el);
  }
}

function attachIcon(a){
  const t = String(a.type || "").toLowerCase();
  const n = String(a.name || "").toLowerCase();
  if(t.startsWith("image/")) return "🖼️";
  if(t === "application/pdf" || n.endsWith(".pdf")) return "📕";
  if(t.startsWith("audio/")) return "🎵";
  if(t.startsWith("video/")) return "🎬";
  if(/\.(doc|docx)$/.test(n)) return "📘";
  if(/\.(xls|xlsx|csv)$/.test(n)) return "📗";
  if(/\.(zip|rar|7z)$/.test(n)) return "🗜️";
  return "📄";
}

export function setDetailDirty(){
  $("#detailStatus").textContent = "Alterações…";
  $("#detailStatus").classList.add("dirty");
  clearTimeout(detailDirtyTimer);
  const lockedId = detailId;
  detailDirtyTimer = setTimeout(() => {
    persistDetail(lockedId);
    detailDirtyTimer = null;
    $("#detailStatus").textContent = "Salvo";
    $("#detailStatus").classList.remove("dirty");
  }, 400);
}

function persistDetail(expectedId){
  if(!detailId) return;
  if(typeof expectedId !== "undefined" && expectedId !== detailId) return;
  const m = getState().missions.find(x => x.id === detailId);
  if(!m) return;
  const newTitle = $("#detailTitle").value.trim();
  if(newTitle) m.title = newTitle;
  m.notes = $("#detailNotes").value;
  save();
  document.dispatchEvent(new CustomEvent("principe:state-changed"));
}

export async function attachFiles(files){
  if(!detailId || !files || !files.length) return;
  const m = getState().missions.find(x => x.id === detailId);
  if(!m) return;
  if(!Array.isArray(m.attachments)) m.attachments = [];
  let totalSize = m.attachments.reduce((s, a) => s + (a.size || 0), 0);
  let added = 0;
  const useCloud = isLogged();
  for(const f of Array.from(files)){
    if(f.size > ATT_MAX_SIZE){
      toast(`"${f.name}" excede ${Math.round(ATT_MAX_SIZE / 1024 / 1024)} MB e foi ignorado`);
      continue;
    }
    if(totalSize + f.size > ATT_MAX_TOTAL){
      toast(`Limite de ${Math.round(ATT_MAX_TOTAL / 1024 / 1024)} MB por missão alcançado`);
      break;
    }
    try{
      const id = uid();
      const meta = {
        id, name: f.name, size: f.size, type: f.type || "",
        addedAt: new Date().toISOString()
      };
      if(f.size <= ATT_CACHE_LOCAL_LIMIT){
        try{
          const dataUrl = await readAsDataURL(f);
          await idbSet("att:" + id, dataUrl);
          meta.cached = true;
        }catch(_){}
      }
      if(useCloud){
        m.attachments.push(meta);
        totalSize += f.size;
        added++;
        renderDetailAttachments(m);
        const path = await sbUploadAttachment(m.id, f, id, (pct) => {
          const item = $(`.attach[data-att-id="${id}"] .progress > i`);
          if(item) item.style.width = pct + "%";
        });
        if(!path){
          m.attachments = m.attachments.filter(a => a.id !== id);
          await idbDel("att:" + id).catch(() => {});
          added--; totalSize -= f.size;
          continue;
        }
        meta.storage_path = path;
      } else {
        if(!meta.cached){
          toast(`Sem login para anexos > ${Math.round(ATT_CACHE_LOCAL_LIMIT / 1024 / 1024)} MB`);
          continue;
        }
        m.attachments.push(meta);
        totalSize += f.size;
        added++;
      }
    }catch(err){
      console.warn(err);
      toast(`Falha ao anexar "${f.name}"`);
    }
  }
  if(added > 0){
    save();
    renderDetailAttachments(m);
    document.dispatchEvent(new CustomEvent("principe:state-changed"));
    toast(added === 1 ? "Anexo registrado" : `${added} anexos registrados`);
  }
}

export async function downloadAttachment(attId){
  if(!detailId) return;
  const m = getState().missions.find(x => x.id === detailId);
  if(!m) return;
  const a = (m.attachments || []).find(x => x.id === attId);
  if(!a) return;
  let blob = null;
  const dataUrl = await idbGet("att:" + attId);
  if(dataUrl){
    try{
      const res = await fetch(dataUrl);
      blob = await res.blob();
    }catch(_){}
  }
  if(!blob && a.storage_path && isLogged()){
    setSyncPill("syncing", "baixando");
    blob = await sbDownloadAttachment(a.storage_path);
    setSyncPill("online", "sincronizado");
  }
  if(!blob){ toast("Anexo indisponível offline"); return; }
  try{
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = a.name || ("anexo-" + attId);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }catch(err){
    toast("Falha ao iniciar download");
  }
}

export async function removeAttachment(attId){
  if(!detailId) return;
  const m = getState().missions.find(x => x.id === detailId);
  if(!m) return;
  const a = (m.attachments || []).find(x => x.id === attId);
  const ok = await askConfirm(
    "Remover Anexo?",
    "O arquivo será removido desta missão (do dispositivo e da nuvem, se sincronizado).",
    { confirmText: "Remover", cancelText: "Manter", danger: true }
  );
  if(!ok) return;
  m.attachments = (m.attachments || []).filter(x => x.id !== attId);
  await idbDel("att:" + attId).catch(() => {});
  if(a && a.storage_path && isLogged()){
    sbDeleteAttachment(attId, a.storage_path).catch(() => {});
  }
  save();
  renderDetailAttachments(m);
  document.dispatchEvent(new CustomEvent("principe:state-changed"));
}

/** Função de cleanup chamada por deleteMission para limpar anexos órfãos. */
export async function removeAttachmentFiles(a){
  await idbDel("att:" + a.id).catch(() => {});
  if(a.storage_path && isLogged()){
    await sbDeleteAttachment(a.id, a.storage_path).catch(() => {});
  }
}
