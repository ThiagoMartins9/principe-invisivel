/**
 * Mapa do Continente — desenho SVG e mecânica de pintura por região.
 *
 * REGIONS define a topologia. paintRegions é pura no sentido de que
 * mexe apenas em state.regions e state.regionLog — a renderização SVG
 * é separada (refreshMap).
 */
import { getState, save } from "./state.js";
import { $, $$ } from "./utils.js";

export const REGIONS = [
  { id: "sco", nm: "Escócia",        d: "M62,18 L72,16 L80,22 L74,32 L66,30 Z" },
  { id: "eng", nm: "Inglaterra",     d: "M60,33 L80,32 L84,46 L70,52 L60,46 Z" },
  { id: "ire", nm: "Irlanda",        d: "M44,34 L56,34 L56,48 L46,50 Z" },
  { id: "por", nm: "Portugal",       d: "M48,86 L56,86 L58,108 L50,112 Z" },
  { id: "cas", nm: "Castela",        d: "M56,88 L80,86 L82,108 L60,112 Z" },
  { id: "ara", nm: "Aragão",         d: "M82,88 L98,88 L100,104 L84,108 Z" },
  { id: "nav", nm: "Navarra",        d: "M82,82 L94,80 L96,86 L84,88 Z" },
  { id: "fra", nm: "França",         d: "M86,52 L114,46 L120,72 L106,90 L88,80 Z" },
  { id: "bur", nm: "Borgonha",       d: "M114,52 L126,52 L128,64 L114,66 Z" },
  { id: "lc",  nm: "Países Baixos",  d: "M104,40 L122,38 L122,50 L106,50 Z" },
  { id: "sax", nm: "Saxônia",        d: "M122,42 L142,40 L144,58 L124,58 Z" },
  { id: "bav", nm: "Baviera",        d: "M124,60 L146,58 L148,72 L126,72 Z" },
  { id: "swi", nm: "Suíça",          d: "M118,68 L130,68 L132,76 L120,78 Z" },
  { id: "sav", nm: "Sabóia",         d: "M114,72 L122,72 L124,82 L114,82 Z" },
  { id: "mil", nm: "Milão",          d: "M122,82 L138,82 L140,90 L124,92 Z" },
  { id: "ven", nm: "Veneza",         d: "M138,80 L154,82 L156,92 L140,92 Z" },
  { id: "flo", nm: "Florença",       d: "M124,94 L144,94 L146,104 L128,106 Z" },
  { id: "pap", nm: "Estados Pont.",  d: "M128,108 L148,106 L152,118 L132,120 Z" },
  { id: "nap", nm: "Nápoles",        d: "M134,122 L154,124 L160,140 L142,142 Z" },
  { id: "sic", nm: "Sicília",        d: "M132,148 L150,150 L150,158 L132,158 Z" },
  { id: "cor", nm: "Córsega/Sard.",  d: "M118,108 L128,108 L128,128 L120,130 Z" },
  { id: "aus", nm: "Áustria",        d: "M146,60 L168,60 L170,76 L150,76 Z" },
  { id: "hun", nm: "Hungria",        d: "M168,64 L192,64 L194,82 L172,82 Z" },
  { id: "boh", nm: "Boêmia",         d: "M150,48 L172,48 L172,60 L152,60 Z" },
  { id: "pol", nm: "Polônia",        d: "M150,30 L184,30 L188,46 L154,46 Z" },
  { id: "den", nm: "Dinamarca",      d: "M122,18 L138,16 L142,30 L126,32 Z" },
  { id: "swe", nm: "Suécia",         d: "M140,8  L158,4  L168,28 L154,30 Z" },
  { id: "nor", nm: "Noruega",        d: "M118,4  L138,2  L138,16 L122,18 Z" },
  { id: "rus", nm: "Moscóvia",       d: "M188,18 L210,18 L210,46 L190,46 Z" },
  { id: "lit", nm: "Lituânia",       d: "M186,32 L208,32 L208,46 L188,46 Z" },
  { id: "ott", nm: "Otomanos",       d: "M162,116 L196,116 L198,140 L168,142 Z" },
  { id: "gre", nm: "Bizâncio/Greg.", d: "M162,140 L184,142 L186,156 L166,156 Z" },
  { id: "bal", nm: "Bálcãs",         d: "M156,98 L184,100 L186,118 L160,118 Z" },
  { id: "rom", nm: "Valáquia",       d: "M186,90 L210,92 L210,108 L188,108 Z" },
  { id: "trn", nm: "Transilvânia",   d: "M180,82 L202,82 L202,92 L182,92 Z" },
  { id: "meck",nm: "Mecklemb.",      d: "M126,32 L148,32 L150,42 L128,44 Z" },
  { id: "pru", nm: "Prússia",        d: "M148,30 L172,30 L174,40 L150,42 Z" },
  { id: "liv", nm: "Livônia",        d: "M180,16 L208,16 L208,30 L182,30 Z" },
  { id: "bre", nm: "Bretanha",       d: "M76,52 L92,52 L92,62 L80,62 Z" },
  { id: "nor2",nm: "Normandia",      d: "M88,46 L106,46 L106,56 L94,56 Z" }
];

