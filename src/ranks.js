/**
 * Patentes e curva de XP.
 *
 * Funções puras que recebem `state` (ou apenas xp) — facilita testar.
 * O arquivo state.js delega para cá ao expor `level()`/`xpInLevel()` ao app.
 */
import { RANKS, XP_TABLE, XP_BASE, XP_GROWTH } from "./config.js";

export { RANKS, XP_TABLE };

/** Retorna o nível dado o XP acumulado. */
export function levelFor(xp){
  for(let n = 1; n < XP_TABLE.length; n++){
    if(XP_TABLE[n + 1] === undefined || xp < XP_TABLE[n + 1]) return n;
  }
  return XP_TABLE.length - 1;
}

/** XP gasto no nível atual. */
export function xpInLevelFor(xp){
  return xp - XP_TABLE[levelFor(xp)];
}

/** XP necessário para terminar o nível atual. */
export function xpNeededFor(xp){
  const lv = levelFor(xp);
  return XP_BASE + Math.floor((lv - 1) * XP_GROWTH);
}

/** Quanto falta para o próximo nível. */
export function xpRemainingFor(xp){
  return XP_TABLE[levelFor(xp) + 1] - xp;
}

/** Patente que cobre um determinado nível. */
export function rankOf(lv){
  return RANKS.find(r => lv >= r.min && lv <= r.max) || RANKS[RANKS.length - 1];
}
