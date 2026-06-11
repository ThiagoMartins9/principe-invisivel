import { describe, it, expect } from "vitest";
import { applyManualOrder } from "../src/reorder.js";

const mk = (id, order) => ({ id, order });

describe("applyManualOrder", () => {
  it("reatribui o multiset de orders na nova sequência", () => {
    const missions = [mk("a", 2), mk("b", 5), mk("c", 9)];
    // usuário arrastou "c" para o topo: nova sequência visual = c, a, b
    const changed = applyManualOrder(missions, ["c", "a", "b"]);
    expect(changed).toBe(true);
    expect(missions.find(m => m.id === "c").order).toBe(2);
    expect(missions.find(m => m.id === "a").order).toBe(5);
    expect(missions.find(m => m.id === "b").order).toBe(9);
  });

  it("não inflaciona valores: o conjunto de orders permanece o mesmo", () => {
    const missions = [mk("a", -3), mk("b", 0), mk("c", 4), mk("d", 7)];
    applyManualOrder(missions, ["d", "b", "a", "c"]);
    const set = missions.map(m => m.order).sort((x, y) => x - y);
    expect(set).toEqual([-3, 0, 4, 7]);
  });

  it("retorna false quando a sequência não muda nada", () => {
    const missions = [mk("a", 1), mk("b", 2)];
    expect(applyManualOrder(missions, ["a", "b"])).toBe(false);
  });

  it("ignora ids inexistentes e exige ao menos 2 itens válidos", () => {
    const missions = [mk("a", 1), mk("b", 2)];
    expect(applyManualOrder(missions, ["a", "fantasma"])).toBe(false);
    expect(applyManualOrder(missions, ["b", "fantasma", "a"])).toBe(true);
    expect(missions.find(m => m.id === "b").order).toBe(1);
    expect(missions.find(m => m.id === "a").order).toBe(2);
  });

  it("missões da sequência sem order finito caem no fallback 0..n-1", () => {
    const missions = [{ id: "a" }, { id: "b", order: 5 }, { id: "c", order: Infinity }];
    applyManualOrder(missions, ["c", "b", "a"]);
    expect(missions.find(m => m.id === "c").order).toBe(0);
    expect(missions.find(m => m.id === "b").order).toBe(1);
    expect(missions.find(m => m.id === "a").order).toBe(2);
  });

  it("não toca em missões fora da sequência (outras categorias/concluídas)", () => {
    const missions = [mk("a", 1), mk("b", 2), mk("z", 99)];
    applyManualOrder(missions, ["b", "a"]);
    expect(missions.find(m => m.id === "z").order).toBe(99);
  });

  it("entradas inválidas retornam false sem lançar", () => {
    expect(applyManualOrder(null, ["a"])).toBe(false);
    expect(applyManualOrder([mk("a", 1)], null)).toBe(false);
    expect(applyManualOrder([], [])).toBe(false);
  });
});
