# Obsidian - Template de Mecanismos

Cópia dos mecanismos do vault pessoal (`flow`), **sem as tarefas e sem conteúdo pessoal**, para evoluir o sistema em outra máquina. Para usar, abra esta pasta como um vault no Obsidian.

## O que vem aqui

### Dashboard e calendário (`Prática/`)
- **`Tarefas.md`** - dashboard. Calendário em `dataviewjs` (visões mês/semana/dia, drag & drop, ordem manual do dia, árvore de subtarefas, botão direito = Edit task) e as queries do Tasks (Atrasadas, Sem Data).
- **`Projetos.md`** - fonte única das tarefas (`SOURCE_PAGE` do calendário). Vem só a estrutura (Caixa embutida via bloco `flow-caixa` + cabeçalhos de área e épico), esvaziada.
- **`Caixa de Entrada.md`** - vazia.
- **`Lembretes.md`** - vazia. Lembretes de longo prazo (não entra no dashboard).

### Recursos (`Recursos/`)
- **`Obsidian Plugins/`** - docs de referência do Calendar, do Tasks e das correções do obsidian-git.

### Configuração do Obsidian (`.obsidian/`)
- Plugins: calendar, cmdr, dataview, flow-inbox (painel da Caixa e botão "Enviar ao agente"), markdown-minimap, mehrmaid, obsidian-git, obsidian-kanban, obsidian-shellcommands, obsidian-tasks-plugin, vscode-editor.
- Snippets CSS: `calendario-tarefas.css` e `task-toolbar-modern.css`.
- Config, hotkeys, templates e aparência.

### Agentes (`.agents/`, com `.claude/` e `.kiro/` como links simbólicos)
- `steering/obsidian-vault.md`: regras do fluxo (notas-núcleo, estrutura do Projetos, sintaxe do Tasks, capacidade diária).
- `skills/`: `agendamento-dinamico`, `processar-inbox`, `revisao-semanal`.
- `scripts/flow-skill.sh` + `caixa.py`: rodam uma skill em headless a partir do Obsidian (shellcommands), usando a Caixa como interface.
- `flow.config.json`: agente (`claude` | `kiro`), modelo, dias úteis e início da semana.

## O que ficou de fora (pessoal)
Tarefas e seu conteúdo, notas detalhadas, Anotações, Estudos, Prompts, Histórico, `.git`, `.trash` e o estado do workspace.

## Primeiros passos na nova máquina
1. Abra a pasta como vault no Obsidian.
2. Em Configurações → Plugins da comunidade, confie no vault e ative os plugins.
3. Em Configurações → Aparência → Snippets CSS, ative `calendario-tarefas` e `task-toolbar-modern`.
4. Ajuste `.agents/flow.config.json` (agente e modelo disponíveis na máquina).
5. Preencha o `Projetos.md` seguindo a estrutura dos cabeçalhos.
