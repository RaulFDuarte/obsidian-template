// Brave real em perfil isolado + serviço real + vault temporário. Abre janelas; não toca no perfil do usuário.
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import { lerLoja } from "../loja.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url)), RAIZ = path.resolve(AQUI, "..");
const BASE = fs.mkdtempSync(`${os.homedir()}/snap/brave/current/flowe2e-`);
const PORTA = 47399, CDP = 9344, WEB = 47400;
const EXT = `${BASE}/ext`, PROF = `${BASE}/prof`, VAULT = `${BASE}/vault`;
fs.cpSync(`${RAIZ}/extension`, EXT, { recursive: true });
fs.writeFileSync(`${EXT}/sw.js`, fs.readFileSync(`${EXT}/sw.js`, "utf8").replace("47291", PORTA));
const NOTAS = `${VAULT}/Prática/Tarefas/Brave`, PROJ = `${VAULT}/Prática/Projetos.md`, CAIXA = `${VAULT}/Prática/Caixa de Entrada.md`;
fs.mkdirSync(NOTAS, { recursive: true });
fs.writeFileSync(PROJ, "### 📋️ Sem Categoria\n- [ ] existente\n");
fs.writeFileSync(CAIXA, "---\nprocessar-inbox: idle\n---\n## 🗂️ Para categorizar\n");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const U = (p) => `http://127.0.0.1:${WEB}/${p}`;
const web = http.createServer((q, r) => {
  if (q.url === "/redir") { r.writeHead(302, { location: "/destino" }); return r.end(); }
  r.writeHead(200, { "content-type": "text/html" });
  r.end(`<title>pg ${q.url}</title>`);
}).listen(WEB, "127.0.0.1");

let srv = null;
function ligarServico() {
  srv = spawn("node", [`${RAIZ}/servico.mjs`], {
    env: { ...process.env, FLOW_BRAVE_VAULT: VAULT, FLOW_BRAVE_PORTA: PORTA, FLOW_BRAVE_PERFIL: `${PROF}/Default`, XDG_STATE_HOME: `${BASE}/state` },
    stdio: ["ignore", fs.openSync(`${BASE}/srv.log`, "a"), fs.openSync(`${BASE}/srv.log`, "a")],
  });
}
const desligarServico = async () => { srv.kill(); await sleep(500); };

let ev = null;
async function abrir(restaurar, comInterface = true) {
  const pref = `${PROF}/Default/Preferences`;
  if (fs.existsSync(pref)) {
    const j = JSON.parse(fs.readFileSync(pref, "utf8"));
    j.session = { ...j.session, restore_on_startup: restaurar ? 1 : 5 };
    fs.writeFileSync(pref, JSON.stringify(j));
  }
  spawn("/snap/bin/brave", [`--user-data-dir=${PROF}`, `--load-extension=${EXT}`, `--disable-extensions-except=${EXT}`, `--remote-debugging-port=${CDP}`, "--no-first-run", "--disable-session-crashed-bubble", ...(comInterface ? ["--force-renderer-accessibility=form-controls"] : [])], { stdio: "ignore", detached: true }).unref();
  let sw;
  for (let i = 0; i < 60 && !sw; i++) {
    await sleep(1000);
    try { sw = (await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json()).find((t) => t.url.endsWith("/sw.js")); } catch {}
  }
  if (!sw) throw new Error("service worker não apareceu");
  const ws = new WebSocket(sw.webSocketDebuggerUrl);
  await new Promise((r) => ws.on("open", r));
  let id = 0; const w = new Map();
  ws.on("message", (d) => { const m = JSON.parse(d); w.get(m.id)?.(m); });
  ev = (x) => new Promise((r, e) => {
    const i = ++id;
    w.set(i, (m) => (m.result?.exceptionDetails ? e(new Error(m.result.exceptionDetails.exception?.description)) : r(m.result?.result?.value)));
    ws.send(JSON.stringify({ id: i, method: "Runtime.evaluate", params: { expression: x, awaitPromise: true, returnByValue: true } }));
  });
}
async function fechar() {
  const v = await (await fetch(`http://127.0.0.1:${CDP}/json/version`)).json();
  const w = new WebSocket(v.webSocketDebuggerUrl);
  await new Promise((r) => w.on("open", r));
  w.send(JSON.stringify({ id: 1, method: "Browser.close" }));
  for (let i = 0; i < 25; i++) { await sleep(1000); try { await fetch(`http://127.0.0.1:${CDP}/json/version`); } catch { break; } }
  await sleep(2000);
}

