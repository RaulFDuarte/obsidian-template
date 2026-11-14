---
cssclasses:
  - calendario-tarefas
---
```dataviewjs
// ---------------------------------------------------------------------------
// Calendário de tarefas (⏳ scheduled / 📅 due) do Projetos.md
// - Visões: mês, semana e dia, só dias úteis (config em .agents/flow.config.json);
//   tarefas de dias de folga aparecem no dia útil anterior
// - Visão dia: lista com checkbox, tarefa pai e árvore de subtarefas; no dia de
//   hoje inclui também as ⏳ atrasadas (sem 📅 vencido, que fica em ⚠️ Atrasadas)
// - Folga: dias de 📅 menos ⏳; negativo = atrasada em relação ao prazo
// - Drag & drop: move a data do item arrastado, editando a linha no arquivo,
//   e define a posição dele no dia (ordem salva em .ordem-do-dia.json via 🆔)
// - Seleção múltipla: arraste no fundo (célula/lista) para desenhar uma caixa de
//   seleção (Alt+arrastar começa a caixa mesmo sobre uma tarefa); Shift/Ctrl+clique
//   alterna uma tarefa; Shift/Ctrl+caixa soma à seleção; Esc ou "✕ Limpar" limpa.
//   Arrastar uma tarefa selecionada move todas, mantendo o deslocamento relativo
//   em dias úteis (na visão dia, reordena em lote). A seleção sobrevive à troca
//   de mês/semana/dia.
// - Duplo clique: abre a tarefa na origem (Ctrl = nova aba)
// - Botão direito: abre o modal "Edit task" do plugin Tasks
// ---------------------------------------------------------------------------

const SOURCE_PAGE = 'Prática/Projetos.md';
const ARQ_ORDEM = 'Prática/.ordem-do-dia.json';
const ARQ_CONFIG = '.agents/flow.config.json';
const EMOJI = { scheduled: '⏳', due: '📅' };
const PRIORIDADES = ['🔺', '⏫', '🔼', '🔽', '⏬'];
const DRAG_TYPE = 'application/x-cal-tarefa';

// --- Links 🔗 das listas do plugin Tasks com o Projetos pinado ---------------
// O plugin abre o link com getLeaf(false), que cria aba nova se a aba alvo está
// pinada. Durante o clique num backlink, devolvemos a aba (pinada) do Projetos;
// leaf.openFile direto navega nela sem criar aba. Ctrl+clique segue o padrão.
const PATCH = '__tarefasBacklinkPatch';
window[PATCH]?.desfazer();
{
    const ws = app.workspace;
    const original = ws.getLeaf;
    let valeAte = 0;
    ws.getLeaf = function (nova, ...resto) {
        if (!nova && Date.now() < valeAte) {
            valeAte = 0;
            let alvo = null;
            ws.iterateAllLeaves((l) => {
                if (!alvo && l.view?.getViewType() === 'markdown' && l.view.file?.path === SOURCE_PAGE) alvo = l;
            });
            if (alvo) return alvo;
        }
        return original.call(this, nova, ...resto);
    };
    const aoClicar = (e) => {
        if (e.button === 0 && !e.ctrlKey && !e.metaKey && e.target.closest?.('.tasks-backlink a')) valeAte = Date.now() + 1500;
    };
    document.addEventListener('click', aoClicar, true);
    window[PATCH] = {
        desfazer() {
            ws.getLeaf = original;
            document.removeEventListener('click', aoClicar, true);
        },
    };
}

const nomesMeses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const siglasDias = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const nomesDias = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

// --- Configuração da semana (.agents/flow.config.json) -----------------------
// weekStart: dia em que a semana começa; workdays: dias que aparecem no calendário.
const codigosDias = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
let avisarInicial = null;
let cfg = { weekStart: 'mon', workdays: ['mon', 'tue', 'wed', 'thu', 'fri'] };
try {
    if (await app.vault.adapter.exists(ARQ_CONFIG)) {
        cfg = { ...cfg, ...JSON.parse(await app.vault.adapter.read(ARQ_CONFIG)) };
    }
} catch (e) {
    avisarInicial = '⚠️ Config da semana inválida; usando seg–sex.';
}
const semanaComecaEm = Math.max(0, codigosDias.indexOf(cfg.weekStart));
let diasUteisCfg = new Set(cfg.workdays.map((c) => codigosDias.indexOf(c)).filter((i) => i >= 0));
if (!diasUteisCfg.size) diasUteisCfg = new Set([1, 2, 3, 4, 5]);
// Colunas da grade, na ordem da semana.
const colunas = Array.from({ length: 7 }, (_, i) => (semanaComecaEm + i) % 7).filter((i) => diasUteisCfg.has(i));

// --- Datas (sempre em horário local, chave 'YYYY-MM-DD') -------------------
const pad = (n) => String(n).padStart(2, '0');
const chaveDe = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const deChave = (k) => { const [a, m, d] = k.split('-').map(Number); return new Date(a, m - 1, d); };
const somarDias = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const inicioSemana = (d) => somarDias(d, -((d.getDay() - semanaComecaEm + 7) % 7));
const ehFolga = (d) => !diasUteisCfg.has(d.getDay());
const diferencaDias = (de, ate) => Math.round((deChave(ate) - deChave(de)) / 86400000);
// Dia de folga vira o dia útil anterior (é onde as tarefas dele aparecem).
const diaUtil = (d) => { while (ehFolga(d)) d = somarDias(d, -1); return d; };
const proximoDiaUtil = (d, direcao) => {
    let r = somarDias(d, direcao);
    while (ehFolga(r)) r = somarDias(r, direcao);
    return r;
};

const hoje = new Date();
hoje.setHours(0, 0, 0, 0);
const chaveHoje = chaveDe(hoje);

// Estado da navegação, mantido em memória durante a sessão do Obsidian.
const stateKey = 'calendario-tarefas-estado-v3';
if (!window[stateKey]) window[stateKey] = { visao: 'mes', ref: chaveHoje };
const estado = window[stateKey];
// Seleção múltipla: chaveItem -> texto da linha (sem 🆔) para detectar mudanças.
// Vive em `window`, então sobrevive à navegação e aos re-renders.
estado.selecao ??= new Map();

function avisar(msg) {
    if (typeof Notice !== 'undefined') new Notice(msg);
    else alert(msg);
}

if (avisarInicial) avisar(avisarInicial);

const limpar = (texto) => texto.split('\n')[0]
    .replace(/🆔\s*[\w-]+/gu, '')
    .replace(/[⏳📅🛫➕✅❌]\s*\d{4}-\d{2}-\d{2}/gu, '')
    .replace(/[🔺⏫🔼🔽⏬]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
// Título da tarefa pai, sem tags (como breadcrumb).
const limparPai = (texto) => limpar(texto).replace(/#[\w/-]+/gu, '').replace(/\s+/g, ' ').trim();

// --- Coleta das tarefas -----------------------------------------------------
const page = dv.page(SOURCE_PAGE);
if (!page) dv.paragraph(`⚠️ Não encontrei o arquivo \`${SOURCE_PAGE}\`.`);

