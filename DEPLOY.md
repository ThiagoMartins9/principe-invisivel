# Deploy no GitHub Pages — passo a passo

Tudo do lado do código já está pronto. Falta só executar os passos abaixo,
que dependem da sua conta GitHub.

## 1. Mover o repo para fora do OneDrive (recomendado)

OneDrive sincronizando `node_modules` e arquivos de build durante `git push`
causa locks intermitentes. Faça uma única vez:

```powershell
# PowerShell — abra como o seu usuário (não Admin)
mkdir C:\dev
robocopy "C:\Users\thiag\OneDrive\Documentos\O príncipe invisível" `
         "C:\dev\principe-invisivel" /E /XD node_modules dist .vite
```

Depois trabalhe sempre em `C:\dev\principe-invisivel`. O OneDrive segue
servindo a versão "abrir o index.html offline" — apenas o trabalho de git
muda de pasta.

## 2. Inicializar o git e fazer o primeiro commit

Dentro de `C:\dev\principe-invisivel`:

```powershell
git init -b main
git add .
git status     # confira que node_modules/ e Saves/ NÃO aparecem
git commit -m "feat: PWA pronta para GitHub Pages — SW v8, fontes locais, ícones completos"
```

## 3. Criar o repositório no GitHub e dar push

No GitHub, crie um repositório **público** chamado, por exemplo,
`principe-invisivel` (use o nome que preferir — o `id` do manifest é `"./"`,
então o subpath não importa).

Depois, no terminal:

```powershell
git remote add origin https://github.com/SEU_USUARIO/principe-invisivel.git
git push -u origin main
```

## 4. Habilitar GitHub Pages com source = GitHub Actions

No GitHub → seu repositório → **Settings** → **Pages**:

- **Source**: `GitHub Actions` (não escolha "Deploy from a branch")
- Salve.

A primeira execução do workflow `.github/workflows/deploy.yml` (já presente
no repo) vai disparar automaticamente após o push. Acompanhe em **Actions**.

Quando terminar, a URL do app aparece em **Settings → Pages**, no formato:

```
https://SEU_USUARIO.github.io/principe-invisivel/
```

## 5. Verificações pós-deploy

Abra a URL no Chrome desktop, depois Chrome Android e Safari iOS:

- DevTools → **Application** → **Manifest**: deve mostrar 5 ícones, sendo
  2 com `purpose: "maskable"`. Verde em "installable".
- DevTools → **Application** → **Service Workers**: deve listar
  `principe-precache-v8`, `principe-runtime-v8`, `principe-fonts-v8`.
- Lighthouse → **PWA**: meta é 90+ (instalável + offline-ready).
- Android Chrome: "Instalar app" deve aparecer no menu (⋮).
- iOS Safari: "Adicionar à Tela de Início" deve mostrar o brasão dourado
  em PNG (não o ícone genérico de Safari).

## 6. Auditar Supabase RLS antes de divulgar

O app vai estar **público** — qualquer pessoa pode ler o `index.html`,
extrair `SB_URL` e `SB_KEY` (publishable, ok) e tentar bater na sua API.
A única defesa real são as policies de **Row-Level Security**.

No painel Supabase, verifique para cada tabela (`chronicles`, `attachments`)
e bucket (`attachments`):

- RLS está habilitada na tabela
- Há policy para `SELECT`, `INSERT`, `UPDATE`, `DELETE` com filtro
  `auth.uid() = user_id`
- O bucket de Storage tem policy equivalente baseada no path

Se for app de uso pessoal apenas, recomendo também desabilitar self-signup
em **Authentication → Providers → Email** (deixa "Allow new users to
sign up" como off) e criar a sua conta uma vez antes.

## 7. Updates futuros

Toda vez que você fizer push em `main`:

1. O workflow roda `npm test` → `npm run build:pages` → publica em Pages.
2. Para usuários já com o PWA instalado, o **service worker novo** vai ser
   detectado e o app exibe o modal **"Nova edição da Crônica — recarregar?"**.
3. Lembre de bumpar `VERSION` em `service-worker.js` (`v8` → `v9` etc.)
   sempre que mudar a lista de assets pré-cacheados, para invalidar caches
   antigos no `activate`.

## Comandos úteis para teste local

```powershell
# Build single-file pra OneDrive (fluxo file://)
npm run build

# Build pages — gera dist/ pronto para deploy
npm run build:pages

# Preview local do build de pages (servidor http real, vê SW funcionando)
npm run preview:pages

# Roda os testes
npm test
```

## Pendência detectada

Há um arquivo `ranks/Gemini_Generated_Image_6ejk296ejk296ejk.png` (~3 MB)
que parece sobra da geração das patentes. Ele não é referenciado pelo app
nem pelo SW, mas inflaria o tamanho do deploy. Sugiro removê-lo:

```powershell
git rm "ranks/Gemini_Generated_Image_6ejk296ejk296ejk.png"
```
