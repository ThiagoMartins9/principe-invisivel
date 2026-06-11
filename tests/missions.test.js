import { describe, it, expect } from "vitest";
import { computeXp } from "../src/missions.js";
import { BASE_XP, WEIGHTS, VIGOR_BONUS, POMODORO_BONUS, FINISH_IN_BATTLE } from "../src/config.js";

describe("computeXp", () => {
  it("missão de Empreitada vale 25 XP base", () => {
    expect(computeXp({ weight: "empreitada" })).toBe(25);
  });

  it("Ofício metade, Façanha dobro", () => {
    expect(computeXp({ weight: "oficio" })).toBe(13);    // arredonda 12.5
    expect(computeXp({ weight: "facanha" })).toBe(50);
  });

  it("Vigor 1 carga = +25%", () => {
    const xp = computeXp({ weight: "empreitada" }, { usingVigor: true }, 1);
    expect(xp).toBe(31); // 25 * 1.25 = 31.25 → 31
  });

  it("Pomodoro vencido = +50%", () => {
    const xp = computeXp({ weight: "empreitada" }, { pomodoro: true });
    expect(xp).toBe(38); // 25 * 1.5 = 37.5 → 38
  });

  it("Concluir durante a batalha = +100%", () => {
    const xp = computeXp({ weight: "empreitada" }, { battleFinish: true });
    expect(xp).toBe(50); // 25 * 2 = 50
  });

  it("Empilha bônus: Façanha + Vigor + Pomodoro", () => {
    // 50 base * (1 + 0.25 + 0.5) = 50 * 1.75 = 87.5 → 88
    const xp = computeXp({ weight: "facanha" }, { usingVigor: true, pomodoro: true }, 1);
    expect(xp).toBe(88);
  });

  it("Vigor satura em 3 cargas (não passa de +75%)", () => {
    const a = computeXp({ weight: "empreitada" }, { usingVigor: true }, 3);
    const b = computeXp({ weight: "empreitada" }, { usingVigor: true }, 10);
    expect(a).toBe(b);
  });
});