const estado = () => ev(`(async()=>({grupos:(await chrome.tabGroups.query({})).map(g=>({id:g.id,t:g.title,c:g.color,col:g.collapsed})),tabs:(await chrome.tabs.query({})).sort((a,b)=>a.index-b.index).map(t=>({id:t.id,u:t.pendingUrl||t.url,g:t.groupId,a:t.active}))}))()`);
const noGrupo = async (titulo) => { const e = await estado(); const g = e.grupos.find((x) => x.t === titulo); return g ? e.tabs.filter((t) => t.g === g.id).map((t) => t.u) : null; };
const criarGrupo = (titulo, urls, cor = "blue") => ev(`(async()=>{const w=(await chrome.windows.getAll())[0].id;const ids=[];for(const url of ${JSON.stringify(urls)})ids.push((await chrome.tabs.create({url,active:false,windowId:w})).id);const g=await chrome.tabs.group({tabIds:ids,createProperties:{windowId:w}});await chrome.tabGroups.update(g,{title:${JSON.stringify(titulo)},color:${JSON.stringify(cor)}});return g})()`);
const nota = (n) => { try { return fs.readFileSync(`${NOTAS}/${n}.md`, "utf8"); } catch { return null; } };
const editar = (n, f) => fs.writeFileSync(`${NOTAS}/${n}.md`, f(nota(n)));

let falhas = 0;
async function espera(desc, cond, ms = 20000) {
  const fim = Date.now() + ms; let ult;
  while (Date.now() < fim) { try { ult = await cond(); if (ult) { console.log(`ok   ${desc}`); return ult; } } catch (e) { ult = e.message; } await sleep(400); }
  falhas++; console.log(`FALHA ${desc} (último: ${JSON.stringify(ult)})`);
}
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const estavel = async (desc, cond, ms = 8000) => { // a condição precisa continuar valendo
  const fim = Date.now() + ms;
  while (Date.now() < fim) { if (!(await cond())) { falhas++; console.log(`FALHA ${desc}`); return; } await sleep(500); }
  console.log(`ok   ${desc}`);
};

