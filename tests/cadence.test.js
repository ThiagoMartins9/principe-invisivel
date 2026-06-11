import { describe, it, expect } from "vitest";
import {
  getCadence, sanitizeCadence, isCadenceDayOf, wasDoneToday,
  nextCadenceDayLabel, recurringStreak, categoriesDoneOn
} from "../src/cadence.js";

describe("sanitizeCadence", () => {
  it("normaliza cadência indefinida para diária", () => {
    expect(sanitizeCadence(undefined)).toEqual({ type: "daily", days: [] });
  });
  it("custom sem dias degrada para diária", () => {
    expect(sanitizeCadence({ type: "custom", days: [] })).toEqual({ type: "daily", days: [] });
  });
  it("filtra dias inválidos e ordena", () => {
    expect(sanitizeCadence({ type: "custom", days: [9, -1, 3, "x", 1] })).toEqual({
      type: "custom", days: [1, 3]
    });
  });
});

describe("isCadenceDayOf", () => {
  it("daily aceita qualquer dia", () => {
    const m = { recurring: true, cadence: { type: "daily" } };
    expect(isCadenceDayOf(m, "2026-05-08")).toBe(true);
  });
  it("custom respeita o dia da semana", () => {
    // 2026-05-08 é uma sexta-feira (dow 5)
    const m = { recurring: true, cadence: { type: "custom", days: [1, 3, 5] } };
    expect(isCadenceDayOf(m, "2026-05-08")).toBe(true);   // sexta
    expect(isCadenceDayOf(m, "2026-05-09")).toBe(false);  // sábado
  });
});

describe("wasDoneToday", () => {
  it("retorna true se lastDoneAt for hoje", () => {
    const today = new Date().toISOString().slice(0, 10);
    const m = { recurring: true, lastDoneAt: today + "T10:00:00.000Z" };
    expect(wasDoneToday(m, today)).toBe(true);
  });
  it("retorna false para missão única", () => {
    expect(wasDoneToday({ recurring: false, doneAt: "2026-05-08" }, "2026-05-08")).toBe(false);
  });
});

describe("nextCadenceDayLabel", () => {
  it("daily devolve 'diária'", () => {
    expect(nextCadenceDayLabel({ recurring: true, cadence: { type: "daily" } })).toBe("diária");
  });
  it("custom devolve 'amanhã' quando o próximo dia agendado é o seguinte", () => {
    // 2026-05-08 é sexta. Dias [6 (sáb)] → próximo é sábado = amanhã.
    const m = { recurring: true, cadence: { type: "custom", days: [6] } };
    expect(nextCadenceDayLabel(m, "2026-05-08")).toBe("amanhã");
  });
});

describe("recurringStreak", () => {
  it("zero quando não há histórico", () => {
    expect(recurringStreak({ recurring: true, xpHistory: [] }, "2026-05-08")).toBe(0);
  });
  it("conta dias consecutivos", () => {
    const m = {
      recurring: true,
      cadence: { type: "daily" },
      xpHistory: [
        { at: "2026-05-08T10:00:00Z", xp: 13 },
        { at: "2026-05-07T10:00:00Z", xp: 13 },
        { at: "2026-05-06T10:00:00Z", xp: 13 }
      ]
    };
    expect(recurringStreak(m, "2026-05-08")).toBe(3);
  });
  it("hoje em aberto não quebra streak (considera anteriores)", () => {
    const m = {
      recurring: true,
      cadence: { type: "daily" },
      xpHistory: [
        { at: "2026-05-07T10:00:00Z", xp: 13 },
        { at: "2026-05-06T10:00:00Z", xp: 13 }
      ]
    };
    // hoje (08) ainda não selada — não zera, conta 2
    expect(recurringStreak(m, "2026-05-08")).toBe(2);
  });
});

describe("categoriesDoneOn", () => {
  it("considera doneAt de únicas e lastDoneAt de recorrentes", () => {
    const t = "2026-05-08";
    const missions = [
      { cat: "razao", doneAt: t + "T10:00:00Z" },
      { cat: "virtu", recurring: true, lastDoneAt: t + "T11:00:00Z" },
      { cat: "armas", doneAt: "2026-04-30T10:00:00Z" },
      { cat: "virtu", doneAt: t + "T12:00:00Z" }
    ];
    const set = categoriesDoneOn(missions, t);
    expect(set.has("razao")).toBe(true);
    expect(set.has("virtu")).toBe(true);
    expect(set.has("armas")).toBe(false);
    expect(set.size).toBe(2);
  });
});
