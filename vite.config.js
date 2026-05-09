import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import { resolve } from "node:path";

/**
 * Build estratégia: o app PRECISA continuar funcionando em file:// (PWA local
 * no OneDrive). Por isso usamos vite-plugin-singlefile, que inline TODO o JS
 * e CSS dentro de um único index.html ao final do build. O resultado vai
 * direto para a raiz do projeto (../index.html), sobrescrevendo o monoarquivo
 * legado de cada release.
 */
export default defineConfig({
  root: "src",
  base: "./",
  publicDir: false, // assets estáticos (icon.svg, ranks/, etc.) já vivem na raiz
  build: {
    // Saída direta na raiz para preservar o fluxo "abrir index.html no OneDrive"
    outDir: resolve(__dirname, "."),
    emptyOutDir: false, // não apagar manifest.json, service-worker.js, ranks/, Saves/
    target: "es2020",
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000, // inline tudo (a flag do plugin já força)
    rollupOptions: {
      output: {
        manualChunks: undefined,
        inlineDynamicImports: true
      }
    }
  },
  plugins: [
    viteSingleFile({
      removeViteModuleLoader: true,
      useRecommendedBuildConfig: true
    })
  ]
});
