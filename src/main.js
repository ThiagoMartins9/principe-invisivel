/**
 * Entrypoint do app — orquestra módulos, faz init e amarra event handlers.
 * Mantém-se "burro": delega lógica para os módulos especializados.
 */
import { $, $$, toast, uid, esc, formatDate, tagPickerStyle } from "./utils.js";
import { getState, save, migrate, defaultState, setState, onSave } from "./state.js";
import { primeAudio, sfxClick } from "./audio.js";
import { buildMap } from "./map.js";
import { renderAll, setNav, ui, renderMissions } from "./render.js";
import { bindModalEvents, askConfirm } from "./modal.js";
import { setBattlePhase, bindBattleEvents } from "./battle.js";
import {
  completeMission, reopenMission, deleteMission, checkInertia
} from "./missions.js";
import { sanitizeCadence } from "./cadence.js";
import {
  openDetail, closeDetail, attachFiles, downloadAttachment, removeAttachment,
  setDetailDirty, removeAttachmentFiles, getDetailId
} from "./attachments.js";
import { exportSave, importSave, applyChronicleFile } from "./io.js";
import {
  sbInit, sbSignIn, sbSignUp, sbSignOut, isLogged, getSbUser,
  schedulePush, setSyncPill
} from "./supabase.js";
import { battle } from "./battle.js";
import { autoArchive, bindArchiveEvents, getArchiveCount, loadArchive } from "./archive.js";
import {
  monthsWithActivity, summarizeMonth, generateChronicle
} from "./chronicle.js";

/* ---------- DRAFT do modal de Nova Missão ---------- */
let draftMission = null;
let editingId = null;

function openMissionModal(category, editMission){
  if(editMission){
    editingId = editMission.id;
    const ec = editMission.cadence || { type: "daily", days: [] };
    draftMission = {
      cat: editMission.cat,
      weight: editMission.weight,
      tag: editMission.tag || null,
      recurring: !!editMission.recurring,
      cadence: { type: ec.type || "daily", days: Array.isArray(ec.days) ? [...ec.days] : [] }
    };
    $("#missTitle").textContent = "Editar Missão";
    $("#btnSave").textContent = "Atualizar Pergaminho";
    $(".lead", $("#modalMission")).textContent = "Atualize os termos do pergaminho";
    $("#missionTitle").value = editMission.title || "";
    $("#missionDesc").value  = editMission.desc  || "";
    $("#missionDue").value   = editMission.due   || "";
  } else {
    editingId = null;
    draftMission = {
      cat: category || ui.currentCat,
      weight: "empreitada",
      tag: null,
      recurring: false,
      cadence: { type: "daily", days: [] }
    };
    $("#missTitle").textContent = "Nova Missão";
    $("#btnSave").textContent = "Selar Pergaminho";
    $(".lead", $("#modalMission")).textContent = "Defina a próxima empreitada do Conselheiro";
    $("#missionTitle").value = "";
    $("#missionDesc").value  = "";
    $("#missionDue").value   = "";
  }
  const rt = $("#recurToggle");
  rt.classList.toggle("on", !!draftMission.recurring);
  rt.setAttribute("aria-checked", draftMission.recurring ? "true" : "false");
  syncCadenceUI();
  $$(".pick", $("#catPicker")).forEach(p => p.classList.toggle("sel", p.dataset.cat === draftMission.cat));
  $$(".pick", $("#weightPicker")).forEach(p => p.classList.toggle("sel", p.dataset.w === draftMission.weight));
  renderTagPicker();
  $("#newTag").value = "";
  updateXpHint();
  $("#modalMission").classList.add("show");
  setTimeout(() => $("#missionTitle").focus(), 50);
}

function closeMissionModal(){
  $("#modalMission").classList.remove("show");
  editingId = null;
}

function syncCadenceUI(){
  const block = $("#cadenceBlock");
  if(!block) return;
  block.classList.toggle("hide", !draftMission.recurring);
  const c = draftMission.cadence || { type: "daily", days: [] };
  $$("button", $("#cadenceTypePicker")).forEach(b => {
    b.classList.toggle("active", b.dataset.c === c.type);
  });
  const daysWrap = $("#cadenceDaysPicker");
  daysWrap.classList.toggle("hide", c.type !== "custom");
  $$("button", daysWrap).forEach(b => {
    const d = parseInt(b.dataset.d, 10);
    b.classList.toggle("sel", Array.isArray(c.days) && c.days.includes(d));
  });
}

