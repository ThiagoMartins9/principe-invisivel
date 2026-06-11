/**
 * Web Audio sound effects — sintetizados, sem dependências externas.
 * Respeita state.sound (toggle) lendo via getter.
 */
import { getState } from "./state.js";

let audioCtx = null;

function getCtx(){
  if(!getState().sound) return null;
  if(!audioCtx){
    try{ audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch(e){ return null; }
  }
  return audioCtx;
}

function tone(freq, ms, type = "sine", gain = 0.06, when = 0){
  const ctx = getCtx();
  if(!ctx) return;
  const t0 = ctx.currentTime + when;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + ms / 1000);
  osc.connect(g); g.connect(ctx.destination);
  osc.start(t0); osc.stop(t0 + ms / 1000 + 0.02);
}

function chord(notes, dur = 350, type = "triangle", g = 0.05){
  notes.forEach(n => tone(n, dur, type, g));
}

export function sfxComplete(){
  chord([523.25, 659.25], 220, "triangle", 0.05);
  setTimeout(() => chord([659.25, 783.99], 280, "triangle", 0.06), 130);
  setTimeout(() => chord([783.99, 1046.5], 360, "sine",     0.05), 260);
}

export function sfxLevelUp(){
  const seq = [392, 523.25, 659.25, 783.99, 1046.5];
  seq.forEach((n, i) => setTimeout(() => tone(n, 320, "triangle", 0.06), i * 120));
  setTimeout(() => chord([523.25, 659.25, 783.99], 600, "sine", 0.05), seq.length * 120);
}

export function sfxClick(){      tone(880, 60, "square", 0.025); }
export function sfxBattleStart(){ chord([261.63, 329.63], 250, "sawtooth", 0.04); }
export function sfxBattleEnd(){
  chord([329.63, 415.30, 493.88], 400, "triangle", 0.05);
  setTimeout(() => chord([493.88, 622.25, 739.99], 500, "sine", 0.05), 200);
}
export function sfxAbort(){ chord([220, 174.61], 350, "sawtooth", 0.04); }
export function sfxTick(){  tone(1200, 30, "square", 0.012); }

/** Desbloqueia o AudioContext após primeira interação do usuário. */
export function primeAudio(){
  document.addEventListener("click", () => { if(getState().sound) getCtx(); }, { once: true });
}