try {
  ligarServico();
  await abrir(false);

  // Nascimento e sentido navegador > nota
  await criarGrupo("Pesquisa", [U("a"), U("b")]);
  await espera("grupo vira nota", () => nota("Pesquisa")?.includes(U("b")));
  await espera("título da página na nota", () => nota("Pesquisa")?.includes("[pg /a]"));
  await espera("grupo vira tarefa", () => fs.readFileSync(PROJ, "utf8").includes("- [ ] [[Prática/Tarefas/Brave/Pesquisa|Pesquisa]]"));

  // Nota > navegador
  editar("Pesquisa", (t) => t + `- [novo](${U("c")})\n`);
  await espera("linha nova abre aba no grupo", async () => (await noGrupo("Pesquisa"))?.includes(U("c")));
  editar("Pesquisa", (t) => t.split("\n").filter((l) => !l.includes(`${U("a")})`)).join("\n"));
  await espera("linha apagada fecha aba", async () => { const g = await noGrupo("Pesquisa"); return g && !g.includes(U("a")); });
  editar("Pesquisa", (t) => { const l = t.split("\n"); const i = l.findIndex((x) => x.includes(`${U("b")})`)), j = l.findIndex((x) => x.includes(`${U("c")})`)); [l[i], l[j]] = [l[j], l[i]]; return l.join("\n"); });
  await espera("reordenar na nota reordena abas", async () => igual(await noGrupo("Pesquisa"), [U("c"), U("b")]));
  editar("Pesquisa", (t) => t.replace("cor: blue", "cor: red"));
  await espera("cor na nota muda o grupo", async () => (await estado()).grupos.find((g) => g.t === "Pesquisa")?.c === "red");

  // Navegador > nota
  await ev(`chrome.tabs.query({}).then(ts=>chrome.tabs.update(ts.find(t=>t.url===${JSON.stringify(U("b"))}).id,{url:${JSON.stringify(U("b2"))}}))`);
  await espera("navegar atualiza a nota", () => nota("Pesquisa")?.includes(U("b2")) && !nota("Pesquisa").includes(`${U("b")})`));

  // Redirecionamento: sem laço
  editar("Pesquisa", (t) => t + `- ${U("redir")}\n`);
  await espera("redirecionamento converge", () => nota("Pesquisa")?.includes(U("destino")) && !nota("Pesquisa").includes(U("redir")));
  const antes = nota("Pesquisa");
  await estavel("nota estável depois de convergir", () => nota("Pesquisa") === antes);

  // Soltas e criação de grupo a partir de nota, movendo a mesma aba
  const idSolta = await ev(`chrome.tabs.create({url:${JSON.stringify(U("solta"))},active:false}).then(t=>t.id)`);
  await espera("aba solta aparece em _Soltas_", () => nota("_Soltas_")?.includes(U("solta")));
  await espera("_Soltas_ tem id próprio", () => nota("_Soltas_")?.includes("id: soltas"));
  const linhaSolta = nota("_Soltas_").split("\n").find((l) => l.includes(U("solta")));
  editar("_Soltas_", (t) => t.replace(`${linhaSolta}\n`, ""));
  fs.writeFileSync(`${NOTAS}/Criado na nota.md`, `${linhaSolta}\n- [fresca](${U("fresca")})\n`);
  await espera("nota nova cria grupo", async () => (await noGrupo("Criado na nota"))?.length === 2);
  await espera("aba movida, não recriada", async () => (await estado()).tabs.find((t) => t.id === idSolta)?.g > 0);
  await espera("nota nova ganha id", () => /^id: /m.test(nota("Criado na nota") ?? ""));
  await espera("nota nova ganha tarefa", () => fs.readFileSync(PROJ, "utf8").includes("Brave/Criado na nota|"));

  // Nota escrita à mão: URL sem traço, nota vazia, grupo apagado que volta
  fs.writeFileSync(`${NOTAS}/Sem traco.md`, `${U("st")}\n`);
  await espera("URL sem traço cria grupo", async () => (await noGrupo("Sem traco"))?.includes(U("st")));
  fs.writeFileSync(`${NOTAS}/Vazia.md`, "");
  await espera("nota vazia ganha id", () => /^id: /m.test(nota("Vazia") ?? ""));
  await sleep(5000);
  editar("Vazia", (t) => `${t}- ${U("v1")}\n`);
  await espera("nota vazia vira grupo depois", async () => (await noGrupo("Vazia"))?.includes(U("v1")));
  await espera("nota vazia não gera aviso falso", () => !fs.readFileSync(CAIXA, "utf8").includes('"Vazia" não existe mais'));
  await ev(`chrome.tabs.query({}).then(ts=>chrome.tabs.remove(ts.find(t=>t.url===${JSON.stringify(U("st"))}).id))`);
  await espera("fechar todas as abas marca apagado", () => nota("Sem traco")?.includes("estado: apagado"));
  editar("Sem traco", (t) => `${t}- ${U("volta")}\n`);
  await espera("linha nova recria grupo apagado", async () => (await noGrupo("Sem traco"))?.includes(U("volta")));
  await espera("nota volta a aberta depois de apagada", () => nota("Sem traco")?.includes("estado: aberto"));

  // Renomear nos dois sentidos
  await ev(`chrome.tabGroups.query({title:"Pesquisa"}).then(([g])=>chrome.tabGroups.update(g.id,{title:"Pesquisa: X/Y"}))`);
  await espera("renomear no Brave renomeia a nota", () => nota("Pesquisa- X-Y") && !nota("Pesquisa"));
  await espera("e o link da tarefa", () => fs.readFileSync(PROJ, "utf8").includes("[[Prática/Tarefas/Brave/Pesquisa- X-Y|Pesquisa- X-Y]]"));
  await estavel("título com caractere especial não é sobrescrito", async () => !!(await noGrupo("Pesquisa: X/Y")), 6000);
  fs.renameSync(`${NOTAS}/Pesquisa- X-Y.md`, `${NOTAS}/Renomeado.md`);
  await espera("renomear a nota renomeia o grupo", async () => !!(await noGrupo("Renomeado")));

  // Clique externo
  await ev(`chrome.tabGroups.query({title:"Renomeado"}).then(([g])=>chrome.tabGroups.update(g.id,{collapsed:true}))`);
  const nAbas = (await estado()).tabs.length;
  const alvo = (await noGrupo("Renomeado"))[0];
  try { execFileSync("/snap/bin/brave", [`--user-data-dir=${PROF}`, alvo], { timeout: 15000, stdio: "ignore" }); } catch {}
  await espera("clique externo não duplica", async () => (await estado()).tabs.length === nAbas);
  await espera("clique externo foca a aba", async () => (await estado()).tabs.find((t) => t.u === alvo)?.a);
  await espera("clique externo expande o grupo", async () => (await estado()).grupos.find((g) => g.t === "Renomeado")?.col === false);
  const urlNova = U("nunca-aberta");
  try { execFileSync("/snap/bin/brave", [`--user-data-dir=${PROF}`, urlNova], { timeout: 15000, stdio: "ignore" }); } catch {}
  await espera("URL não aberta abre normalmente", async () => (await estado()).tabs.some((t) => t.u === urlNova));

  // Conflito de merge: nada acontece
  const lixo = (await noGrupo("Renomeado")).length;
  const salvo = nota("Renomeado");
  fs.writeFileSync(`${NOTAS}/Renomeado.md`, "<<<<<<< HEAD\n=======\n>>>>>>> x\n");
  await sleep(6000);
  if ((await noGrupo("Renomeado"))?.length === lixo) console.log("ok   nota com conflito de merge não fecha abas"); else { falhas++; console.log("FALHA conflito de merge fechou abas"); }
  fs.writeFileSync(`${NOTAS}/Renomeado.md`, salvo);

  // Fechamento em massa
  const muitas = Array.from({ length: 25 }, (_, i) => U(`m${i}`));
  await criarGrupo("Massa", muitas);
  await espera("grupo grande na nota", () => nota("Massa")?.includes(U("m24")));
  const notaMassa = nota("Massa");
  fs.unlinkSync(`${NOTAS}/Massa.md`);
  await espera("apagar nota grande restaura em vez de fechar", () => nota("Massa")?.includes(U("m24")));
  await espera("e avisa na Caixa", () => fs.readFileSync(CAIXA, "utf8").includes("25 abas seriam fechadas"));
  if ((await noGrupo("Massa"))?.length === 25) console.log("ok   abas continuam abertas"); else { falhas++; console.log("FALHA abas fechadas"); }
  void notaMassa;

  // Última aba da janela não encerra o navegador
  await criarGrupo("Curto", [U("c1")]);
  await espera("grupo curto", () => nota("Curto")?.includes(U("c1")));
  fs.unlinkSync(`${NOTAS}/Curto.md`);
  await espera("apagar nota apaga o grupo", async () => (await noGrupo("Curto")) === null);
  await sleep(4000);
  await espera("nota apagada continua apagada", () => nota("Curto") === null);

  // Concluir tarefa
  await criarGrupo("Concluir", [U("k1"), U("k2")], "green");
  await espera("tarefa de Concluir", () => fs.readFileSync(PROJ, "utf8").includes("Brave/Concluir|"));
  fs.writeFileSync(PROJ, fs.readFileSync(PROJ, "utf8").replace("- [ ] [[Prática/Tarefas/Brave/Concluir|", "- [x] [[Prática/Tarefas/Brave/Concluir|"));
  await espera("concluir fecha o grupo", async () => (await noGrupo("Concluir")) === null);
  await espera("nota fica como concluída", () => nota("Concluir")?.includes("estado: concluido") && nota("Concluir").includes(U("k1")));
  await sleep(4000);
  fs.writeFileSync(PROJ, fs.readFileSync(PROJ, "utf8").replace("- [x] [[Prática/Tarefas/Brave/Concluir|", "- [ ] [[Prática/Tarefas/Brave/Concluir|"));
  await espera("reabrir tarefa recria o grupo", async () => (await noGrupo("Concluir"))?.length === 2);
  await espera("nota volta a aberta", () => nota("Concluir")?.includes("estado: aberto"));

  // Serviço fora do ar: fusão ao voltar
  await criarGrupo("Offline", [U("o1"), U("o2")]);
  await espera("grupo Offline", () => nota("Offline")?.includes(U("o2")));
  await sleep(3000);
  await desligarServico();
  await ev(`chrome.tabs.query({}).then(ts=>chrome.tabs.remove(ts.find(t=>t.url===${JSON.stringify(U("o1"))}).id))`);
  editar("Offline", (t) => t + `- ${U("o3")}\n`);
  ligarServico();
  await espera("fusão: fechada no Brave some, nova da nota abre", async () => { const g = await noGrupo("Offline"); return g && !g.includes(U("o1")) && g.includes(U("o2")) && g.includes(U("o3")); }, 90000);
  await espera("nota reflete a fusão", () => !nota("Offline").includes(U("o1")) && nota("Offline").includes(U("o3")));

  // Reinício com restauração: mesmos grupos, sem duplicar
  await sleep(4000);
  const qtd = (await estado()).grupos.length;
  const projAntes = fs.readFileSync(PROJ, "utf8");
  await fechar();
  const lojaAntes = await lerLoja(`${PROF}/Default`);
  await abrir(true);
  await espera("restauração traz os grupos", async () => (await estado()).grupos.length === qtd, 30000);
  await sleep(25000); // passa da espera inicial e roda ciclos
  const lojaDepois = await lerLoja(`${PROF}/Default`);
  if (lojaDepois?.length === lojaAntes?.length) console.log(`ok   restauração não duplica no Sync (${lojaDepois.length})`); else { falhas++; console.log(`FALHA Sync foi de ${lojaAntes?.length} para ${lojaDepois?.length}`); }
  if (fs.readFileSync(PROJ, "utf8") === projAntes) console.log("ok   nenhuma tarefa nova no reinício"); else { falhas++; console.log("FALHA tarefas mudaram no reinício"); }
  if (nota("Offline")?.includes("estado: aberto")) console.log("ok   nota segue aberta"); else { falhas++; console.log("FALHA nota mudou de estado"); }

  // Reinício sem restauração: grupos fechados de verdade
  await fechar();
  await abrir(false);
  await sleep(25000);
  await espera("grupos ficam fechados na API", async () => (await estado()).grupos.length === 0);
  await espera("nota vira fechada", () => nota("Offline")?.includes("estado: fechado"), 30000);
  const lojaF = await lerLoja(`${PROF}/Default`);
  await estavel("não recria grupo fechado", async () => (await estado()).grupos.length === 0, 8000);
  const cor = lojaF.find((g) => g.titulo === "Concluir")?.cor;
  if (cor === "green") console.log("ok   mapa de cores do Sync"); else { falhas++; console.log(`FALHA cor do Sync: ${cor}`); }
  // Editar grupo fechado: abre o original, aplica, fecha, sem duplicar
  const guia = (t) => lojaF.find((g) => g.titulo === t)?.guid;
  const noSync = async (t) => (await lerLoja(`${PROF}/Default`))?.find((g) => g.titulo === t);
  const total = lojaF.length;
  editar("Offline", (t) => t + `- ${U("pendente")}\n`);
  await espera("linha em nota fechada chega ao grupo salvo", async () => (await noSync("Offline"))?.itens.some((i) => i.url === U("pendente")), 60000);
  await espera("grupo volta a fechar", async () => (await estado()).grupos.length === 0, 30000);
  if ((await noSync("Offline"))?.guid === guia("Offline")) console.log("ok   mesma entrada salva"); else { falhas++; console.log("FALHA entrada trocada"); }
  await espera("nota continua fechada", () => nota("Offline")?.includes("estado: fechado"), 30000);
  editar("Offline", (t) => t.split("\n").filter((l) => !l.includes(U("o2"))).join("\n"));
  await espera("remover linha de nota fechada", async () => { const g = await noSync("Offline"); return g && !g.itens.some((i) => i.url === U("o2")); }, 60000);
  await espera("e fecha de novo", async () => (await estado()).grupos.length === 0, 30000);
  await sleep(3000);
  editar("Concluir", (t) => t.replace("cor: green", "cor: red"));
  await espera("cor em nota fechada", async () => (await noSync("Concluir"))?.cor === "red", 60000);
  await espera("fecha depois da cor", async () => (await estado()).grupos.length === 0, 30000);
  await sleep(3000);
  fs.renameSync(`${NOTAS}/Concluir.md`, `${NOTAS}/Concluir novo.md`);
  await espera("renomear nota fechada", async () => !!(await noSync("Concluir novo")), 60000);
  await espera("fecha depois de renomear", async () => (await estado()).grupos.length === 0, 30000);
  await sleep(3000);
  fs.writeFileSync(PROJ, fs.readFileSync(PROJ, "utf8").replace(/- \[ \] (\[\[[^\]]*Criado na nota)/, "- [x] $1"));
  if (!fs.readFileSync(PROJ, "utf8").includes("- [x] [[Prática/Tarefas/Brave/Criado na nota")) { falhas++; console.log("FALHA preparar tarefa"); }
  await espera("concluir tarefa apaga grupo fechado", async () => !(await noSync("Criado na nota")), 60000);
  await sleep(3000);
  fs.unlinkSync(`${NOTAS}/Vazia.md`);
  await espera("apagar nota apaga grupo fechado", async () => !(await noSync("Vazia")), 60000);
  await espera("nada ficou aberto", async () => (await estado()).grupos.length === 0, 30000);
  const semDup = (await lerLoja(`${PROF}/Default`)).length;
  if (semDup === total - 2) console.log(`ok   nenhuma duplicata (${semDup})`); else { falhas++; console.log(`FALHA Sync foi de ${total} para ${semDup}`); }

  // Sem a flag: nada se perde
  await fechar();
  await abrir(false, false);
  await sleep(25000);
  editar("Offline", (t) => t + `- ${U("sem-flag")}\n`);
  await espera("sem flag, avisa na Caixa", () => fs.readFileSync(CAIXA, "utf8").includes('"Offline" continua pendente'), 30000);
  if (nota("Offline").includes(U("sem-flag")) && (await estado()).grupos.length === 0) console.log("ok   sem flag, edição fica na nota"); else { falhas++; console.log("FALHA sem flag"); }

  // Grupo que aparece só no Sync (como os criados no celular)
  srv.kill(); await sleep(500);
  fs.rmSync(`${NOTAS}/Offline.md`);
  const est = `${BASE}/state/flow-brave`; const f = `${est}/${fs.readdirSync(est)[0]}`;
  const j = JSON.parse(fs.readFileSync(f, "utf8"));
  for (const [id, b] of Object.entries(j.grupos)) if (b.titulo === "Offline") delete j.grupos[id];
  fs.writeFileSync(f, JSON.stringify(j));
  ligarServico();
  await espera("grupo só do Sync vira nota fechada", () => nota("Offline")?.includes("estado: fechado"), 90000);
  await espera("e ganha tarefa", () => (fs.readFileSync(PROJ, "utf8").match(/Brave\/Offline\|/g) ?? []).length >= 1);

  // Só a extensão conecta
  const recusa = await new Promise((r) => { const w = new WebSocket(`ws://127.0.0.1:${PORTA}`, { origin: "https://site-malicioso.example" }); w.on("open", () => r(false)); w.on("error", () => r(true)); });
  if (recusa) console.log("ok   página web não conecta no serviço"); else { falhas++; console.log("FALHA origem externa aceita"); }

  await fechar();
} catch (e) {
  falhas++; console.error("ERRO", e);
  try { await fechar(); } catch {}
} finally {
  srv?.kill(); web.close();
  const log = fs.readFileSync(`${BASE}/srv.log`, "utf8").split("\n").filter((l) => /falhou|Error|ilegível/.test(l));
  if (log.length) console.log("LOG:", log.slice(0, 10).join("\n"));
  fs.rmSync(BASE, { recursive: true, force: true });
  console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo ok");
  process.exit(falhas ? 1 : 0);
}