function renderTagPicker(){
  const wrap = $("#tagPicker");
  wrap.innerHTML = "";
  const state = getState();
  state.tags.forEach(t => {
    const el = document.createElement("button");
    const isSel = draftMission?.tag === t;
    el.className = "tag" + (isSel ? " sel" : "");
    el.textContent = t;
    el.setAttribute("style", tagPickerStyle(t, isSel));
    el.addEventListener("click", () => {
      if(draftMission.tag === t) draftMission.tag = null;
      else draftMission.tag = t;
      renderTagPicker();
    });
    wrap.appendChild(el);
  });
}

function updateXpHint(){
  const WEIGHTS = { oficio: 0.5, empreitada: 1, facanha: 2 };
  const xp = Math.round(25 * (WEIGHTS[draftMission?.weight] ?? 1));
  $("#xpHint").textContent = xp;
}

/* ---------- AUTH MODAL ---------- */
let authMode = "signin";
function openAuth(){
  $("#modalAuth").classList.add("show");
  updateAuthUI();
  setTimeout(() => { if(!isLogged()) $("#authEmail").focus(); }, 60);
}
function closeAuth(){ $("#modalAuth").classList.remove("show"); }

function updateAuthUI(){
  const loggedIn = isLogged();
  $("#authLoggedIn").classList.toggle("hide", !loggedIn);
  $("#authLoggedOut").classList.toggle("hide", loggedIn);
  if(loggedIn){
    $("#authAccountEmail").textContent = getSbUser()?.email || "(sem e-mail)";
    $("#authLead").textContent = "Você está sincronizado entre dispositivos";
  } else {
    $("#authStatus").textContent = "";
    $("#authLead").textContent = "Acesse com seu e-mail para sincronizar entre dispositivos";
    setAuthMode(authMode);
  }
  $("#btnAuth").style.color = loggedIn ? "var(--gold)" : "var(--muted-2)";
}

function setAuthMode(mode){
  authMode = mode;
  $$("#authTabs button").forEach(b => b.classList.toggle("active", b.dataset.tab === mode));
  $("#authSubmit").textContent = (mode === "signup") ? "Criar conta" : "Entrar";
  $("#authPass").autocomplete = (mode === "signup") ? "new-password" : "current-password";
  $("#authStatus").textContent = "";
}

async function authSubmit(){
  const email = $("#authEmail").value.trim();
  const pass  = $("#authPass").value;
  if(!email || !pass){ $("#authStatus").textContent = "Preencha e-mail e senha"; return; }
  if(pass.length < 8){ $("#authStatus").textContent = "Senha deve ter ao menos 8 caracteres"; return; }
  $("#authSubmit").disabled = true;
  $("#authStatus").textContent = "Aguarde…";
  $("#authStatus").classList.remove("ok");
  let user = null;
  if(authMode === "signup") user = await sbSignUp(email, pass);
  else                       user = await sbSignIn(email, pass);
  $("#authSubmit").disabled = false;
  if(user){
    $("#authStatus").classList.add("ok");
    $("#authStatus").textContent = "Pronto. Sincronizando…";
    setTimeout(closeAuth, 700);
  } else {
    $("#authStatus").textContent = $("#authStatus").textContent || "Falha ao autenticar";
  }
}

