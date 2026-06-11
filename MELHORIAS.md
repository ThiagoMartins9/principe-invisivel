# O Príncipe Invisível — Análise técnica e roadmap de melhorias

*Análise de 11/06/2026 · base: v0.6.0 (schema 10, SW v10)*

## Diagnóstico geral

O app está em estado sólido. A modularização (P3) foi bem executada: estado central com migrações versionadas, renderização unidirecional, funções puras testáveis (103 testes passando), hierarquia de imports sem ciclos. O sync Supabase (P4) opera agora com merge por missão (P7, abaixo). Pontos de atenção restantes:

1. ~~Last-write-wins por estado inteiro~~ — **resolvido na P7** (11/06/2026).
2. **`SB_KEY` publicável no bundle** — correto para chave `publishable` com RLS estrito, sem ação necessária; apenas manter o RLS como única barreira real.
3. ~~Higiene do repositório (timestamps órfãos, Git sem commit)~~ — **resolvido**: artefatos `*.timestamp-*.mjs` removidos (já ignorados no `.gitignore`) e commit inicial realizado.
4. **`legacy/index-monoarquivo.html`** segue fora do Git (ignorado); com histórico ativo, pode ser apagado do disco quando desejar.

## Implementado — P6: Reordenação por arrasto (11/06/2026)

Missões pendentes podem ser arrastadas pela alça ⠿ (borda esquerda do card). Ordem 100% manual nas listas de categoria (`m.order` asc; concluídas seguem cronológicas); novas missões no topo; Pointer Events (mouse + touch + caneta) com placeholder, auto-scroll e teclado ↑/↓; arrasto desabilitado com busca/filtro ativo; migração v9 preserva a ordem visual pré-existente; campo `order` sincroniza via Supabase.

## Implementado — P7: Merge por missão no sync (11/06/2026)

O pull (login e realtime) deixou de usar last-write-wins de estado inteiro. `merge.js` (puro, 18 testes dedicados):

- **LWW individual por missão** via carimbo `updatedAt` — toda mutação carimba (`touchMission` em concluir/reabrir/editar/notas/anexos/reordenar). Edições offline em dispositivos diferentes sobre missões diferentes não se perdem mais.
- **Tombstones** em `state.deletedIds` (`{ at, reason: "deleted"|"archived" }`, TTL 90 dias): exclusão definitiva se propaga; arquivamento num dispositivo arquiva nos demais (o merge devolve `toArchive` e o sync grava no IDB local). Editar uma missão depois de excluída a ressuscita — a intenção mais recente vence.
- **Recorrentes com merge fino**: `xpHistory` unido por timestamp (selos feitos offline em dois aparelhos somam-se), `count` = max(counts, |histórico|), `lastDoneAt` = max.
- **Acumuladores** `xp`/`missionsDone` usam `max()` entre os lados — melhor que LWW nos conflitos reais ("ambos progrediram"), ainda sem somar deltas (ver P12 abaixo). Demais escalares (vigor, streak, regions, regionLog) seguem o `_updatedAt` mais novo.
- **Convergência sem eco**: `statesEquivalent()` compara estados canonizados (chaves ordenadas — o jsonb do Postgres reordena chaves; missões por id; ignora `_updatedAt`). Só aplica/re-pusha quando há diferença real; merge idempotente verificado em teste.

Limitação conhecida e aceita: XP é um acumulador global, não event-sourced. Em conflito simultâneo, `max()` preserva o maior lado, não a soma dos deltas. Correção definitiva exigiria log de eventos de XP (P12).

## Roadmap sugerido (priorizado)

### P8 — Qualidade de vida nas listas (valor alto, esforço baixo)
- **Desfazer (undo) no toast** após concluir/excluir (5s) — exclusão hoje é irreversível mesmo com confirmação.
- **Adiar prazo rápido**: botão "+1 dia / +1 semana" no card de missão atrasada (tela Hoje).
- **Duplicar missão** (mesmo peso/tag/categoria) pelo menu de edição.

### P9 — Recorrentes mais inteligentes (valor médio, esforço médio)
- Cadência quinzenal/mensal (`type: "interval", everyDays: N`) — o `cadence.js` puro já comporta a extensão.
- "Pausar recorrente" (férias/recesso parlamentar) sem zerar streak.

### P10 — Relatórios da Crônica (valor médio, esforço médio)
A Crônica Narrada (P5) já agrega por mês. Faltam: visão anual (heatmap estilo GitHub por categoria), XP médio semanal, e exportação da crônica em PDF para registro pessoal.

### P11 — Robustez de plataforma (valor baixo-médio, esforço baixo)
- `beforeinstallprompt` para instalar o PWA com um botão próprio.
- Detecção de armazenamento quase cheio (`navigator.storage.estimate`) com aviso antes de anexos grandes.
- Backup automático semanal silencioso para a pasta `Saves/` via FSAA quando a permissão já existir.

### P12 — XP event-sourced (valor baixo enquanto P7 basta, esforço alto)
Registrar deltas de XP (`{at, delta, missionId}`) em vez de acumulador; XP total = redução do log. Elimina a última classe de conflito de sync. Só vale se o uso multi-dispositivo simultâneo se tornar rotina.

## Notas de manutenção

- Build de produção: `npm run build` (regenera `index.html` raiz) · Pages: `npm run build:pages`.
- Ao publicar mudança relevante, bumpar `VERSION` em `service-worker.js` (raiz **e** `dist/`). Atual: `v10`.
- Testes: `npm test` — 103 testes; merge em `tests/merge.test.js`, ordem manual em `tests/reorder.test.js`.
- Git ativo desde 11/06/2026 (commit inicial). `index.html` da raiz é versionado; `dist/`, `Saves/cronica-*.json`, `legacy/` e timestamps ficam fora.
