/**
 * Supabase — autenticação, sync bidirecional, Storage de anexos.
 *
 * Estratégia:
 * - Pull on signin (mais recente vence por updated_at)
 * - Push debounced após cada save() local (1s)
 * - Realtime subscribe para receber updates de outros dispositivos
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

    const remote = data.payload || {};
    const remoteUpd = data.updated_at ? Date.parse(data.updated_at) : 0;
    const local = getState();
    const localUpd = local._updatedAt ? Date.parse(local._updatedAt) : 0;
    const localEmpty = (local.missions || []).length === 0 && (local.xp || 0) === 0;

    if(localEmpty || remoteUpd > localUpd){
      setApplyingRemote(true);
      setState({ ...defaultState(), ...remote });
      save();
      migrate();
      renderAll();
      setApplyingRemote(false);
      toast("Crônica restaurada do servidor");
    } else if(localUpd > remoteUpd){
      await sbPushNow();
    }
  } catch(e){ _err("Pull", e); }
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
      if(_pushTimer) return; // ignora eco
      const remote = payload.new?.payload;
      const remoteUpd = payload.new?.updated_at ? Date.parse(payload.new.updated_at) : 0;
      const local = getState();
      const localUpd  = local._updatedAt ? Date.parse(local._updatedAt) : 0;
      if(remote && remoteUpd > localUpd){
        setApplyingRemote(true);
        setState({ ...defaultState(), ...remote });
        save();
        migrate();
        renderAll();
        setApplyingRemote(false);
        toast("Atualizado de outro dispositivo");
      }
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
