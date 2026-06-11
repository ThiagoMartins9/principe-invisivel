import { describe, it, expect } from "vitest";
import {
  mergeStates, mergeMission, mergeXpHistory, missionStamp,
  isTombstoneActive, pruneTombstones, statesEquivalent
} from "../src/merge.js";
import { defaultState } from "../src/state.js";

const NOW = "2026-06-11T12:00:00.000Z";

const mk = (id, extra = {}) => ({
  id, title: id, cat: "razao", weight: "empreitada",
  recurring: false, doneAt: null, due: null, order: 0,
  createdAt: "2026-06-01T10:00:00.000Z", ...extra
});

const st = (extra = {}) => ({ ...defaultState(), ...extra });

describe("missionStamp", () => {
  it("usa o maior carimbo disponível", () => {
    expect(missionStamp(mk("a", {
      createdAt: "2026-01-01T00:00:00Z",
      doneAt:    "2026-03-01T00:00:00Z",
      updatedAt: "2026-02-01T00:00:00Z"
    }))).toBe(Date.parse("2026-03-01T00:00:00Z"));
    expect(missionStamp(null)).toBe(0);
  });
});

describe("mergeStates — cenário central da P7", () => {
  it("edições offline em missões DIFERENTES não se perdem (o bug do LWW)", () => {
    const base = [mk("a"), mk("b")];
    const local = st({
      _updatedAt: "2026-06-11T10:00:00Z",
      missions: [{ ...base[0], title: "a editada local", updatedAt: "2026-06-11T10:00:00Z" }, base[1]]
    });
    const remote = st({
      _updatedAt: "2026-06-11T11:00:00Z",
      missions: [base[0], { ...base[1], title: "b editada remoto", updatedAt: "2026-06-11T11:00:00Z" }]
    });
    const { state } = mergeStates(local, remote, NOW);
    const byId = Object.fromEntries(state.missions.map(m => [m.id, m]));
    expect(byId.a.title).toBe("a editada local");
    expect(byId.b.title).toBe("b editada remoto");
  });

  it("mesma missão editada nos dois lados: vence o updatedAt mais novo", () => {
    const local  = st({ missions: [mk("a", { title: "velha", updatedAt: "2026-06-10T00:00:00Z" })] });
    const remote = st({ missions: [mk("a", { title: "nova",  updatedAt: "2026-06-11T00:00:00Z" })] });
    const { state } = mergeStates(local, remote, NOW);
    expect(state.missions[0].title).toBe("nova");
  });

  it("missão criada offline em um lado só entra no resultado", () => {
    const local  = st({ missions: [mk("soLocal")] });
    const remote = st({ missions: [mk("soRemoto")] });
    const { state } = mergeStates(local, remote, NOW);
    expect(state.missions.map(m => m.id).sort()).toEqual(["soLocal", "soRemoto"]);
  });
});

describe("mergeStates — tombstones", () => {
  it("exclusão remota (tombstone) remove missão local intocada", () => {
    const local = st({ missions: [mk("x", { updatedAt: "2026-06-01T00:00:00Z" })] });
    const remote = st({
      missions: [],
      deletedIds: { x: { at: "2026-06-10T00:00:00Z", reason: "deleted" } }
    });
    const { state, toArchive } = mergeStates(local, remote, NOW);
    expect(state.missions).toHaveLength(0);
    expect(toArchive).toHaveLength(0);
    expect(state.deletedIds.x).toBeTruthy();
  });

  it("tombstone 'archived' devolve a missão em toArchive (propaga arquivamento)", () => {
    const local = st({ missions: [mk("velha", { doneAt: "2026-01-01T00:00:00Z" })] });
    const remote = st({
      missions: [],
      deletedIds: { velha: { at: "2026-06-10T00:00:00Z", reason: "archived" } }
    });
    const { state, toArchive } = mergeStates(local, remote, NOW);
    expect(state.missions).toHaveLength(0);
    expect(toArchive.map(m => m.id)).toEqual(["velha"]);
  });

  it("missão editada APÓS o tombstone ressuscita e derruba o tombstone", () => {
    const local = st({ missions: [mk("x", { title: "editada depois", updatedAt: "2026-06-11T00:00:00Z" })] });
    const remote = st({
      missions: [],
      deletedIds: { x: { at: "2026-06-10T00:00:00Z", reason: "deleted" } }
    });
    const { state } = mergeStates(local, remote, NOW);
    expect(state.missions.map(m => m.id)).toEqual(["x"]);
    expect(state.deletedIds.x).toBeUndefined();
  });

  it("poda tombstones além do TTL", () => {
    const tombs = {
      novo:  { at: "2026-06-01T00:00:00Z", reason: "deleted" },
      velho: { at: "2025-06-01T00:00:00Z", reason: "deleted" }
    };
    const out = pruneTombstones(tombs, NOW, 90);
    expect(out.novo).toBeTruthy();
    expect(out.velho).toBeUndefined();
  });

  it("isTombstoneActive: empate de carimbo favorece o tombstone", () => {
    const m = mk("x", { updatedAt: "2026-06-10T00:00:00Z" });
    expect(isTombstoneActive({ at: "2026-06-10T00:00:00Z" }, m)).toBe(true);
    expect(isTombstoneActive({ at: "2026-06-09T00:00:00Z" }, m)).toBe(false);
  });
});

