#!/usr/bin/env node
// Liga a extensão às notas. Só a extensão (origem fixa) pode conectar: páginas web também alcançam localhost.
import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { lerLoja, pastaPerfil } from "./loja.mjs";
import { SOLTAS, gerenciada, planejar } from "./modelo.mjs";
import { acrescentarCaixa, adicionarTarefas, escreverNota, gravar, lerNota, renomearNaTarefa, statusTarefa } from "./notas.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const VAULT = process.env.FLOW_BRAVE_VAULT ?? path.resolve(AQUI, "../..");
const PORTA = Number(process.env.FLOW_BRAVE_PORTA ?? 47291);
const PRATICA = path.join(VAULT, "Prática");
const REL = "Prática/Tarefas/Brave";
const PASTA = path.join(VAULT, REL);
const PROJETOS = path.join(PRATICA, "Projetos.md");
const CAIXA = path.join(PRATICA, "Caixa de Entrada.md");
const hashVault = crypto.createHash("sha1").update(VAULT).digest("hex").slice(0, 10);
const ESTADO = path.join(process.env.XDG_STATE_HOME ?? path.join(os.homedir(), ".local/state"), "flow-brave", `${hashVault}.json`);
const PERFIL = pastaPerfil();

const manifesto = JSON.parse(fs.readFileSync(path.join(AQUI, "extension/manifest.json"), "utf8"));
const idExtensao = [...crypto.createHash("sha256").update(Buffer.from(manifesto.key, "base64")).digest().subarray(0, 16)]
  .map((b) => String.fromCharCode(97 + (b >> 4)) + String.fromCharCode(97 + (b & 15))).join("");
const ORIGEM = `chrome-extension://${idExtensao}`;

fs.mkdirSync(PASTA, { recursive: true });
fs.mkdirSync(path.dirname(ESTADO), { recursive: true });

const ler = (f, d = "") => { try { return fs.readFileSync(f, "utf8"); } catch { return d; } };
const lerEstado = () => { try { return JSON.parse(fs.readFileSync(ESTADO, "utf8")); } catch { return { grupos: {}, soltas: { itens: [] }, avisos: [] }; } };
const novoId = () => crypto.randomUUID().slice(0, 8);

const falhasInterface = [];
const esperaAbrir = new Map(); // título > quando pode tentar de novo

function interface_(acao, titulo) {
  return new Promise((ok) => {
    execFile("python3", ["-W", "ignore", path.join(AQUI, "interface.py"), acao, titulo], { timeout: 30000 }, (erro, saida) => {
      try { ok(JSON.parse(saida)); } catch { ok({ ok: false, motivo: erro?.message ?? "sem resposta" }); }
    });
  });
}

async function acionarInterface(plano) {
  for (const titulo of plano.fecharUi) {
    await new Promise((r) => setTimeout(r, 5000)); // a aba criada precisa chegar a carregar para entrar no grupo salvo
    const r = await interface_("fechar", titulo);
    if (!r.ok) falhasInterface.push(`Brave: não consegui fechar o grupo "${titulo}" depois de editá-lo (${r.motivo}).`);
  }
  const titulo = plano.abrir[0]; // um por vez, para mexer o mínimo na janela
  if (!titulo) return;
  const r = await interface_("abrir", titulo);
  esperaAbrir.set(titulo, Date.now() + (r.ok ? 15000 : 600000));
  if (!r.ok) falhasInterface.push(`Brave: edição do grupo fechado "${titulo}" continua pendente (${r.motivo}).`);
}

let conexao = null, snap = null, rodando = false, pendente = false, seq = 0;
const esperando = new Map();

function lerNotas() {
  const notas = [];
  let soltas = null, conflito = false;
  for (const f of fs.readdirSync(PASTA)) {
    if (!f.endsWith(".md") || f.startsWith(".")) continue;
    const nome = f.slice(0, -3), n = lerNota(ler(path.join(PASTA, f)), nome);
    conflito ||= n.conflito; // merge do git em andamento: esperar resolver
    if (nome === SOLTAS) soltas = n;
    else { n.id ||= novoId(); notas.push(n); }
  }
  return { notas, soltas, conflito };
}

function enviarComando(comando) {
  return new Promise((ok, erro) => {
    const id = ++seq;
    const t = setTimeout(() => { esperando.delete(id); erro(new Error("sem resposta da extensão")); }, 120000);
    esperando.set(id, (r) => { clearTimeout(t); ok(r); });
    conexao.send(JSON.stringify({ tipo: "aplicar", id, comando }));
  });
}

