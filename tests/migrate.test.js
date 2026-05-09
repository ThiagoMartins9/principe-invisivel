import { describe, it, expect, beforeEach } from "vitest";
import { migrate, getState, setState, defaultState } from "../src/state.js";
import { XP_TABLE } from "../src/config.js";

beforeEach(() => {
  setState(defaultState());
  localStorage.clear();
});

describe("migrate", () => {
  it("save default já fica em schemaVersion 8", () => {
    migrate();
    expect(getState().schemaVersion).toBe(8);
  });

  it("v1 → v2: limpa OLD_DEFAULT_TAGS e injeta novas", () => {
    setState({ ...defaultState(), schemaVersion: 1, tags: ["ALESC", "Plenário", "MeuProjeto"] });
    migrate();
    const tags = getState().tags;
    expect(tags).not.toContain("ALESC");
    expect(tags).not.toContain("Plenário");
    expect(tags).toContain("MeuProjeto");
    expect(tags).toContain("Gabinete");
  });

  it("v2 → v3: missões recorrentes ganham campos default", () => {
    setState({
      ...defaultState(),
      schemaVersion: 2,
      missions: [{ id: "x", title: "T", weight: "empreitada", cat: "razao", createdAt: new Date().toISOString() }]
    });
    migrate();
    const m = getState().missions[0];
    expect(m.recurring).toBe(false);
    expect(m.count).toBe(0);
    expect(m.lastDoneAt).toBeNull();
  });

  it("v3 → v4: notes e attachments são inicializados", () => {
    setState({
      ...defaultState(),
      schemaVersion: 3,
      missions: [{ id: "x", title: "T", weight: "empreitada", cat: "razao" }]
    });
    migrate();
    const m = getState().missions[0];
    expect(m.notes).toBe("");
    expect(Array.isArray(m.attachments)).toBe(true);
  });

  it("v5 → v6: recompõe XP preservando o nível", () => {
    setState({ ...defaultState(), schemaVersion: 5, xp: 125 });
    migrate();
    const xp = getState().xp;
    expect(xp).toBeGreaterThanOrEqual(XP_TABLE[3]);
    expect(xp).toBeLessThan(XP_TABLE[4]);
  });

  it("v6 → v7: garante _updatedAt no estado", () => {
    setState({ ...defaultState(), schemaVersion: 6, _updatedAt: null });
    migrate();
    expect(getState()._updatedAt).toBeTruthy();
    expect(getState().schemaVersion).toBeGreaterThanOrEqual(7);
  });

  it("v7 → v8: regionLog é inicializado como array vazio", () => {
    const s = { ...defaultState(), schemaVersion: 7 };
    delete s.regionLog;
    setState(s);
    migrate();
    expect(Array.isArray(getState().regionLog)).toBe(true);
    expect(getState().regionLog).toHaveLength(0);
    expect(getState().schemaVersion).toBe(8);
  });

  it("v7 → v8: preserva regionLog existente se já houver", () => {
    const log = [{ rid: "ven", takenAt: "2026-05-08T10:00:00Z" }];
    setState({ ...defaultState(), schemaVersion: 7, regionLog: log });
    migrate();
    expect(getState().regionLog).toEqual(log);
  });
});
