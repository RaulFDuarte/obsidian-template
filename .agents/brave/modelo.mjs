// Regras de sincronização, sem E/S: base (último acordo) + navegador + notas = plano.
export const SOLTAS = "_Soltas_";
const ID_SOLTAS = "soltas";

export function gerenciada(url) {
  return !!url && !/^(chrome|brave):\/\/newtab|^about:blank|^chrome-extension:/.test(url);
}

const chaves = (lista) => {
  const n = new Map();
  return lista.map((it) => {
    const c = n.get(it.url) ?? 0;
    n.set(it.url, c + 1);
    return { chave: `${it.url}#${c}`, it };
  });
};

/** Fusão de três vias por URL (duplicatas contam por ocorrência). */
export function mesclar(base, navegador, nota, { respeitarRemocaoNota = true } = {}) {
  const B = chaves(base), N = chaves(navegador), O = chaves(nota);
  const emB = new Set(B.map((x) => x.chave)), emN = new Set(N.map((x) => x.chave)), emO = new Set(O.map((x) => x.chave));
  const iguais = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));
  const mudouN = !iguais(emB, emN), mudouO = !iguais(emB, emO);

  const conflitos = [];
  const fica = (k) => {
    const n = emN.has(k), o = emO.has(k);
    if (n && o) return true;
    if (!emB.has(k)) return n || o;
    if (n && !o) { // removida na nota, ainda aberta
      if (!respeitarRemocaoNota) return true;
      if (mudouN && mudouO) { conflitos.push(k.replace(/#\d+$/, "")); return true; }
      return false;
    }
    return false; // removida no navegador
  };

  const ordem = (l) => l.map((x) => x.chave).filter((k) => emB.has(k) && emO.has(k) && emN.has(k));
  const seq = (l, comuns) => l.map((x) => x.chave).filter((k) => comuns.has(k)).join("\n");
  const comuns = new Set(ordem(B));
  const notaReordenou = seq(O, comuns) !== seq(B, comuns);
  const [prim, sec] = notaReordenou ? [O, N] : [N, O];

  const porN = new Map(N.map((x) => [x.chave, x.it])), porO = new Map(O.map((x) => [x.chave, x.it]));
  const vistos = new Set(), itens = [];
  for (const { chave } of [...prim, ...sec]) {
    if (vistos.has(chave) || !fica(chave)) continue;
    vistos.add(chave);
    const n = porN.get(chave), o = porO.get(chave);
    itens.push({ url: (n ?? o).url, titulo: n?.titulo || o?.titulo || "", ...(n?.tabId != null ? { tabId: n.tabId } : {}) });
  }
  return { itens, conflitos: [...new Set(conflitos)] };
}

export function nomeArquivo(titulo, usados) {
  const limpo = titulo.replace(/[\\/:*?"<>|#^[\]]/g, "-").replace(/\s+/g, " ").replace(/^[.\s]+|[.\s]+$/g, "").slice(0, 100) || "Grupo";
  let nome = limpo, i = 2;
  while (usados.has(nome.toLowerCase()) || nome === SOLTAS) nome = `${limpo} (${i++})`;
  usados.add(nome.toLowerCase());
  return nome;
}

const semTab = (l) => l.map(({ url, titulo }) => ({ url, titulo }));

/**
 * @param snap      estado da extensão
 * @param loja      grupos do banco do Sync, ou null se a leitura falhou (nesse caso nada é dado como apagado)
 * @param notas     notas de grupo em disco [{id, arquivo, cor, itens, resto, estado}]
 * @param soltas    nota _Soltas_ ou null
 * @param estado    {grupos: {id: base}, soltas: {itens}}
 * @param statusTarefa arquivo => " " | "x" | "-" | null
 */
export function planejar(ent) {
  const limite = ent.limiteFechamentos ?? 20;
  const r = passo(ent, true);
  if (r.fechamentosPorNota <= limite) return r;
  const seguro = passo(ent, false);
  seguro.avisos.push(`${r.fechamentosPorNota} abas seriam fechadas de uma vez por mudanças nas notas. Por segurança restaurei as linhas; apague em partes (até ${limite}) se foi intencional.`);
  return seguro;
}

function passo({ snap, loja, notas, soltas, estado, statusTarefa, novoId, podeAbrir = () => true }, respeitarRemocaoNota) {
  const bases = estado.grupos ?? {};
  const avisos = [], apagados = [], novasTarefas = [], renomeios = [];
  const abrir = [], fecharUi = []; // grupos salvos só mudam com o grupo aberto: abre, aplica, fecha
  let fechamentosFechados = 0;
  const contagem = new Map();
  for (const g of loja ?? []) contagem.set(g.titulo, (contagem.get(g.titulo) ?? 0) + 1);
  // O botão do Brave só mostra o título: com nomes repetidos não há como saber qual acionar.
  const repetido = (titulo) => (contagem.get(titulo) ?? 0) > 1;
  const pedirAbertura = (titulo) => {
    if (repetido(titulo)) { avisos.push(`Brave: há mais de um grupo "${titulo}"; renomeie um deles para eu conseguir editá-lo fechado.`); return false; }
    if (!podeAbrir(titulo)) return false;
    abrir.push(titulo);
    return true;
  };
  const comandoGrupos = [], grava = [];
  const novoEstado = { grupos: {}, soltas: { itens: [] } };
  const usados = new Set(notas.map((n) => n.arquivo.toLowerCase()));
  for (const b of Object.values(bases)) if (b.ignorada !== true) usados.add(b.arquivo.toLowerCase());

  const tabs = snap.tabs.filter((t) => !t.fixada && gerenciada(t.url))
    .sort((a, b) => a.janela - b.janela || a.indice - b.indice)
    .map((t) => ({ url: t.url, titulo: t.titulo, tabId: t.id, grupo: t.grupo }));
  const doGrupo = (id) => tabs.filter((t) => t.grupo === id);
  const nomeados = snap.groups.filter((g) => g.titulo);
  const semNome = new Set(snap.groups.filter((g) => !g.titulo).map((g) => g.id));
  const gLivres = new Map(nomeados.map((g) => [g.id, g]));
  const lLivres = new Map((loja ?? []).map((g) => [g.guid, g]));

  const tomarG = (base, titulo) => {
    let g = base?.groupId != null ? gLivres.get(base.groupId) : null;
    g ??= [...gLivres.values()].find((x) => x.titulo === (base?.titulo ?? titulo));
    if (g) gLivres.delete(g.id);
    return g ?? null;
  };
  const tomarL = (base, titulo) => {
    let l = base?.guid ? lLivres.get(base.guid) : null;
    l ??= [...lLivres.values()].find((x) => x.titulo === (base?.titulo ?? titulo));
    if (l) lLivres.delete(l.guid);
    return l ?? null;
  };

  const pendencias = []; // grupos abertos, para resolver movimentações depois da fusão
  const fechamentosConcluidos = [];

  const tratar = (nota, base) => {
    const notaRenomeada = !!base && base.arquivo !== nota.arquivo;
    const tituloNota = notaRenomeada ? nota.arquivo : base?.titulo ?? nota.arquivo;
    const g = tomarG(base, tituloNota);
    const l = tomarL(base, tituloNota);
    const st = statusTarefa(nota.arquivo);
    const concluida = st === "x" || st === "X" || st === "-";
    const guid = l?.guid ?? base?.guid;
    const itensNota = nota.itens;
    const salvar = (estadoNota, itens, extra = {}) => {
      const titulo = extra.titulo ?? tituloNota, cor = extra.cor ?? nota.cor ?? base?.cor ?? "";
      let arquivo = nota.arquivo;
      if (extra.titulo != null && extra.titulo !== (base?.titulo ?? tituloNota) && !notaRenomeada) {
        usados.delete(arquivo.toLowerCase());
        arquivo = nomeArquivo(titulo, usados);
        if (arquivo !== nota.arquivo) renomeios.push({ de: nota.arquivo, para: arquivo });
      }
      novoEstado.grupos[nota.id] = {
        arquivo, titulo, cor, estado: estadoNota, itens: semTab(extra.baseItens ?? itens),
        groupId: extra.groupId ?? null, ...(guid ? { guid } : {}),
        ...extra.sobre,
      };
      grava.push({ ...nota, arquivo, cor, estado: estadoNota, itens: semTab(itens) });
    };

    if (concluida) {
      if (g) fechamentosConcluidos.push(...doGrupo(g.id).map((t) => t.tabId));
      else if (l) pedirAbertura(l.titulo); // aberto, o próximo ciclo apaga
      return salvar("concluido", itensNota);
    }
    if (g) {
      const nav = doGrupo(g.id);
      const m = mesclar(base?.itens ?? [], nav, itensNota, { respeitarRemocaoNota });
      if (m.conflitos.length) avisos.push(`"${g.titulo}": mudou nos dois lados; mantive abertas ${m.conflitos.length} aba(s) removida(s) da nota.`);
      const titulo = notaRenomeada ? tituloNota : g.titulo;
      const corMudouNota = nota.cor && nota.cor !== (base?.cor ?? nota.cor);
      const cor = corMudouNota ? nota.cor : g.cor;
      pendencias.push({ grupoId: g.id, nav, itens: m.itens, titulo, cor, tituloAtual: g.titulo, corAtual: g.cor, nota, base, fecharDepois: !!base?.fecharDepois });
      return salvar("aberto", m.itens, { titulo, cor, groupId: g.id, sobre: base?.fecharDepois ? { fecharDepois: true } : {} });
    }
    if (l) {
      // Fechado no PC: a nota acompanha o Sync. Se ela tem algo a mais, o grupo abre para receber a mudança;
      // a base fica no que o Sync diz para o ramo acima enxergar a diferença.
      const m = mesclar(base?.itens ?? [], l.itens, itensNota, { respeitarRemocaoNota });
      const seq = (x) => x.map((i) => i.url).join("\n");
      const corNota = !!base && !!nota.cor && nota.cor !== base.cor;
      const pendente = !!base && (seq(m.itens) !== seq(l.itens) || notaRenomeada || corNota);
      const fecharDepois = pendente && pedirAbertura(l.titulo);
      return salvar("fechado", m.itens, {
        titulo: l.titulo, cor: corNota ? nota.cor : l.cor || nota.cor, baseItens: l.itens,
        sobre: { ...(notaRenomeada ? { arquivo: base.arquivo } : {}), ...(corNota ? { cor: base.cor } : {}), ...(fecharDepois ? { fecharDepois: true } : {}) },
      });
    }
    // Linha nova em nota de grupo apagado é pedido para recriar.
    const reativada = nota.estado === "apagado" && !!base && itensNota.length > 0
      && itensNota.map((i) => i.url).join() !== base.itens.map((i) => i.url).join();
    if (nota.estado === "apagado" && !reativada) return salvar("apagado", itensNota);
    if (!base || base.estado === "concluido" || reativada || !base.itens.length) { // nota nova, antes vazia ou tarefa reaberta: cria o grupo
      if (!itensNota.length) return salvar("aberto", itensNota);
      if (nota.estado !== "fechado" || !base) {
        pendencias.push({ grupoId: null, nav: [], itens: itensNota.map((x) => ({ ...x })), titulo: tituloNota, cor: nota.cor || base?.cor || "", nota, base });
        return salvar("aberto", itensNota);
      }
    }
    if (!itensNota.length && !base?.itens?.length) return salvar("aberto", itensNota); // nota ainda vazia: nada a apagar
    if (loja === null) { // sem como distinguir fechado de apagado: não decide nada
      novoEstado.grupos[nota.id] = base;
      return;
    }
    if (base?.estado !== "apagado") apagados.push(tituloNota);
    return salvar("apagado", itensNota);
  };

  for (const nota of notas) {
    tratar(nota, bases[nota.id]);
    // Só no nascimento: quem apagou a tarefa depois não a vê voltar.
    if (!bases[nota.id] && statusTarefa(nota.arquivo) === null) novasTarefas.push(nota.arquivo);
  }

  // Notas apagadas do disco.
  const presentes = new Set(notas.map((n) => n.id));
  for (const [id, base] of Object.entries(bases)) {
    if (presentes.has(id)) continue;
    if (base.ignorada) {
      const l = tomarL(base);
      novoEstado.grupos[id] = base;
      if (!l && loja) delete novoEstado.grupos[id];
      continue;
    }
    if (!respeitarRemocaoNota) { // restaura a nota
      tratar({ id, arquivo: base.arquivo, cor: base.cor, estado: base.estado, itens: base.itens, resto: "" }, base);
      continue;
    }
    const g = tomarG(base);
    if (g) pendencias.push({ grupoId: g.id, nav: doGrupo(g.id), itens: [], titulo: g.titulo, cor: g.cor, tituloAtual: g.titulo, corAtual: g.cor, removida: true });
    else {
      const l = tomarL(base);
      if (l && repetido(l.titulo)) novoEstado.grupos[id] = { ...base, ignorada: true };
      else if (l) { // abre agora, o próximo ciclo apaga
        fechamentosFechados += l.itens.length;
        novoEstado.grupos[id] = base;
        pedirAbertura(l.titulo);
      }
    }
  }

  // Grupos novos no navegador e no Sync (ex.: criados no celular).
  for (const g of [...gLivres.values()]) {
    gLivres.delete(g.id);
    const l = [...lLivres.values()].find((x) => x.titulo === g.titulo);
    if (l) lLivres.delete(l.guid);
    const arquivo = nomeArquivo(g.titulo, usados), id = novoId(), itens = doGrupo(g.id);
    pendencias.push({ grupoId: g.id, nav: itens, itens, titulo: g.titulo, cor: g.cor, tituloAtual: g.titulo, corAtual: g.cor });
    novoEstado.grupos[id] = { arquivo, titulo: g.titulo, cor: g.cor, estado: "aberto", itens: semTab(itens), groupId: g.id, ...(l ? { guid: l.guid } : {}) };
    grava.push({ id, arquivo, cor: g.cor, estado: "aberto", itens: semTab(itens), resto: "" });
    novasTarefas.push(arquivo);
  }
  for (const l of [...lLivres.values()]) {
    if (!l.titulo) continue;
    const arquivo = nomeArquivo(l.titulo, usados), id = novoId();
    novoEstado.grupos[id] = { arquivo, titulo: l.titulo, cor: l.cor, estado: "fechado", itens: l.itens, groupId: null, guid: l.guid };
    grava.push({ id, arquivo, cor: l.cor, estado: "fechado", itens: l.itens, resto: "" });
    novasTarefas.push(arquivo);
  }

  // Abas soltas.
  const navSoltas = tabs.filter((t) => t.grupo === -1);
  // Sem a nota não há intenção de remover: ela é recriada a partir do navegador.
  const baseSoltas = estado.soltas?.itens ?? [];
  const mSoltas = mesclar(baseSoltas, navSoltas, soltas?.itens ?? baseSoltas, { respeitarRemocaoNota });
  novoEstado.soltas.itens = semTab(mSoltas.itens);
  if (mSoltas.conflitos.length) avisos.push(`Soltas: mudou nos dois lados; mantive abertas ${mSoltas.conflitos.length} aba(s) removida(s) da nota.`);

  // Aba que saiu de um lugar e entrou em outro é movida, não fechada e recriada.
  const ficam = new Set();
  for (const p of pendencias) for (const it of p.itens) if (it.tabId != null) ficam.add(it.tabId);
  for (const it of mSoltas.itens) if (it.tabId != null) ficam.add(it.tabId);
  const concluidas = new Set(fechamentosConcluidos);
  const sobra = tabs.filter((t) => !ficam.has(t.tabId) && !concluidas.has(t.tabId)
    && !semNome.has(t.grupo));
  // Abas de grupos que nenhum ramo tratou (ex.: fechados sem decisão) não entram na sobra.
  const tratados = new Set([...pendencias.map((p) => p.grupoId), -1]);
  const pool = sobra.filter((t) => tratados.has(t.grupo));
  const usar = (it) => {
    if (it.tabId != null) return;
    const i = pool.findIndex((t) => t.url === it.url);
    if (i >= 0) { it.tabId = pool[i].tabId; pool.splice(i, 1); }
  };
  for (const p of pendencias) p.itens.forEach(usar);
  mSoltas.itens.forEach(usar);

  const grupoDe = new Map(tabs.map((t) => [t.tabId, t.grupo]));
  for (const p of pendencias) {
    if (p.removida || !p.itens.length) continue;
    const atual = p.nav.map((t) => t.tabId).join();
    const desejado = p.itens.map((t) => t.tabId ?? "?").join();
    if (p.grupoId != null && atual === desejado && p.titulo === p.tituloAtual && p.cor === p.corAtual) {
      if (p.fecharDepois) fecharUi.push(p.titulo); // mudança já aplicada: volta a ficar fechado
      continue;
    }
    comandoGrupos.push({ groupId: p.grupoId, titulo: p.titulo, cor: p.cor, itens: p.itens.map((i) => (i.tabId != null ? { tabId: i.tabId } : { url: i.url })) });
  }
  const soltar = mSoltas.itens.filter((i) => i.tabId != null && grupoDe.get(i.tabId) !== -1).map((i) => i.tabId);
  const criar = mSoltas.itens.filter((i) => i.tabId == null).map((i) => i.url);
  const fecharTabs = [...pool.map((t) => t.tabId), ...concluidas];

  const comando = comandoGrupos.length || soltar.length || criar.length || fecharTabs.length
    ? { grupos: comandoGrupos, soltas: { soltar, criar }, fechar: fecharTabs } : null;

  for (const a of apagados) avisos.push(`Brave: o grupo "${a}" não existe mais; mantive a nota como registro.`);

  return {
    comando, grava, renomeios, novasTarefas, avisos, novoEstado, abrir, fecharUi,
    soltas: { ...(soltas ?? { resto: "" }), itens: semTab(mSoltas.itens) },
    fechamentosPorNota: pool.length + fechamentosFechados,
  };
}
