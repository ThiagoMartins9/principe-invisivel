/**
 * Build dedicado para GitHub Pages.
 *
 * Diferente do build padrão (que escreve o single-file na raiz para preservar
 * o fluxo "abrir no OneDrive em file://"), este escreve em ./dist e copia
 * os assets estáticos que não passam pelo bundler (ícones, fontes, manifest,
 * service-worker, ranks, etc.).
 *
 * Uso: npm run build:pages
 */
import { build } from "vite";
import { cp, rm, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DIST = resolve(ROOT, "dist");

// 1) Limpa e recria dist/
if (existsSync(DIST)) await rm(DIST, { recursive: true, force: true });
await mkdir(DIST, { recursive: true });

// 2) Roda Vite com outDir override (mantém todo o resto do vite.config.js)
await build({
  configFile: resolve(ROOT, "vite.config.js"),
  build: {
    outDir: DIST,
    emptyOutDir: true,
  },
});

// 3) Copia assets estáticos que não passam pelo Vite
const STATIC_FILES = [
  "manifest.json",
  "service-worker.js",
  "icon.svg",
  "icon-maskable.svg",
  "icon-192.png",
  "icon-512.png",
  "icon-maskable-192.png",
  "icon-maskable-512.png",
  "apple-touch-icon.png",
];
const STATIC_DIRS = ["ranks", "assets"];

for (const f of STATIC_FILES) {
  const src = resolve(ROOT, f);
  if (!existsSync(src)) {
    console.warn(`  [aviso] arquivo ausente, ignorado: ${f}`);
    continue;
  }
  await cp(src, resolve(DIST, f));
  console.log(`  + ${f}`);
}

for (const d of STATIC_DIRS) {
  const src = resolve(ROOT, d);
  if (!existsSync(src)) {
    console.warn(`  [aviso] pasta ausente, ignorada: ${d}/`);
    continue;
  }
  await cp(src, resolve(DIST, d), { recursive: true });
  console.log(`  + ${d}/`);
}

// 4) Adiciona .nojekyll para o GitHub Pages não filtrar arquivos com prefixo "_"
await writeFile(resolve(DIST, ".nojekyll"), "");
console.log("  + .nojekyll");

console.log("\n✓ dist/ pronto para deploy no GitHub Pages");
