import { describe, it, expect, beforeEach } from "vitest";
import {
  pickVariant, gatherMonthData, generateChronicle,
  monthsWithActivity, summarizeMonth, monthLabel, monthSeed,
  collectXpEvents
} from "../src/chronicle.js";
import { defaultState, setState, getState } from "../src/state.js";

beforeEach(() => {
  setState(defaultState());
  localStorage.clear();
});

function setupStateWithMissions(){
  const state = defaultState();
  // Não-recorrentes concluídas em maio/2026
  state.missions = [
    { id: "m1", title: "Parecer ALC-12/2026", cat: "razao", weight: "empreitada",
      doneAt: "2026-05-03T10:00:00Z", xpAwarded: 25, attachments: [], notes: "", recurring: false },
    { id: "m2", title: "Estudo de Direito Constitucional", cat: "virtu", weight: "oficio",
      doneAt: "2026-05-08T14:30:00Z", xpAwarded: 13, attachments: [], notes: "", recurring: false },
    { id: "m3", title: "Treino de basquete", cat: "armas", weight: "empreitada",
      doneAt: "2026-05-10T07:00:00Z", xpAwarded: 25, attachments: [], notes: "", recurring: false },
    { id: "m4", title: "Maratona de redação final", cat: "razao", weight: "facanha",
      doneAt: "2026-05-15T20:00:00Z", xpAwarded: 50, attachments: [], notes: "", recurring: false },
    // Mês diferente — não deve aparecer no resumo de maio
    { id: "m5", title: "Mês anterior", cat: "razao", weight: "empreitada",
      doneAt: "2026-04-20T09:00:00Z", xpAwarded: 25, attachments: [], notes: "", recurring: false },
    // Recorrente com xpHistory
    {
      id: "m6", title: "Caminhada matinal", cat: "armas", weight: "oficio",
      recurring: true, attachments: [], notes: "",
      cadence: { type: "daily", days: [] },
      xpHistory: [
        { at: "2026-05-04T07:00:00Z", xp: 13 },
        { at: "2026-05-05T07:00:00Z", xp: 13 },
        { at: "2026-05-06T07:00:00Z", xp: 13 }
      ]
    }
  ];
  state.regionLog = [
    { rid: "ven", takenAt: "2026-05-03T10:00:30Z" },
    { rid: "flo", takenAt: "2026-05-08T14:30:30Z" },
    { rid: "swe", takenAt: "2026-04-15T08:00:00Z" } // mês anterior
  ];
  state.regions = { ven: "taken", flo: "taken", swe: "taken" };
  setState(state);
  return state;
}

describe("pickVariant — determinismo", () => {
  it("mesmo seed+slot devolvem o mesmo item", () => {
    const arr = ["a", "b", "c", "d", "e"];
    const a = pickVariant(arr, "2026-05", "intro");
    const b = pickVariant(arr, "2026-05", "intro");
    expect(a).toBe(b);
  });

  it("seeds diferentes podem devolver itens diferentes", () => {
    const arr = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const a = pickVariant(arr, "2026-05", "intro");
    const b = pickVariant(arr, "2026-06", "intro");
    // Não é garantido serem diferentes (colisão de hash possível), mas
    // verificamos a propriedade fundamental: ambos pertencem ao array.
    expect(arr).toContain(a);
    expect(arr).toContain(b);
  });

  it("array vazio devolve string vazia", () => {
    expect(pickVariant([], "x", "y")).toBe("");
  });
});

describe("collectXpEvents", () => {
  it("agrega missões únicas e recorrentes em ordem cronológica", () => {
    setupStateWithMissions();
    const evs = collectXpEvents(getState(), []);
    expect(evs.length).toBe(8); // 5 únicas + 3 recorrentes
    for(let i = 1; i < evs.length; i++){
      expect(evs[i - 1].at <= evs[i].at).toBe(true);
    }
  });

  it("inclui arquivo passado como segundo argumento", () => {
    setupStateWithMissions();
    const archive = [{
      id: "old1", title: "Pergaminho antigo", cat: "razao", weight: "empreitada",
      doneAt: "2025-12-01T10:00:00Z", xpAwarded: 25, recurring: false
    }];
    const evs = collectXpEvents(getState(), archive);
    expect(evs.length).toBe(9);
    expect(evs[0].at.startsWith("2025-12")).toBe(true);
  });
});

