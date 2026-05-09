/**
 * Wrapper minimalista de IndexedDB usado para:
 *  - Cache de anexos (key "att:<id>" → dataURL)
 *  - File System Access dir handle (key "saveDirHandle")
 *  - Arquivamento de missões antigas (key "archive:missions" → array)
 */
import { IDB_NAME, IDB_STORE } from "./config.js";

export function idbOpen(){
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(IDB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(IDB_STORE);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function idbGet(key){
  try{
    const db = await idbOpen();
    return await new Promise((res) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const rq = tx.objectStore(IDB_STORE).get(key);
      rq.onsuccess = () => res(rq.result);
      rq.onerror   = () => res(null);
    });
  }catch(e){ return null; }
}

export async function idbSet(key, val){
  try{
    const db = await idbOpen();
    return await new Promise((res) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(val, key);
      tx.oncomplete = () => res(true);
      tx.onerror    = () => res(false);
    });
  }catch(e){ return false; }
}

export async function idbDel(key){
  try{
    const db = await idbOpen();
    return await new Promise((res) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).delete(key);
      tx.oncomplete = () => res(true);
      tx.onerror    = () => res(false);
    });
  }catch(e){ return false; }
}