export function buildMap(){
  const host = $("#mapHost");
  if(!host) return;
  const labels = REGIONS.map(r => {
    const pts = r.d.replace(/[ML Z]/g, ",").split(",").map(s => s.trim()).filter(Boolean).map(parseFloat);
    let sx = 0, sy = 0, n = 0;
    for(let i = 0; i < pts.length; i += 2){ sx += pts[i]; sy += pts[i + 1]; n++; }
    const cx = (sx / n), cy = (sy / n);
    return `<text class="region-label" x="${cx}" y="${cy}" text-anchor="middle">${r.nm}</text>`;
  }).join("");
  const paths = REGIONS.map(r => `<path class="region" data-rid="${r.id}" d="M ${r.d.slice(1)} Z"></path>`).join("");
  host.innerHTML = `
    <svg viewBox="0 0 220 170" preserveAspectRatio="xMidYMid meet" aria-label="Mapa do Continente">
      <defs>
        <linearGradient id="kingGold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"  stop-color="#F5DA8A"/>
          <stop offset="55%" stop-color="#D4AF37"/>
          <stop offset="100%" stop-color="#9B7A23"/>
        </linearGradient>
        <pattern id="sea" patternUnits="userSpaceOnUse" width="6" height="6">
          <rect width="6" height="6" fill="#0A1A33"/>
          <path d="M0 3 Q1.5 1.5 3 3 T6 3" stroke="#15294A" fill="none" stroke-width=".4"/>
        </pattern>
      </defs>
      <rect x="0" y="0" width="220" height="170" fill="url(#sea)"/>
      <g>${paths}</g>
      <g>${labels}</g>
    </svg>
  `;
  refreshMap();
}

export function refreshMap(){
  const state = getState();
  $$(".region").forEach(p => {
    const rid = p.getAttribute("data-rid");
    if(state.regions[rid] === "taken") p.classList.add("taken");
    else p.classList.remove("taken");
  });
}

/**
 * Pinta N regiões aleatórias no estado e atualiza o SVG.
 * Função pura para testes: aceita opcionalmente um RNG injetado e um
 * relógio (`now`) para timestamp determinístico no `regionLog`.
 */
export function paintRegions(n, rng = Math.random, now = () => new Date().toISOString()){
  const state = getState();
  if(!Array.isArray(state.regionLog)) state.regionLog = [];
  const free = REGIONS.filter(r => !state.regions[r.id]);
  for(let i = 0; i < n && free.length; i++){
    const idx = Math.floor(rng() * free.length);
    const r = free.splice(idx, 1)[0];
    state.regions[r.id] = "taken";
    state.regionLog.push({ rid: r.id, takenAt: now() });
  }
  refreshMap();
}