const todas = page ? page.file.tasks.array() : [];
const tarefaPorLinha = new Map(todas.map((t) => [t.line, t]));
let porDia = {}; // 'YYYY-MM-DD' -> [tarefa]

function registrar(task, tipo, chave, folga, prazo) {
    const pai = task.parent !== undefined && task.parent !== null ? tarefaPorLinha.get(task.parent) : null;
    (porDia[chave] ??= []).push({
        texto: limpar(task.text),
        bruto: task.text.split('\n')[0].trim(),
        pai: pai ? limparPai(pai.text) : '',
        tipo, chave, folga, prazo,
        prioridade: PRIORIDADES.find((p) => task.text.includes(p)) || '',
        id: (task.text.match(/🆔\s*([\w-]+)/u) || [])[1] || null,
        concluida: task.completed || task.status === 'x',
        cancelada: task.status === '-',
        path: task.path,
        line: task.line,
    });
}

for (const task of todas) {
    const agendada = task.scheduled ? task.scheduled.toFormat('yyyy-MM-dd') : null;
    const prazo = task.due ? task.due.toFormat('yyyy-MM-dd') : null;
    // Folga só existe quando a tarefa tem as duas datas.
    const folga = agendada && prazo ? diferencaDias(agendada, prazo) : null;
    if (agendada) registrar(task, 'scheduled', agendada, folga, prazo);
    if (prazo) registrar(task, 'due', prazo, folga, prazo);
}

// --- Ordem manual por dia ---------------------------------------------------
// Arquivo { 'YYYY-MM-DD': [id, ...] } com a ordem definida arrastando as tarefas.
// A chave é o dia da célula (o dia útil guarda também a ordem dos dias de folga seguintes).
// Fica em cache na sessão (o bloco reexecuta a cada mudança do vault; reler o
// arquivo toda vez é desperdício e, após um drop, poderia ler a versão antiga).
let ordemPorDia = estado.ordem;
if (!ordemPorDia) {
    ordemPorDia = {};
    try {
        if (await app.vault.adapter.exists(ARQ_ORDEM)) {
            ordemPorDia = JSON.parse(await app.vault.adapter.read(ARQ_ORDEM));
        }
    } catch (e) {
        avisar('⚠️ Não consegui ler a ordem do dia; usando a ordem padrão.');
    }
    estado.ordem = ordemPorDia;
}

// Escritas em fila: nunca duas ao mesmo tempo, e a última sempre vence.
function salvarOrdem() {
    // Descarta dias com mais de 30 dias para o arquivo não crescer para sempre.
    const limite = chaveDe(somarDias(hoje, -30));
    for (const k of Object.keys(ordemPorDia)) if (k < limite) delete ordemPorDia[k];
    const json = JSON.stringify(ordemPorDia, null, 2);
    estado.escrita = (estado.escrita ?? Promise.resolve())
        .then(() => app.vault.adapter.write(ARQ_ORDEM, json))
        .catch(() => avisar('⚠️ Não consegui salvar a ordem do dia.'));
    return estado.escrita;
}

const gerarId = () => Math.random().toString(36).slice(2, 8);

// Ordem dentro do dia: abertas antes de concluídas/canceladas, depois a ordem
// manual; quem não está na ordem manual vai depois, por prazo e prioridade.
const pesoPrioridade = (p) => (p ? PRIORIDADES.indexOf(p) : 2.5);
const finalizada = (t) => (t.concluida || t.cancelada ? 1 : 0);
function ordenar(lista, chaveCelula) {
    const posicoes = new Map((ordemPorDia[chaveCelula] || []).map((id, i) => [id, i]));
    const posicao = (t) => (t.id && posicoes.has(t.id) ? posicoes.get(t.id) : 1e9);
    return lista.sort((a, b) =>
        finalizada(a) - finalizada(b)
        || posicao(a) - posicao(b)
        || (a.tipo === b.tipo ? 0 : a.tipo === 'due' ? -1 : 1)
        || pesoPrioridade(a.prioridade) - pesoPrioridade(b.prioridade));
}

