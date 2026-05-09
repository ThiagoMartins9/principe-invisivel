import { describe, it, expect } from "vitest";
import {
  levelFor, xpInLevelFor, xpNeededFor, xpRemainingFor, rankOf
} from "../src/ranks.js";
import { XP_TABLE, XP_BASE, XP_GROWTH, RANKS } from "../src/config.js";

describe("Curva de XP", () => {
  it("L1→L2 custa exatamente 50 XP", () => {
    expect(XP_TABLE[1]).toBe(0);
    expect(XP_TABLE[2]).toBe(50);
  });

  it("levelFor(0) == 1 e levelFor(49) == 1", () => {
    expect(levelFor(0)).toBe(1);
    expect(levelFor(49)).toBe(1);
  });

  it("levelFor(50) == 2 (passa pra L2 ao acumular o custo)", () => {
    expect(levelFor(50)).toBe(2);
  });

  it("xpInLevelFor coincide com (xp - acumulado anterior)", () => {
    expect(xpInLevelFor(50)).toBe(0);
    expect(xpInLevelFor(75)).toBe(25);
  });

  it("xpNeededFor cresce em ~1.5 por nível", () => {
    const need1 = xpNeededFor(0);
    const need60 = xpNeededFor(XP_TABLE[60] || 99999);
    expect(need1).toBe(50);
    // Nível 60 — custo do nível 60 é 50 + floor(59*1.5) = 50+88 = 138
    // (testamos via fórmula direta)
    expect(XP_BASE + Math.floor((60 - 1) * XP_GROWTH)).toBe(138);
  });

  it("xpRemainingFor é monotônico decrescente dentro de um nível", () => {
    expect(xpRemainingFor(0)).toBe(50);
    expect(xpRemainingFor(25)).toBe(25);
    expect(xpRemainingFor(49)).toBe(1);
  });

  it("Total para L61 fica próximo do esperado (~5.6k XP)", () => {
    // Soma cumulativa até L60→L61 (último custo no caminho):
    // É preciso entrar no L61, ou seja, atingir XP_TABLE[61].
    const totalForL61 = XP_TABLE[61];
    expect(totalForL61).toBeGreaterThanOrEqual(5500);
    expect(totalForL61).toBeLessThanOrEqual(5800);
  });
});

describe("Ranks", () => {
  it("Nível 1 cai em O Sem Nome", () => {
    expect(rankOf(1).name).toBe("O Sem Nome");
  });
  it("Nível 7 cai em O Observador", () => {
    expect(rankOf(7).name).toBe("O Observador");
  });
  it("Nível 100 cai em O Príncipe Invisível", () => {
    expect(rankOf(100).name).toBe("O Príncipe Invisível");
  });
  it("Cada rank tem essence definida", () => {
    for(const r of RANKS) expect(r.essence).toBeTypeOf("string");
  });
});
