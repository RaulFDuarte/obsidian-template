# Versão Windows do interface.py: aciona os botões do próprio Brave por acessibilidade (MSAA).
# A API de extensão não abre nem fecha grupos salvos.
#
# interface.ps1 abrir <título> | fechar <título>
# Responde JSON {"ok": bool, "motivo": str}. Os textos procurados são os da interface em pt-BR.
# Fora dos comentários, só ASCII: o PowerShell 5.1 lê .ps1 sem BOM na página de código do sistema,
# então o travessão do cabeçalho é montado por código e as mensagens vão sem acento.
param([string]$acao, [string]$titulo)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
[Console]::OutputEncoding = [Text.Encoding]::UTF8

function Responder([bool]$ok, [string]$motivo = "") {
  [Console]::Out.Write((@{ ok = $ok; motivo = $motivo } | ConvertTo-Json -Compress))
  exit 0
}

if ($acao -notin @("abrir", "fechar") -or -not $titulo) { Responder $false "uso: interface.ps1 abrir|fechar <titulo>" }

Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;

public static class FlowBrave {
  [DllImport("oleacc.dll")] static extern int AccessibleObjectFromWindow(IntPtr h, uint id, ref Guid g, [MarshalAs(UnmanagedType.Interface)] out object o);
  [DllImport("oleacc.dll")] static extern int AccessibleChildren([MarshalAs(UnmanagedType.Interface)] object p, int inicio, int n, [Out, MarshalAs(UnmanagedType.LPArray, SizeParamIndex = 4)] object[] filhos, out int obtidos);
  public delegate bool Cb(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(Cb f, IntPtr l);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] static extern bool ScreenToClient(IntPtr h, ref Ponto p);
  [DllImport("user32.dll")] static extern bool GetClientRect(IntPtr h, out Retangulo r);
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr h, int i);
  [DllImport("user32.dll")] static extern int SetWindowLong(IntPtr h, int i, int v);
  [DllImport("user32.dll")] static extern bool SetLayeredWindowAttributes(IntPtr h, uint cor, byte alfa, uint flags);
  [DllImport("dwmapi.dll")] static extern int DwmSetWindowAttribute(IntPtr h, int atributo, ref int valor, int tamanho);
  // Coordenadas da acessibilidade são físicas; sem isto, telas com escala misturam físico e lógico.
  static FlowBrave() { SetProcessDPIAware(); }
  public struct Ponto { public int x; public int y; }
  public struct Retangulo { public int esq, topo, dir, base_; }

  const int PAPEL_DOCUMENTO = 15;
  const int INVISIVEL = 0x8000;

  /// Um elemento achado: o objeto e o id do filho simples (0 quando é o próprio objeto).
  public class No { public object Obj; public object Filho; public long Janela;
    public string Nome { get { return Prop(Obj, "accName", Filho) as string ?? ""; } }
    public bool Visivel { get { var s = Prop(Obj, "accState", Filho); return !(s is int) || (((int)s) & INVISIVEL) == 0; } }
  }

  static object Prop(object o, string p, object c) {
    try { return o.GetType().InvokeMember(p, BindingFlags.GetProperty, null, o, new object[] { c }); } catch { return null; }
  }

  public static List<long> Janelas(uint pid) {
    var r = new List<long>();
    EnumWindows(new Cb((h, l) => { uint p; GetWindowThreadProcessId(h, out p); if (p == pid && IsWindowVisible(h)) r.Add(h.ToInt64()); return true; }), IntPtr.Zero);
    return r;
  }

  static void Andar(object o, Regex re, int prof, long janela, List<No> saida, int limite) {
    if (prof > 25 || saida.Count >= limite) return;
    int n;
    try { n = (int)o.GetType().InvokeMember("accChildCount", BindingFlags.GetProperty, null, o, null); } catch { return; }
    if (n <= 0) return;
    var filhos = new object[Math.Min(n, 400)]; int obtidos;
    if (AccessibleChildren(o, 0, filhos.Length, filhos, out obtidos) != 0) return;
    for (int i = 0; i < obtidos && saida.Count < limite; i++) {
      var f = filhos[i];
      if (f is int) {
        var nm = Prop(o, "accName", f) as string;
        if (nm != null && re.IsMatch(nm)) saida.Add(new No { Obj = o, Filho = f, Janela = janela });
        continue;
      }
      if (f == null) continue;
      var papel = Prop(f, "accRole", 0);
      if (papel is int && (int)papel == PAPEL_DOCUMENTO) continue; // conteúdo das páginas
      var nome = Prop(f, "accName", 0) as string;
      if (nome != null && re.IsMatch(nome)) saida.Add(new No { Obj = f, Filho = 0, Janela = janela });
      Andar(f, re, prof + 1, janela, saida, limite);
    }
  }

  /// Procura em todas as janelas visíveis do processo: menus e popups são janelas próprias.
  public static List<No> Achar(uint pid, string padrao) { return Achar(pid, padrao, int.MaxValue, 0); }

  /// Cada varredura da janela principal custa segundos (chamadas entre processos), então para em `limite`
  /// resultados e pode pular uma janela (`excluir`), para buscar só no menu aberto.
  public static List<No> Achar(uint pid, string padrao, int limite, long excluir) {
    var saida = new List<No>(); var re = new Regex(padrao);
    var g = new Guid("618736E0-3C3D-11CF-810C-00AA00389B71");
    foreach (var j in Janelas(pid)) {
      if (j == excluir || saida.Count >= limite) continue;
      object raiz;
      if (AccessibleObjectFromWindow(new IntPtr(j), 0xFFFFFFFC, ref g, out raiz) == 0 && raiz != null) Andar(raiz, re, 0, j, saida, limite);
    }
    return saida;
  }

  /// Deixa invisível qualquer janela nova do processo (menus e popups) pelos próximos `ms` milissegundos,
  /// sem movê-la (o Brave fecha o menu que sai do lugar). A acessibilidade continua acionando os itens.
  public static void Esconder(uint pid, int ms) {
    var antes = new HashSet<long>(Janelas(pid));
    var feitas = new HashSet<long>();
    var t = new System.Threading.Thread(() => {
      int fim = Environment.TickCount + ms;
      while (Environment.TickCount < fim) {
        foreach (var j in Janelas(pid)) {
          if (antes.Contains(j) || feitas.Contains(j)) continue;
          var h = new IntPtr(j); int sim = 1;
          DwmSetWindowAttribute(h, 13, ref sim, 4); // DWMWA_CLOAK
          SetWindowLong(h, -20, GetWindowLong(h, -20) | 0x80000); // WS_EX_LAYERED
          SetLayeredWindowAttributes(h, 0, 0, 2); // LWA_ALPHA = 0
          feitas.Add(j);
        }
        System.Threading.Thread.Sleep(2);
      }
    });
    t.IsBackground = true; t.Start();
  }

  public static bool Acionar(No n) {
    try { n.Obj.GetType().InvokeMember("accDoDefaultAction", BindingFlags.InvokeMethod, null, n.Obj, new object[] { n.Filho }); return true; }
    catch { return false; }
  }

  /// Menu de contexto por mensagem de janela: não move o mouse do usuário.
  public static bool CliqueDireito(No n) {
    var a = new object[] { 0, 0, 0, 0, n.Filho };
    var mods = new ParameterModifier(5); for (int i = 0; i < 4; i++) mods[i] = true;
    try { n.Obj.GetType().InvokeMember("accLocation", BindingFlags.InvokeMethod, null, n.Obj, a, new[] { mods }, null, null); } catch { return false; }
    int larg = (int)a[2], alt = (int)a[3];
    if (larg <= 0 || alt <= 0) return false;
    var h = new IntPtr(n.Janela);
    var p = new Ponto { x = (int)a[0] + Math.Min(larg / 2, 20), y = (int)a[1] + alt / 2 };
    ScreenToClient(h, ref p);
    Retangulo r; GetClientRect(h, out r);
    if (p.x < 0 || p.y < 0 || p.x >= r.dir || p.y >= r.base_) return false; // fora da janela: rolado para longe
    var lp = new IntPtr((p.y << 16) | (p.x & 0xFFFF));
    return PostMessage(h, 0x0204, new IntPtr(2), lp) && PostMessage(h, 0x0205, IntPtr.Zero, lp);
  }
}
"@