// Tarefas da célula; o dia útil também recebe as dos dias de folga que o seguem.
// Na visão dia, o dia de hoje recebe ainda as ⏳ atrasadas e abertas, e cada
// tarefa aparece uma vez só (⏳ e 📅 no mesmo dia viram um item).
function tarefasDoDia(dia) {
    const celula = chaveDe(dia);
    const lista = (porDia[celula] || []).map((t) => ({ ...t, celula }));
    if (!ehFolga(dia)) {
        for (let x = somarDias(dia, 1); ehFolga(x); x = somarDias(x, 1)) {
            for (const t of (porDia[chaveDe(x)] || [])) lista.push({ ...t, celula, fimDeSemana: true });
        }
    }
    if (estado.visao !== 'dia') return ordenar(lista, celula);

    if (celula === chaveHoje) {
        for (const [chave, itens] of Object.entries(porDia)) {
            if (chave >= chaveHoje) continue;
            for (const t of itens) {
                const vencida = t.prazo && t.prazo < chaveHoje;
                if (t.tipo === 'scheduled' && !finalizada(t) && !vencida) {
                    lista.push({ ...t, celula, atrasada: true });
                }
            }
        }
    }
    const vistas = new Set();
    return ordenar(lista, celula).filter((t) => !vistas.has(t.line) && vistas.add(t.line));
}

const chaveItem = (t) => `${t.line}:${t.tipo}`;
// Cópia serializável para o drag & drop.
const paraArraste = (t) => JSON.stringify(t);

// --- Seleção múltipla -------------------------------------------------------
const semId = (s) => s.replace(/\s*🆔\s*[\w-]+/gu, '').trim();
const dadosEl = new WeakMap(); // elemento do DOM -> tarefa
let versaoScroll = 0; // sobe a cada rolagem; invalida retângulos medidos

// Índices sobre `porDia`: por chave de item e por linha do arquivo.
let itensPorChave = new Map();
let itensPorLinha = new Map();
function reindexar() {
    itensPorChave = new Map();
    itensPorLinha = new Map();
    for (const lista of Object.values(porDia)) {
        for (const t of lista) {
            itensPorChave.set(chaveItem(t), t);
            if (!itensPorLinha.has(t.line)) itensPorLinha.set(t.line, []);
            itensPorLinha.get(t.line).push(t);
        }
    }
}
reindexar();

// --- Atualização otimista ---------------------------------------------------
// O Dataview só reexecuta o bloco ~2,5 s depois de gravar o arquivo. Para a tela
// responder na hora, refletimos a mudança no estado local e redesenhamos já; a
// reexecução posterior chega ao mesmo resultado.
const clonarPorDia = () => Object.fromEntries(
    Object.entries(porDia).map(([k, lista]) => [k, lista.map((t) => ({ ...t }))]));

function aplicarLocal(mudados, novosIds) {
    for (const [line, { id }] of Object.entries(novosIds)) {
        for (const t of itensPorLinha.get(Number(line)) || []) { t.id = id; t.bruto = `${t.bruto} 🆔 ${id}`; }
    }
    const linhas = new Set();
    for (const m of mudados) {
        const emoji = EMOJI[m.tipo];
        const itens = itensPorLinha.get(m.line) || [];
        for (const t of itens) t.bruto = t.bruto.replace(`${emoji} ${m.chave}`, `${emoji} ${m.novaData}`);
        const orig = itens.find((t) => t.tipo === m.tipo);
        if (!orig) continue;
        const lista = porDia[orig.chave];
        const i = lista ? lista.indexOf(orig) : -1;
        if (i >= 0) lista.splice(i, 1);
        orig.chave = m.novaData;
        (porDia[m.novaData] ??= []).push(orig);
        linhas.add(m.line);
    }
    for (const line of linhas) {
        const itens = itensPorLinha.get(line);
        const ag = itens.find((t) => t.tipo === 'scheduled')?.chave;
        const pr = itens.find((t) => t.tipo === 'due')?.chave || null;
        const folga = ag && pr ? diferencaDias(ag, pr) : null;
        for (const t of itens) { t.folga = folga; t.prazo = pr; }
    }
}

// Descarta da seleção o que sumiu, fechou ou foi editado no arquivo.
for (const [k, bruto] of [...estado.selecao]) {
    const t = itensPorChave.get(k);
    if (!t || finalizada(t) || semId(t.bruto) !== bruto) estado.selecao.delete(k);
}

// Itens selecionados (cópias); o arrastado entra com o próprio objeto.
function loteDaSelecao(arrastado) {
    const lote = [];
    for (const k of estado.selecao.keys()) {
        if (k === chaveItem(arrastado)) { lote.push(arrastado); continue; }
        const base = itensPorChave.get(k);
        if (base) lote.push({ ...base });
    }
    return lote;
}

// Dias úteis entre duas chaves de dia útil (negativo se `ate` vem antes de `de`).
function uteisEntre(de, ate) {
    let d = deChave(de);
    const fim = deChave(ate);
    const dir = fim >= d ? 1 : -1;
    let n = 0;
    while ((dir > 0 ? d < fim : d > fim) && Math.abs(n) < 5000) { d = proximoDiaUtil(d, dir); n += dir; }
    return n;
}
// Anda `n` dias úteis a partir de uma chave de dia útil.
function deslocarUteis(chave, n) {
    let d = deChave(chave);
    const dir = n < 0 ? -1 : 1;
    for (let i = 0; i < Math.abs(n); i++) d = proximoDiaUtil(d, dir);
    return chaveDe(d);
}

// --- Edição do arquivo ------------------------------------------------------
// Corpo da linha sem o marcador "- [ ] ", para conferir se a linha ainda é a mesma.
const corpo = (linha) => linha.replace(/^\s*[-*+]\s+\[.\]\s*/, '').trim();
const apiTasks = () => app.plugins.plugins['obsidian-tasks-plugin']?.apiV1;

