// Fina de propósito: envia o estado do navegador e executa comandos. As decisões ficam no serviço.
const SERVICO = "ws://127.0.0.1:47291";
const ESPERA_INICIO_MS = 15000; // a restauração de sessão não pode parecer "abas fechadas"

let ws = null;
let aplicando = 0;
let temporizador = null;

chrome.runtime.onStartup.addListener(() =>
  chrome.storage.session.set({ prontoEm: Date.now() + ESPERA_INICIO_MS }));

async function pronto() {
  const { prontoEm = 0 } = await chrome.storage.session.get("prontoEm");
  return Date.now() >= prontoEm;
}

function conectar() {
  if (ws && ws.readyState <= WebSocket.OPEN) return;
  ws = new WebSocket(SERVICO);
  ws.onopen = () => agendar(0);
  ws.onclose = () => { ws = null; };
  ws.onerror = () => {};
  ws.onmessage = async (e) => {
    const m = JSON.parse(e.data);
    if (m.tipo === "pedirEstado") return agendar(0);
    if (m.tipo !== "aplicar") return;
    aplicando++;
    let r;
    try { r = await aplicar(m.comando); } catch (x) { r = { erro: String(x), falhas: [] }; }
    aplicando--;
    enviar({ tipo: "aplicado", id: m.id, ...r });
    agendar(500);
  };
}

function enviar(m) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
}

function agendar(ms = 1500) {
  clearTimeout(temporizador);
  temporizador = setTimeout(enviarEstado, ms);
}

async function enviarEstado() {
  if (aplicando) return agendar();
  if (!(await pronto())) return agendar(5000);
  const [tabs, groups, devices] = await Promise.all([
    chrome.tabs.query({ windowType: "normal" }),
    chrome.tabGroups.query({}),
    chrome.sessions.getDevices().catch(() => []),
  ]);
  if (!tabs.length) return; // navegador encerrando: não confundir com "fechou tudo"
  enviar({
    tipo: "estado",
    tabs: tabs.map((t) => ({
      id: t.id, url: t.pendingUrl || t.url || "", titulo: t.title || "", grupo: t.groupId,
      janela: t.windowId, indice: t.index, fixada: t.pinned,
    })),
    groups: groups.map((g) => ({ id: g.id, titulo: g.title || "", cor: g.color, janela: g.windowId })),
    dispositivos: devices.map((d) => ({
      nome: d.deviceName,
      tabs: d.sessions.flatMap((s) => s.window?.tabs ?? (s.tab ? [s.tab] : []))
        .map((t) => ({ url: t.url, titulo: t.title || "" })),
    })),
  });
}

async function janelaAlvo() {
  const j = await chrome.windows.getLastFocused({ windowTypes: ["normal"] }).catch(() => null);
  if (j) return j.id;
  return (await chrome.windows.create({ focused: false })).id;
}

async function aplicar({ grupos = [], soltas = { soltar: [], criar: [] }, fechar = [] }) {
  const falhas = [];
  const criar = async (url, janela) => {
    try { return (await chrome.tabs.create({ url, active: false, windowId: janela })).id; }
    catch { falhas.push(url); return null; }
  };

  for (const g of grupos) {
    const janela = g.groupId != null ? (await chrome.tabGroups.get(g.groupId)).windowId : await janelaAlvo();
    const ids = [];
    for (const it of g.itens) {
      const id = it.tabId ?? await criar(it.url, janela);
      if (id != null) ids.push(id);
    }
    if (!ids.length) continue;
    const gid = await chrome.tabs.group(g.groupId != null
      ? { tabIds: ids, groupId: g.groupId }
      : { tabIds: ids, createProperties: { windowId: janela } });
    await chrome.tabGroups.update(gid, { title: g.titulo, ...(g.cor ? { color: g.cor } : {}) });
    const atuais = (await chrome.tabs.query({ groupId: gid })).sort((a, b) => a.index - b.index);
    const inicio = atuais[0].index;
    for (let i = 0; i < ids.length; i++) await chrome.tabs.move(ids[i], { index: inicio + i });
  }

  if (soltas.soltar.length) await chrome.tabs.ungroup(soltas.soltar);
  if (soltas.criar.length) {
    const janela = await janelaAlvo();
    for (const url of soltas.criar) await criar(url, janela);
  }

  if (fechar.length) {
    // Fechar a última aba de uma janela encerraria o navegador.
    const alvo = new Set(fechar);
    const todas = await chrome.tabs.query({});
    for (const janela of new Set(todas.filter((t) => alvo.has(t.id)).map((t) => t.windowId))) {
      if (todas.filter((t) => t.windowId === janela).every((t) => alvo.has(t.id)))
        await chrome.tabs.create({ windowId: janela, active: true });
    }
    await chrome.tabs.remove(fechar);
  }
  return { falhas };
}

// Link aberto de fora (ex.: Obsidian) cuja URL já está aberta: vai até a aba em vez de duplicar.
chrome.tabs.onCreated.addListener(async (nova) => {
  if (aplicando || !nova.active || !nova.pendingUrl || !(await pronto())) return;
  const iguais = (await chrome.tabs.query({})).filter((t) =>
    t.id !== nova.id && (t.url === nova.pendingUrl || t.pendingUrl === nova.pendingUrl));
  const alvo = iguais.find((t) => t.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) ?? iguais[0];
  if (!alvo) return;
  if (alvo.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE)
    await chrome.tabGroups.update(alvo.groupId, { collapsed: false });
  await chrome.tabs.update(alvo.id, { active: true });
  await chrome.windows.update(alvo.windowId, { focused: true });
  await chrome.tabs.remove(nova.id);
});

const mudou = () => agendar();
chrome.tabs.onCreated.addListener(mudou);
chrome.tabs.onRemoved.addListener((_, info) => { if (!info.isWindowClosing) agendar(); });
chrome.tabs.onUpdated.addListener((_, m) => {
  if (m.url || m.title || m.pinned !== undefined || m.groupId !== undefined) agendar();
});
chrome.tabs.onMoved.addListener(mudou);
chrome.tabs.onAttached.addListener(mudou);
chrome.tabs.onDetached.addListener(mudou);
chrome.tabGroups.onCreated.addListener(mudou);
chrome.tabGroups.onUpdated.addListener(mudou);
chrome.tabGroups.onRemoved.addListener(mudou);
chrome.tabGroups.onMoved.addListener(mudou);

// Reconecta se o serviço caiu e cobre o que não gera evento (Sync do celular).
chrome.alarms.create("batida", { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener(() => { conectar(); agendar(0); });
setInterval(() => enviar({ tipo: "ping" }), 20000); // mantém o service worker vivo
conectar();