describe("mergeStates — recorrentes (merge fino)", () => {
  it("xpHistory é unido por timestamp; count e lastDoneAt acompanham", () => {
    const local = st({
      missions: [mk("r", {
        recurring: true, count: 2,
        lastDoneAt: "2026-06-10T08:00:00Z",
        xpHistory: [
          { at: "2026-06-09T08:00:00Z", xp: 25 },
          { at: "2026-06-10T08:00:00Z", xp: 25 }
        ]
      })]
    });
    const remote = st({
      missions: [mk("r", {
        recurring: true, count: 2,
        lastDoneAt: "2026-06-11T09:00:00Z",
        xpHistory: [
          { at: "2026-06-09T08:00:00Z", xp: 25 },
          { at: "2026-06-11T09:00:00Z", xp: 31 }
        ]
      })]
    });
    const { state } = mergeStates(local, remote, NOW);
    const r = state.missions[0];
    expect(r.xpHistory).toHaveLength(3);
    expect(r.count).toBe(3);
    expect(r.lastDoneAt).toBe("2026-06-11T09:00:00Z");
  });

  it("mergeXpHistory deduplica e ordena", () => {
    const out = mergeXpHistory(
      [{ at: "2026-06-10T00:00:00Z", xp: 1 }],
      [{ at: "2026-06-09T00:00:00Z", xp: 2 }, { at: "2026-06-10T00:00:00Z", xp: 1 }]
    );
    expect(out.map(e => e.at)).toEqual(["2026-06-09T00:00:00Z", "2026-06-10T00:00:00Z"]);
  });

  it("count histórico maior que o xpHistory é preservado (pré-v5)", () => {
    const a = mk("r", { recurring: true, count: 40, xpHistory: [] });
    const b = mk("r", { recurring: true, count: 38, xpHistory: [{ at: "2026-06-10T00:00:00Z", xp: 25 }] });
    const m = mergeMission(a, b);
    expect(m.count).toBe(40);
  });
});

describe("mergeStates — escalares e tags", () => {
  it("xp e missionsDone usam max()", () => {
    const local  = st({ xp: 900, missionsDone: 40, _updatedAt: "2026-06-11T11:00:00Z" });
    const remote = st({ xp: 950, missionsDone: 38, _updatedAt: "2026-06-10T00:00:00Z" });
    const { state } = mergeStates(local, remote, NOW);
    expect(state.xp).toBe(950);
    expect(state.missionsDone).toBe(40);
  });

  it("demais escalares seguem o lado com _updatedAt mais novo", () => {
    const local  = st({ vigor: 2, streak: 5, _updatedAt: "2026-06-11T11:00:00Z" });
    const remote = st({ vigor: 0, streak: 9, _updatedAt: "2026-06-10T00:00:00Z" });
    const { state } = mergeStates(local, remote, NOW);
    expect(state.vigor).toBe(2);
    expect(state.streak).toBe(5);
  });

  it("tags: união sem duplicatas", () => {
    const local  = st({ tags: ["Gabinete", "Leitura"], _updatedAt: "2026-06-11T11:00:00Z" });
    const remote = st({ tags: ["Leitura", "Plenário 2ª"], _updatedAt: "2026-06-10T00:00:00Z" });
    const { state } = mergeStates(local, remote, NOW);
    expect(state.tags).toContain("Gabinete");
    expect(state.tags).toContain("Plenário 2ª");
    expect(state.tags.filter(t => t === "Leitura")).toHaveLength(1);
  });
});

describe("statesEquivalent e convergência", () => {
  it("ignora _updatedAt, ordem de chaves e ordem de missões", () => {
    const a = st({ missions: [mk("a"), mk("b")], _updatedAt: "2026-06-11T00:00:00Z" });
    const b = {
      ...JSON.parse(JSON.stringify(st({ missions: [mk("b"), mk("a")] }))),
      _updatedAt: "2026-06-10T00:00:00Z"
    };
    expect(statesEquivalent(a, b)).toBe(true);
  });

  it("detecta diferença real", () => {
    const a = st({ missions: [mk("a")] });
    const b = st({ missions: [mk("a", { title: "outra" })] });
    expect(statesEquivalent(a, b)).toBe(false);
  });

  it("merge é idempotente: merge(merged, remote) ≡ merged (sem novo push)", () => {
    const local = st({
      missions: [mk("a", { updatedAt: "2026-06-11T10:00:00Z" }), mk("c")],
      deletedIds: { z: { at: "2026-06-01T00:00:00Z", reason: "deleted" } }
    });
    const remote = st({
      missions: [mk("a"), mk("b", { recurring: true, count: 1, xpHistory: [{ at: "2026-06-10T00:00:00Z", xp: 25 }] })]
    });
    const r1 = mergeStates(local, remote, NOW);
    const r2 = mergeStates(r1.state, remote, NOW);
    expect(statesEquivalent(r1.state, r2.state)).toBe(true);
    const r3 = mergeStates(r1.state, r1.state, NOW);
    expect(statesEquivalent(r1.state, r3.state)).toBe(true);
  });
});