// Aplica `transformar` na linha, só se ela ainda tem o texto esperado.
async function editarLinha(path, line, bruto, transformar) {
    const arquivo = app.vault.getAbstractFileByPath(path);
    if (!arquivo) { avisar('⚠️ Arquivo da tarefa não encontrado.'); return; }
    let novo = null;
    await app.vault.process(arquivo, (conteudo) => {
        const linhas = conteudo.split('\n');
        if (linhas[line] === undefined || corpo(linhas[line]) !== bruto) return conteudo;
        linhas[line] = transformar(linhas[line]); // pode virar 2 linhas em tarefas recorrentes
        novo = linhas[line];
        return linhas.join('\n');
    });
    if (novo === null) avisar('⚠️ A tarefa mudou de lugar no arquivo. Nada foi alterado; aguarde o calendário atualizar.');
    return novo; // texto novo da linha, ou null se nada mudou
}

// Conclui/reabre pelo plugin Tasks (respeita recorrência e ✅).
async function alternarConclusao(path, line, bruto) {
    const api = apiTasks();
    if (!api?.executeToggleTaskDoneCommand) { avisar('⚠️ Plugin Tasks indisponível.'); return; }
    const novo = await editarLinha(path, line, bruto, (linha) => api.executeToggleTaskDoneCommand(linha, path));
    // Reflete já na tela (exceto recorrentes, que viram 2 linhas e deslocam as demais).
    const status = novo && !novo.includes('\n') ? novo.match(/^\s*[-*+]\s+\[(.)\]/)?.[1] : null;
    const itens = itensPorLinha.get(line);
    if (status && itens) {
        for (const t of itens) {
            t.concluida = status.toLowerCase() === 'x';
            t.cancelada = status === '-';
            t.bruto = corpo(novo);
            if (finalizada(t)) estado.selecao.delete(chaveItem(t));
        }
        render();
    }
}

// Abre o modal "Edit task" do plugin Tasks e grava o resultado na linha.
async function editarTarefa(path, line, bruto) {
    const api = apiTasks();
    if (!api?.editTaskLineModal) { avisar('⚠️ Plugin Tasks indisponível.'); return; }
    const arquivo = app.vault.getAbstractFileByPath(path);
    const original = arquivo && (await app.vault.read(arquivo)).split('\n')[line];
    if (!original || corpo(original) !== bruto) {
        avisar('⚠️ A tarefa mudou de lugar no arquivo; aguarde o calendário atualizar.');
        return;
    }
    const editada = await api.editTaskLineModal(original);
    if (!editada || editada === original) return; // cancelado ou sem mudança
    await editarLinha(path, line, bruto, () => editada);
}

async function abrirNaOrigem(e, path, line) {
    e.preventDefault();
    const arquivo = app.vault.getAbstractFileByPath(path);
    if (!arquivo) { avisar('⚠️ Arquivo da tarefa não encontrado.'); return; }
    const novaAba = e.ctrlKey || e.metaKey;
    // Se o arquivo já está aberto (mesmo pinado), só rola nele: getLeaf(false)
    // abriria uma nova aba quando a aba alvo está pinada.
    let aberta = null;
    if (!novaAba) {
        app.workspace.iterateAllLeaves((l) => {
            if (!aberta && l.view?.getViewType() === 'markdown' && l.view.file?.path === path) aberta = l;
        });
    }
    if (aberta) {
        await app.workspace.revealLeaf(aberta);
        app.workspace.setActiveLeaf(aberta, { focus: true });
        aberta.setEphemeralState({ line });
        return;
    }
    const leaf = app.workspace.getLeaf(novaAba ? 'tab' : false);
    await leaf.openFile(arquivo, { active: true, eState: { line } });
}

