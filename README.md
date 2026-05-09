# O Príncipe Invisível

PWA gamificado de gestão de missões — Razão de Estado, Círculo de Virtù e Minhas Armas.

Identidade visual medieval/fantasia. Funciona offline (Service Worker). Sincroniza entre dispositivos via Supabase quando logado. Roda direto do filesystem (`file://`) sem servidor.

## Estrutura

```
.
├── index.html              # Build final (gerado por Vite, single-file).
├── manifest.json
├── service-worker.js
├── icon.svg
├── ranks/                  # Retratos das 7 patentes
├── Saves/                  # Crônicas exportadas (JSON; uso pessoal)
├── package.json
├── vite.config.js
├── vitest.config.js
├── src/
│   ├── index.html          # Template (Vite root)
│   ├── styles.css
│   ├── main.js             # Entrypoint — orquestra módulos e bind de eventos
│   ├── config.js           # Constantes (XP_TABLE, RANKS, CATS, DEFAULT_TAGS, limites)
│   ├── state.js            # Singleton de estado + load/save/migrate
│   ├── ranks.js            # Curva de XP (level/xpInLevel/xpRemaining/rankOf)
│   ├── cadence.js          # Helpers puros de cadência de recorrentes
│   ├── missions.js         # complete/reopen/delete/computeXp/checkInertia
│   ├── render.js           # Renderização (DOM ← state)
│   ├── modal.js            # askConfirm / askPassword
│   ├── battle.js           # Pomodoro/Batalha
│   ├── map.js              # Mapa do continente + paintRegions
│   ├── attachments.js      # IDB local + Storage remoto
│   ├── audio.js            # SFX (Web Audio sintetizado)
│   ├── fx.js               # Sparks + level-up overlay
│   ├── crypto.js           # Cifragem AES-GCM da exportação
│   ├── io.js               # Import/export FSAA + download fallback
│   ├── supabase.js         # Auth + sync + Storage
│   ├── archive.js          # Auto-arquivamento de missões antigas (P3.6)
│   ├── idb.js              # Wrapper IndexedDB
│   └── utils.js            # $ / $$ / esc / toast / formatDate / etc
├── tests/
│   ├── setup.js
│   ├── ranks.test.js
│   ├── missions.test.js
│   ├── cadence.test.js
│   ├── map.test.js
│   ├── migrate.test.js
│   ├── inertia.test.js
│   └── archive.test.js
└── legacy/
    └── index-monoarquivo.html   # Backup do app antes da modularização
```

## Workflow de desenvolvimento

```sh
# Instalar dependências (uma vez)
npm install

# Desenvolvimento com hot-reload em http://localhost:5173
npm run dev

# Rodar testes
npm test               # uma vez
npm run test:watch     # modo watch
npm run test:ui        # UI gráfica do Vitest

# Build de produção (regenera index.html single-file na raiz)
npm run build
```

`npm run build` produz um `index.html` com TODO o CSS/JS inline. É esse arquivo que vai para o OneDrive e que você abre direto no navegador. Mantém `file://` funcionando.

## Arquitetura

**Estado central (state.js).** Singleton mutável persistido em `localStorage`. Toda mutação dispara um hook `onSave()` — usado em produção para `schedulePush()` no Supabase. Migrações de schema versionadas (1 → 7), preservando dados de saves antigos.

**Funções puras separadas.** `computeXp`, `levelFor`, `xpInLevelFor`, `recurringStreak`, `splitForArchive`, helpers de cadência — todas puras, testáveis sem DOM.

**Renderização unidirecional.** `render.js` projeta state → DOM, nunca o contrário. Mutações disparam o evento custom `principe:state-changed`, que `main.js` escuta para chamar `renderAll()`.

**Sem dependências circulares.** `cadence.js` e `fx.js` foram extraídos para quebrar o triângulo `missions ↔ render`. Hierarquia: `config → utils/idb/audio → cadence/ranks → state → fx → modal → map/missions → render → battle → attachments/io/crypto → supabase → main`.

## Testes

Vitest + jsdom. 50+ testes cobrindo:

- Curva de XP e ranks
- `computeXp` com todos os bônus combinados
- Helpers de cadência (daily / custom)
- `recurringStreak` com hoje em aberto
- `paintRegions` com RNG injetado
- Migrações v2 → v7 (cada salto de schema)
- `checkInertia` (devolução de regiões)
- `splitForArchive` (cutoff e exclusões)

Cada teste limpa `localStorage` no `beforeEach`. RNG e datas são determinísticos via injeção de parâmetro.

## Arquivamento (P3.6)

Missões **únicas** (não recorrentes) concluídas há mais de **90 dias** migram automaticamente para um array em IndexedDB no carregamento (`autoArchive()`). Permanecem pesquisáveis na tela "Arquivo" (ícone de caixa na top-bar) e podem ser restauradas com um clique. Recorrentes nunca arquivam — são por natureza recorrentes. O `localStorage` permanece compacto mesmo com anos de uso.

## Sincronização (P4)

Supabase Free, região São Paulo. RLS estrito por `user_id`. Anexos até 500 MB por arquivo no Storage (o bucket `attachments` precisa ter `file_size_limit = 524288000` configurado no dashboard). Sync automático em tempo real após login (e-mail + senha). Realtime via `postgres_changes` traz updates de outros dispositivos.

## Produção

O `index.html` na raiz é o que vai para uso. Para atualizar o app no seu OneDrive, basta:

```sh
npm run build
```

O Vite regenera o `index.html` single-file. O Service Worker tem versão própria (`principe-invisivel-v5`) — bumpe-o em `service-worker.js` quando publicar mudanças relevantes.
