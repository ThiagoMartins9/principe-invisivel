import { describe, it, expect, beforeEach } from "vitest";
import { paintRegions, REGIONS } from "../src/map.js";
import { getState, setState, defaultState } from "../src/state.js";

beforeEach(() => {
  setState(defaultState());
});

// stub do refreshMap (sem DOM no teste)
beforeEach(() => {
  document.body.innerHTML = "";
});

describe("paintRegions", () => {
  it("pinta exatamente N regiões com RNG determinístico", () => {
    // RNG fixo: sempre escolhe primeira posição (0)
    const rng = () => 0;
    paintRegions(3, rng);
    const taken = Object.keys(getState().regions).filter(k => getState().regions[k] === "taken");
    expect(taken.length).toBe(3);
  });

  it("não pinta além do total disponível", () => {
    const rng = () => 0;
    paintRegions(REGIONS.length + 10, rng);
    const taken = Object.keys(getState().regions).filter(k => getState().regions[k] === "taken");
    expect(taken.length).toBe(REGIONS.length);
  });

  it("não repinta regiões já tomadas", () => {
    const rng = () => 0;
    paintRegions(5, rng);
    const before = Object.keys(getState().regions).length;
    paintRegions(5, rng);
    const after = Object.keys(getState().regions).length;
    expect(after).toBe(before + 5);
  });
});

describe("REGIONS", () => {
  it("tem 40 regiões definidas", () => {
    expect(REGIONS.length).toBe(40);
  });
  it("todas regiões têm id e nome", () => {
    for(const r of REGIONS){
      expect(r.id).toBeTruthy();
      expect(r.nm).toBeTruthy();
    }
  });
});