// Solta `arrastado` na célula `destino`. Se ele faz parte da seleção, todo o lote
// vai junto, mantendo o deslocamento relativo em dias úteis: o arrastado vai para
// `destino` e os demais andam o mesmo número de dias úteis.
// `posicionar(excluir)` devolve as chaves das tarefas abertas da célula (sem as
// excluídas) e o índice em que o bloco solto entra.
async function soltar(arrastado, destino, dia, posicionar) {
    const lote = estado.selecao.has(chaveItem(arrastado)) ? loteDaSelecao(arrastado) : [arrastado];
    const n = uteisEntre(arrastado.celula, destino);
    for (const t of lote) {
        const ehAncora = t === arrastado;
        t.origem = ehAncora ? t.celula : chaveDe(diaUtil(deChave(t.chave)));
        t.muda = ehAncora ? t.celula !== destino : n !== 0;
        t.novaData = ehAncora ? destino : (t.muda ? deslocarUteis(t.origem, n) : t.chave);
        t.celulaFinal = t.muda ? chaveDe(diaUtil(deChave(t.novaData))) : t.origem;
    }
    const mudados = lote.filter((t) => t.muda);

    const prazos = mudados.filter((t) => t.tipo === 'due');
    if (prazos.length && !confirm(prazos.length === 1
        ? `📅 é prazo fixo.\nMover "${prazos[0].texto}" de ${prazos[0].chave} para ${prazos[0].novaData}?`
        : `📅 ${prazos.length} prazos fixos serão movidos junto com a seleção.\nContinuar?`)) return;

    // Bloco que entra na célula de destino, na ordem em que aparece na tela.
    const ordemDom = new Map([...raiz.querySelectorAll('[data-item]')].map((el, i) => [el.dataset.item, i]));
    const posDom = (t) => ordemDom.get(chaveItem(t)) ?? 1e9;
    const bloco = lote.filter((t) => t.celulaFinal === destino).sort((a, b) => posDom(a) - posDom(b));
    const { chaves, indice } = posicionar(new Set(lote.map(chaveItem)));
    const chavesNaOrdem = [...chaves];
    chavesNaOrdem.splice(indice, 0, ...bloco.map(chaveItem));

    const porChave = new Map(tarefasDoDia(dia).map((t) => [chaveItem(t), t]));
    for (const t of lote) porChave.set(chaveItem(t), t);
    const itens = chavesNaOrdem.map((k) => porChave.get(k)).filter(Boolean);

    // Garante um 🆔 por linha (scheduled e due da mesma linha compartilham).
    const novosIds = {}; // line -> { id, item }
    for (const t of itens) {
        if (t.id) continue;
        novosIds[t.line] ??= { id: gerarId(), item: t };
        t.id = novosIds[t.line].id;
    }

    // Salva a ordem antes de editar o Projetos: a edição re-renderiza o bloco.
    ordemPorDia[destino] = [...new Set(itens.map((t) => t.id))];
    for (const t of mudados) {
        if (t.id && ordemPorDia[t.origem]) ordemPorDia[t.origem] = ordemPorDia[t.origem].filter((id) => id !== t.id);
    }
    const salvando = salvarOrdem(); // em paralelo com a edição do Projetos (a ordem já está em cache)

    // Datas mudaram: a seleção antiga não vale mais.
    if (mudados.length) estado.selecao.clear();

    const precisaEditar = mudados.length > 0 || Object.keys(novosIds).length > 0;
    if (!precisaEditar) { render(); await salvando; return; }

    const arquivo = app.vault.getAbstractFileByPath(SOURCE_PAGE);
    if (!arquivo) { avisar('⚠️ Arquivo das tarefas não encontrado.'); return; }

    // Atualização otimista: redesenha agora; desfaz se a edição for recusada.
    const copia = clonarPorDia();
    aplicarLocal(mudados, novosIds);
    render();

    let ok = true;
    const editando = app.vault.process(arquivo, (conteudo) => {
        const linhas = conteudo.split('\n');
        // Só edita se cada linha ainda contém a data esperada (evita editar a linha errada).
        const confere = (t) => linhas[t.line] && linhas[t.line].includes(`${EMOJI[t.tipo]} ${t.chave}`);
        for (const { item } of Object.values(novosIds)) if (!confere(item)) ok = false;
        for (const t of mudados) if (!confere(t)) ok = false;
        if (!ok) return conteudo;

        for (const [line, { id }] of Object.entries(novosIds)) {
            linhas[line] = `${linhas[line].trimEnd()} 🆔 ${id}`;
        }
        // Reordenar dentro do dia útil não muda a data de tarefas dos dias de folga,
        // nem reordenar ⏳ atrasadas dentro de hoje.
        for (const t of mudados) {
            const emoji = EMOJI[t.tipo];
            linhas[t.line] = linhas[t.line].replace(`${emoji} ${t.chave}`, `${emoji} ${t.novaData}`);
        }
        return linhas.join('\n');
    });
    await Promise.all([salvando, editando]);

    if (!ok) {
        porDia = copia;
        reindexar();
        render();
        avisar('⚠️ A tarefa mudou de lugar no arquivo. Nada foi alterado; aguarde o calendário atualizar.');
    } else if (mudados.length === 1) avisar(`${EMOJI[mudados[0].tipo]} ${mudados[0].chave} → ${mudados[0].novaData}`);
    else if (mudados.length > 1) avisar(`${mudados.length} tarefas movidas`);
}

// --- Renderização -----------------------------------------------------------
const raiz = dv.container.createDiv({ cls: 'cal-raiz' });
let infoSel = null; // contador e botão "Limpar" do cabeçalho (criados em render)
let btnLimpar = null;

// Atualiza só o destaque e o contador da seleção, sem redesenhar o calendário.
function atualizarSelecao() {
    marcar();
    if (!infoSel) return;
    const n = estado.selecao.size;
    infoSel.setText(`${n} selecionada(s)`);
    infoSel.hidden = btnLimpar.hidden = n === 0;
}

function botao(pai, texto, aoClicar, ativo = false) {
    const b = pai.createEl('button', { text: texto });
    if (ativo) b.addClass('cal-ativo');
    b.onclick = aoClicar;
    return b;
}

function navegar(direcao) {
    const ref = deChave(estado.ref);
    if (estado.visao === 'mes') estado.ref = chaveDe(new Date(ref.getFullYear(), ref.getMonth() + direcao, 1));
    else if (estado.visao === 'semana') estado.ref = chaveDe(somarDias(inicioSemana(ref), 7 * direcao));
    else estado.ref = chaveDe(proximoDiaUtil(diaUtil(ref), direcao));
    render();
}

// Segurar uma tarefa sobre ◀/▶ durante o arraste troca de mês/semana/dia (a cada 600 ms).
let timerNavegacao = null;
function alvoNavegacao(btn, direcao) {
    btn.addEventListener('dragover', (e) => {
        if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
        e.preventDefault();
        btn.addClass('cal-drop-alvo');
        if (timerNavegacao) return;
        timerNavegacao = setTimeout(() => { timerNavegacao = null; navegar(direcao); }, 600);
    });
    const cancelar = () => {
        btn.removeClass('cal-drop-alvo');
        clearTimeout(timerNavegacao);
        timerNavegacao = null;
    };
    btn.addEventListener('dragleave', cancelar);
    btn.addEventListener('drop', (e) => { e.preventDefault(); cancelar(); });
}

function titulo(ref, dias) {
    const mesCurto = (d) => nomesMeses[d.getMonth()].slice(0, 3);
    if (estado.visao === 'mes') return `${nomesMeses[ref.getMonth()]} ${ref.getFullYear()}`;
    if (estado.visao === 'dia') {
        const d = dias[0];
        return `${nomesDias[d.getDay()]}, ${d.getDate()} ${mesCurto(d)} ${d.getFullYear()}`;
    }
    const ini = dias[0], fim = dias[dias.length - 1];
    return ini.getMonth() === fim.getMonth()
        ? `${ini.getDate()} – ${fim.getDate()} ${mesCurto(fim)} ${fim.getFullYear()}`
        : `${ini.getDate()} ${mesCurto(ini)} – ${fim.getDate()} ${mesCurto(fim)} ${fim.getFullYear()}`;
}

