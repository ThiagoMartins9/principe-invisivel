@echo off
rem Publica o app no site (GitHub Pages) — basta dar dois cliques.
cd /d "%~dp0"
echo Enviando para o GitHub...
git push -u origin main
if errorlevel 1 (
  echo.
  echo Algo falhou. Se uma janela de login do GitHub abriu, conclua a
  echo autenticacao e rode este arquivo novamente.
) else (
  echo.
  echo Enviado! O site atualiza sozinho em 1-2 minutos:
  echo https://thiagomartins9.github.io/principe-invisivel/
)
echo.
pause
