/**
 * P6 — Reordenação manual de missões por arrasto (alça ⠿).
 *
 * Por que Pointer Events e não HTML5 Drag-and-Drop: a API nativa de DnD não
 * dispara em telas de toque, e o uso primário do app é PWA no celular.
 * Pointer Events unificam mouse, toque e caneta num só fluxo.
 *
 * Mecânica:
 *  - pointerdown na .drag-handle captura o ponteiro (setPointerCapture);
 *  - após um limiar de 5px o drag ativa: o card vira position:fixed e segue
 *    o dedo; um placeholder tracejado marca a posição de inserção;
 *  - pointermove decide a posição comparando o Y do ponteiro com o centro
 *    dos demais cards arrastáveis; perto das bordas da tela, auto-scroll;
 *  - pointerup devolve o card ao fluxo e comita a nova ordem no state
 *    (applyManualOrder), que persiste via save() e re-renderiza tudo pelo
 *    evento principe:state-changed (também sincroniza no Supabase).
 *  - A alça aceita teclado: setas ↑/↓ com foco nela movem o card uma posição.
 *
 * A ordem é gravada reutilizando o multiset de m.order já existente entre as
 * missões reordenadas (os valores trocam de dono, não inflacionam) — assim a
 * posição relativa frente a outras categorias e às concluídas não se altera.
 */
import { $ } from "./utils.js";
import { getState, save } from "./state.js";

const DRAG_THRESHOLD = 5;   // px até ativar o arrasto (permite tap sem efeito)
const SCROLL_EDGE    = 72;  // faixa (px) junto às bordas que ativa auto-scroll
const SCROLL_MAX     = 16;  // px por frame no auto-scroll

let drag = null;

/* ---------- Lógica pura (testável sem DOM) ---------- */
/**
 * Reatribui m.order conforme a sequência de ids dada. Os valores usados são
 * os mesmos orders que as missões já ocupavam (ordenados asc) — apenas trocam
 * de dono. Retorna true se algo mudou.
 */
export function applyManualOrder(missions, orderedIds){
  if(!Array.isArray(missions) || !Array.isArray(orderedIds)) return false;
  const byId = new Map(missions.map(m => [m.id, m]));
  const sel = orderedIds.map(id => byId.get(id)).filter(Boolean);
  if(sel.length < 2) return false;
  const allFinite = sel.every(m => typeof m.order === "number" && isFinite(m.order));
  const slots = allFinite
    ? sel.map(m => m.order).sort((a, b) => a - b)
    : sel.map((_, i) => i);
  let changed = false;
  const now = new Date().toISOString();
  sel.forEach((m, i) => {
    if(m.order !== slots[i]){
      m.order = slots[i];
      m.updatedAt = now; // carimbo p/ merge por missão (P7)
      changed = true;
    }
  });
  return changed;
}

/* ---------- Bind ---------- */
export function bindReorderEvents(){
  const list = $("#missionList");
  if(!list) return;
  list.addEventListener("pointerdown", onPointerDown);
  list.addEventListener("keydown", onHandleKeydown);
}

