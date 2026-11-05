# Versão Windows do instalar.sh: instala as dependências e registra o serviço como tarefa agendada no logon.
# Depois carregue extension\ em brave://extensions. Uso: powershell -ExecutionPolicy Bypass -File instalar.ps1
# Fora dos comentários, só ASCII (o PowerShell 5.1 lê .ps1 sem BOM na página de código do sistema).
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
if (-not $node) { throw "node.exe nao encontrado no PATH. Instale o Node.js (https://nodejs.org)." }
& npm.cmd install --omit=dev --silent
if ($LASTEXITCODE -ne 0) { throw "npm install falhou" }

$estado = Join-Path $env:LOCALAPPDATA "flow-brave"
New-Item -ItemType Directory -Force $estado | Out-Null
$log = Join-Path $estado "servico.log"

# PowerShell oculto mantém o node em primeiro plano: a tarefa só termina se o serviço cair, e aí é reiniciada.
$cmd = "& '$node' '$PSScriptRoot\servico.mjs' *>> '$log'"
$args_ = "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -Command `"$cmd`""
$acao = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $args_ -WorkingDirectory $PSScriptRoot
$gatilho = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$config = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName "flow-brave" -Action $acao -Trigger $gatilho -Settings $config `
  -Description "Sincroniza grupos do Brave com o vault Obsidian" -Force | Out-Null

Stop-ScheduledTask -TaskName "flow-brave" -ErrorAction SilentlyContinue
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like "*servico.mjs*" } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Start-ScheduledTask -TaskName "flow-brave"

Write-Output "Servico iniciado. Log: $log"
Write-Output "Extensao: Modo do desenvolvedor > Carregar sem compactacao > $PSScriptRoot\extension"