/* ---------- BIND ALL EVENTS ---------- */
function bindEvents(){
  // nav
  $$(".nav button").forEach(b => b.addEventListener("click", () => { sfxClick(); setNav(b.dataset.nav); }));

  // tabs
  $$(".tabs button").forEach(b => b.addEventListener("click", () => {
    $$(".tabs button").forEach(x => x.classList.remove("active"));
    b.classList.add("active");
    ui.listFilter = b.dataset.filter;
    renderMissions();
  }));

  // nova missão
  $("#btnNewMission").addEventListener("click", () => { sfxClick(); openMissionModal(ui.currentCat); });
  $("#btnCancel").addEventListener("click", closeMissionModal);
  $("#modalMission").addEventListener("click", (e) => { if(e.target.id === "modalMission") closeMissionModal(); });

  // categoria + peso
  $$(".pick", $("#catPicker")).forEach(p => p.addEventListener("click", () => {
    draftMission.cat = p.dataset.cat;
    $$(".pick", $("#catPicker")).forEach(x => x.classList.toggle("sel", x === p));
  }));
  $$(".pick", $("#weightPicker")).forEach(p => p.addEventListener("click", () => {
    draftMission.weight = p.dataset.w;
    $$(".pick", $("#weightPicker")).forEach(x => x.classList.toggle("sel", x === p));
    updateXpHint();
  }));

  // toggle de recorrência
  const toggleRecur = () => {
    const t = $("#recurToggle");
    t.classList.toggle("on");
    const on = t.classList.contains("on");
    t.setAttribute("aria-checked", on ? "true" : "false");
    draftMission.recurring = on;
    if(on && !draftMission.cadence) draftMission.cadence = { type: "daily", days: [] };
    syncCadenceUI();
  };
  $("#recurToggle").addEventListener("click", toggleRecur);
  $("#recurToggle").addEventListener("keydown", (e) => {
    if(e.key === " " || e.key === "Enter"){ e.preventDefault(); toggleRecur(); }
  });

  // cadência
  $$("button", $("#cadenceTypePicker")).forEach(b => b.addEventListener("click", () => {
    if(!draftMission.cadence) draftMission.cadence = { type: "daily", days: [] };
    draftMission.cadence.type = b.dataset.c;
    if(draftMission.cadence.type === "custom" && !draftMission.cadence.days.length){
      draftMission.cadence.days = [new Date().getDay()];
    }
    syncCadenceUI();
  }));
  $$("button", $("#cadenceDaysPicker")).forEach(b => b.addEventListener("click", () => {
    const d = parseInt(b.dataset.d, 10);
    if(!draftMission.cadence) draftMission.cadence = { type: "custom", days: [] };
    const arr = draftMission.cadence.days || [];
    const i = arr.indexOf(d);
    if(i >= 0) arr.splice(i, 1);
    else { arr.push(d); arr.sort((a, b) => a - b); }
    draftMission.cadence.days = arr;
    syncCadenceUI();
  }));

  // nova tag
  $("#newTag").addEventListener("keydown", (e) => {
    if(e.key === "Enter"){
      e.preventDefault();
      const v = $("#newTag").value.trim();
      if(!v) return;
      const state = getState();
      if(!state.tags.includes(v)){ state.tags.push(v); save(); }
      draftMission.tag = v;
      $("#newTag").value = "";
      renderTagPicker();
    }
  });

  // salvar missão
  $("#btnSave").addEventListener("click", () => {
    const title = $("#missionTitle").value.trim();
    if(!title){ $("#missionTitle").focus(); toast("Dê um título à missão"); return; }
    const state = getState();
    if(editingId){
      const m = state.missions.find(x => x.id === editingId);
      if(m){
        m.title  = title;
        m.desc   = $("#missionDesc").value.trim();
        m.cat    = draftMission.cat;
        m.weight = draftMission.weight;
        m.due    = $("#missionDue").value || null;
        m.tag    = draftMission.tag || null;
        m.recurring = !!draftMission.recurring;
        if(m.recurring){
          m.doneAt = null;
          if(typeof m.count !== "number") m.count = 0;
          m.cadence = sanitizeCadence(draftMission.cadence);
        } else {
          delete m.cadence;
        }
        m.updatedAt = new Date().toISOString();
      }
      save();
      closeMissionModal();
      sfxClick();
      toast("Pergaminho atualizado");
      renderAll();
      return;
    }
    const m = {
      id: uid(),
      title,
      desc: $("#missionDesc").value.trim(),
      cat: draftMission.cat,
      weight: draftMission.weight,
      due: $("#missionDue").value || null,
      tag: draftMission.tag || null,
      recurring: !!draftMission.recurring,
      count: 0,
      lastDoneAt: null,
      createdAt: new Date().toISOString(),
      doneAt: null,
      ...(draftMission.recurring ? { cadence: sanitizeCadence(draftMission.cadence) } : {})
    };
    state.missions.unshift(m);
    save();
    closeMissionModal();
    sfxClick();
    toast("Pergaminho selado");
    renderAll();
  });

  // missões: check / del / edit / abrir detalhe
  const missionListClickHandler = (e) => {
    const c   = e.target.closest("[data-id]");
    const d   = e.target.closest("[data-del]");
    const ed  = e.target.closest("[data-edit]");
    const det = e.target.closest("[data-detail]");
    if(d){ deleteMission(d.dataset.del, removeAttachmentFiles); return; }
    if(ed){
      const m = getState().missions.find(x => x.id === ed.dataset.edit);
      if(m){ sfxClick(); openMissionModal(m.cat, m); }
      return;
    }
    if(c){
      const id = c.dataset.id;
      const m = getState().missions.find(x => x.id === id);
      if(!m) return;
      if(m.doneAt){ reopenMission(id); }
      else {
        const ctx = {};
        if(getState().battle.linkedId === id && battle.running) ctx.battleFinish = true;
        completeMission(id, ctx);
      }
      return;
    }
    if(det){ sfxClick(); openDetail(det.dataset.detail); }
  };
  $("#missionList").addEventListener("click", missionListClickHandler);
  $("#todayList").addEventListener("click", missionListClickHandler);

  // busca
  const searchInput = $("#searchInput");
  const searchClear = $("#searchClear");
  searchInput.addEventListener("input", () => {
    ui.searchQuery = searchInput.value || "";
    searchClear.classList.toggle("show", ui.searchQuery.length > 0);
    renderMissions();
  });
  searchClear.addEventListener("click", () => {
    ui.searchQuery = "";
    searchInput.value = "";
    searchClear.classList.remove("show");
    renderMissions();
    searchInput.focus();
  });
  document.addEventListener("keydown", (e) => {
    if(e.key !== "/") return;
    if(/^(input|textarea|select)$/i.test(e.target.tagName)) return;
    if($("#screen-list").classList.contains("hide")) return;
    e.preventDefault();
    searchInput.focus();
    searchInput.select();
  });

  // detalhe
  $("#btnDetailClose").addEventListener("click", closeDetail);
  $("#modalDetail").addEventListener("click", (e) => { if(e.target.id === "modalDetail") closeDetail(); });
  $("#detailTitle").addEventListener("input", setDetailDirty);
  $("#detailNotes").addEventListener("input", setDetailDirty);
  $("#detailTitle").addEventListener("keydown", (e) => {
    if(e.key === "Enter"){ e.preventDefault(); $("#detailNotes").focus(); }
  });
  document.addEventListener("keydown", (e) => {
    if(e.key !== "Escape") return;
    if($("#modalPassword").classList.contains("show")) return;
    if($("#modalConfirm").classList.contains("show")) return;
    if($("#modalDetail").classList.contains("show")) closeDetail();
  });

  $("#btnDetailPick").addEventListener("click", (e) => { e.preventDefault(); $("#detailFiles").click(); });
  $("#detailFiles").addEventListener("change", (e) => { attachFiles(e.target.files); e.target.value = ""; });

  const drop = $("#detailDrop");
  ["dragenter","dragover"].forEach(ev => drop.addEventListener(ev, (e) => {
    e.preventDefault(); e.stopPropagation();
    drop.classList.add("over");
  }));
  ["dragleave","dragend"].forEach(ev => drop.addEventListener(ev, (e) => {
    e.preventDefault(); e.stopPropagation();
    drop.classList.remove("over");
  }));
  drop.addEventListener("drop", (e) => {
    e.preventDefault(); e.stopPropagation();
    drop.classList.remove("over");
    if(e.dataTransfer?.files) attachFiles(e.dataTransfer.files);
  });
  ["dragover","drop"].forEach(ev => window.addEventListener(ev, (e) => {
    if($("#modalDetail").classList.contains("show")) e.preventDefault();
  }));

  document.addEventListener("paste", (e) => {
    if(!$("#modalDetail").classList.contains("show")) return;
    if(!getDetailId()) return;
    const items = e.clipboardData?.items || [];
    const files = [];
    for(const it of items){
      if(it.kind === "file"){
        const f = it.getAsFile();
        if(f && /^image\//i.test(f.type)){
          const ext = (f.type.split("/")[1] || "png").replace("jpeg","jpg");
          const stamp = new Date().toISOString().slice(0,19).replace(/[:T]/g,"-");
          const renamed = new File([f], `colado-${stamp}.${ext}`, { type: f.type });
          files.push(renamed);
        }
      }
    }
    if(files.length === 0) return;
    e.preventDefault();
    const dt = new DataTransfer();
    files.forEach(f => dt.items.add(f));
    attachFiles(dt.files);
    toast(`Imagem colada (${files.length})`);
  });

  $("#detailList").addEventListener("click", (e) => {
    const dl = e.target.closest("[data-att-dl]");
    const rm = e.target.closest("[data-att-rm]");
    if(dl){ downloadAttachment(dl.dataset.attDl); return; }
    if(rm){ removeAttachment(rm.dataset.attRm); return; }
  });

  // som
  $("#btnSound").addEventListener("click", () => {
    const state = getState();
    state.sound = !state.sound;
    save();
    $("#btnSound").style.color = state.sound ? "var(--gold)" : "var(--muted-2)";
    toast(state.sound ? "Som: ligado" : "Som: silenciado");
  });
  $("#btnSound").style.color = getState().sound ? "var(--gold)" : "var(--muted-2)";

  // export/import/reset
  $("#btnExport").addEventListener("click", (e) => exportSave(e.shiftKey, e.altKey));
  $("#btnImport").addEventListener("click", () => importSave());
  $("#fileImport").addEventListener("change", (e) => {
    const f = e.target.files[0];
    if(!f) return;
    applyChronicleFile(f);
    e.target.value = "";
  });
  $("#btnReset").addEventListener("click", async () => {
    const ok = await askConfirm(
      "Reiniciar Crônica?",
      "Esta ação <b>apaga todas as missões, XP, regiões e selos</b>. Considere exportar a Crônica antes. Não há como reverter.",
      { confirmText: "Sim, reiniciar", cancelText: "Cancelar", danger: true }
    );
    if(!ok) return;
    setState(defaultState());
    save();
    renderAll();
    setNav("razao");
    toast("Reino reiniciado");
  });

  // Auth
  $("#btnAuth").addEventListener("click", openAuth);
  $("#modalAuth").addEventListener("click", (e) => { if(e.target.id === "modalAuth") closeAuth(); });
  $("#authCancel").addEventListener("click", closeAuth);
  $("#authClose").addEventListener("click", closeAuth);
  $$("#authTabs button").forEach(b => b.addEventListener("click", () => setAuthMode(b.dataset.tab)));
  $("#authSubmit").addEventListener("click", authSubmit);
  $("#authPass").addEventListener("keydown", (e) => {
    if(e.key === "Enter"){ e.preventDefault(); authSubmit(); }
  });
  $("#authEmail").addEventListener("keydown", (e) => {
    if(e.key === "Enter"){ e.preventDefault(); $("#authPass").focus(); }
  });
  $("#authSignOut").addEventListener("click", async () => {
    const ok = await askConfirm("Sair da conta?", "Sua Crônica continua localmente.",
      { confirmText: "Sair", cancelText: "Ficar" });
    if(!ok) return;
    await sbSignOut();
    closeAuth();
  });

  // Level up close
  $("#luClose").addEventListener("click", () => $("#levelup").classList.remove("show"));
  $("#levelup").addEventListener("click", (e) => { if(e.target.id === "levelup") $("#levelup").classList.remove("show"); });

  // Eventos custom da app
  document.addEventListener("principe:state-changed", () => renderAll());
  document.addEventListener("principe:auth-changed", () => updateAuthUI());
  document.addEventListener("principe:goto-nav", (e) => setNav(e.detail.target));

  bindChroniclesEvents();

  primeAudio();
}

