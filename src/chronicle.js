/**
 * Crônica Narrada — geração determinística de prosa cronística mensal.
 *
 * Não usa LLM. A partir de state + arquivo, monta blocos de texto
 * escolhendo variantes pelo hash (FNV-1a 32-bit) de "ano-mês:slot".
 * A mesma entrada SEMPRE produz a mesma saída — testável e estável.
 *
 * Toda função aqui é pura: recebe state e archive como argumentos,
 * não toca no DOM, não muta estado.
 */

import { CATS, RANKS, XP_TABLE, XP_BASE, XP_GROWTH } from "./config.js";
import { REGIONS } from "./map.js";

/* ---------- Hash determinístico (FNV-1a 32-bit) ---------- */
function hashSeed(s){
  let h = 0x811c9dc5;
  const str = String(s);
  for(let i = 0; i < str.length; i++){
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h;
}

/**
 * Escolhe item determinístico de um array, dado um seed (mês-ano)
 * e um slot (nome do bloco textual). Diferentes slots no mesmo mês
 * produzem escolhas independentes.
 */
export function pickVariant(arr, seed, slot){
  if(!Array.isArray(arr) || arr.length === 0) return "";
  const h = hashSeed(String(seed) + ":" + String(slot));
  return arr[h % arr.length];
}

/* ---------- Curva de XP — recomputada localmente ---------- */
function levelForXp(xp){
  for(let n = 1; n < XP_TABLE.length; n++){
    if(XP_TABLE[n + 1] === undefined || xp < XP_TABLE[n + 1]) return n;
  }
  return XP_TABLE.length - 1;
}
function rankOfLevel(lv){
  return RANKS.find(r => lv >= r.min && lv <= r.max) || RANKS[RANKS.length - 1];
}

/* ---------- Calendário e i18n leve ---------- */
const MONTH_NAMES_PT = [
  "janeiro","fevereiro","março","abril","maio","junho",
  "julho","agosto","setembro","outubro","novembro","dezembro"
];
export function monthLabel(year, month){
  return `${MONTH_NAMES_PT[month - 1]} de ${year}`;
}
export function monthSeed(year, month){
  return `${year}-${String(month).padStart(2,"0")}`;
}

/** Iso "YYYY-MM" do timestamp; null se inválido. */
function isoYM(ts){
  if(!ts) return null;
  const s = String(ts).slice(0, 7);
  return /^\d{4}-\d{2}$/.test(s) ? s : null;
}

/* ---------- Coleta de eventos do mês ---------- */
/**
 * Reúne TODOS os eventos de XP num array unificado a partir de
 * state.missions (vivas) + archive (arquivadas). Cada evento é:
 *   { at: ISO, xp: number, cat: string, weight: string, title: string,
 *     mid: string, recurring: boolean, kind: "done"|"recur" }
 */
export function collectXpEvents(state, archive = []){
  const out = [];
  const all = [].concat(state.missions || [], Array.isArray(archive) ? archive : []);
  for(const m of all){
    if(m.recurring && Array.isArray(m.xpHistory)){
      for(const e of m.xpHistory){
        if(!e || !e.at) continue;
        out.push({
          at: e.at,
          xp: Number(e.xp) || 0,
          cat: m.cat,
          weight: m.weight,
          title: m.title,
          mid: m.id,
          recurring: true,
          kind: "recur"
        });
      }
    } else if(!m.recurring && m.doneAt){
      out.push({
        at: m.doneAt,
        xp: Number(m.xpAwarded) || 0,
        cat: m.cat,
        weight: m.weight,
        title: m.title,
        mid: m.id,
        recurring: false,
        kind: "done"
      });
    }
  }
  out.sort((a, b) => String(a.at).localeCompare(String(b.at)));
  return out;
}

/** Eventos de um mês específico. */
export function eventsOfMonth(events, year, month){
  const ym = `${year}-${String(month).padStart(2,"0")}`;
  return events.filter(e => isoYM(e.at) === ym);
}

/** Conjunto de "YYYY-MM" com pelo menos um evento ou conquista de região. */
export function monthsWithActivity(state, archive = []){
  const set = new Set();
  for(const e of collectXpEvents(state, archive)){
    const ym = isoYM(e.at);
    if(ym) set.add(ym);
  }
  for(const r of (state.regionLog || [])){
    const ym = isoYM(r.takenAt);
    if(ym) set.add(ym);
  }
  return Array.from(set).sort().reverse().map(s => {
    const [y, m] = s.split("-");
    return { year: Number(y), month: Number(m) };
  });
}

/** Maior sequência de dias consecutivos COM atividade dentro do mês. */
function maxConsecutiveActiveDays(monthEvents, year, month){
  const days = new Set(monthEvents.map(e => String(e.at).slice(0, 10)));
  if(days.size === 0) return 0;
  const sorted = Array.from(days).sort();
  let best = 1, run = 1;
  for(let i = 1; i < sorted.length; i++){
    const prev = new Date(sorted[i - 1] + "T00:00:00");
    const cur  = new Date(sorted[i]     + "T00:00:00");
    const diff = Math.round((cur - prev) / 86400000);
    run = (diff === 1) ? run + 1 : 1;
    if(run > best) best = run;
  }
  return best;
}

/* ---------- Estatística de um mês ---------- */
export function gatherMonthData(state, archive, year, month){
  const allEvents = collectXpEvents(state, archive);
  const evs = eventsOfMonth(allEvents, year, month);

  const byCat = { razao: 0, virtu: 0, armas: 0 };
  const byWeight = { oficio: 0, empreitada: 0, facanha: 0 };
  let totalXp = 0;
  let biggest = null;
  let pomodoroLike = 0; // soma de XP > base — proxy de bônus

  for(const e of evs){
    if(byCat[e.cat] !== undefined) byCat[e.cat]++;
    if(byWeight[e.weight] !== undefined) byWeight[e.weight]++;
    totalXp += e.xp;
    if(!biggest || e.xp > biggest.xp) biggest = e;
  }

  // XP cumulativo: rank no fim do mês
  const ymEnd = `${year}-${String(month).padStart(2,"0")}`;
  let cumXpEnd = 0, cumXpStart = 0;
  for(const e of allEvents){
    const ym = isoYM(e.at);
    if(!ym) continue;
    if(ym <= ymEnd) cumXpEnd += e.xp;
    if(ym <  ymEnd) cumXpStart += e.xp;
  }
  const lvStart = levelForXp(cumXpStart);
  const lvEnd   = levelForXp(cumXpEnd);
  const rkStart = rankOfLevel(lvStart);
  const rkEnd   = rankOfLevel(lvEnd);

  // Regiões tomadas no mês
  const regionsTaken = (state.regionLog || [])
    .filter(r => isoYM(r.takenAt) === ymEnd)
    .map(r => {
      const def = REGIONS.find(x => x.id === r.rid);
      return { rid: r.rid, name: def ? def.nm : r.rid, takenAt: r.takenAt };
    });

  // Tags e categorias dominantes (para inflexão de vocabulário)
  const tagCount = {};
  for(const e of evs){
    const m = (state.missions || []).concat(archive || []).find(x => x.id === e.mid);
    const tag = m && m.tag ? m.tag : null;
    if(tag) tagCount[tag] = (tagCount[tag] || 0) + 1;
  }
  let topTag = null, topTagN = 0;
  for(const t in tagCount){
    if(tagCount[t] > topTagN){ topTag = t; topTagN = tagCount[t]; }
  }
  let topCat = null, topCatN = 0;
  for(const k in byCat){
    if(byCat[k] > topCatN){ topCat = k; topCatN = byCat[k]; }
  }

  // Dias do mês
  const lastDay = new Date(year, month, 0).getDate();
  const totalCompleted = evs.length;
  const ratio = totalCompleted / lastDay;

  // Humor: triunfal / contido / sombrio
  let mood = "contido";
  if(ratio >= 1.5) mood = "triunfal";
  else if(ratio < 0.5) mood = "sombrio";

  return {
    year, month, monthLabel: monthLabel(year, month),
    totalCompleted,
    byCategory: byCat,
    byWeight,
    totalXp,
    biggest,
    pomodoroLike,
    regionsTaken,
    levelAtStart: lvStart,
    levelAtEnd: lvEnd,
    rankAtStart: rkStart,
    rankAtEnd: rkEnd,
    rankChanged: rkEnd && rkStart && rkEnd.name !== rkStart.name,
    topTag, topCat,
    maxConsecutiveDays: maxConsecutiveActiveDays(evs, year, month),
    daysInMonth: lastDay,
    ratio,
    mood
  };
}

/* ---------- Variantes de prosa ---------- */
const INTRO_TRIUNFAL = [
  "Em {month}, o {rank} marchou em ritmo de triunfo: {n} pergaminhos selados no curso do mês.",
  "{month} viu mãos firmes do {rank} fecharem {n} pergaminhos — um para cada vento do calendário.",
  "Foi mês de balanço favorável ao {rank}: {n} selos lavrados, {xp} XP recolhidos ao cofre.",
  "O {rank} atravessou {month} com clamor de campanha — {n} missões cumpridas, {xp} XP somados."
];
const INTRO_CONTIDO = [
  "Em {month}, o {rank} manteve o ritmo: {n} pergaminhos selados, soma de {xp} XP.",
  "{month} foi mês de ofício constante para o {rank} — {n} pergaminhos lavrados em silêncio.",
  "Sem alarde, o {rank} despachou {n} pergaminhos em {month}; {xp} XP foram registrados.",
  "O {rank} cumpriu {month} com a regularidade dos antigos: {n} selos, {xp} XP."
];
const INTRO_SOMBRIO = [
  "{month} foi mês duro para o {rank} — apenas {n} pergaminhos selados.",
  "Em {month}, a corte murmurou: o {rank} fechou somente {n} pergaminhos.",
  "Tempos de inércia em {month}: o {rank} lavrou {n} pergaminhos e {xp} XP.",
  "O {rank} atravessou {month} sob nuvens — {n} pergaminhos e pouco mais."
];

const COMP_TRIUNFAL = [
  "Foram {razao} sob o peso da Razão de Estado, {virtu} dedicados ao Círculo de Virtù e {armas} forjados em Minhas Armas.",
  "A composição do mês: {razao} pergaminhos do Gabinete, {virtu} de leitura e estudo, {armas} no aço do corpo.",
  "Razão de Estado contou {razao}; Virtù, {virtu}; Armas, {armas} — distribuição que honra todas as cortes."
];
const COMP_CONTIDO = [
  "{razao} sob a Razão de Estado, {virtu} no Círculo de Virtù, {armas} em Minhas Armas.",
  "Distribuíram-se assim: {razao} no Gabinete, {virtu} no estudo, {armas} no corpo.",
  "Foram {razao} de Razão de Estado, {virtu} de Virtù e {armas} de Armas — números justos para o mês."
];
const COMP_SOMBRIO = [
  "Pouco se selou: {razao} de Razão de Estado, {virtu} de Virtù, {armas} de Armas.",
  "A escassez se distribuiu — {razao}, {virtu} e {armas} pergaminhos por categoria.",
  "Apenas {razao} de Razão de Estado, {virtu} de Virtù e {armas} de Armas marcaram o mês."
];

const REGION_OPENINGS = [
  "O domínio estendeu-se sobre",
  "Bandeiras subiram em",
  "Pelo mapa do Reino, o {rank} alcançou",
  "Caíram sob a influência do {rank}"
];

const STREAK_LINES = [
  "A constância valeu-lhe {streak} dia(s) seguido(s) de fidelidade ao calendário.",
  "Por {streak} dia(s) consecutivo(s) não houve silêncio na corte.",
  "{streak} dia(s) corridos de atividade sustentada — virtude rara."
];

const FACANHA_LINES = [
  "Uma Façanha — \"{title}\" — coroou o mês.",
  "Coroando o período, a Façanha \"{title}\" foi cumprida.",
  "Entre os trabalhos, destaca-se a Façanha \"{title}\"."
];

const LEVELUP_LINES = [
  "Subiu de {old} a {new}: {essence}.",
  "O {rank} ascendeu — agora chama-se {new}. {essence}.",
  "Da patente de {old} passou à de {new}; {essence}."
];

const CLOSE_TRIUNFAL = [
  "O mês fechou com {xp} XP no cofre. O Príncipe Invisível anota.",
  "Saldo: {xp} XP. O Conselho aplaude em silêncio.",
  "{xp} XP marcam o livro do mês — boa colheita."
];
const CLOSE_CONTIDO = [
  "Encerrou-se o mês com {xp} XP no cofre.",
  "Saldo do mês: {xp} XP. O escriba arquiva e segue.",
  "Ao apagar das luzes, {xp} XP foram somados ao reino."
];
const CLOSE_SOMBRIO = [
  "Apenas {xp} XP no cofre — o mês foi parco.",
  "{xp} XP encerram a página. Que o próximo seja mais farto.",
  "Saldo magro: {xp} XP. Há campos a recuperar."
];

/* ---------- Citações renascentistas/clássicas ---------- */
const QUOTES = {
  razao: [
    { t: "Quem governa deve, antes de tudo, dominar o tempo.", a: "Maquiavel — apócrifo de cortesão" },
    { t: "Os homens esquecem mais facilmente a morte do pai que a perda do patrimônio.", a: "Maquiavel — O Príncipe" },
    { t: "Salus populi suprema lex esto.", a: "Cícero — De Legibus" },
    { t: "Fazem grandes coisas os que sabem aproveitar a ocasião.", a: "Maquiavel — Discorsi" }
  ],
  virtu: [
    { t: "Que pareça tudo feito sem esforço — esse é o segredo da graça.", a: "Castiglione — Il Cortegiano" },
    { t: "A vida, se sabes usá-la, é longa.", a: "Sêneca — De Brevitate Vitae" },
    { t: "A graça é o tempero secreto de toda virtude.", a: "Castiglione — Il Cortegiano" },
    { t: "Não há nada tão absurdo que não tenha sido dito por algum filósofo.", a: "Cícero" }
  ],
  armas: [
    { t: "Conhece teu inimigo e conhece-te a ti mesmo.", a: "Sun Tzu — A Arte da Guerra" },
    { t: "Si vis pacem, para bellum.", a: "Vegécio — De Re Militari" },
    { t: "A suprema arte da guerra é vencer sem combate.", a: "Sun Tzu — A Arte da Guerra" },
    { t: "Toda guerra se baseia no engano.", a: "Sun Tzu — A Arte da Guerra" }
  ]
};

/* ---------- Helpers de prosa ---------- */
function fillTemplate(tpl, vars){
  return String(tpl).replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? String(vars[k]) : ""));
}