function diasVisiveis(ref) {
    if (estado.visao === 'dia') return [diaUtil(ref)];
    if (estado.visao === 'semana') {
        const ini = inicioSemana(ref);
        return Array.from({ length: 7 }, (_, i) => somarDias(ini, i)).filter((d) => !ehFolga(d));
    }
    // Mês: semanas completas (só dias úteis), incluindo dias do mês anterior/seguinte.
    const primeiro = new Date(ref.getFullYear(), ref.getMonth(), 1);
    const ultimo = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
    const dias = [];
    for (let d = inicioSemana(primeiro); d <= ultimo; d = somarDias(d, 1)) {
        if (!ehFolga(d)) dias.push(d);
    }
    return dias;
}

// Liga os eventos comuns a chips e itens da visão dia.
function ligarEventos(el, t) {
    el.addEventListener('dblclick', (e) => abrirNaOrigem(e, t.path, t.line));
    el.addEventListener('contextmenu', (e) => { e.preventDefault(); editarTarefa(t.path, t.line, t.bruto); });

    // Tarefas fechadas não são arrastáveis nem selecionáveis.
    if (finalizada(t)) return;
    el.dataset.item = chaveItem(t);
    dadosEl.set(el, t);
    el.draggable = true;
    // Shift/Ctrl+clique alterna a tarefa na seleção.
    el.addEventListener('click', (e) => {
        if (!(e.shiftKey || e.ctrlKey || e.metaKey)) return;
        e.preventDefault();
        e.stopPropagation();
        const k = chaveItem(t);
        if (estado.selecao.has(k)) estado.selecao.delete(k);
        else estado.selecao.set(k, semId(t.bruto));
        atualizarSelecao();
    });
    el.addEventListener('dragstart', (e) => {
        if (e.altKey) { e.preventDefault(); return; } // Alt é a caixa de seleção
        e.dataTransfer.setData(DRAG_TYPE, paraArraste(t));
        e.dataTransfer.effectAllowed = 'move';
        const marcados = estado.selecao.has(chaveItem(t)) ? raiz.querySelectorAll('.cal-selecionado') : [el];
        marcados.forEach((m) => m.addClass('cal-arrastando'));
    });
    el.addEventListener('dragend', () => {
        raiz.querySelectorAll('.cal-arrastando').forEach((m) => m.removeClass('cal-arrastando'));
        // Arraste cancelado (Esc / fora da página) não dispara dragleave: limpa marcas e medidas.
        raiz.querySelectorAll('.cal-drop-alvo, .cal-drop-antes, .cal-drop-depois')
            .forEach((m) => m.classList.remove('cal-drop-alvo', 'cal-drop-antes', 'cal-drop-depois'));
        versaoScroll++;
    });
}

function renderChip(celula, t) {
    const chip = celula.createDiv({ cls: `cal-task cal-task-${t.tipo}` });
    if (t.concluida) chip.addClass('cal-task-done');
    if (t.cancelada) chip.addClass('cal-task-cancel');

    const atrasada = t.folga !== null && t.folga < 0;
    if (atrasada && !finalizada(t)) chip.addClass('cal-task-atrasada');
    // Agendada no próprio dia do prazo: mesma cor do prazo.
    if (t.folga === 0) chip.addClass('cal-task-no-prazo');

    const texto = `${t.prioridade ? t.prioridade + ' ' : ''}${t.texto}`;
    chip.createSpan({ cls: 'cal-task-texto', text: texto });
    if (t.folga !== null) {
        chip.createSpan({
            cls: 'cal-task-folga',
            text: t.folga > 0 ? `+${t.folga}` : String(t.folga),
        });
    }
    if (estado.visao === 'semana' && t.pai) chip.createSpan({ cls: 'cal-task-pai', text: t.pai });

    const detalhes = [
        t.pai ? `↳ ${t.pai}` : null,
        `${EMOJI[t.tipo]} ${t.chave}${t.fimDeSemana ? ' (dia de folga)' : ''}`,
        t.folga !== null ? `Folga até o prazo: ${t.folga} dia(s)` : null,
        '(duplo clique abre na origem; Ctrl+duplo clique em nova aba; botão direito edita)',
    ].filter(Boolean).join('\n');
    chip.setAttr('title', `${texto}\n${detalhes}`);

    ligarEventos(chip, t);
}

// Árvore de subtarefas (como o "show tree" do Tasks): subtarefas com checkbox,
// bullets de contexto como texto. Não são arrastáveis; a ordem é a do arquivo.
function renderFilhos(pai, filhos) {
    if (!filhos || !filhos.length) return;
    const ul = pai.createEl('ul', { cls: 'dia-filhos' });
    for (const f of filhos) {
        const li = ul.createEl('li', { cls: 'dia-filho' });
        const bruto = f.text.split('\n')[0].trim();
        if (f.task) {
            const fechada = f.completed || f.status === 'x' || f.status === '-';
            const check = li.createEl('input', { type: 'checkbox', cls: 'task-list-item-checkbox' });
            check.checked = fechada;
            check.setAttr('aria-label', `Concluir: ${limpar(f.text)}`);
            check.addEventListener('click', (e) => { e.stopPropagation(); alternarConclusao(f.path, f.line, bruto); });
            if (fechada) li.addClass('dia-filho-fechado');
        } else {
            li.addClass('dia-filho-contexto');
        }
        li.createSpan({ text: limpar(f.text) });
        li.addEventListener('dblclick', (e) => { e.stopPropagation(); abrirNaOrigem(e, f.path, f.line); });
        li.addEventListener('contextmenu', (e) => {
            e.stopPropagation();
            if (f.task) { e.preventDefault(); editarTarefa(f.path, f.line, bruto); }
        });
        renderFilhos(li, f.children);
    }
}

