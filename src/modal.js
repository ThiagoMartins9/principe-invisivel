/**
 * Modais customizados que substituem confirm()/prompt() nativos:
 *  - askConfirm(title, htmlMsg, opts) → Promise<boolean>
 *  - askPassword(title, htmlMsg, opts) → Promise<string|null>
 *
 * Bindings de eventos ficam em bindModalEvents() chamada uma vez no init.
 */
import { $, $$ } from "./utils.js";

let _confirmResolver = null;

export function askConfirm(title, htmlMsg, opts = {}){
  return new Promise((resolve) => {
    $("#confirmTitle").textContent = title || "Confirmar";
    $("#confirmMsg").innerHTML = htmlMsg || "Tem certeza?";
    $("#confirmOk").textContent     = opts.confirmText || "Confirmar";
    $("#confirmCancel").textContent = opts.cancelText  || "Cancelar";
    $("#confirmOk").classList.toggle("danger", !!opts.danger);
    $("#confirmOk").classList.toggle("gold",  !opts.danger);
    _confirmResolver = resolve;
    $("#modalConfirm").classList.add("show");
    setTimeout(() => $("#confirmOk").focus(), 60);
  });
}

function closeConfirm(result){
  $("#modalConfirm").classList.remove("show");
  if(_confirmResolver){
    const r = _confirmResolver;
    _confirmResolver = null;
    r(!!result);
  }
}

let _passResolver = null;

export function askPassword(title, htmlMsg, opts = {}){
  return new Promise((resolve) => {
    $("#passTitle").textContent = title || "Senha";
    $("#passMsg").innerHTML     = htmlMsg || "";
    $("#passInput").value       = "";
    $("#passInput").placeholder = opts.placeholder || "senha…";
    $("#passOk").textContent     = opts.confirmText || "Confirmar";
    $("#passCancel").textContent = opts.cancelText  || "Cancelar";
    $("#passOk").classList.toggle("danger", !!opts.danger);
    $("#passOk").classList.toggle("gold",  !opts.danger);
    _passResolver = resolve;
    $("#modalPassword").classList.add("show");
    setTimeout(() => $("#passInput").focus(), 60);
  });
}

function closePassword(value){
  $("#modalPassword").classList.remove("show");
  if(_passResolver){
    const r = _passResolver;
    _passResolver = null;
    r(value);
  }
}

export function bindModalEvents(){
  $("#confirmOk").addEventListener("click",     () => closeConfirm(true));
  $("#confirmCancel").addEventListener("click", () => closeConfirm(false));
  $("#modalConfirm").addEventListener("click", (e) => {
    if(e.target.id === "modalConfirm") closeConfirm(false);
  });

  $("#passOk").addEventListener("click",     () => closePassword($("#passInput").value));
  $("#passCancel").addEventListener("click", () => closePassword(null));
  $("#modalPassword").addEventListener("click", (e) => {
    if(e.target.id === "modalPassword") closePassword(null);
  });
  $("#passInput").addEventListener("keydown", (e) => {
    if(e.key === "Enter")  { e.preventDefault(); closePassword($("#passInput").value); }
    if(e.key === "Escape") { e.preventDefault(); closePassword(null); }
  });

  // ESC global respeitando hierarquia: senha > confirmação > detalhe
  document.addEventListener("keydown", (e) => {
    if(!$("#modalConfirm").classList.contains("show")) return;
    if(e.key === "Escape"){ e.preventDefault(); closeConfirm(false); }
    if(e.key === "Enter") { e.preventDefault(); closeConfirm(true);  }
  });
}