/** Junta lista em prosa: ["a","b","c","d"] → "a, b, c e d". */
function joinNatural(arr){
  const items = arr.filter(Boolean);
  if(items.length === 0) return "";
  if(items.length === 1) return items[0];
  if(items.length === 2) return items[0] + " e " + items[1];
  return items.slice(0, -1).join(", ") + " e " + items[items.length - 1];
}

/* ---------- Geração ---------- */
/**
 * Gera HTML pronto da crônica. Retorna string com markup mínimo.
 * Idempotente — mesmas entradas geram mesma saída.
 */
export function generateChronicle(state, archive, year, month){
  const data = gatherMonthData(state, archive, year, month);
  const seed = monthSeed(year, month);
  const m = data.mood;

  // Vazio absoluto — silêncio
  if(data.totalCompleted === 0 && data.regionsTaken.length === 0){
    return `<article class="chronicle empty">
      <h2>${data.monthLabel.replace(/^./, c => c.toUpperCase())}</h2>
      <p class="lead">Em ${data.monthLabel}, o ${escHtml(data.rankAtEnd.name)} guardou silêncio. Nenhum pergaminho foi selado, nenhuma região mudou de bandeira.</p>
      <p class="quote">${escHtml(pickVariant(QUOTES.virtu, seed, "silentquote").t)} <span class="cite">— ${escHtml(pickVariant(QUOTES.virtu, seed, "silentquote").a)}</span></p>
    </article>`;
  }

  // Bloco intro
  const introTpl = m === "triunfal" ? pickVariant(INTRO_TRIUNFAL, seed, "intro")
                  : m === "sombrio" ? pickVariant(INTRO_SOMBRIO, seed, "intro")
                  : pickVariant(INTRO_CONTIDO, seed, "intro");
  const intro = fillTemplate(introTpl, {
    month: data.monthLabel,
    rank: data.rankAtEnd.name,
    n: data.totalCompleted,
    xp: data.totalXp
  });

  // Bloco de composição por categoria
  const compTpl = m === "triunfal" ? pickVariant(COMP_TRIUNFAL, seed, "comp")
                  : m === "sombrio" ? pickVariant(COMP_SOMBRIO, seed, "comp")
                  : pickVariant(COMP_CONTIDO, seed, "comp");
  const comp = fillTemplate(compTpl, {
    razao: data.byCategory.razao,
    virtu: data.byCategory.virtu,
    armas: data.byCategory.armas
  });

  // Bloco regiões (opcional)
  let regionLine = "";
  if(data.regionsTaken.length > 0){
    const opening = fillTemplate(pickVariant(REGION_OPENINGS, seed, "regopen"), { rank: data.rankAtEnd.name });
    regionLine = `${opening} ${joinNatural(data.regionsTaken.map(r => `<b>${escHtml(r.name)}</b>`))}.`;
  }

  // Bloco streak (se >= 5 dias consecutivos no mês)
  let streakLine = "";
  if(data.maxConsecutiveDays >= 5){
    streakLine = fillTemplate(pickVariant(STREAK_LINES, seed, "streak"), { streak: data.maxConsecutiveDays });
  }

  // Façanha (se houve)
  let facanhaLine = "";
  const facanhasInMonth = collectXpEvents(state, archive)
    .filter(e => isoYM(e.at) === `${year}-${String(month).padStart(2,"0")}` && e.weight === "facanha");
  if(facanhasInMonth.length > 0){
    const top = facanhasInMonth.reduce((a, b) => (a.xp >= b.xp ? a : b));
    facanhaLine = fillTemplate(pickVariant(FACANHA_LINES, seed, "facanha"), { title: escHtml(top.title) });
  }

  // Level-up (se houve mudança de patente)
  let levelLine = "";
  if(data.rankChanged){
    levelLine = fillTemplate(pickVariant(LEVELUP_LINES, seed, "level"), {
      old: escHtml(data.rankAtStart.name),
      new: escHtml(data.rankAtEnd.name),
      rank: escHtml(data.rankAtStart.name),
      essence: escHtml(data.rankAtEnd.essence)
    });
  }

  // Fechamento + citação
  const closeTpl = m === "triunfal" ? pickVariant(CLOSE_TRIUNFAL, seed, "close")
                  : m === "sombrio" ? pickVariant(CLOSE_SOMBRIO, seed, "close")
                  : pickVariant(CLOSE_CONTIDO, seed, "close");
  const closeLine = fillTemplate(closeTpl, { xp: data.totalXp });

  // Cita de acordo com categoria dominante
  const quotePool = QUOTES[data.topCat] || QUOTES.virtu;
  const q = pickVariant(quotePool, seed, "quote");

  // Monta HTML
  const moodClass = "mood-" + m;
  const parts = [
    `<article class="chronicle ${moodClass}">`,
    `<header class="ch-head">`,
    `<h2>${escHtml(data.monthLabel.replace(/^./, c => c.toUpperCase()))}</h2>`,
    `<p class="ch-sub">${escHtml(data.rankAtEnd.name)} · Nível ${data.levelAtEnd}</p>`,
    `</header>`,
    `<p class="ch-lead">${intro}</p>`,
    `<p>${comp}</p>`
  ];
  if(regionLine)   parts.push(`<p>${regionLine}</p>`);
  const tail = [streakLine, facanhaLine, levelLine].filter(Boolean);
  if(tail.length) parts.push(`<ul class="ch-marks">${tail.map(s => `<li>${s}</li>`).join("")}</ul>`);
  parts.push(`<p class="ch-close">${closeLine}</p>`);
  parts.push(`<blockquote class="ch-quote">«${escHtml(q.t)}»<cite>— ${escHtml(q.a)}</cite></blockquote>`);
  parts.push(`</article>`);
  return parts.join("");
}

/** Escapa HTML em inserções de strings de usuário. */
function escHtml(s){
  return String(s == null ? "" : s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

/** Sumário de uma linha para listagem (lista de meses). */
export function summarizeMonth(state, archive, year, month){
  const d = gatherMonthData(state, archive, year, month);
  const parts = [];
  if(d.totalCompleted > 0) parts.push(`${d.totalCompleted} pergaminhos`);
  if(d.regionsTaken.length > 0) parts.push(`${d.regionsTaken.length} região(ões)`);
  if(d.totalXp > 0) parts.push(`+${d.totalXp} XP`);
  return {
    year, month,
    label: d.monthLabel.replace(/^./, c => c.toUpperCase()),
    line: parts.length ? parts.join(" · ") : "silêncio",
    mood: d.mood,
    rank: d.rankAtEnd.name
  };
}
