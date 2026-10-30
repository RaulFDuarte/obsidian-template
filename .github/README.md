# obsidian-template

Vault do Obsidian para gestão pessoal de tarefas, com um agente de IA (Claude Code ou Kiro CLI) como parceiro: você despeja ideias soltas numa Caixa de Entrada, o agente triaga com você, organiza em projetos e agenda respeitando uma capacidade diária. Um calendário mostra tudo por mês, semana e dia.

Este repositório traz só os **mecanismos** (notas-núcleo vazias, plugins, estilos, skills do agente). Seus dados ficam num repo privado seu, que recebe atualizações daqui (ver [Mantendo seus dados privados](#mantendo-seus-dados-privados)).

## Como funciona

Quatro notas em `Prática/`, pensadas para ficarem abertas lado a lado:

| Nota | Papel |
|---|---|
| `Caixa de Entrada.md` | Captura rápida e bagunçada do dia. Tudo cai aqui primeiro. |
| `Projetos.md` | Fonte única das tarefas. Áreas (H1) → épicos (tarefa de topo) → subtarefas. Só o que está aqui é rastreado. |
| `Tarefas.md` | Painel: calendário (mês/semana/dia, arrastar para reagendar, ordem manual do dia) e listas de Atrasadas e Sem Data. Não se edita à mão. |
| `Lembretes.md` | Metas, ideias e assuntos de longo prazo, em formato livre. Fora do painel. |

Tarefas usam a sintaxe do plugin Tasks: `⏳` data planejada (flexível), `📅` prazo (inegociável), prioridades `🔺 ⏫ 🔼 🔽 ⏬`. Veja `Prática/Projetos.md` para um exemplo da estrutura.

Quando uma tarefa acumula muito contexto, ela vira uma nota própria em `Prática/` e a tarefa passa a apontar para ela com `[[link]]`.

### O agente

As regras do vault ficam em `.agents/steering/obsidian-vault.md` e as skills em `.agents/skills/` (`.claude/` e `.kiro/` são links simbólicos para lá, então os dois agentes leem o mesmo):

- **processar-inbox** - triagem da Caixa de Entrada em rodadas de perguntas: o que é tarefa, de qual épico, quando, o que vira lembrete ou nota própria.
- **agendamento-dinamico** - agenda e reagenda mantendo cada dia dentro da capacidade (3 tarefas médias, ou 1 pesada + 2 leves), empurrando `⏳` em cascata sem nunca furar um `📅`.
- **revisao-semanal** - encontra tarefas atrasadas, paradas ou esquecidas, dias sobrecarregados e notas órfãs, e decide com você o que fazer.

Converse com o agente na pasta do vault (ex.: "processar inbox", "revisão semanal", "agenda isso para quinta").

### Triagem sem sair do Obsidian

O plugin `flow-inbox` (incluído) mostra a Caixa de Entrada como um painel, embutido no topo de `Projetos.md` pelo bloco `flow-caixa`. O botão **Enviar ao agente** roda a triagem em segundo plano (`.agents/scripts/flow-skill.sh`): as perguntas do agente aparecem na própria nota, com caixas de seleção e campos de resposta, e cada novo clique envia uma rodada. Lá também se aplica a triagem final.

Linhas da Caixa começadas com `*` são instruções diretas para o agente, não tarefas.

## Requisitos

- [Obsidian](https://obsidian.md) (desktop).
- Um agente: [Claude Code](https://claude.com/claude-code) (`claude`) ou [Kiro CLI](https://kiro.dev) (`kiro-cli`), autenticado.
- Para o botão de triagem: Linux com `bash`, `python3` e `flock` (`notify-send` opcional, para notificações).

## Instalação

1. Clone o repositório e abra a pasta como vault no Obsidian.
2. Configurações → Plugins da comunidade: confie no vault e confira que estão ativos Tasks, Dataview, Flow Inbox, Git e Markdown Minimap.
3. Configurações → Aparência → Snippets CSS: ative `calendario-tarefas` e `task-toolbar-modern`.
4. Ajuste `.agents/flow.config.json`:
   - `agent`: `claude` ou `kiro`; `modelo`: modelo por agente (vazio = padrão).
   - `workdays` e `weekStart`: dias que contam para a capacidade.
   - `jira`: `true` só se usar a integração com Jira.
5. Troque os exemplos de `Prática/Projetos.md` pelas suas áreas e épicos.

## Mantendo seus dados privados

Como o template é público, seus dados vão para um repo **privado** seu, que contém o vault inteiro (mecanismos + dados) e aponta para este como `upstream`. Ter o vault inteiro num só repo permite sincronizar tudo, inclusive plugins, com o celular pelo plugin Git.

Montar (uma vez):
```bash
git clone https://github.com/RaulFDuarte/obsidian-template.git meu-vault && cd meu-vault
git remote rename origin upstream
git remote add origin git@github.com:<você>/<repo-privado>.git
git push -u origin main
```

No dia a dia, use e edite tudo no seu vault (o plugin Git pode commitar sozinho). Para trazer atualizações do template e, se tiver permissão de escrita nele, publicar mudanças de mecanismo que você fez:
```bash
.agents/scripts/sincronizar-mecanismos.sh "o que mudou"
```

O script:
1. traz o `upstream` e faz merge; `.gitattributes` garante que `Projetos`, `Caixa de Entrada` e `Lembretes` locais sempre vençam;
2. monta um commit para o `upstream` copiando **só** os caminhos da lista `MECANISMOS` no topo do script (`.agents`, `.obsidian`, `Prática/Tarefas.md`, ...), mostra o que vai subir e pede confirmação.

Seus dados nunca entram nesse commit, mesmo que estejam no mesmo commit local que a mudança de mecanismo. Se criar um novo arquivo de mecanismo fora desses caminhos, inclua-o na lista.

## Estrutura

```
.agents/          steering, skills, scripts e flow.config.json do agente
.claude/ .kiro/   links simbólicos para .agents (um por agente)
.obsidian/        plugins, snippets CSS, atalhos e configurações
Prática/          as 4 notas-núcleo e as notas de tarefas detalhadas
Recursos/         material de referência (docs dos plugins Calendar, Tasks e Git)
```