async function ciclo() {
  if (rodando) { pendente = true; return; }
  if (!snap || !conexao) return;
  rodando = true;
  try {
    const { notas, soltas, conflito } = lerNotas();
    if (conflito) return console.log("notas com conflito de merge: aguardando");
    const estado = lerEstado();
    const loja = await lerLoja(PERFIL);
    const projetos = ler(PROJETOS);
    const plano = planejar({
      snap, loja, notas, soltas, estado, novoId,
      statusTarefa: (n) => statusTarefa(projetos, n),
      podeAbrir: (t) => Date.now() >= (esperaAbrir.get(t) ?? 0),
    });

    const avisos = [...plano.avisos];
    if (plano.comando) {
      const r = await enviarComando(plano.comando);
      if (r.erro) throw new Error(r.erro);
      for (const u of r.falhas ?? []) {
        avisos.push(`Brave: não consegui abrir ${u}.`);
        for (const b of [plano.novoEstado.soltas, ...Object.values(plano.novoEstado.grupos)]) b.itens = b.itens.filter((i) => i.url !== u);
      }
    }

    // Só depois de o navegador confirmar: comando perdido não pode virar estado acordado.
    for (const { de, para } of plano.renomeios) {
      try { fs.renameSync(path.join(PASTA, `${de}.md`), path.join(PASTA, `${para}.md`)); } catch {}
    }
    for (const n of plano.grava) gravar(path.join(PASTA, `${n.arquivo}.md`), escreverNota(n));
    const urlsLoja = new Set((loja ?? []).flatMap((g) => g.itens.map((i) => i.url)));
    const celular = (snap.dispositivos ?? []).map((d) => ({ nome: d.nome, tabs: d.tabs.filter((t) => gerenciada(t.url) && !urlsLoja.has(t.url)) })).filter((d) => d.tabs.length);
    gravar(path.join(PASTA, `${SOLTAS}.md`), escreverNota({ ...plano.soltas, id: "soltas", estado: "" }, celular));

    let p = projetos;
    for (const { de, para } of plano.renomeios) p = renomearNaTarefa(p, de, para);
    p = adicionarTarefas(p, REL, plano.novasTarefas);
    if (p !== projetos) gravar(PROJETOS, p);

    const fila = [...(estado.avisos ?? []), ...avisos, ...falhasInterface.splice(0)];
    let restantes = fila;
    if (fila.length) {
      const c = acrescentarCaixa(ler(CAIXA), fila);
      if (c !== null) { gravar(CAIXA, c); restantes = []; }
    }
    const novo = { ...plano.novoEstado, avisos: restantes };
    if (JSON.stringify(novo) !== JSON.stringify(estado)) gravar(ESTADO, JSON.stringify(novo));
    await acionarInterface(plano);
    console.log(`ciclo: ${snap.tabs.length} abas, ${snap.groups.length} grupos abertos, ${loja?.length ?? "?"} no Sync, comando=${!!plano.comando}, ${plano.grava.length} notas`);
  } catch (e) {
    console.error("ciclo falhou:", e);
  } finally {
    rodando = false;
    if (pendente) { pendente = false; agendar(500); }
  }
}

let timer = null;
function agendar(ms) { clearTimeout(timer); timer = setTimeout(ciclo, ms); }

const wss = new WebSocketServer({
  host: "127.0.0.1", port: PORTA,
  verifyClient: ({ origin }) => origin === ORIGEM,
});
wss.on("listening", () => console.log(`ouvindo em ${PORTA}, extensão ${idExtensao}, vault ${VAULT}, perfil ${PERFIL}`));
wss.on("connection", (ws) => {
  conexao = ws;
  console.log("extensão conectada");
  ws.on("close", () => { if (conexao === ws) { conexao = null; snap = null; } });
  ws.on("message", (d) => {
    const m = JSON.parse(d);
    if (m.tipo === "estado") {
      if (!rodando) agendar(1000); else pendente = true;
      snap = m;
    } else if (m.tipo === "aplicado") {
      esperando.get(m.id)?.(m);
      esperando.delete(m.id);
    }
  });
});

// Editar nota ou Projetos dispara um ciclo; escritas do próprio serviço terminam em plano vazio.
// Pastas observadas sem `recursive`: no Linux esse modo perde arquivos trocados por escrita atômica.
const interessa = (f) => f?.endsWith(".md") && !f.startsWith(".");
fs.watch(PASTA, (_, f) => { if (interessa(f)) agendar(3000); });
fs.watch(PRATICA, (_, f) => { if (f === "Projetos.md") agendar(3000); });
