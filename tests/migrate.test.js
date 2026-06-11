import { describe, it, expect, beforeEach } from "vitest";
import { migrate, getState, setState, defaultState, assignMissingOrders, nextTopOrder } from "../src/state.js";
import { XP_TABLE, SCHEMA_VERSION } from "../src/config.js";

beforeEach(() => {
  setState(defaultState());
  localStorage.clear();
});

describe("migrate", () => {
  it("save default já fica na SCHEMA_VERSION atual", () => {
    migrate();
    expect(getState().schemaVersion).toBe(SCHEMA_VERSION);
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
    expect(getState().schemaVersion).toBeGreaterThanOrEqual(8);
  });

  it("v7 → v8: preserva regionLog existente se já houver", () => {
    const log = [{ rid: "ven", takenAt: "2026-05-08T10:00:00Z" }];
    setState({ ...defaultState(), schemaVersion: 7, regionLog: log });
    migrate();
    expect(getState().regionLog).toEqual(log);
  });

  it("v8 → v9: atribui order preservando a ordem visual legada", () => {
    const mk = (id, extra = {}) => ({
      id, title: id, weight: "empreitada", cat: "razao",
      recurring: false, doneAt: null, due: null,
      createdAt: "2026-01-01T00:00:00Z", ...extra
    });
    setState({
      ...defaultState(),
      schemaVersion: 8,
      missions: [
        mk("semPrazoVelha", { createdAt: "2026-01-01T00:00:00Z" }),
        mk("concluida",     { doneAt: "2026-02-01T00:00:00Z" }),
        mk("prazoLonge",    { due: "2026-12-31" }),
        mk("prazoPerto",    { due: "2026-06-15" }),
        mk("semPrazoNova",  { createdAt: "2026-05-01T00:00:00Z" })
      ]
    });
    migrate();
    const st = getState();
    expect(st.schemaVersion).toBe(SCHEMA_VERSION);
    const orderOf = id => st.missions.find(m => m.id === id).order;
    // pendentes: due asc primeiro, depois sem due por createdAt desc; concluída ao fim
    expect(orderOf("prazoPerto")).toBeLessThan(orderOf("prazoLonge"));
    expect(orderOf("prazoLonge")).toBeLessThan(orderOf("semPrazoNova"));
    expect(orderOf("semPrazoNova")).toBeLessThan(orderOf("semPrazoVelha"));
    expect(orderOf("semPrazoVelha")).toBeLessThan(orderOf("concluida"));
  });

  it("v8 → v9: idempotente — segunda migração não toca orders existentes", () => {
    setState({
      ...defaultState(),
      schemaVersion: 8,
      missions: [
        { id: "a", title: "a", weight: "empreitada", cat: "razao", createdAt: "2026-01-01T00:00:00Z", doneAt: null },
        { id: "b", title: "b", weight: "empreitada", cat: "razao", createdAt: "2026-02-01T00:00:00Z", doneAt: null }
      ]
    });
    migrate();
    const before = getState().missions.map(m => [m.id, m.order]);
    assignMissingOrders(getState().missions);
    const after = getState().missions.map(m => [m.id, m.order]);
    expect(after).toEqual(before);
  });
});

describe("migrate v10 (P7)", () => {
  it("v9 → v10: inicializa deletedIds como objeto vazio", () => {
    const s = { ...defaultState(), schemaVersion: 9 };
    delete s.deletedIds;
    setState(s);
    migrate();
    expect(getState().deletedIds).toEqual({});
    expect(getState().schemaVersion).toBe(SCHEMA_VERSION);
  });

  it("v9 → v10: preserva deletedIds existente", () => {
    const tombs = { abc: { at: "2026-06-01T00:00:00Z", reason: "deleted" } };
    setState({ ...defaultState(), schemaVersion: 9, deletedIds: tombs });
    migrate();
    expect(getState().deletedIds).toEqual(tombs);
  });
});

describe("assignMissingOrders / nextTopOrder", () => {
  it("completa apenas as missões sem order, após o maior existente", () => {
    const missions = [
      { id: "a", order: 3,  doneAt: null, due: null, createdAt: "2026-01-02T00:00:00Z" },
      { id: "b",            doneAt: null, due: null, createdAt: "2026-01-01T00:00:00Z" },
      { id: "c", order: 10, doneAt: null, due: null, createdAt: "2026-01-03T00:00:00Z" }
    ];
    assignMissingOrders(missions);
    expect(missions.find(m => m.id === "a").order).toBe(3);
    expect(missions.find(m => m.id === "c").order).toBe(10);
    expect(missions.find(m => m.id === "b").order).toBe(11);
  });

  it("nextTopOrder retorna min−1 (e 0 em estado vazio)", () => {
    setState({ ...defaultState(), missions: [] });
    expect(nextTopOrder()).toBe(0);
    setState({ ...defaultState(), missions: [{ id: "a", order: -2 }, { id: "b", order: 7 }] });
    expect(nextTopOrder()).toBe(-3);
  });
});
