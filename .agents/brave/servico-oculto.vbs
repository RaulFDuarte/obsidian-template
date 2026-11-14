' Lança o serviço sem nenhuma janela. O -WindowStyle Hidden do PowerShell não basta no Windows 11
' com o Windows Terminal como terminal padrão: ele abre uma aba vazia. O wscript roda o comando
' com janela oculta (estilo 0) e espera o fim, então a tarefa agendada continua "rodando" enquanto o serviço vive.
' Uso: wscript.exe servico-oculto.vbs <node.exe> <servico.mjs> <servico.log>
Option Explicit
Dim sh, a
Set sh = CreateObject("WScript.Shell")
Set a = WScript.Arguments
sh.CurrentDirectory = CreateObject("Scripting.FileSystemObject").GetParentFolderName(a(1))
WScript.Quit sh.Run("cmd.exe /d /c """"" & a(0) & """ """ & a(1) & """ >> """ & a(2) & """ 2>&1""", 0, True)
