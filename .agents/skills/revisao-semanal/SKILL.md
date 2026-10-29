---
name: revisao-semanal
description: Weekly review of the Obsidian vault backlog. Finds overdue, rolled-over, stagnant and zombie tasks in 🔨 Projetos, overloaded days, finished epics, broken links and orphan notes, then interviews the user to decide what to break down, reschedule, move to Notas or discard. Use when the user says "revisão semanal", "weekly review", "revisar tarefas", "revisar backlog", "limpar backlog", "tarefas zumbis" or "o que está parado".
---

# Revisão Semanal

Keep 🔨 Projetos honest: everything there should be something the user still intends to do. Vault rules come from the `obsidian-vault` steering. Scheduling rules come from `agendamento-dinamico`.

## Phase 1 — Scan (facts are your job)

Read `📝 Prática/🔨 Projetos.md`, `📝 Prática/📥 Caixa de Entrada.md`, `🔗 Recursos/✍️ Notas.md` and list `📝 Prática/`. Build these findings:

1. **Atrasadas**: open tasks with `📅` before today.
2. **Roladas**: open tasks with `⏳` before today (they keep reappearing in "Hoje").
3. **Dias sobrecarregados**: next 5 workdays (per `.agents/flow.config.json`) over capacity.
4. **Épicos parados**: open epics with no dated open subtask and no priority above normal.
5. **Zumbis**: undated `🔽`/`⏬` tasks, vague one-liners with no context, items untouched across reviews.
6. **Épicos concluídos**: parent `[ ]` with every child `[x]`/`[-]`.
7. **Concluídas acumuladas**: `[x]` subtrees with `✅` older than 30 days that clutter the file.
8. **🌐 Abas do Navegador**: each pending tab item.
9. **Links quebrados**: `[[...]]` in Projetos pointing to notes that don't exist.
10. **Notas órfãs**: notes in `📝 Prática/` (except the 3 core notes and `✅ Linha do Tempo`) not linked from Projetos.
11. **Caixa pendente**: number of items still in the Caixa de Entrada.

Show a short summary with counts per category before asking anything.

## Phase 2 — Interview rounds

Use the same round format and frontier logic as `processar-inbox` (numbered questions, recommended answer for each, ask the whole frontier, dependent questions wait for the next round). Recommended actions per item:

- **Reagendar** (new `⏳`, run the cascade rules)
- **Quebrar** (vague or too big: propose concrete subtasks)
- **Promover** (raise priority / add `📅`)
- **Mover para Notas** (long-lived idea, not a task)
- **Virar nota própria** (too much inline context)
- **Concluir** (mark `[x]`) or **Cancelar** (`[-]`)
- **Descartar** (delete the line)
- **Arquivar** (move old done subtrees to `✅ Linha do Tempo`)

To keep rounds manageable:
- Bundle low-stakes categories (épicos concluídos, concluídas acumuladas, links quebrados) into one question each, with a table of proposed actions.
- For 🌐 Abas do Navegador, one question with a table `Aba | Ação sugerida` (descartar, virar tarefa em <épico>, mover para Notas).
- If the Caixa has items, the last question offers to run `processar-inbox` next.

## Phase 3 — Confirm and apply

1. Present the final change list (grouped by action) and the resulting cascade, and wait for explicit confirmation.
2. Apply with surgical `str_replace` edits. Never rewrite the whole file.
3. Report in pt-BR: counts per action, cascades (`tarefa: data antiga → data nova`), deadline warnings, and the next review suggestion (first day of the next week, per `weekStart` in `.agents/flow.config.json`).