/* ---------- INIT ---------- */
async function init(){
  // Conecta o hook de save → push debounced no Supabase
  onSave(() => schedulePush());

  bindEvents();
  bindModalEvents();
  bindBattleEvents();
  bindArchiveEvents();

  migrate();
  buildMap();
  setNav("razao");
  checkInertia();

  // Auto-arquiva missões antigas (P3.6)
  try{
    const archived = await autoArchive();
    if(archived > 0){
      toast(`${archived} missão(ões) movidas para o Arquivo`);
    }
  }catch(e){ console.warn("auto-archive falhou:", e); }

  renderAll();
  setBattlePhase(25);

  // [P4] inicia Supabase (SDK importado via ESM, não mais via CDN UMD)
  sbInit();
}

/* ---------- CRÔNICAS (P5) ---------- */
async function renderChroniclesList(){
  const host = $("#chroniclesList");
  const empty = $("#chroniclesEmpty");
  if(!host) return;
  let archive = [];
  try{ archive = await loadArchive(); }catch(_){ archive = []; }
  const months = monthsWithActivity(getState(), archive);
  if(months.length === 0){
    host.innerHTML = "";
    empty && empty.classList.remove("hide");
    return;
  }
  empty && empty.classList.add("hide");
  const cards = months.map(({ year, month }) => {
    const s = summarizeMonth(getState(), archive, year, month);
    return [
      '<button class="ch-card mood-', s.mood, '" data-year="', year, '" data-month="', month, '">',
        '<div class="ch-month">', esc(s.label), '</div>',
        '<div class="ch-rank">', esc(s.rank), '</div>',
        '<div class="ch-line">', esc(s.line), '</div>',
      '</button>'
    ].join("");
  }).join("");
  host.innerHTML = cards;
}

