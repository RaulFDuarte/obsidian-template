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

## Usando com um vault privado (seus dados)
O obsidian-flow só tem mecanismos. Seus dados ficam num repo **privado** que contém o vault inteiro (mecanismos + dados), para o celular receber tudo pelo obsidian-git. Esse repo privado aponta para o obsidian-flow como `upstream`.

Montar (uma vez por vault privado):
```bash
git clone git@github.com:<você>/obsidian-flow.git meu-vault && cd meu-vault
git remote rename origin upstream
git remote add origin git@github.com:<você>/<repo-privado>.git
git push -u origin main
```

No dia a dia, edite tudo no vault privado (o obsidian-git commita sozinho). Quando quiser levar mudanças de mecanismo para o upstream, ou trazer as feitas em outra máquina:
```bash
.agents/scripts/sincronizar-mecanismos.sh "o que mudou"
```
O script traz o upstream, monta um commit só com os caminhos listados em `MECANISMOS` (`.agents`, `.obsidian`, `Prática/Tarefas.md`...), mostra o que vai subir e pede confirmação. Dados nunca entram, mesmo que estejam no mesmo commit que a mudança de mecanismo. Nos merges, `.gitattributes` faz os dados locais vencerem.
