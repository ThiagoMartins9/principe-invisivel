/**
 * Setup global do Vitest.
 * Reinicializa localStorage e crypto antes de cada teste para isolamento.
 */
import { beforeEach, vi } from "vitest";

beforeEach(() => {
  localStorage.clear();
  vi.useRealTimers();
});

// Mock de crypto.randomUUID e crypto.getRandomValues caso jsdom não traga
if(!globalThis.crypto) globalThis.crypto = {};
if(!globalThis.crypto.randomUUID){
  globalThis.crypto.randomUUID = () =>
    "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
}
if(!globalThis.crypto.getRandomValues){
  globalThis.crypto.getRandomValues = (arr) => {
    for(let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
    return arr;
  };
}