async function openChronicle(year, month){
  const host = $("#chronicleReadHost");
  if(!host) return;
  let archive = [];
  try{ archive = await loadArchive(); }catch(_){ archive = []; }
  host.innerHTML = generateChronicle(getState(), archive, year, month);
  setNav("chronicle-read");
}

function bindChroniclesEvents(){
  const btn = $("#btnChronicles");
  if(btn) btn.addEventListener("click", () => { sfxClick(); setNav("chronicles"); });
  const back = $("#chroniclesBack");
  if(back) back.addEventListener("click", () => setNav("razao"));
  const back2 = $("#chronicleReadBack");
  if(back2) back2.addEventListener("click", () => setNav("chronicles"));
  const list = $("#chroniclesList");
  if(list){
    list.addEventListener("click", (e) => {
      const card = e.target.closest("[data-year][data-month]");
      if(!card) return;
      const y = parseInt(card.dataset.year, 10);
      const m = parseInt(card.dataset.month, 10);
      openChronicle(y, m);
    });
  }
  document.addEventListener("principe:render-chronicles", renderChroniclesList);
}

init();

/* ---------- SERVICE WORKER ----------
 * Estratégia de update (P4.1):
 *  - O SW é instalado em background e fica em "waiting" até o usuário aceitar.
 *  - Quando detectamos um SW novo em estado "installed" havendo já um controller
 *    ativo, mostramos um askConfirm ("Nova edição da Crônica — recarregar?").
 *  - Se o usuário confirmar, postamos { type: 'SKIP_WAITING' } pro SW novo
 *    e a página recarrega no evento 'controllerchange'.
 *  - Sem isso, o SW antigo seguiria servindo HTML em cache até reload manual.
 */
