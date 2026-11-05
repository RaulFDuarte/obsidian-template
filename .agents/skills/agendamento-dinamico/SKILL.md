---
name: agendamento-dinamico
description: Schedule, reschedule or postpone tasks in Projetos while keeping each workday within capacity (cascade rule, unbreakable deadlines). Use whenever the user creates a task with a date, asks to schedule/postpone/adiar/reagendar a task, sets a prazo or "data limite", or asks to rebalance the week.
---

# Agendamento Dinâmico

Insert or move tasks in `Prática/Projetos.md` so that every day stays feasible. Syntax, structure and paths come from the `obsidian-vault` steering. Only Projetos counts. Ignore checkboxes in the Caixa de Entrada, Lembretes and detailed notes.

## 0. Overdue mode

If the request is just to reschedule overdue tasks (no specific task), do only this: list open tasks (`[ ]` or `[/]`) in Projetos with `⏳` before today, move each `⏳` forward to today or the next workday with room, applying the cascade in step 5 (highest priority first, never past `📅`). Do not touch tasks that have no `⏳`. Then give the feedback in step 7 and stop.

## 1. Locate the task

- Existing task: find it in Projetos by text or link (also by Jira key, only if `jira` is `true` in `.agents/flow.config.json`).
- New task: pick the epic that fits (H1 area, tag, meaning). If two epics fit, or none does, ask one question with your recommendation (new epic/H1 needs confirmation).
- If the request is vague (a scribble, no clear outcome), clarify first, or suggest running `processar-inbox` on it.

## 2. Dates and priority

- `⏳` scheduled (default when the type is not stated), `📅` due, `🛫` start. Resolve relative dates ("amanhã", "sexta", "semana que vem") against today's date.
- Infer priority from context when not given (`🔺 ⏫ 🔼` none `🔽 ⏬`) and state it in the feedback.

## 3. Effort

Estimate Baixa / Média / Alta from the description, number of subtasks and linked note size.

## 4. Load analysis

For the target day, count the open tasks (`[ ]` or `[/]`) in Projetos that land on it:
- `⏳` equal to the day, or `📅` equal to the day with no `⏳`.
- If the day is today, also count overdue `⏳` (the "Hoje" dashboard shows them).
- Count the most specific level: if a parent and its child are dated on the same day, count only the child. A dated parent with no dated children counts as one task.

Capacity: 3 Médias OR 1 Alta + 2 Baixas (Baixa ≈ half of a Média, Alta ≈ two Médias).

## 5. Cascade (when over capacity)

1. Rank the day's tasks: priority emoji > closeness of `📅` > blocks other work > context.
2. Move the lowest-ranked task's `⏳` to the next workday (per `workdays` in `.agents/flow.config.json`).
3. Repeat recursively on that day if it overflows too.
4. Golden rule: never move `⏳` past the task's `📅`. If the cascade would break a deadline, stop and warn the user with options (drop scope, swap with another task, renegotiate the deadline).

Show the proposed cascade before applying it if it moves more than one task or touches a `⏫`/`🔺` task. Otherwise apply directly.

## 6. Edit

Surgical `str_replace` on the task line only. Keep the token order from the steering. Never touch other lines.

## 7. Feedback (pt-BR, short)

- What was scheduled and where (H1 › épico).
- Effort and priority.
- Cascades: `tarefa: data antiga → data nova`.
- Deadline warnings, if any.