/* ---------- Teclado (acessibilidade) ---------- */
function onHandleKeydown(e){
  if(e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
  const grip = e.target.closest?.(".drag-handle");
  if(!grip) return;
  const card = grip.closest(".mission");
  const list = card?.parentElement;
  if(!card || !list) return;
  e.preventDefault();
  const cards = [...list.querySelectorAll(".mission.draggable")];
  const i = cards.indexOf(card);
  if(i < 0) return;
  if(e.key === "ArrowUp" && i > 0){
    list.insertBefore(card, cards[i - 1]);
  } else if(e.key === "ArrowDown" && i < cards.length - 1){
    list.insertBefore(card, cards[i + 1].nextSibling);
  } else return;
  commitOrder(list);
  // renderAll reconstrói a lista — devolve o foco à alça do mesmo card
  requestAnimationFrame(() => {
    document.querySelector(`.mission[data-mid="${card.dataset.mid}"] .drag-handle`)?.focus();
  });
}

/* ---------- Pointer flow ---------- */
function onPointerDown(e){
  if(drag) return;
  if(e.pointerType === "mouse" && e.button !== 0) return;
  const grip = e.target.closest?.(".drag-handle");
  if(!grip) return;
  const card = grip.closest(".mission");
  const list = card?.parentElement;
  if(!card || !list) return;
  e.preventDefault(); // sem seleção de texto / gesto nativo a partir da alça
  const r = card.getBoundingClientRect();
  drag = {
    pointerId: e.pointerId,
    grip, card, list,
    startY: e.clientY, startX: e.clientX,
    offsetY: e.clientY - r.top,
    lastClientY: e.clientY,
    active: false,
    placeholder: null,
    rafScroll: null
  };
  try{ grip.setPointerCapture(e.pointerId); }catch(_){}
  grip.addEventListener("pointermove", onPointerMove);
  grip.addEventListener("pointerup", onPointerUp);
  grip.addEventListener("pointercancel", onPointerCancel);
}

function onPointerMove(e){
  if(!drag || e.pointerId !== drag.pointerId) return;
  drag.lastClientY = e.clientY;
  if(!drag.active){
    if(Math.max(Math.abs(e.clientY - drag.startY), Math.abs(e.clientX - drag.startX)) < DRAG_THRESHOLD) return;
    startDrag();
  }
  // Lista pode ter sido reconstruída por um render vindo do sync realtime.
  if(!drag.card.isConnected){ abortDrag(); return; }
  positionCard(e.clientY);
  updatePlaceholder(e.clientY);
  maybeAutoScroll();
}

function onPointerUp(e){
  if(!drag || e.pointerId !== drag.pointerId) return;
  const d = drag;
  cleanup(d);
  if(!d.active){ drag = null; return; } // foi apenas um tap na alça
  d.card.classList.remove("dragging");
  d.card.style.cssText = "";
  if(d.placeholder?.isConnected) d.list.insertBefore(d.card, d.placeholder);
  d.placeholder?.remove();
  document.body.classList.remove("drag-in-progress");
  drag = null;
  commitOrder(d.list);
}

function onPointerCancel(e){
  if(!drag || e.pointerId !== drag.pointerId) return;
  abortDrag();
}

/* ---------- Internals ---------- */
function startDrag(){
  const { card, list } = drag;
  const r = card.getBoundingClientRect();
  const ph = document.createElement("div");
  ph.className = "drag-placeholder";
  ph.style.height = r.height + "px";
  list.insertBefore(ph, card);
  drag.placeholder = ph;
  card.classList.add("dragging");
  card.style.width = r.width + "px";
  card.style.position = "fixed";
  card.style.left = r.left + "px";
  card.style.top = r.top + "px";
  card.style.zIndex = "999";
  card.style.pointerEvents = "none";
  document.body.classList.add("drag-in-progress");
  drag.active = true;
}

function positionCard(clientY){
  drag.card.style.top = (clientY - drag.offsetY) + "px";
}

function updatePlaceholder(clientY){
  const { list, card, placeholder } = drag;
  if(!placeholder?.isConnected) return;
  const cards = [...list.querySelectorAll(".mission.draggable")].filter(el => el !== card);
  let before = null;
  for(const el of cards){
    const r = el.getBoundingClientRect();
    if(clientY < r.top + r.height / 2){ before = el; break; }
  }
  if(before){
    if(placeholder.nextElementSibling !== before) list.insertBefore(placeholder, before);
  } else {
    const last = cards[cards.length - 1];
    if(last && placeholder.previousElementSibling !== last) list.insertBefore(placeholder, last.nextSibling);
  }
}

function maybeAutoScroll(){
  if(!drag || drag.rafScroll) return;
  const step = () => {
    if(!drag || !drag.active){ return; }
    drag.rafScroll = null;
    const y = drag.lastClientY;
    const vh = window.innerHeight;
    let dy = 0;
    if(y < SCROLL_EDGE)            dy = -Math.ceil((SCROLL_EDGE - y) / SCROLL_EDGE * SCROLL_MAX);
    else if(y > vh - SCROLL_EDGE)  dy =  Math.ceil((y - (vh - SCROLL_EDGE)) / SCROLL_EDGE * SCROLL_MAX);
    if(dy !== 0){
      window.scrollBy(0, dy);
      updatePlaceholder(y); // a lista deslizou sob o ponteiro parado
      drag.rafScroll = requestAnimationFrame(step);
    }
  };
  drag.rafScroll = requestAnimationFrame(step);
}

function commitOrder(list){
  const ids = [...list.querySelectorAll(".mission.draggable")].map(el => el.dataset.mid);
  const changed = applyManualOrder(getState().missions, ids);
  if(changed){
    save();
    document.dispatchEvent(new CustomEvent("principe:state-changed"));
  }
}

function abortDrag(){
  const d = drag;
  if(!d) return;
  cleanup(d);
  if(d.active){
    d.card.classList.remove("dragging");
    d.card.style.cssText = "";
    if(d.placeholder?.isConnected && d.card.isConnected === false){
      // card foi destruído por re-render: nada a restaurar
    } else if(d.placeholder?.isConnected){
      d.list.insertBefore(d.card, d.placeholder);
    }
    d.placeholder?.remove();
    document.body.classList.remove("drag-in-progress");
  }
  drag = null;
}

function cleanup(d){
  if(d.rafScroll){ cancelAnimationFrame(d.rafScroll); d.rafScroll = null; }
  try{ d.grip.releasePointerCapture(d.pointerId); }catch(_){}
  d.grip.removeEventListener("pointermove", onPointerMove);
  d.grip.removeEventListener("pointerup", onPointerUp);
  d.grip.removeEventListener("pointercancel", onPointerCancel);
}
