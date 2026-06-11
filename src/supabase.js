/**
 * Supabase — autenticação, sync bidirecional, Storage de anexos.
 *
 * Estratégia (P7):
 * - Pull on signin → merge POR MISSÃO (merge.js): LWW individual por
 *   updatedAt, tombstones de exclusão/arquivamento, união de xpHistory.
 *   Nada de last-write-wins de estado inteiro — edições offline feitas em
 *   dispositivos diferentes sobre missões diferentes não se perdem mais.
 * - Push debounced após cada save() local (1s); após merge, push só se o
 *   resultado difere estruturalmente do remoto (statesEquivalent) — evita
 *   loops de eco entre dispositivos via Realtime.
 * - Realtime subscribe aplica o mesmo merge.
 */
import { createClient } from "@supabase/supabase-js";
import { SB_URL, SB_KEY, SB_BUCKET } from "./config.js";
import { $, toast } from "./utils.js";
import {
  getState, setState, save, defaultState, isApplyingRemote, setApplyingRemote
} from "./state.js";
import { migrate } from "./state.js";
import { askConfirm } from "./modal.js";
import { renderAll } from "./render.js";
import { mergeStates, statesEquivalent } from "./merge.js";
import { loadArchive, saveArchive } from "./archive.js";

let sb = null;
let sbUser = null;
let sbChannel = null;
let _pushTimer = null;

export function isLogged(){ return !!sbUser; }
export function getSbUser(){ return sbUser; }
export function getSb(){ return sb; }

export function sbInit(){
  if(!sb){
    sb = createClient(SB_URL, SB_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        storageKey: "principe-sb-auth",
        detectSessionInUrl: false
      }
    });
    sb.auth.getSession().then(({ data }) => {
      if(data?.session?.user) sbOnAuthEnter(data.session.user);
      else setSyncPill("offline", "deslogado");
    });
    sb.auth.onAuthStateChange((event, session) => {
      if(event === "SIGNED_IN" && session?.user) sbOnAuthEnter(session.user);
      if(event === "SIGNED_OUT") sbOnAuthLeave();
    });
    window.addEventListener("online",  () => { if(sbUser) setSyncPill("online", "sincronizado"); });
    window.addEventListener("offline", () => { setSyncPill("offline", "sem rede"); });
  }
  return sb;
}

export function setSyncPill(stateName, label){
  const el = $("#syncPill");
  if(!el) return;
  el.dataset.state = stateName;
  el.querySelector(".sync-label").textContent = label || stateName;
}

function _err(prefix, err){
  const msg = err?.message || String(err || "erro desconhecido");
  toast(`${prefix}: ${msg}`);
  setSyncPill("error", "erro");
  return null;
}

/* ---------- AUTH ---------- */
export async function sbSignIn(email, password){
  if(!sb) return _err("Auth", new Error("SDK não carregado"));
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if(error) return _err("Login", error);
  return data.user;
}

export async function sbSignUp(email, password){
  if(!sb) return _err("Auth", new Error("SDK não carregado"));
  const { data, error } = await sb.auth.signUp({ email, password });
  if(error) return _err("Cadastro", error);
  if(data.user && !data.session){
    toast("Confira seu e-mail para confirmar a conta");
    return null;
  }
  return data.user;
}

export async function sbSignOut(){
  if(!sb || !sbUser) return;
  if(sbChannel){ sb.removeChannel(sbChannel); sbChannel = null; }
  await sb.auth.signOut();
}

async function sbOnAuthEnter(user){
  sbUser = user;
  setSyncPill("syncing", "puxando");
  await sbPullAndMerge();
  sbSubscribeRealtime();
  setSyncPill("online", "sincronizado");
  document.dispatchEvent(new CustomEvent("principe:auth-changed"));
}

function sbOnAuthLeave(){
  sbUser = null;
  if(sbChannel){ sb.removeChannel(sbChannel); sbChannel = null; }
  setSyncPill("offline", "deslogado");
  document.dispatchEvent(new CustomEvent("principe:auth-changed"));
}

/* ---------- PULL / PUSH ---------- */
async function sbPullAndMerge(){
  if(!sb || !sbUser) return;
  try{
    const { data, error } = await sb.from("chronicles")
      .select("payload, schema_version, updated_at")
      .eq("user_id", sbUser.id)
      .maybeSingle();
    if(error) return _err("Pull", error);
    if(!data){ await sbPushNow(); return; }
    const applied = await applyRemotePayload(data.payload || {}, { announce: true });
    if(applied === null) return; // erro já tratado
  } catch(e){ _err("Pull", e); }
}

/**
 * P7 — aplica um payload remoto via merge por missão.
 * - Local "virgem" (sem missões, XP e tombstones): adota o remoto direto.
 * - Caso contrário: mergeStates() resolve missão a missão; aplica localmente
 *   apenas se algo mudou; arquiva no IDB as missões cujo tombstone remoto é
 *   "archived"; push de volta apenas se o merge difere do remoto.
 * @returns {Promise<boolean|null>} true se o estado local mudou.
 */
