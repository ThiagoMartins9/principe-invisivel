/**
 * Helpers utilitários — DOM, formatação, escape, normalização, IDs.
 * Cada função é pura ou age sobre o DOM passado, sem usar globais.
 */

export const $  = (s, root = document) => root.querySelector(s);
export const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));

/**
 * ID único compatível com colunas UUID do Postgres (Supabase).
 * Usa `crypto.randomUUID()` quando disponível (browsers modernos em contexto
 * seguro). Caso indisponível, monta um UUID v4 a partir de
 * `crypto.getRandomValues`. Em último caso, faz fallback para base36 —
 * porém nesse cenário o sync remoto falhará, pois Postgres rejeita strings
 * que não correspondem ao formato UUID.
 */
export const uid = () => {
  try{
    if(typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"){
      return crypto.randomUUID();
    }
    if(typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function"){
      const b = new Uint8Array(16);
      crypto.getRandomValues(b);
      b[6] = (b[6] & 0x0f) | 0x40; // versão 4
      b[8] = (b[8] & 0x3f) | 0x80; // variante RFC 4122
      const hex = Array.from(b, x => x.toString(16).padStart(2, "0")).join("");
      return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
    }
  }catch(_){}
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
};

export const today = () => new Date().toISOString().slice(0, 10);

export function esc(s){
  return String(s || "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

export function formatDate(iso){
  if(!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/**
 * Normalização para busca textual amigável a português:
 * - lowercase
 * - remove acentos (NFD + range Unicode de marcas combinantes)
 */
export function normalize(s){
  return String(s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function formatSize(n){
  if(!n && n !== 0) return "";
  if(n < 1024) return n + " B";
  if(n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
  if(n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + " MB";
  return (n / 1024 / 1024 / 1024).toFixed(2) + " GB";
}

/**
 * Toast — mensagem efêmera no canto da tela.
 * Espera elemento #toasts no DOM.
 */
export function toast(msg){
  const host = $("#toasts");
  if(!host) return;
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  host.appendChild(el);
  setTimeout(() => el.remove(), 2900);
}

/* ---------- Cor determinística por tag (FNV-1a 32-bit) ---------- */
export function tagHue(name){
  const s = String(name || "");
  let h = 0x811c9dc5;
  for(let i = 0; i < s.length; i++){
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h % 360;
}

export function tagChipStyle(name){
  const hue = tagHue(name);
  return `background: hsla(${hue}, 65%, 55%, .14); border-color: hsla(${hue}, 70%, 60%, .55); color: hsl(${hue}, 80%, 78%);`;
}

export function tagPickerStyle(name, active){
  const hue = tagHue(name);
  return active
    ? `background: hsla(${hue}, 70%, 55%, .22); border-color: hsl(${hue}, 75%, 65%); color: hsl(${hue}, 85%, 82%);`
    : `background: hsla(${hue}, 50%, 40%, .08); border-color: hsla(${hue}, 60%, 55%, .35); color: hsl(${hue}, 60%, 80%);`;
}
