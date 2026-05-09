/**
 * Import/export da Crônica via File System Access API com fallback de download.
 * Suporta Crônicas cifradas (P2.5) — detecta envelope e pede senha.
 */
import { getState, setState, save, defaultState, migrate } from "./state.js";
import { askConfirm, askPassword } from "./modal.js";
import { encryptStateJson, decryptEnvelope, isEncryptedEnvelope } from "./crypto.js";
import { idbGet, idbSet } from "./idb.js";
import { SAVE_DIR_KEY } from "./config.js";
import { $, esc, toast } from "./utils.js";
import { renderAll } from "./render.js";

async function ensureSaveDir(forcePick = false){
  if(!('showDirectoryPicker' in window)) return null;
  let handle = forcePick ? null : await idbGet(SAVE_DIR_KEY);
  if(handle){
    let perm = await handle.queryPermission({ mode: "readwrite" });
    if(perm !== "granted") perm = await handle.requestPermission({ mode: "readwrite" });
    if(perm === "granted") return handle;
  }
  try{
    handle = await window.showDirectoryPicker({
      id: "principe-saves",
      mode: "readwrite",
      startIn: "documents"
    });
    await idbSet(SAVE_DIR_KEY, handle);
    toast(`Pasta de saves: ${handle.name}`);
    return handle;
  }catch(e){
    return null;
  }
}

export function applyChronicleFile(file){
  const r = new FileReader();
  r.onload = async () => {
    try{
      let obj = JSON.parse(r.result);
      if(!obj || typeof obj !== "object") throw new Error("Arquivo inválido");
      if(isEncryptedEnvelope(obj)){
        let plaintext = null;
        for(let attempt = 0; attempt < 3; attempt++){
          const pwd = await askPassword(
            "Crônica Cifrada",
            "Esta Crônica está cifrada. Forneça a senha para restaurar.",
            { confirmText: "Decifrar e Restaurar", placeholder: "senha…" }
          );
          if(pwd === null) return;
          plaintext = await decryptEnvelope(obj, pwd);
          if(plaintext) break;
          toast("Senha incorreta");
        }
        if(!plaintext){ toast("Restauração abortada"); return; }
        obj = JSON.parse(plaintext);
      }
      setState({ ...defaultState(), ...obj });
      save();
      migrate();
      renderAll();
      toast("Crônica restaurada");
    }catch(err){
      askConfirm("Arquivo Inválido", `Não foi possível ler a Crônica: <b>${esc(err.message || String(err))}</b>`,
        { confirmText: "Entendi", cancelText: "Fechar" });
    }
  };
  r.readAsText(file);
}

export async function importSave(){
  if('showOpenFilePicker' in window){
    try{
      const opts = {
        id: "principe-saves",
        multiple: false,
        types: [{ description: "Crônica (JSON)", accept: { "application/json": [".json"] } }]
      };
      const dir = await idbGet(SAVE_DIR_KEY);
      if(dir){
        let perm = await dir.queryPermission({ mode: "read" });
        if(perm !== "granted") perm = await dir.requestPermission({ mode: "read" });
        if(perm === "granted") opts.startIn = dir;
      }
      const [fh] = await window.showOpenFilePicker(opts);
      const file = await fh.getFile();
      applyChronicleFile(file);
      return;
    }catch(e){
      if(e?.name === "AbortError") return;
      console.warn("FSAA falhou, fallback input:", e);
    }
  }
  $("#fileImport").click();
}

export async function exportSave(forcePick = false, withPassword = false){
  let json = JSON.stringify(getState(), null, 2);
  let suffix = "";
  if(withPassword){
    if(!crypto?.subtle){ toast("WebCrypto indisponível neste navegador"); return; }
    const pwd = await askPassword(
      "Cifrar Crônica",
      "A Crônica será cifrada com <b>AES-256-GCM</b> antes de salvar. Sem a senha, não há recuperação.",
      { confirmText: "Cifrar e Exportar", placeholder: "mín. 8 caracteres" }
    );
    if(pwd === null) return;
    if(pwd.length < 8){ toast("Senha curta — mínimo 8 caracteres"); return; }
    try{
      const env = await encryptStateJson(json, pwd);
      json = JSON.stringify(env, null, 2);
      suffix = "-cifrada";
    }catch(e){ toast("Falha ao cifrar: " + (e?.message || e)); return; }
  }
  const blob = new Blob([json], { type: "application/json" });
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  const name = `cronica${suffix}-${stamp}.json`;

  const dir = await ensureSaveDir(forcePick);
  if(dir){
    try{
      const fh = await dir.getFileHandle(name, { create: true });
      const w  = await fh.createWritable();
      await w.write(blob); await w.close();
      const latestName = withPassword ? "cronica-latest-cifrada.json" : "cronica-latest.json";
      const fhL = await dir.getFileHandle(latestName, { create: true });
      const wL  = await fhL.createWritable();
      await wL.write(blob); await wL.close();
      toast(`Crônica${withPassword ? " cifrada" : ""} salva em ${dir.name}/`);
      return;
    }catch(e){
      console.warn("Falha ao gravar pasta, fallback download:", e);
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
  toast(`Crônica${withPassword ? " cifrada" : ""} exportada (download)`);
}