describe("gatherMonthData", () => {
  it("contabiliza todas as missões do mês alvo", () => {
    setupStateWithMissions();
    const d = gatherMonthData(getState(), [], 2026, 5);
    expect(d.totalCompleted).toBe(7); // 4 únicas + 3 recorrentes em maio
    expect(d.byCategory.razao).toBe(2);
    expect(d.byCategory.virtu).toBe(1);
    expect(d.byCategory.armas).toBe(4); // 1 única + 3 recorrentes
    expect(d.byWeight.facanha).toBe(1);
  });

  it("identifica regiões tomadas no mês", () => {
    setupStateWithMissions();
    const d = gatherMonthData(getState(), [], 2026, 5);
    expect(d.regionsTaken.length).toBe(2);
    const names = d.regionsTaken.map(r => r.name).sort();
    expect(names).toEqual(["Florença", "Veneza"]);
  });

  it("classifica humor pelo ratio missões/dias do mês", () => {
    setupStateWithMissions();
    const d = gatherMonthData(getState(), [], 2026, 5);
    // 7 / 31 ≈ 0.226 — humor "sombrio"
    expect(d.mood).toBe("sombrio");
  });

  it("computa rank no fim do mês a partir do XP cumulativo", () => {
    setupStateWithMissions();
    const d = gatherMonthData(getState(), [], 2026, 5);
    expect(d.rankAtEnd).toBeTruthy();
    expect(d.rankAtEnd.name).toBeTruthy();
    expect(d.levelAtEnd).toBeGreaterThanOrEqual(1);
  });
});

describe("generateChronicle", () => {
  it("é determinístico — mesma entrada gera mesma saída", () => {
    setupStateWithMissions();
    const a = generateChronicle(getState(), [], 2026, 5);
    const b = generateChronicle(getState(), [], 2026, 5);
    expect(a).toBe(b);
  });

  it("inclui o nome do mês e do rank no texto", () => {
    setupStateWithMissions();
    const html = generateChronicle(getState(), [], 2026, 5);
    expect(html).toContain("aio de 2026"); // "Maio de 2026" ou "maio de 2026"
    expect(html).toMatch(/O Sem Nome|O Observador|O Emissário/); // patente inicial
  });

  it("menciona regiões conquistadas no mês", () => {
    setupStateWithMissions();
    const html = generateChronicle(getState(), [], 2026, 5);
    expect(html).toContain("Veneza");
    expect(html).toContain("Florença");
    expect(html).not.toContain("Suécia"); // foi tomada em abril
  });

  it("trata mês sem atividade com bloco de silêncio", () => {
    setupStateWithMissions();
    const html = generateChronicle(getState(), [], 2026, 7); // julho — sem dados
    expect(html).toContain("silêncio");
  });

  it("retorna string com markup HTML válido", () => {
    setupStateWithMissions();
    const html = generateChronicle(getState(), [], 2026, 5);
    expect(html).toMatch(/^<article/);
    expect(html).toContain("</article>");
    expect(html).toContain("<blockquote");
  });
});

describe("monthsWithActivity", () => {
  it("agrupa eventos por ano-mês e ordena descendentemente", () => {
    setupStateWithMissions();
    const months = monthsWithActivity(getState(), []);
    // Maio e abril têm atividade
    expect(months.length).toBeGreaterThanOrEqual(2);
    expect(months[0].year).toBe(2026);
    expect(months[0].month).toBe(5); // mais recente primeiro
  });

  it("inclui meses com apenas regiões (sem missões)", () => {
    const state = defaultState();
    state.regionLog = [{ rid: "ven", takenAt: "2026-03-15T10:00:00Z" }];
    setState(state);
    const months = monthsWithActivity(getState(), []);
    expect(months).toContainEqual({ year: 2026, month: 3 });
  });
});

describe("summarizeMonth", () => {
  it("monta linha-resumo legível", () => {
    setupStateWithMissions();
    const s = summarizeMonth(getState(), [], 2026, 5);
    expect(s.label).toMatch(/aio de 2026/);
    expect(s.line).toContain("pergaminhos");
    expect(s.line).toContain("região");
    expect(s.line).toContain("XP");
  });

  it("rotula meses sem atividade como silêncio", () => {
    setState(defaultState());
    const s = summarizeMonth(getState(), [], 2099, 1);
    expect(s.line).toBe("silêncio");
  });
});

describe("monthLabel + monthSeed", () => {
  it("formata mês em PT-BR", () => {
    expect(monthLabel(2026, 5)).toBe("maio de 2026");
    expect(monthLabel(2026, 12)).toBe("dezembro de 2026");
  });

  it("seed determinístico por mês", () => {
    expect(monthSeed(2026, 5)).toBe("2026-05");
    expect(monthSeed(2026, 12)).toBe("2026-12");
  });
});
