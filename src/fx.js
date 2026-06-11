/**
 * Efeitos visuais: sparks (faíscas) e overlay de level-up.
 * Pequeno e independente, evita ciclos entre missions.js e render.js.
 */
import { $ } from "./utils.js";
import { sfxLevelUp } from "./audio.js";

export function burstSparks(){
  const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
  for(let i = 0; i < 22; i++){
    const s = document.createElement("div");
    s.className = "spark";
    const a = Math.random() * Math.PI * 2;
    const r = 80 + Math.random() * 120;
    s.style.left = (cx + Math.cos(a) * r) + "px";
    s.style.top  = (cy + Math.sin(a) * r) + "px";
    document.body.appendChild(s);
    setTimeout(() => s.remove(), 900);
  }
}

export function showLevelUp(rank){
  $("#luTitle").textContent = rank.name;
  $("#luEssence").textContent = rank.essence + ".";
  $("#levelup").classList.add("show");
  sfxLevelUp();
}
