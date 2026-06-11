import { describe, it, expect } from "vitest";
import { splitForArchive, cutoffDate } from "../src/archive.js";

describe("splitForArchive", () => {
  it("missões recorrentes nunca arquivam", () => {
    const missions = [
      { id: "1", recurring: true, doneAt: "2020-01-01T00:00:00Z" }
    ];
    const { toArchive, toKeep } = splitForArchive(missions, "2025-01-01");
    expect(toArchive).toHaveLength(0);
    expect(toKeep).toHaveLength(1);
  });

  it("missões pendentes nunca arquivam, mesmo antigas", () => {
    const missions = [
      { id: "1", recurring: false, doneAt: null, createdAt: "2010-01-01T00:00:00Z" }
    ];
    const { toArchive, toKeep } = splitForArchive(missions, "2025-01-01");
    expect(toArchive).toHaveLength(0);
    expect(toKeep).toHaveLength(1);
  });

  it("concluídas antes do cutoff vão para o arquivo", () => {
    const missions = [
      { id: "1", recurring: false, doneAt: "2024-01-01T00:00:00Z" }, // antes do cutoff
      { id: "2", recurring: false, doneAt: "2026-01-01T00:00:00Z" }  // depois do cutoff
    ];
    const { toArchive, toKeep } = splitForArchive(missions, "2025-12-01");
    expect(toArchive.map(m => m.id)).toEqual(["1"]);
    expect(toKeep.map(m => m.id)).toEqual(["2"]);
  });

  it("doneAt malformado não causa crash, mantém na lista", () => {
    const missions = [
      { id: "1", recurring: false, doneAt: "not-a-date" }
    ];
    const { toArchive, toKeep } = splitForArchive(missions, "2025-01-01");
    expect(toArchive).toHaveLength(0);
    expect(toKeep).toHaveLength(1);
  });
});

describe("cutoffDate", () => {
  it("calcula a data N dias atrás", () => {
    const fixedNow = new Date("2026-05-08T00:00:00Z");
    expect(cutoffDate(90, fixedNow)).toBe("2026-02-07");
  });
});
