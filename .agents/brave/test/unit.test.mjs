import assert from "node:assert/strict";
import test from "node:test";
import { mesclar, nomeArquivo, planejar } from "../modelo.mjs";
import { acrescentarCaixa, adicionarTarefas, concluirTarefa, escreverNota, lerNota, marcarEstados, moverNaTarefa, renomearNaTarefa, statusTarefa } from "../notas.mjs";

const i = (...u) => u.map((url) => ({ url, titulo: url }));
const urls = (m) => m.itens.map((x) => x.url);

test("adição de cada lado entra nos dois", () => assert.deepEqual(urls(mesclar(i("a"), i("a", "b"), i("a", "c"))), ["a", "b", "c"]));
test("remoção na nota fecha", () => assert.deepEqual(urls(mesclar(i("a", "b"), i("a", "b"), i("a"))), ["a"]));
test("remoção no navegador some da nota", () => assert.deepEqual(urls(mesclar(i("a", "b"), i("a"), i("a", "b"))), ["a"]));
test("sem base é união: nada fecha", () => assert.deepEqual(urls(mesclar([], i("a"), i("b"))), ["a", "b"]));
test("mudou nos dois lados: remoção da nota não fecha", () => {
  const m = mesclar(i("a", "b"), i("a", "b", "c"), i("a"));
  assert.deepEqual(urls(m), ["a", "b", "c"]);
  assert.deepEqual(m.conflitos, ["b"]);
});
test("reordenar na nota vence", () => assert.deepEqual(urls(mesclar(i("a", "b"), i("a", "b"), i("b", "a"))), ["b", "a"]));
test("duplicatas contam por ocorrência", () => assert.deepEqual(urls(mesclar(i("a", "a"), i("a", "a"), i("a"))), ["a"]));
test("título vem do navegador", () => assert.equal(mesclar(i("a"), [{ url: "a", titulo: "novo", tabId: 1 }], i("a")).itens[0].titulo, "novo"));

test("nota: ida e volta com caracteres difíceis", () => {
  const n = { id: "x", cor: "blue", estado: "aberto", resto: "texto livre", itens: [{ titulo: "a [b] c", url: "https://x.y/a_(b)?q=1#f" }] };
  const l = lerNota(escreverNota(n), "N");
  assert.deepEqual(l.itens, n.itens);
  assert.equal(l.resto, "texto livre");
  assert.equal(l.cor, "blue");
});
test("nota: URL nua e seção do celular", () => {
  const l = lerNota(escreverNota({ id: "s", itens: [], resto: "" }, [{ nome: "Tel", tabs: i("https://t") }]) + "\n", "S");
  assert.deepEqual(l.itens, []);
  assert.equal(lerNota("- https://a.b/c\n", "S").itens[0].url, "https://a.b/c");
});
test("nota: URL sem traço", () => {
  const n = lerNota("---\nid: x\n---\nhttps://example.com\ntexto com https://a.b no meio\n", "N");
  assert.deepEqual(n.itens.map((i) => i.url), ["https://example.com"]);
  assert.equal(n.resto, "texto com https://a.b no meio");
});
test("caixa: não repete aviso", () => {
  const c = "## 🗂️ Para categorizar\n- a\n";
  assert.equal(acrescentarCaixa(c, ["a"]), c);
  assert.equal(acrescentarCaixa(c, ["b", "b"]), "## 🗂️ Para categorizar\n- a\n- b\n");
});
test("nome de arquivo seguro e único", () => {
  const u = new Set();
  assert.equal(nomeArquivo("a/b: c", u), "a-b- c");
  assert.equal(nomeArquivo("a/b: c", u), "a-b- c (2)");
  assert.equal(nomeArquivo("_Soltas_", new Set()), "_Soltas_ (2)");
});
test("tarefa: acha em wikilink, com alias e markdown", () => {
  assert.equal(statusTarefa("- [x] [[Prática/Tarefas/Brave/Meu grupo|Meu grupo]]", "Meu grupo"), "x");
  assert.equal(statusTarefa("\t- [ ] [[Meu grupo]] ⏳ 2026-11-02", "Meu grupo"), " ");
  assert.equal(statusTarefa("- [-] [Meu grupo](Prática/Tarefas/Brave/Meu%20grupo.md)", "Meu grupo"), "-");
  assert.equal(statusTarefa("- [ ] [[Meu grupo 2]]\n- nota [[Meu grupo]]", "Meu grupo"), null);
});
test("tarefa: adicionar na seção e renomear", () => {
  const p = adicionarTarefas("### 📋️ Sem Categoria\n- [ ] y\n", "P/B", ["G"]);
  assert.equal(p, "### 📋️ Sem Categoria\n- [ ] [[P/B/G|G]]\n- [ ] y\n");
  assert.equal(renomearNaTarefa(p, "G", "H").split("\n")[1], "- [ ] [[P/B/H|H]]");
});
test("caixa: respeita seção e processamento", () => {
  assert.equal(acrescentarCaixa("---\nprocessar-inbox: idle\n---\n## 🗂️ Para categorizar\n- a\n\n", ["b"]), "---\nprocessar-inbox: idle\n---\n## 🗂️ Para categorizar\n- a\n- b\n\n");
  assert.equal(acrescentarCaixa("---\nprocessar-inbox: rodando\n---\n", ["b"]), null);
});