if("serviceWorker" in navigator){
  window.addEventListener("load", async () => {
    let _reloading = false;

    const promptUserToUpdate = async (waitingWorker) => {
      if(!waitingWorker) return;
      const ok = await askConfirm(
        "Nova edição da Crônica",
        "Uma nova versão d'<b>O Príncipe Invisível</b> está pronta. Recarregar agora para abrir?",
        { confirmText: "Recarregar", cancelText: "Mais tarde" }
      );
      if(ok) waitingWorker.postMessage({ type: "SKIP_WAITING" });
    };

    try {
      const reg = await navigator.serviceWorker.register("./service-worker.js");

      // Caso 1: já havia um SW novo aguardando antes da página carregar
      if(reg.waiting && navigator.serviceWorker.controller){
        promptUserToUpdate(reg.waiting);
      }

      // Caso 2: novo SW começa a instalar enquanto a página está aberta
      reg.addEventListener("updatefound", () => {
        const sw = reg.installing;
        if(!sw) return;
        sw.addEventListener("statechange", () => {
          if(sw.state === "installed" && navigator.serviceWorker.controller){
            // installed + já existe controller = é um update, não primeira instalação
            promptUserToUpdate(sw);
          }
        });
      });

      // Quando o SW novo assume o controle, recarrega a página uma única vez
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if(_reloading) return;
        _reloading = true;
        window.location.reload();
      });
    } catch(e){
      // SW indisponível (ex: file://, navegador sem suporte) — segue normalmente.
    }
  });
}
