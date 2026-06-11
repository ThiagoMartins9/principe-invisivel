/**
 * O Príncipe Invisível — Constantes e configuração de domínio.
 *
 * Funções puras e dados imutáveis. Nada que dependa do DOM ou de estado
 * global vive aqui — assim os testes podem importar tudo sem efeitos.
 */

/* ---------- Patentes (rank ladder) ---------- */
export const RANKS = [
  { min: 1,  max: 5,        name: "O Sem Nome",           essence: "Você existe, mas ninguém sabe ainda" },
  { min: 6,  max: 12,       name: "O Observador",         essence: "Você vê tudo, fala pouco, registra tudo" },
  { min: 13, max: 22,       name: "O Emissário",          essence: "Você já circula — as mensagens passam por você" },
  { min: 23, max: 35,       name: "O Intrigante",         essence: "Você move peças que outros não percebem" },
  { min: 36, max: 48,       name: "O Consigliere",        essence: "O poder real sem o cargo real" },
  { min: 49, max: 60,       name: "O Arquiteto",          essence: "Você não jogou o jogo — você desenhou o tabuleiro" },
  { min: 61, max: Infinity, name: "O Príncipe Invisível", essence: "A corte inteira serve a quem ninguém vê" }
];

/* ---------- Curva de XP (P2.2) ---------- */
// Custo do nível n→n+1 = 50 + floor((n-1) * 1.5).
// L1→L2: 50 · L60→L61: 138 · Total para L61: ~5.655 XP.
export const XP_BASE = 50;
export const XP_GROWTH = 1.5;

/** Tabela cumulativa: XP_TABLE[n] = XP total para ESTAR no nível n+1.
 *  XP_TABLE[1] = 50  (subir de L1 para L2 custa 50)
 *  XP_TABLE[2] = 101 (subir até L3 custa 50+51=101 acumulado)
 */
export const XP_TABLE = (() => {
  const t = [0, 0]; // t[0] e t[1] = 0 XP para iniciar no nível 1
  let acc = 0;
  for(let n = 1; n <= 200; n++){
    acc += XP_BASE + Math.floor((n - 1) * XP_GROWTH);
    t[n + 1] = acc;
  }
  return t;
})();

export function xpForLevel(n){ return XP_BASE + Math.floor((n - 1) * XP_GROWTH); }

/* ---------- Pesos e bônus de XP ---------- */
export const WEIGHTS = { oficio: 0.5, empreitada: 1, facanha: 2 };
export const BASE_XP = 25;            // XP base de uma missão (×peso)
export const VIGOR_BONUS = 0.25;      // cada Vigor = +25%
export const VIGOR_MAX = 3;
export const VIGOR_USES = 3;          // missões beneficiadas por uma carga
export const POMODORO_BONUS = 0.5;    // 50% adicional se concluir Pomodoro
export const FINISH_IN_BATTLE = 1.0;  // 100% se concluir missão durante a batalha

/* ---------- Categorias ---------- */
export const CATS = {
  razao: { label: "Razão de Estado", sub: "As tarefas do Gabinete. O expediente do Rei.",      icon: "⚖️" },
  virtu: { label: "Círculo de Virtù", sub: "O estudo, a leitura, o aprimoramento do espírito.", icon: "📜" },
  armas: { label: "Minhas Armas",    sub: "O corpo é arsenal. Treine — multiplique seus pontos.", icon: "⚔️" }
};

/* ---------- Tags padrão (foram definidas com base no perfil legislativo do usuário) ---------- */
export const DEFAULT_TAGS = ["Gabinete", "Leitura", "Pós-Graduação", "Preparação Física", "Basquete"];
export const OLD_DEFAULT_TAGS = ["ALESC", "Plenário", "Corrida"]; // limpeza histórica (v2)

/* ---------- Dias da semana (PT-BR) ---------- */
export const WEEKDAY_LABELS_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
export const WEEKDAYS_PT_FULL = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];

/* ---------- Limites de anexos (P4) ---------- */
export const ATT_MAX_SIZE  = 500 * 1024 * 1024;  // 500 MB por arquivo
export const ATT_MAX_TOTAL = 500 * 1024 * 1024;  // 500 MB no total por missão
export const ATT_CACHE_LOCAL_LIMIT = 25 * 1024 * 1024; // até 25 MB são cacheados em IDB

/* ---------- Arquivamento (P3.6) ---------- */
export const ARCHIVE_AFTER_DAYS = 90;  // missões únicas concluídas há > N dias migram para IDB

/* ---------- Sync P7 ---------- */
export const TOMBSTONE_TTL_DAYS = 90;  // tombstones (exclusões/arquivamentos) expiram após N dias

/* ---------- Storage local ---------- */
export const STATE_KEY = "principe-invisivel-v1";
export const SCHEMA_VERSION = 10;

/* ---------- Supabase (P4) ---------- */
export const SB_URL    = "https://jajhwyyodstughkspypi.supabase.co";
export const SB_KEY    = "sb_publishable_3iCzgWQtX4CS53eZwc42-g_w60YjWeS";
export const SB_BUCKET = "attachments";

/* ---------- IndexedDB ---------- */
export const IDB_NAME  = "principe-invisivel";
export const IDB_STORE = "kv";
export const IDB_ARCHIVE_KEY = "archive:missions"; // chave única que guarda array de missões arquivadas
export const SAVE_DIR_KEY = "saveDirHandle";