async function applyRemotePayload(remote, { announce = false } = {}){
  try{
    const local = getState();
    const localEmpty =
      (local.missions || []).length === 0 &&
      (local.xp || 0) === 0 &&
      Object.keys(local.deletedIds || {}).length === 0;

    if(localEmpty){
      setApplyingRemote(true);
      setState({ ...defaultState(), ...remote });
      save();
      migrate();
      renderAll();
      setApplyingRemote(false);
      if(announce) toast("Crônica restaurada do servidor");
      return true;
    }

    const { state: merged, toArchive } = mergeStates(local, remote);
    const changedLocal  = !statesEquivalent(merged, local);
    const changedRemote = !statesEquivalent(merged, remote);

    if(changedLocal){
      setApplyingRemote(true);
      setState({ ...defaultState(), ...merged });
      save();
      migrate();
      renderAll();
      setApplyingRemote(false);
    }

    // Arquivamento propagado de outro dispositivo → move para o IDB local.
    if(toArchive.length){
      try{
        const arch = await loadArchive();
        const have = new Set(arch.map(m => m.id));
        const add = toArchive.filter(m => !have.has(m.id));
        if(add.length) await saveArchive(arch.concat(add));
      }catch(_){ /* IDB indisponível — missões seguem protegidas pelo tombstone */ }
    }

    if(changedRemote) await sbPushNow();
    return changedLocal;
  } catch(e){ _err("Merge", e); return null; }
}

async function sbPushNow(){
  if(!sb || !sbUser) return;
  setSyncPill("syncing", "enviando");
  const state = getState();
  state._updatedAt = new Date().toISOString();
  try{
    save();
    const { error } = await sb.from("chronicles").upsert({
      user_id: sbUser.id,
      payload: state,
      schema_version: state.schemaVersion || 7,
      updated_at: state._updatedAt
    }, { onConflict: "user_id" });
    if(error) return _err("Push", error);
    setSyncPill("online", "sincronizado");
  } catch(e){ _err("Push", e); }
}

export function schedulePush(){
  if(isApplyingRemote() || !sbUser || !sb) return;
  clearTimeout(_pushTimer);
  setSyncPill("syncing", "enviando");
  _pushTimer = setTimeout(() => { _pushTimer = null; sbPushNow(); }, 1000);
}

/* ---------- REALTIME ---------- */
function sbSubscribeRealtime(){
  if(!sb || !sbUser) return;
  if(sbChannel){ sb.removeChannel(sbChannel); sbChannel = null; }
  sbChannel = sb.channel(`chronicle-${sbUser.id}`)
    .on("postgres_changes", {
      event: "UPDATE",
      schema: "public",
      table: "chronicles",
      filter: `user_id=eq.${sbUser.id}`
    }, (payload) => {
      if(_pushTimer) return; // ignora eco do próprio push debounced
      const remote = payload.new?.payload;
      if(!remote) return;
      // P7: merge por missão também no realtime; statesEquivalent corta loops
      // (eco convergido ⇒ merged ≡ local ≡ remoto ⇒ nem aplica nem re-pusha).
      applyRemotePayload(remote);
    })
    .subscribe();
}

/* ---------- STORAGE: anexos ---------- */
export async function sbUploadAttachment(missionId, file, attId, onProgress){
  if(!sb || !sbUser) return null;
  const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(0, 80);
  const path = `${sbUser.id}/${missionId}/${attId}-${safeName}`;
  if(typeof onProgress === "function") onProgress(10);
  const { error } = await sb.storage.from(SB_BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || "application/octet-stream"
  });
  if(error){ _err("Upload", error); return null; }
  if(typeof onProgress === "function") onProgress(80);
  const { error: e2 } = await sb.from("attachments").insert({
    id: attId,
    user_id: sbUser.id,
    mission_id: missionId,
    storage_path: path,
    file_name: file.name,
    mime_type: file.type || "application/octet-stream",
    size_bytes: file.size
  });
  if(e2){ _err("Catálogo", e2); return null; }
  if(typeof onProgress === "function") onProgress(100);
  return path;
}

export async function sbDeleteAttachment(attId, storagePath){
  if(!sb || !sbUser) return;
  if(storagePath){
    const { error } = await sb.storage.from(SB_BUCKET).remove([storagePath]);
    if(error) console.warn("Storage remove error:", error);
  }
  const { error: e2 } = await sb.from("attachments").delete().eq("id", attId);
  if(e2) console.warn("Catalog delete error:", e2);
}

export async function sbDownloadAttachment(storagePath){
  if(!sb || !sbUser || !storagePath) return null;
  const { data, error } = await sb.storage.from(SB_BUCKET).download(storagePath);
  if(error){ _err("Download", error); return null; }
  return data;
}
