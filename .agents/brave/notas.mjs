// Formato em disco: notas de grupo, Projetos e Caixa de Entrada.
import fs from "node:fs";
import path from "node:path";

export const MARCA_CELULAR = "<!--celular-->";
const LINK = /^\s*[-*]\s+\[((?:\\.|[^\]\\])*)\]\(<?((?:\\.|[^)\\])*?)>?\)\s*$/;
const NUA = /^\s*(?:[-*]\s+)?(?:<)?([a-z][a-z0-9+.-]*:\/\/\S+?)(?:>)?\s*$/i;

const des = (s) => s.replace(/\\(.)/g, "$1");
const titulo = (s) => (s || "").replace(/\s+/g, " ").replace(/([\\[\]])/g, "\\$1").trim();
const url = (s) => s.replace(/([\\()])/g, "\\$1").replace(/ /g, "%20");

export function lerNota(texto, arquivo) {
  const nota = { arquivo, id: null, cor: "", estado: "", itens: [], resto: "", conflito: /^(<{7}|>{7}) /m.test(texto) };
  let corpo = texto;
  const fm = texto.match(/^---\n([\s\S]*?)\n?---\n?/);
  if (fm) {
    corpo = texto.slice(fm[0].length);
    for (const [, k, v] of fm[1].matchAll(/^(id|cor|estado):\s*(.*)$/gm)) nota[k] = v.trim();
  }
  corpo = corpo.split(MARCA_CELULAR)[0];
  const resto = [];
  for (const linha of corpo.split("\n")) {
    if (/^> \[!\w+\] Grupo fechado/.test(linha)) continue;
    const m = linha.match(LINK);
    if (m) { nota.itens.push({ titulo: des(m[1]), url: des(m[2]) }); continue; }
    const n = linha.match(NUA);
    if (n) { nota.itens.push({ titulo: "", url: n[1] }); continue; }
    if (linha.trim()) resto.push(linha);
  }
  nota.resto = resto.join("\n");
  return nota;
}

export function escreverNota(n, celular = []) {
  const fm = [`id: ${n.id}`];
  if (n.cor) fm.push(`cor: ${n.cor}`);
  if (n.estado) fm.push(`estado: ${n.estado}`);
  const partes = [`---\n${fm.join("\n")}\n---`];
  // No Windows o grupo aberto para receber a edição continua aberto (ver servico.mjs).
  if (n.estado === "fechado") partes.push(process.platform === "win32"
    ? "> [!info] Grupo fechado neste PC. Edições aqui abrem o grupo e são aplicadas; ele continua aberto."
    : "> [!info] Grupo fechado neste PC. Edições aqui abrem o grupo, são aplicadas e ele fecha de novo.");
  if (n.itens.length) partes.push(n.itens.map(linha).join("\n"));
  if (n.resto) partes.push(n.resto);
  if (celular.length) {
    partes.push(MARCA_CELULAR);
    for (const d of celular) partes.push(`## 📱 ${d.nome}\n${d.tabs.map(linha).join("\n")}`);
  }
  return partes.join("\n\n") + "\n";
}

const linha = (i) => `- [${titulo(i.titulo) || titulo(i.url)}](${url(i.url)})`;

// No Windows, trocar um arquivo aberto por outro processo (Obsidian, antivírus, indexador) falha por alguns
// instantes com EPERM/EBUSY/EACCES. Tenta de novo e, se continuar preso, escreve direto no arquivo.
const PRESO = new Set(["EPERM", "EBUSY", "EACCES"]);
const pausa = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

export function gravar(arquivo, texto) {
  try { if (fs.readFileSync(arquivo, "utf8") === texto) return false; } catch {}
  const tmp = path.join(path.dirname(arquivo), `.${path.basename(arquivo)}.tmp`);
  fs.writeFileSync(tmp, texto);
  for (let tentativa = 0; ; tentativa++) {
    try { fs.renameSync(tmp, arquivo); return true; } catch (e) {
      if (!PRESO.has(e.code)) throw e;
      if (tentativa < 10) { pausa(100); continue; }
      fs.writeFileSync(arquivo, texto);
      fs.rmSync(tmp, { force: true });
      return true;
    }
  }
}

// Projetos: a tarefa é a linha com checkbox que aponta para a nota, em qualquer forma de link.
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const refere = (nome) => {
  const alt = [esc(nome), esc(encodeURI(nome))].join("|");
  return new RegExp(`(?:\\[\\[|/|\\]\\()(?:${alt})(?:\\.md)?(?:\\]\\]|\\||\\))`);
};

export function statusTarefa(projetos, nome) {
  const r = refere(nome);
  for (const l of projetos.split("\n")) {
    const m = l.match(/^\s*- \[(.)\]/);
    if (m && r.test(l)) return m[1];
  }
  return null;
}

export const linkNota = (pasta, nome) => `[[${pasta}/${nome}|${nome}]]`;

export function adicionarTarefas(projetos, pasta, nomes, secao = "### 📋️ Sem Categoria") {
  if (!nomes.length) return projetos;
  const novas = nomes.map((n) => `- [ ] ${linkNota(pasta, n)}`).join("\n");
  const ls = projetos.split("\n");
  const i = ls.findIndex((l) => l.trim() === secao);
  if (i < 0) return `${projetos.replace(/\n*$/, "")}\n${novas}\n`;
  ls.splice(i + 1, 0, novas);
  return ls.join("\n");
}

export function renomearNaTarefa(projetos, de, para) {
  let s = projetos;
  for (const [a, b] of [[de, para], [encodeURI(de), encodeURI(para)]]) {
    s = s.replace(new RegExp(`(\\[\\[|/|\\]\\()${esc(a)}(\\.md)?(\\]\\]|\\||\\))`, "g"), `$1${b}$2$3`)
      .replace(new RegExp(`\\|${esc(a)}\\]\\]`, "g"), `|${b}]]`);
  }
  return s;
}

/** Acrescenta avisos em "Para categorizar"; devolve null se o processar-inbox estiver rodando. */
export function acrescentarCaixa(caixa, avisos) {
  const fase = caixa.match(/^processar-inbox:\s*(\S+)/m)?.[1] ?? "idle";
  if (fase !== "idle") return null;
  const ls = caixa.split("\n");
  const novas = [...new Set(avisos.map((a) => `- ${a}`))].filter((a) => !ls.includes(a)).join("\n");
  if (!novas) return caixa;
  const i = ls.findIndex((l) => l.startsWith("## 🗂️ Para categorizar"));
  if (i < 0) return `${caixa.replace(/\n*$/, "")}\n${novas}\n`;
  let j = i + 1;
  while (j < ls.length && !/^(## |```)/.test(ls[j])) j++;
  while (j > i + 1 && !ls[j - 1].trim()) j--;
  ls.splice(j, 0, novas);
  return ls.join("\n");
}
