---
inclusion: always
---

# Obsidian Vault Workflow

This workspace is the user's personal Obsidian vault. You act as a productivity partner: you keep the backlog structured, the daily load feasible, and nothing important forgotten. Always talk to the user in pt-BR. Task text written into the vault is pt-BR (technical terms stay in English).

## The 4 core notes (always open side by side)

| Note | Path | Role | Agent may |
|---|---|---|---|
| 📥 Caixa de Entrada | `📝 Prática/📥 Caixa de Entrada.md` | "RAM": raw, unstructured captures of the day, in one section, `🗂️ Para categorizar` (triaged with the user). Drafts, half-sentences and memory anchors for bigger tasks. | Read; append; remove items only after they were triaged (skill `processar-inbox`). |
| 🔨 Projetos | `📝 Prática/🔨 Projetos.md` | The single source of truth for tasks. Only tasks here are tracked. | Read; surgical edits. |
| 📋 Tarefas | `📝 Prática/📋 Tarefas.md` | Dashboard of Tasks queries over 🔨 Projetos (Atrasadas, Hoje, Próximos 7 dias, Futuro, Sem Data). | Never edit, except the queries themselves when the user asks. |
| ✍️ Notas | `🔗 Recursos/✍️ Notas.md` | Long-lived reminders, goals, 1:1 topics, ideas that last days or months. Free format. Not tracked by the dashboard. | Read; append only with user confirmation. |

Detailed notes: when a task carries a lot of content (more than ~5 lines of context, open discussion, decisions, research), it becomes its own note at `📝 Prática/<Nome descritivo>.md` (plain markdown, no Tasks dates). The task in 🔨 Projetos links to it with `[[Nome descritivo]]`. Only the linking task counts for the dashboard.

## 🔨 Projetos structure

```
# <emoji> <Área>                          ← H1 per domain area; areas separated by `---`
- [ ] <emoji> <Épico> #tag                ← epic = top-level task, domain tag(s)
	- [ ] Subtarefa acionável ⏫ ⏳ 2026-10-07 📅 2026-10-09
		- [ ] Sub-subtarefa
		- contexto em bullet simples, sem checkbox
	- [ ] [[Nota própria]] 🔽
```

- Indent with TABs. Context lines are plain bullets (no `ℹ️ Contexto` label).
- Place new tasks under the existing epic that fits (by area, tag and meaning). Create a new epic or H1 only when nothing fits, and confirm with the user first.
- Edit surgically (`str_replace` on the smallest unique block). Never rewrite the whole file, never reorder existing content, preserve emojis, links and tabs.

## Tasks plugin syntax

- Dates (`YYYY-MM-DD`): `⏳` scheduled (when I plan to do it), `📅` due (hard deadline), `🛫` start. A single unqualified date means `⏳`. `✅` done date is set by the plugin. Do not add `➕`.
- Priority: `🔺` highest (blocker, production down) · `⏫` high · `🔼` medium · none = normal · `🔽` low · `⏬` lowest (nice-to-have).
- Status: `[ ]` todo · `[/]` in progress · `[x]` done · `[-]` cancelled.
- Order on the line: `- [ ] texto [[link]] [JIRA-123](url) <prioridade> ⏳ data 📅 data #tags`.

## Capacity and scheduling rules

- Daily limit: 3 medium tasks OR 1 high-effort + 2 low-effort. Only workdays count (skip the other days). Workdays and week start come from `.agents/flow.config.json` (`workdays`, `weekStart`); read it before scheduling. Without the file, assume Mon-Fri, week starting Monday.
- The "Hoje" dashboard also shows overdue `⏳`, so overdue scheduled tasks count toward today's load.
- `⏳` is flexible and can cascade to the next workday. `📅` is unbreakable: if a cascade would push a task past its `📅`, stop and warn the user.
- Details live in skill `agendamento-dinamico`.

## Other rules

- Jira (only if `jira` is `true` in `.agents/flow.config.json`; otherwise ignore Jira entirely, never ask about it): when the user asks for a card from a task, use skill `criar-cartao-jira`, then add `[KEY-123](url)` to the task line.
- Zombie tasks (no date, no progress, low priority for a long time) are handled by skill `revisao-semanal`.
- Facts are your job: look things up in the vault (or with tools) instead of asking the user. Decisions (priority, dates, destination, discard) are the user's.
- After editing, summarize briefly in pt-BR: what changed, where, and any cascades.
- Lines in the Caixa starting with `*` are instructions for the agent, not notes: read and process them in the current round, never create them as tasks in 🔨 Projetos. Actions that change many files or the look of Obsidian become a question in the Triagem first.

## Skill philosophy (interactive skills)

- **The note is the interface.** An interactive skill started from an Obsidian button talks through the note where the button lives (questions, checkboxes, `✏️` fields), never through the chat. Each press is one stateless round: the note holds all state.
- **The result stays in the note.** The skill's final answer is saved as a callout at the top of that note, written to be read later; the desktop notification is only a complement.
- **Immediate feedback.** On press, the wrapper script hides what is being processed (moves it to the frontmatter) and shows a "processando" callout before the agent starts.
- **Deterministic vs semantic.** The wrapper (`.agents/scripts/`) does backups, locks, stashing, status and template upkeep; the agent does understanding, questions and decisions.
- **No scaffolding while working.** Templates for capture exist only when the note is idle.
- **Headless for non-interactive skills.** Skills that ask nothing run headless (`claude -p` or `kiro-cli chat --no-interactive`, per `agent` in `.agents/flow.config.json`) through the same wrapper.
