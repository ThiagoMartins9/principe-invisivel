/**
 * Cifragem opcional da Crônica exportada — AES-256-GCM com PBKDF2-SHA256.
 * 200.000 iterações, salt+iv aleatórios por export.
 */
const _PRINCIPE_ENC_TAG = "_principeEncrypted";

const _b64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const _ub64 = (s) => Uint8Array.from(atob(s), c => c.charCodeAt(0));

async function deriveKey(password, salt, iterations){
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptStateJson(plaintext, password){
  if(!crypto?.subtle) throw new Error("WebCrypto indisponível");
  const iter = 200000;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv   = crypto.getRandomValues(new Uint8Array(12));
  const key  = await deriveKey(password, salt, iter);
  const ct   = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext)
  );
  return {
    [_PRINCIPE_ENC_TAG]: true,
    v: 1,
    kdf: "PBKDF2-SHA256",
    iter,
    salt: _b64(salt),
    iv:   _b64(iv),
    ct:   _b64(ct),
    note: "O Príncipe Invisível — Crônica cifrada (AES-256-GCM)"
  };
}

export async function decryptEnvelope(env, password){
  if(!env || !env[_PRINCIPE_ENC_TAG]) return null;
  try{
    const salt = _ub64(env.salt);
    const iv   = _ub64(env.iv);
    const ct   = _ub64(env.ct);
    const key  = await deriveKey(password, salt, env.iter || 200000);
    const pt   = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
    return new TextDecoder().decode(pt);
  } catch(e){
    return null;
  }
}

export function isEncryptedEnvelope(obj){
  return !!(obj && obj[_PRINCIPE_ENC_TAG]);
}
