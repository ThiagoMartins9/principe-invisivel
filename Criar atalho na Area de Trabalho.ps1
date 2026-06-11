# Cria um atalho "O Príncipe Invisível" na Área de Trabalho.
# O app abre em janela própria (sem barra de endereço), como um aplicativo.
$ErrorActionPreference = "Stop"

$root  = Split-Path -Parent $MyInvocation.MyCommand.Path
$index = Join-Path $root "index.html"
if (-not (Test-Path $index)) {
  Write-Host "ERRO: index.html nao foi encontrado em $root" -ForegroundColor Red
  exit 1
}

# URI file:/// correta (lida com espacos e acentos do caminho)
$uri = ([System.Uri]$index).AbsoluteUri

# Procura Edge ou Chrome
$candidatos = @(
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LocalAppData\Google\Chrome\Application\chrome.exe"
)
$navegador = $candidatos | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $navegador) {
  Write-Host "ERRO: Edge/Chrome nao encontrados." -ForegroundColor Red
  exit 1
}

$desktop = [Environment]::GetFolderPath("Desktop")
$lnkPath = Join-Path $desktop "O Príncipe Invisível.lnk"

$ws  = New-Object -ComObject WScript.Shell
$lnk = $ws.CreateShortcut($lnkPath)
$lnk.TargetPath       = $navegador
$lnk.Arguments        = "--app=`"$uri`""
$lnk.WorkingDirectory = $root
$icone = Join-Path $root "icon.ico"
if (Test-Path $icone) { $lnk.IconLocation = "$icone,0" }
$lnk.Description = "O Príncipe Invisível — PWA de missões"
$lnk.Save()

Write-Host ""
Write-Host "Atalho criado na Área de Trabalho: O Príncipe Invisível" -ForegroundColor Green
Write-Host "Navegador: $navegador"
Write-Host "Abre:      $uri"