function Navegador {
  # Processo principal do perfil do serviço: o Brave pode ter outras instâncias abertas.
  $perfil = [string]$env:FLOW_BRAVE_PERFIL
  if ($perfil -match '[\\/]Default$') { $perfil = $perfil.Substring(0, $perfil.Length - 8) }
  foreach ($p in Get-CimInstance Win32_Process -Filter "Name='brave.exe'") {
    $cmd = [string]$p.CommandLine
    if ($cmd -match '--type=') { continue }
    $outro = $cmd -match '--user-data-dir'
    if (($perfil -and $cmd.Contains("--user-data-dir=$perfil")) -or (-not $perfil -and -not $outro)) { return [uint32]$p.ProcessId }
  }
  return $null
}

function Esperar([scriptblock]$f, [double]$s = 4) {
  $fim = (Get-Date).AddSeconds($s)
  while ((Get-Date) -lt $fim) { $r = & $f; if ($r) { return $r }; Start-Sleep -Milliseconds 250 }
  return $null
}

$app = Navegador
if (-not $app) { Responder $false "Brave nao encontrado" }
$t = [regex]::Escape($titulo)
$travessao = [string][char]0x2013
$cabecalho = "^Grupo\s+$t\s+$travessao"

$aberto = "^\s*grupo\s+$t" + ':\s+Aberto$'
$fechado = "^\s*grupo\s+$t" + ':\s+Fechado$'
function Abriu { @([FlowBrave]::Achar($app, "($aberto)|($cabecalho)", 1, 0)).Count -gt 0 }