const fechado = (over = {}) => {
  const b = { arquivo: "G", titulo: "G", cor: "red", estado: "fechado", itens: i("a"), groupId: null, guid: "g1" };
  return planejar({
    snap: { tabs: [{ id: 1, url: "x", titulo: "x", grupo: -1, janela: 1, indice: 0, fixada: false }], groups: [] },
    loja: [{ guid: "g1", titulo: "G", cor: "red", itens: i("a") }],
    notas: [{ id: "n", arquivo: "G", cor: "red", estado: "fechado", itens: i("a"), resto: "" }],
    soltas: { itens: i("x"), resto: "" }, estado: { grupos: { n: b }, soltas: { itens: i("x") } },
    statusTarefa: () => " ", novoId: () => "z", ...over,
  });
};
test("grupo fechado sem mudança não abre", () => assert.deepEqual(fechado().abrir, []));
test("linha nova em nota fechada abre", () => {
  const r = fechado({ notas: [{ id: "n", arquivo: "G", cor: "red", estado: "fechado", itens: i("a", "b"), resto: "" }] });
  assert.deepEqual(r.abrir, ["G"]);
  assert.equal(r.novoEstado.grupos.n.fecharDepois, true);
  assert.deepEqual(r.novoEstado.grupos.n.itens.map((x) => x.url), ["a"]);
  assert.deepEqual(r.grava[0].itens.map((x) => x.url), ["a", "b"]);
});
test("nomes repetidos não abrem e avisam", () => {
  const l = { guid: "g2", titulo: "G", cor: "", itens: i("q") };
  const r = fechado({ loja: [{ guid: "g1", titulo: "G", cor: "red", itens: i("a") }, l], notas: [{ id: "n", arquivo: "G", cor: "red", estado: "fechado", itens: i("a", "b"), resto: "" }] });
  assert.deepEqual(r.abrir, []);
  assert.ok(r.avisos.some((a) => a.includes("mais de um grupo")));
});
test("em espera não abre, mas mantém a nota", () => {
  const r = fechado({ podeAbrir: () => false, notas: [{ id: "n", arquivo: "G", cor: "red", estado: "fechado", itens: i("a", "b"), resto: "" }] });
  assert.deepEqual(r.abrir, []);
  assert.deepEqual(r.grava[0].itens.map((x) => x.url), ["a", "b"]);
});
test("nota renomeada e fechada preserva a diferença até aplicar", () => {
  const r = fechado({ notas: [{ id: "n", arquivo: "H", cor: "red", estado: "fechado", itens: i("a"), resto: "" }] });
  assert.deepEqual(r.abrir, ["G"]);
  assert.equal(r.novoEstado.grupos.n.arquivo, "G");
  assert.equal(r.grava[0].arquivo, "H");
});
test("sem estado, nota com nome limpo casa com o grupo em vez de criar outro", () => {
  const r = planejar({
    snap: { tabs: [{ id: 1, url: "a", titulo: "a", grupo: 7, janela: 1, indice: 0, fixada: false }], groups: [{ id: 7, titulo: "TDD?", cor: "red" }] },
    loja: [{ guid: "g1", titulo: "TDD?", cor: "red", itens: i("a") }],
    notas: [{ id: "n", arquivo: "TDD-", cor: "red", estado: "aberto", itens: i("a"), resto: "" }],
    soltas: { itens: [], resto: "" }, estado: { grupos: {}, soltas: { itens: [] } },
    statusTarefa: () => " ", novoId: () => "z",
  });
  assert.equal(r.novoEstado.grupos.n.groupId, 7);
  assert.equal(Object.keys(r.novoEstado.grupos).length, 1);
  assert.deepEqual(r.novasTarefas, []);
});

