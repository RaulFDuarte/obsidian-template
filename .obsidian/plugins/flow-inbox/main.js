// Flow Inbox: mostra a Caixa de Entrada como painel. O arquivo markdown continua sendo
// a fonte da verdade (o agente lê e escreve nele); a view só desenha campos de texto e
// checkboxes sobre as linhas dele, mesmo sem entrar no modo edição.
const { Plugin, ItemView, MarkdownRenderChild, MarkdownRenderer, Notice, parseYaml, setIcon } = require('obsidian');
const { spawn } = require('child_process');
const path = require('path');

const VIEW = 'flow-caixa';
const CAIXA = 'Prática/Caixa de Entrada.md';
const SCRIPT = '.agents/scripts/flow-skill.sh';
const SKILL = 'processar-inbox';
const MARCA_A = '<!--flow-status-->';
const MARCA_B = '<!--/flow-status-->';
const SECOES = ['## 🗂️ Para categorizar'];
const ROTULOS = {
	idle: '▶ Enviar ao agente',
	perguntas: '▶ Enviar respostas ao agente',
	'decisao-final': '✅ Aplicar triagem',
};

// --- Parsing (puro) ---------------------------------------------------------

function dividir(texto) {
	const m = texto.match(/^---\n([\s\S]*?)\n---\n/);
	return { prefixo: m ? m[0] : '', fm: m ? m[1] : '', corpo: m ? texto.slice(m[0].length) : texto };
}

