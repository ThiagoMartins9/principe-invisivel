import { describe, it, expect, beforeEach, vi } from "vitest";
import { setState, defaultState, getState } from "../src/state.js";
import { checkInertia } from "../src/missions.js";

beforeEach(() => {
  setState(defaultState());
  // Stub do toast: precisa de #toasts no DOM
  document.body.innerHTML = `<div id="toasts"></div>`;
});

describe("checkInertia", () => {
  it("não faz nada se nunca houve missão concluída", () => {
    setState({ ...defaultState(), lastDoneDate: null });
    checkInertia();
    expect(getState().inertiaDays).toBe(0);
  });

  it("não devolve regiões se diff <= 1", () => {
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10);
    setState({
      ...defaultState(),
      lastDoneDate: yesterday,
      regions: { fra: "taken", ita: "taken", aus: "taken" }
    });
    checkInertia();
    const taken = Object.values(getState().regions).filter(v => v === "taken").length;
    expect(taken).toBe(3);
  });

  it("devolve N-1 regiões para N dias parados", () => {
    // simulamos 5 dias parados → 4 regiões devolvidas
    const lastDone = new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    setState({
      ...defaultState(),
      lastDoneDate: lastDone,
      regions: { fra: "taken", ita: "taken", aus: "taken", swi: "taken", den: "taken", swe: "taken" }
    });
    checkInertia();
    const taken = Object.values(getState().regions).filter(v => v === "taken").length;
    expect(taken).toBe(2); // 6 - 4 = 2
  });
});