test("marca o estado do grupo antes do link e troca o marcador antigo", () => {
  const p = [
    "- [ ] [[P/B/Kiro|Kiro]] ⏫",
    "\t- [ ] ⚪ [[P/B/Delta|Delta]]",
    "- [x] 🟢 [[P/B/Feito|Feito]]",
    "- [ ] [[Outra nota]]",
  ].join("\n");
  const r = marcarEstados(p, "P/B", { Kiro: "aberto", Delta: "aberto", Feito: "concluido" });
  assert.equal(r, [
    "- [ ] 🟢 [[P/B/Kiro|Kiro]] ⏫",
    "\t- [ ] 🟢 [[P/B/Delta|Delta]]",
    "- [x] [[P/B/Feito|Feito]]",
    "- [ ] [[Outra nota]]",
  ].join("\n"));
  assert.equal(statusTarefa(r, "Kiro"), " ");
  assert.equal(marcarEstados(r, "P/B", { Kiro: "aberto", Delta: "aberto", Feito: "concluido" }), r);
});

test("nota arquivada: o link da tarefa segue o novo caminho", () => {
  const p = "- [ ] [[P/B/windsurf configs|windsurf configs]]\n- [ ] [[P/B/windsurf configs 2|x]]\n- [ ] [link](P/B/windsurf%20configs.md)";
  assert.equal(moverNaTarefa(p, "P/B/windsurf configs", "A/B/windsurf configs"),
    "- [ ] [[A/B/windsurf configs|windsurf configs]]\n- [ ] [[P/B/windsurf configs 2|x]]\n- [ ] [link](A/B/windsurf%20configs.md)");
});

test("grupo apagado no navegador conclui a tarefa com data", () => {
  const p = "\t- [ ] [[A/B/X|X]] ⏫\n- [ ] [[A/B/X (2)|X (2)]]\n- [x] [[A/B/Y|Y]] ✅ 2026-01-01";
  assert.equal(concluirTarefa(p, "A/B/X", "2026-11-09"),
    "\t- [x] [[A/B/X|X]] ⏫ ✅ 2026-11-09\n- [ ] [[A/B/X (2)|X (2)]]\n- [x] [[A/B/Y|Y]] ✅ 2026-01-01");
});
test("tarefa concluída só libera o arquivamento quando o grupo já não existe", () => {
  const nota = { id: "n1", arquivo: "G", cor: "red", estado: "aberto", itens: i("a"), resto: "" };
  const base = { arquivo: "G", titulo: "G", cor: "red", estado: "aberto", itens: i("a"), groupId: 7 };
  const ent = (tabs, groups, loja) => planejar({
    snap: { tabs, groups }, loja, notas: [nota], soltas: null, estado: { grupos: { n1: base } },
    statusTarefa: () => "x", novoId: () => "z",
  }).grava.find((g) => g.id === "n1");
  const aba = [{ id: 1, url: "a", titulo: "a", grupo: 7, janela: 1, indice: 0, fixada: false }];
  assert.equal(ent(aba, [{ id: 7, titulo: "G", cor: "red" }], []).semGrupo, false);
  assert.equal(ent([], [], []).semGrupo, true);
  assert.equal(ent([], [], null).semGrupo, false); // Sync ilegível: não arquiva
});