// Quebra o corpo em partes: card de status, seções de captura, linhas interativas
// (checkbox e ✏️) e trechos de markdown comum. `linha` é o índice no corpo.
function segmentar(linhas) {
	const segs = [];
	let buf = [];
	let cerca = false;
	const flush = () => {
		if (buf.some((l) => l.trim())) segs.push({ tipo: 'md', texto: buf.join('\n') });
		buf = [];
	};
	for (let i = 0; i < linhas.length; i++) {
		const l = linhas[i];
		if (l.trim() === MARCA_A) {
			flush();
			let j = i + 1;
			while (j < linhas.length && linhas[j].trim() !== MARCA_B) j++;
			segs.push({ tipo: 'status', texto: linhas.slice(i + 1, j).join('\n') });
			i = j;
			continue;
		}
		const secao = !cerca && SECOES.find((t) => l.trimEnd() === t);
		if (secao) {
			flush();
			let j = i + 1;
			while (j < linhas.length && !/^## /.test(linhas[j])) j++;
			segs.push({ tipo: 'captura', titulo: secao, conteudo: linhas.slice(i + 1, j).join('\n').replace(/^\n+|\s+$/g, '') });
			i = j - 1;
			continue;
		}
		if (/^```/.test(l)) cerca = !cerca;
		if (!cerca && !/^```/.test(l)) {
			const c = l.match(/^(\s*)- \[( |x)\] (.*)$/);
			if (c) {
				flush();
				segs.push({ tipo: 'check', linha: i, marcada: c[2] === 'x', texto: c[3], bruta: l });
				continue;
			}
			const f = l.match(/^(✏️[^:\n]*:) ?(.*)$/u);
			if (f) {
				flush();
				segs.push({ tipo: 'campo', linha: i, rotulo: f[1], valor: f[2], bruta: l });
				continue;
			}
		}
		buf.push(l);
	}
	flush();
	return segs;
}

// --- View -------------------------------------------------------------------

// Lógica de desenho e escrita compartilhada pelo painel (aba) e pelo bloco embutido (Projetos).
// O host fornece: app, plugin, caminho, contentEl, registerEvent e os campos de estado.
const painel = {
	arquivo() { return this.app.vault.getFileByPath(this.caminho); },

	// Não derruba o campo em que o usuário está digitando.
	redesenhar() {
		const ativo = document.activeElement;
		if (ativo && this.contentEl.contains(ativo) && /^(TEXTAREA|INPUT)$/.test(ativo.tagName)) {
			this.pendente = true;
			return;
		}
		clearTimeout(this.timer);
		this.timer = setTimeout(() => this.render(), 120);
	},

	// Aplica `fn` às linhas do corpo, sobre o conteúdo mais recente do arquivo.
	editar(fn) {
		this.fila = this.fila.then(async () => {
			const f = this.arquivo();
			if (!f) return;
			let ok = true;
			this.ignorarAte = Date.now() + 800;
			await this.app.vault.process(f, (txt) => {
				const { prefixo, corpo } = dividir(txt);
				const linhas = corpo.split('\n');
				if (fn(linhas) === false) { ok = false; return txt; }
				return prefixo + linhas.join('\n');
			});
			if (!ok) {
				new Notice('⚠️ A Caixa mudou enquanto você editava; atualizei a tela. Refaça a última edição.');
				this.render();
			}
		}).catch((e) => new Notice(`⚠️ Flow: ${e.message}`));
		return this.fila;
	},

	editarFrontmatter(fn) {
		this.fila = this.fila.then(async () => {
			const f = this.arquivo();
			if (!f) return;
			this.ignorarAte = Date.now() + 800;
			await this.app.fileManager.processFrontMatter(f, fn);
		}).catch((e) => new Notice(`⚠️ Flow: ${e.message}`));
		return this.fila;
	},

	async inline(el, texto) {
		const tmp = createDiv();
		await MarkdownRenderer.render(this.app, texto, tmp, this.caminho, this);
		const origem = tmp.querySelector('p') || tmp;
		while (origem.firstChild) el.appendChild(origem.firstChild);
	},

	botao(pai, fase) {
		const rodando = this.plugin.rodando;
		const b = pai.createEl('button', { cls: 'flow-botao mod-cta', text: rodando ? '⏳ Processando…' : (ROTULOS[fase] || ROTULOS.idle) });
		b.disabled = rodando;
		b.onclick = () => this.plugin.enviar(this);
		return b;
	},

	campoTexto(pai, valor, aoSalvar, { placeholder = '', linhas = 1, bullets = false } = {}) {
		const ta = pai.createEl('textarea', { cls: 'flow-texto', attr: { rows: String(linhas), placeholder } });
		ta.value = valor;
		const ajustar = () => { ta.style.height = 'auto'; ta.style.height = `${ta.scrollHeight + 2}px`; };
		let sujo = false;
		let timer;
		const salvar = async () => { clearTimeout(timer); if (!sujo) return; sujo = false; await aoSalvar(ta.value); };
		ta.addEventListener('input', () => { sujo = true; ajustar(); clearTimeout(timer); timer = setTimeout(salvar, 700); });
		ta.addEventListener('blur', async () => {
			await salvar();
			if (this.pendente) { this.pendente = false; this.render(); }
		});
		if (bullets) {
			// Enter continua a lista; Enter numa linha "- " vazia encerra o bullet.
			ta.addEventListener('keydown', (e) => {
				if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
				const ini = ta.selectionStart;
				const inicioLinha = ta.value.lastIndexOf('\n', ini - 1) + 1;
				const linha = ta.value.slice(inicioLinha, ini);
				const m = linha.match(/^(\s*)- (.*)$/);
				if (!m) return;
				e.preventDefault();
				if (!m[2].trim()) {
					ta.setRangeText('', inicioLinha, ini, 'end');
				} else {
					ta.setRangeText(`\n${m[1]}- `, ini, ini, 'end');
				}
				ta.dispatchEvent(new Event('input'));
			});
		}
		setTimeout(ajustar, 0);
		return ta;
	},

	// Um botão de lápis fixo na margem esquerda de cada linha não vazia: abre o "Edit Task"
	// do plugin Tasks e a captura vira `- [ ] ...`.
	botaoTarefa(ta) {
		const api = this.app.plugins.plugins['obsidian-tasks-plugin']?.apiV1;
		if (!api) return;
		const pai = ta.parentElement;
		const botoes = [];

		// Espelho invisível do textarea: mede topo e altura de cada linha lógica (com quebra visual).
		const medir = () => {
			const cs = getComputedStyle(ta);
			const esp = pai.createDiv({ cls: 'flow-espelho' });
			for (const p of ['font', 'lineHeight', 'letterSpacing', 'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight', 'borderTopWidth', 'borderLeftWidth', 'boxSizing'])
				esp.style[p] = cs[p];
			esp.style.width = `${ta.offsetWidth}px`;
			const caixas = ta.value.split('\n').map((t) => esp.createDiv({ text: t || '\u200b' }));
			const r = caixas.map((d) => ({ topo: d.offsetTop, alt: d.offsetHeight }));
			esp.remove();
			return r;
		};
		const reposicionar = () => {
			const L = ta.value.split('\n');
			const m = ta.offsetWidth ? medir() : [];
			const lh = parseFloat(getComputedStyle(ta).lineHeight) || 20;
			L.forEach((l, i) => {
				if (!l.trim() || !m[i]) { botoes[i]?.remove(); botoes[i] = null; return; }
				if (!botoes[i]) botoes[i] = this.criarBotaoLinha(pai, ta, i, api);
				const b = botoes[i];
				b.style.top = `${ta.offsetTop + m[i].topo + Math.max(0, (lh - 24) / 2)}px`;
			});
			botoes.splice(L.length).forEach((b) => b?.remove());
		};
		ta.addEventListener('input', reposicionar);
		new ResizeObserver(reposicionar).observe(ta);
		setTimeout(reposicionar, 0);
	},

	criarBotaoLinha(pai, ta, i, api) {
		const b = pai.createEl('button', { cls: 'flow-editar-tarefa', attr: { 'aria-label': 'Editar tarefa', title: 'Editar tarefa' } });
		setIcon(b, 'pencil');
		b.onmousedown = (e) => e.preventDefault(); // não tira o foco/cursor do campo
		b.onclick = async () => {
			const L = ta.value.split('\n');
			const ini = L.slice(0, i).reduce((n, l) => n + l.length + 1, 0);
			const fim = ini + (L[i] ?? '').length;
			const m = (L[i] ?? '').match(/^(\s*)(?:- )?(?:\[.\] )?(.*)$/);
			if (!m || !m[2].trim()) { new Notice('Linha vazia'); return; }
			const nova = await api.editTaskLineModal(`${m[1]}- [ ] ${m[2]}`);
			if (!nova) return; // cancelado
			ta.setRangeText(nova, ini, fim, 'end');
			ta.dispatchEvent(new Event('input'));
		};
		return b;
	},

	async render() {
		const meu = ++this.token;
		const f = this.arquivo();
		const nova = createDiv({ cls: 'flow-caixa' });
		if (!f) {
			nova.createDiv({ cls: 'flow-vazio', text: `Não encontrei ${this.caminho}.` });
			this.contentEl.empty();
			this.contentEl.appendChild(nova);
			return;
		}
		const { fm, corpo } = dividir(await this.app.vault.read(f));
		let meta = {};
		try { meta = parseYaml(fm) || {}; } catch (e) { /* frontmatter inválido: segue sem fase */ }
		const fase = meta['processar-inbox'] || 'idle';
		const segs = segmentar(corpo.split('\n'));

		for (const seg of segs) {
			if (this.plugin.rodando && seg.tipo !== 'status') continue; // processando: só balão e botão
			if (seg.tipo === 'status') {
				const card = nova.createDiv({ cls: 'flow-card' });
				await MarkdownRenderer.render(this.app, seg.texto, card, this.caminho, this);
				if (!/^> \[!info\]/.test(seg.texto)) {
					const ok = card.createEl('button', { cls: 'flow-ok', text: 'OK' });
					ok.onclick = () => this.removerCard();
				}
			} else if (seg.tipo === 'captura') {
				const sec = nova.createDiv({ cls: 'flow-secao' });
				sec.createDiv({ cls: 'flow-secao-titulo', text: seg.titulo.replace(/^## /, '') });
				const cx = sec.createDiv({ cls: 'flow-captura' });
				const ta = this.campoTexto(cx, seg.conteudo, (v) => this.salvarCaptura(seg.titulo, v), {
					placeholder: '- uma captura por linha', linhas: 3, bullets: true,
				});
				this.botaoTarefa(ta);
			} else if (seg.tipo === 'check') {
				const linha = nova.createEl('label', { cls: 'flow-check' });
				const cb = linha.createEl('input', { attr: { type: 'checkbox' } });
				cb.checked = seg.marcada;
				const txt = linha.createSpan({ cls: 'flow-check-texto' });
				await this.inline(txt, seg.texto);
				cb.onchange = () => this.alternar(seg, cb.checked);
			} else if (seg.tipo === 'campo') {
				const linha = nova.createDiv({ cls: 'flow-campo' });
				linha.createSpan({ cls: 'flow-campo-rotulo', text: seg.rotulo });
				this.campoTexto(linha, seg.valor, (v) => this.salvarCampo(seg, v), { linhas: 1 });
			} else {
				const bloco = nova.createDiv({ cls: 'flow-md' });
				await MarkdownRenderer.render(this.app, seg.texto, bloco, this.caminho, this);
			}
		}

		const rodape = nova.createDiv({ cls: 'flow-rodape' });
		this.botao(rodape, fase);

		if (meu !== this.token) return; // outro render começou depois
		const topo = this.contentEl.scrollTop;
		this.contentEl.empty();
		this.contentEl.appendChild(nova);
		this.contentEl.scrollTop = topo;
	},

	salvarCaptura(titulo, valor) {
		return this.editar((linhas) => {
			const i = linhas.findIndex((l) => l.trimEnd() === titulo);
			if (i < 0) return false;
			let j = i + 1;
			while (j < linhas.length && !/^## /.test(linhas[j])) j++;
			const texto = valor.replace(/\s+$/, '');
			linhas.splice(i + 1, j - i - 1, ...(texto ? ['', ...texto.split('\n'), ''] : ['']));
		});
	},

	alternar(seg, marcada) {
		return this.editar((linhas) => {
			if (linhas[seg.linha] !== seg.bruta) return false;
			seg.bruta = seg.bruta.replace(/\[( |x)\]/, marcada ? '[x]' : '[ ]');
			linhas[seg.linha] = seg.bruta;
		});
	},

	salvarCampo(seg, valor) {
		return this.editar((linhas) => {
			if (linhas[seg.linha] !== seg.bruta) return false;
			seg.bruta = `${seg.rotulo} ${valor.replace(/\s*\n\s*/g, ' ').trim()}`.replace(/ +$/, ' ');
			linhas[seg.linha] = seg.bruta;
		});
	},

	removerCard() {
		this.fila = this.fila.then(async () => {
			const f = this.arquivo();
			if (!f) return;
			await this.app.vault.process(f, (s) => {
				const i = s.indexOf(MARCA_A);
				const j = s.indexOf(MARCA_B);
				return i < 0 || j < 0 ? s : s.slice(0, i) + s.slice(j + MARCA_B.length).replace(/^\n+/, '');
			});
		}).catch((e) => new Notice(`⚠️ Flow: ${e.message}`));
	},
};

class CaixaView extends ItemView {
	constructor(leaf, plugin) {
		super(leaf);
		this.plugin = plugin;
		this.caminho = CAIXA;
		this.fila = Promise.resolve(); // escritas em série
		this.token = 0;
		this.ignorarAte = 0; // modify disparado por escrita nossa não redesenha
		this.pendente = false;
	}

	getViewType() { return VIEW; }
	getDisplayText() { return 'Caixa de Entrada'; }
	getIcon() { return 'inbox'; }
	getState() { return { file: this.caminho }; }

	async setState(state, result) {
		if (state && state.file) this.caminho = state.file;
		await super.setState(state, result);
		await this.render();
	}

	async onOpen() {
		this.contentEl.addClass('flow-caixa-raiz');
		this.addAction('file-text', 'Abrir como texto', () => this.plugin.abrirTexto(this.leaf));
		this.registerEvent(this.app.vault.on('modify', (f) => {
			if (f.path !== this.caminho || Date.now() < this.ignorarAte) return;
			this.redesenhar();
		}));
		await this.render();
	}
}

Object.assign(CaixaView.prototype, painel);

// Bloco ```flow-caixa``` numa nota (ex.: topo de Projetos): o mesmo painel, embutido.
class CaixaEmbed extends MarkdownRenderChild {
	constructor(el, plugin) {
		super(el);
		this.contentEl = el;
		this.plugin = plugin;
		this.caminho = CAIXA;
		this.fila = Promise.resolve();
		this.token = 0;
		this.ignorarAte = 0;
		this.pendente = false;
	}

	onload() {
		this.contentEl.addClass('flow-embed');
		this.plugin.embeds.add(this);
		this.registerEvent(this.app.vault.on('modify', (f) => {
			if (f.path !== this.caminho || Date.now() < this.ignorarAte) return;
			this.redesenhar();
		}));
		this.render();
	}

	onunload() { this.plugin.embeds.delete(this); }

	get app() { return this.plugin.app; }
}

Object.assign(CaixaEmbed.prototype, painel);

// --- Plugin -----------------------------------------------------------------

module.exports = class FlowInbox extends Plugin {
	async onload() {
		this.rodando = false;
		this.embeds = new Set();
		this.registerMarkdownCodeBlockProcessor('flow-caixa', (_src, el, ctx) => ctx.addChild(new CaixaEmbed(el, this)));
		this.texto = new WeakSet(); // abas em que o usuário pediu a Caixa como texto

		this.registerView(VIEW, (leaf) => new CaixaView(leaf, this));
		const ws = this.app.workspace;
		const varrer = () => this.trocar();
		this.registerEvent(ws.on('file-open', varrer));
		this.registerEvent(ws.on('active-leaf-change', varrer));
		this.registerEvent(ws.on('layout-change', varrer));
		ws.onLayoutReady(varrer);

		this.addCommand({ id: 'abrir-caixa', name: 'Abrir Caixa de Entrada (painel)', callback: () => this.abrirPainel() });
		this.addCommand({ id: 'enviar-ao-agente', name: 'Enviar ao agente', callback: () => this.enviar() });
	}

	// Qualquer aba markdown com a Caixa (aberta pelo explorador, link, ou restaurada ao
	// iniciar o Obsidian) vira o painel, exceto as que o usuário pediu como texto.
	trocar() {
		this.app.workspace.getLeavesOfType('markdown').forEach((leaf) => {
			if (leaf.view.file?.path !== CAIXA || this.texto.has(leaf)) return;
			leaf.setViewState({ type: VIEW, state: { file: CAIXA }, active: leaf === this.app.workspace.activeLeaf });
		});
	}

	async abrirPainel() {
		const leaf = this.app.workspace.getLeaf(false);
		await leaf.setViewState({ type: VIEW, state: { file: CAIXA }, active: true });
	}

	abrirTexto(leaf) {
		this.texto.add(leaf);
		leaf.setViewState({ type: 'markdown', state: { file: CAIXA, mode: 'source' }, active: true });
	}

	views() {
		return [...this.app.workspace.getLeavesOfType(VIEW).map((l) => l.view), ...this.embeds];
	}

	async enviar(origem) {
		if (this.rodando) return;
		const views = this.views();
		await Promise.all(views.map((v) => v.fila)); // grava o que ainda está sendo digitado
		const base = this.app.vault.adapter.getBasePath();
		this.rodando = true;
		views.forEach((v) => v.render());
		const filho = spawn('bash', [path.join(base, SCRIPT), SKILL, 'modo-nota'], { cwd: base, stdio: 'ignore' });
		const fim = () => { this.rodando = false; this.views().forEach((v) => v.render()); };
		filho.on('error', (e) => { new Notice(`⚠️ Flow: não consegui iniciar o script (${e.message})`); fim(); });
		filho.on('close', fim);
	}

	onunload() {
		this.app.workspace.detachLeavesOfType(VIEW);
	}
};

module.exports.__teste = { dividir, segmentar };