// Item da visão dia: checkbox, texto, tarefa pai/datas e árvore de subtarefas.
function renderItemDia(lista, t) {
    const li = lista.createDiv({ cls: 'dia-item' });
    if (finalizada(t)) li.addClass('dia-item-fechado');

    const check = li.createEl('input', { type: 'checkbox', cls: 'task-list-item-checkbox' });
    check.checked = !!finalizada(t);
    check.setAttr('aria-label', `Concluir: ${t.texto}`);
    check.addEventListener('click', (e) => { e.stopPropagation(); alternarConclusao(t.path, t.line, t.bruto); });

    const conteudo = li.createDiv({ cls: 'dia-conteudo' });
    conteudo.createSpan({ cls: 'dia-texto', text: `${t.prioridade ? t.prioridade + ' ' : ''}${t.texto}` });

    const meta = [];
    if (t.pai) meta.push(t.pai);
    if (t.atrasada || t.fimDeSemana) meta.push(`⏳ ${t.chave}`);
    if (t.prazo) meta.push(t.prazo === t.celula ? '📅 no dia' : `📅 ${t.prazo}`);
    if (meta.length) conteudo.createDiv({ cls: 'dia-meta', text: meta.join(' · ') });
    renderFilhos(conteudo, tarefaPorLinha.get(t.line)?.children);

    li.setAttr('title', 'Arraste para reordenar · duplo clique abre na origem · botão direito edita');
    ligarEventos(li, t);
}

// Torna o container um alvo de drop: a posição vertical do cursor define onde a tarefa entra.
function tornarAlvo(container, chave, dia) {
    const abertos = () => [...container.querySelectorAll(':scope > [data-item]:not(.cal-arrastando)')];
    // Posições medidas uma vez por passagem do cursor (o layout não muda durante
    // o arraste); recalculadas se houve rolagem.
    let medidas = null, versao = -1;
    const itens = () => {
        if (!medidas || versao !== versaoScroll) {
            medidas = abertos().map((el) => { const r = el.getBoundingClientRect(); return { el, meio: r.top + r.height / 2 }; });
            versao = versaoScroll;
        }
        return medidas;
    };
    const indiceDrop = (lista, y) => {
        const i = lista.findIndex((c) => y < c.meio);
        return i < 0 ? lista.length : i;
    };
    // Só uma marca de posição por vez; só mexe no DOM quando ela muda.
    let marca = null;
    const limparMarcas = () => { if (marca) { marca.el.classList.remove(marca.cls); marca = null; } };
    const marcarDrop = (el, cls) => {
        if (marca && marca.el === el && marca.cls === cls && el.classList.contains(cls)) return;
        limparMarcas();
        if (el) { el.classList.add(cls); marca = { el, cls }; }
    };
    const sair = () => {
        container.classList.remove('cal-drop-alvo');
        limparMarcas();
        medidas = null;
    };

    container.addEventListener('dragover', (e) => {
        if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        container.classList.add('cal-drop-alvo');
        const lista = itens();
        const i = indiceDrop(lista, e.clientY);
        if (i < lista.length) marcarDrop(lista[i].el, 'cal-drop-antes');
        else if (lista.length) marcarDrop(lista[lista.length - 1].el, 'cal-drop-depois');
        else marcarDrop(null);
    });
    container.addEventListener('dragleave', (e) => {
        if (container.contains(e.relatedTarget)) return;
        sair();
    });
    const posicionar = (lista, y, excluir) => {
        const restantes = lista.filter((c) => !excluir.has(c.el.dataset.item));
        return { chaves: restantes.map((c) => c.el.dataset.item), indice: indiceDrop(restantes, y) };
    };
    container.addEventListener('drop', async (e) => {
        const lista = itens();
        sair();
        const dados = e.dataTransfer.getData(DRAG_TYPE);
        if (!dados) return;
        e.preventDefault();
        const arrastado = JSON.parse(dados);
        const y = e.clientY;
        await soltar(arrastado, chave, dia, (excluir) => posicionar(lista, y, excluir));
    });
}

function renderCelula(grid, dia, mesRef) {
    const celula = grid.createDiv({ cls: 'cal-cel' });
    if (estado.visao === 'mes' && dia.getMonth() !== mesRef) celula.addClass('cal-cel-fora');

    const chave = chaveDe(dia);
    if (chave === chaveHoje) celula.addClass('cal-cel-hoje');

    const rotuloDia = estado.visao === 'semana'
        ? `${siglasDias[dia.getDay()]} ${dia.getDate()}`
        : String(dia.getDate());
    const num = celula.createDiv({ cls: 'cal-num', text: rotuloDia });
    // Clique no número do dia abre a visão dia.
    num.addEventListener('click', () => { estado.visao = 'dia'; estado.ref = chave; render(); });

    for (const t of tarefasDoDia(dia)) renderChip(celula, t);
    tornarAlvo(celula, chave, dia);
}

function renderDia(dia) {
    const chave = chaveDe(dia);
    const lista = raiz.createDiv({ cls: 'dia-lista' });
    if (chave === chaveHoje) lista.addClass('dia-lista-hoje');

    const tarefas = tarefasDoDia(dia);
    if (!tarefas.length) lista.createDiv({ cls: 'dia-vazio', text: 'Nada para este dia 🎉' });
    for (const t of tarefas) renderItemDia(lista, t);
    tornarAlvo(lista, chave, dia);
}