if ($acao -eq "abrir") {
  # Uma varredura só: estado aberto ou botão do grupo fechado na barra.
  $r = @([FlowBrave]::Achar($app, "($aberto)|($cabecalho)|($fechado)", 1, 0))
  if ($r.Count -and $r[0].Nome -notmatch 'Fechado$') { Responder $true "ja aberto" }
  # Botão que não cabe na barra aceita o comando e não faz nada. Por isso tenta, confere e só então vai pelo menu.
  $botao = $r | Select-Object -First 1
  if ($botao) {
    [void][FlowBrave]::Acionar($botao)
    if (Esperar { Abriu } 2.5) { Responder $true }
  }
  $menus = @([FlowBrave]::Achar($app, "^Grupos de guias$", 2, 0))
  $menu = @($menus | Where-Object { $_.Visivel }) + $menus | Select-Object -First 1
  if (-not $menu) { Responder $false "interface indisponivel (Brave sem a flag de acessibilidade?)" }
  [FlowBrave]::Esconder($app, 6000)
  [void][FlowBrave]::Acionar($menu)
  $item = Esperar { @([FlowBrave]::Achar($app, $fechado, 1, $menu.Janela)) | Select-Object -First 1 }
  if ($item) { [void][FlowBrave]::Acionar($item) } else { [void][FlowBrave]::Acionar($menu) } # sem item: fecha o menu
  if (Esperar { Abriu }) { Responder $true }
  Responder $false "o Brave nao abriu o grupo"
}

$cab = @([FlowBrave]::Achar($app, $cabecalho, 1, 0)) | Select-Object -First 1
if (-not $cab) { Responder $false "cabecalho do grupo nao encontrado" }
[FlowBrave]::Esconder($app, 6000)
if (-not [FlowBrave]::CliqueDireito($cab)) { Responder $false "cabecalho do grupo fora da tela" }
$botao = Esperar { @([FlowBrave]::Achar($app, "^Fechar grupo", 1, $cab.Janela)) | Select-Object -First 1 }
if (-not $botao) { Responder $false "botao Fechar grupo nao encontrado" }
Responder ([FlowBrave]::Acionar($botao))