function render() {
    raiz.empty();
    const ref = deChave(estado.ref);
    const dias = diasVisiveis(ref);

    // Barra superior.
    const header = raiz.createDiv({ cls: 'cal-header' });
    alvoNavegacao(botao(header, '◀', () => navegar(-1)), -1);
    header.createEl('span', { text: titulo(ref, dias), cls: 'cal-titulo' });
    alvoNavegacao(botao(header, '▶', () => navegar(1)), 1);
    botao(header, 'Hoje', () => { estado.ref = chaveHoje; render(); });
    infoSel = header.createSpan({ cls: 'cal-sel-info' });
    btnLimpar = botao(header, '✕ Limpar', () => { estado.selecao.clear(); atualizarSelecao(); });

    const grupoVisao = header.createDiv({ cls: 'cal-toggle' });
    for (const [visao, rotulo] of [['mes', 'Mês'], ['semana', 'Semana'], ['dia', 'Dia']]) {
        botao(grupoVisao, rotulo, () => { estado.visao = visao; render(); }, estado.visao === visao);
    }

    if (estado.visao === 'dia') { renderDia(dias[0]); atualizarSelecao(); return; }

    // Grade.
    const grid = raiz.createDiv({ cls: 'cal-grid' });
    grid.style.gridTemplateColumns = `repeat(${colunas.length}, minmax(0, 1fr))`;
    if (estado.visao === 'semana') grid.addClass('cal-grid-semana');
    else for (const i of colunas) grid.createDiv({ cls: 'cal-dow', text: siglasDias[i] });

    for (const dia of dias) renderCelula(grid, dia, ref.getMonth());
    atualizarSelecao();
}

// Destaca as tarefas do conjunto de chaves (por padrão, a seleção atual).
function marcar(conjunto = estado.selecao) {
    raiz.querySelectorAll('[data-item]').forEach((el) => {
        el.classList.toggle('cal-selecionado', conjunto.has(el.dataset.item));
    });
}

// Caixa de seleção: arrastar no fundo (ou Alt+arrastar sobre uma tarefa).
// Shift/Ctrl soma à seleção atual; sem modificador, substitui.
raiz.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    if (e.target.closest('button, input, .cal-header, .cal-num, .dia-filhos')) return;
    if (!e.altKey && e.target.closest('.cal-task, .dia-item')) return;
    e.preventDefault();
    iniciarCaixa(e);
});

function iniciarCaixa(ini) {
    const aditivo = ini.shiftKey || ini.ctrlKey || ini.metaKey;
    const base = aditivo ? new Set(estado.selecao.keys()) : new Set();
    let caixa = null;
    let tocados = new Map(); // chaveItem -> tarefa
    let ultimo = null;       // último mousemove
    let quadro = 0;          // requestAnimationFrame pendente
    let alvos = null, versao = -1; // retângulos medidos uma vez (e de novo se rolar)
    let destacados = new Set(estado.selecao.keys()); // o que o DOM mostra agora

    const medir = () => {
        if (alvos && versao === versaoScroll) return;
        alvos = [...raiz.querySelectorAll('[data-item]')]
            .map((el) => ({ el, k: el.dataset.item, b: el.getBoundingClientRect() }));
        versao = versaoScroll;
    };
    const atualizar = () => {
        quadro = 0;
        if (!ultimo) return;
        if (!caixa) {
            if (Math.hypot(ultimo.clientX - ini.clientX, ultimo.clientY - ini.clientY) < 4) return;
            caixa = document.body.createDiv({ cls: 'cal-caixa' });
        }
        const esq = Math.min(ini.clientX, ultimo.clientX), dir = Math.max(ini.clientX, ultimo.clientX);
        const topo = Math.min(ini.clientY, ultimo.clientY), baixo = Math.max(ini.clientY, ultimo.clientY);
        Object.assign(caixa.style, {
            left: `${esq}px`, top: `${topo}px`, width: `${dir - esq}px`, height: `${baixo - topo}px`,
        });
        medir();
        tocados = new Map();
        const novos = new Set(base);
        for (const { el, k, b } of alvos) {
            if (b.left < dir && b.right > esq && b.top < baixo && b.bottom > topo) {
                tocados.set(k, dadosEl.get(el));
                novos.add(k);
            }
        }
        // Só mexe nos elementos cujo destaque mudou.
        for (const { el, k } of alvos) {
            const quer = novos.has(k);
            if (quer !== destacados.has(k)) el.classList.toggle('cal-selecionado', quer);
        }
        destacados = novos;
    };
    const mover = (e) => {
        ultimo = e;
        if (!quadro) quadro = requestAnimationFrame(atualizar);
    };
    const fim = () => {
        document.removeEventListener('mousemove', mover, true);
        document.removeEventListener('mouseup', fim, true);
        if (quadro) { cancelAnimationFrame(quadro); atualizar(); }
        caixa?.remove();
        if (!aditivo) estado.selecao.clear();
        for (const [k, t] of tocados) if (t) estado.selecao.set(k, semId(t.bruto));
        atualizarSelecao();
    };
    document.addEventListener('mousemove', mover, true);
    document.addEventListener('mouseup', fim, true);
}

// Esc limpa a seleção. O bloco é reexecutado a cada mudança do Projetos, então
// o listener anterior é removido para não acumular.
const ESC = '__calSelecaoEsc';
window[ESC]?.();
{
    const aoTeclar = (e) => {
        if (e.key !== 'Escape' || !estado.selecao.size || !raiz.isConnected) return;
        estado.selecao.clear();
        atualizarSelecao();
    };
    // Qualquer rolagem invalida as medidas em cache (caixa de seleção e arraste).
    const aoRolar = () => { versaoScroll++; };
    document.addEventListener('keydown', aoTeclar);
    document.addEventListener('scroll', aoRolar, { capture: true, passive: true });
    window[ESC] = () => {
        document.removeEventListener('keydown', aoTeclar);
        document.removeEventListener('scroll', aoRolar, true);
    };
}

render();
```

# ⚠️ Atrasadas
```tasks
path includes Projetos
not done
due before today
hide toolbar
short mode
show tree
hide task count
```
# 🗓️ Sem Data
```tasks
path includes Projetos
not done
(no due date) AND (no scheduled date)
short mode
hide toolbar
sort by priority
show tree
```
