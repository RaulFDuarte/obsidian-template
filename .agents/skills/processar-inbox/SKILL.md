---
name: processar-inbox
description: Triage the Caixa de Entrada into Projetos, Lembretes or detailed notes, interviewing the user (grill-me rounds) to understand drafts and memory anchors before structuring anything. Also runs headless from the Obsidian buttons (argument `modo-nota`). Use when the user says "processar inbox", "processar caixa de entrada", "triar caixa", "limpar caixa de entrada", "organizar caixa", or pastes an unstructured dump (meeting notes, To Do export, loose text) to be turned into tasks.
---

# Processar Caixa de Entrada

The Caixa de Entrada holds raw captures: complete tasks, but also half-written drafts and scribbles that only anchor the user's memory of a bigger task. Never structure what you don't understand. First reach a shared understanding through interview rounds, then act.

Vault rules (paths, Projetos structure, Tasks syntax, capacity) come from the `obsidian-vault` steering (`.agents/steering/obsidian-vault.md`; read it explicitly when running headless).

## Seções da Caixa

The Caixa has one capture section, `## 🗂️ Para categorizar`: its items go through Phases 1-5 below. Items that need no categorization are typed straight into Projetos by the user, not here. If the Caixa has no heading (old raw dump), treat everything as `Para categorizar`.

## Phase 1 — Gather facts (your job, never the user's)

1. Read `Prática/Caixa de Entrada.md` (or the dump pasted in chat), `Prática/Projetos.md` and `Prática/Lembretes.md`. List the notes in `Prática/`.
2. Split the input into items: each top-level bullet with its children, or each free-text block/heading.
3. For each item, look up everything you can before asking:
   - Matching epic/area in Projetos (by tag, keywords, linked notes).
   - Duplicates or overlaps with existing tasks (same MR, env var, lib, card, person).
   - Related detailed notes in `Prática/` or reminders in Lembretes.
   - Environment facts (repos, MRs, and Jira cards only if `jira` is `true` in `.agents/flow.config.json`) via tools or a `context-gatherer` sub-agent. Don't block the round on a slow lookup: only questions that depend on it wait.
4. Classify each item provisionally:
   - **Clara**: actionable, destination obvious.
   - **Âncora**: scribble pointing at something bigger; meaning, scope or outcome unknown.
   - **Duplicada**: already in Projetos (possibly with new info to merge).
   - **Lembrete**: belongs in Lembretes (long-lived, not an actionable task).
   - **Contexto**: information supporting a task (may become a detailed note).
   - **Ruído/feito**: already done or no longer relevant.

## Phase 2 — Interview rounds (grill-me)

Map the triage as a **design tree**: each item is a root; each decision branches into the decisions that depend on it. Typical branches per item:

- What is the real task behind it? What is the expected outcome / done criterion?
- Destination: existing epic (which), new epic/H1, Lembretes, detailed note, or discard.
- Breakdown into subtasks.
- Priority, `⏳` and `📅` (only after the task itself is understood).
- Merge strategy for duplicates (what new info to add to the existing task).

**Default `⏳`:** every new actionable task (not epics, not Lembretes items, not context bullets) gets `⏳ <today>` (current date, `YYYY-MM-DD`) unless the user or the item defines another scheduled date. Use it as the recommended answer in rounds and in the Phase 3 plan, and still apply the capacity check from `agendamento-dinamico` (today's load may require a cascade).

Work in **rounds**. The **frontier** is every decision whose prerequisites are already settled. Ask the whole frontier in one round, numbered, each with your recommended answer. A question that depends on another question still open in this round goes to a later round. Never ask for facts you can look up.

To keep rounds readable:
- Bundle all **Clara**, **Duplicada** and **Ruído** items into a single first question with a table `Item | Destino proposto | Prioridade/datas`, so the user confirms or corrects in one answer.
- Group the remaining questions by item, in the order they appear in the Caixa.
- Always offer "deixar na Caixa por enquanto" as a valid answer for any item.

Round format (write in pt-BR):

```
❓ **Q1** - **<título da pergunta>**: <corpo da pergunta, pode ter múltiplos parágrafos e opções>

➡️ <sua resposta recomendada>

---

❓ **Q2** - **<título da pergunta>**: <corpo>

➡️ <sua resposta recomendada>
```

After each answer, update the tree, recompute the frontier and ask the next round. Stop when the frontier is empty: every branch visited, nothing silently assumed.

## Phase 3 — Confirm the plan

Present the final plan, without editing anything yet:
- Table `Item | Destino | Ação` (inserir, mesclar, criar nota, mover para Lembretes, descartar, manter na Caixa).
- The exact lines to be inserted into Projetos, under the named H1/epic.
- Scheduling impact: days that would exceed capacity and the cascade you propose (rules from `agendamento-dinamico`).

Wait for explicit confirmation ("ok", "pode aplicar"). Do not act before it.

## Phase 4 — Apply

1. Projetos: insert under the confirmed epic with surgical `str_replace`, TAB indentation, steering syntax. Merge duplicates into the existing task instead of creating a new one.
2. Detailed notes: create `Prática/<Nome descritivo>.md` with the full context (plain markdown) and link it from the task with `[[Nome descritivo]]`.
3. Lembretes: append to the section the user chose.
4. Normalize text: clean, actionable wording; fix obvious typos; keep links, IDs, MR numbers, env vars, file names and technical terms intact.
5. Caixa de Entrada: remove only the items that were triaged. Leave the items the user kept, untouched.
6. Apply any cascade the user confirmed.

## Phase 5 — Report (pt-BR, short)

- What went where (Projetos epic, nota nova, Lembretes, descartado).
- Cascades applied (`tarefa: data antiga → data nova`).
- What stayed in the Caixa.

## Modo nota (botões do Obsidian)

Runs when the argument is `modo-nota` (one round). The user works in the `flow-inbox` panel (an editable view over the Caixa) and presses one button, whose label follows `processar-inbox` (`idle`: Enviar ao agente · `perguntas`: Enviar respostas ao agente · `decisao-final`: Aplicar triagem), so set that key correctly. There is no chat: the user only sees the Caixa note, edits it, and presses the button again. Never use AskUserQuestion; every question goes into the note. Your final answer (stdout) is the persistent report, in pt-BR markdown: first line = summary of at most 120 characters (also shown as a notification). In question and plan rounds (`perguntas`, `decisao-final`) that single line is the whole answer: the Triagem below already holds the questions, decisions and plan, so never restate them in the report (the user would read everything twice). Only the Apply run adds up to ~6 short bullets (what went where, cascades, what stayed). The wrapper saves it as a callout at the top of the Caixa.

State lives in the Caixa frontmatter: `processar-inbox: idle | perguntas | decisao-final` and `rodada: N`. Leave the status card (`<!--flow-status-->` block) and the `capturas_*` keys alone: the wrapper owns them. The note ends with the Original callout: write the Triagem above it. The user's free text goes in each question's `✏️ outra resposta:` field (keep that exact line format). Requests that answer no question go in the general field `### 💬 Outra mensagem ao agente` (`✏️ mensagem:`), placed at the end of the Triagem in every round. Create the frontmatter if missing.

### Round (`modo-nota`)

1. Read the steering, Caixa, Projetos and Lembretes. Decide the round type: if `processar-inbox` is `decisao-final`, the approvals are checked and no answer was changed, this press means **Apply** (section below); if it is `decisao-final` but nothing is approved and nothing changed, change nothing and say in the report what to approve; otherwise run the round below. On the first round the wrapper has already moved the captures out of sight into the frontmatter: `capturas_para_categorizar` (a YAML text block, one item per bullet). Treat it as the contents of the Caixa section. The section itself does not exist in the body during a triage (the wrapper manages the template: do not create or keep it). Loose bullets typed in the body outside the managed blocks are new captures for `Para categorizar`.
2. Items in `Para categorizar` are new captures: run Phase 1 on them and copy them verbatim into the collapsed callout at the bottom of the Caixa (remove loose ones from the body):
   ```
   > [!note]- Original (dump de <YYYY-MM-DD>)
   > - item cru
   ```
   Append to the callout if it already exists.
3. Read the user's answers in `## 🤖 Triagem`: a checked option, text after `✏️`, or an edit to the question itself. Unanswered questions stay unanswered, except when `- [x] aceitar recomendações` is checked, which makes every unanswered question take its recommended option. Text in `✏️ mensagem:` is a request for this round: act on it, or turn it into a question if it changes the look of Obsidian or many files, and say in the report what was done with it.
4. Rewrite `## 🤖 Triagem` (placed after the status callout and before the Original callout) and increment `rodada`:
   - Open `- [ ] aceitar recomendações` at the top.
   - Resolved questions shrink to one bullet each, `- **Qn** título: decisão`, grouped under a single `✅ **Decidido**` line. The ✅ appears once per Triagem, never per question (the same goes for `**Feito**` lines: bullets under that one group).
   - Open questions use this block (write in pt-BR), the recommended option marked `(recomendado)` but unchecked:
     ```
     ### ❓ Q1: <título>
     <corpo>
     - [ ] <opção> (recomendado)
     - [ ] <opção>
     - [ ] deixar na Caixa por enquanto
     ✏️ outra resposta: 
     ```
   - Same bundling rules as Phase 2 (one table for Clara/Duplicada/Ruído items, then per item). Set `processar-inbox: perguntas`.
   - Always close the Triagem with the general field block `### 💬 Outra mensagem ao agente` and `✏️ mensagem: `, keeping the user's text inside it.
5. When the frontier is empty, replace the open questions with the Phase 3 plan: the table, the exact lines to insert, the cascade, and one `- [ ] aprovar` per action plus `- [ ] aprovar tudo`. Set `processar-inbox: decisao-final`. If the user then edits an answer, go back to step 3 and re-plan.

Keep the line of `obsidian://` button links under the frontmatter untouched. Never delete the user's text from the note, and never touch Projetos/Lembretes/detailed notes in a round.

### Apply (press in `decisao-final`)

Proceed only if `processar-inbox: decisao-final` and the approvals are checked (`aprovar tudo`, or per action: apply only the approved ones). Otherwise change nothing and say why in the last line. Then run Phase 4 for the approved actions; unapproved and "deixar na Caixa" items return under a `## 🗂️ Para categorizar` heading you create. Reset the Caixa: remove `## 🤖 Triagem` and the Original callout, set `processar-inbox: idle`, `rodada: 0`. Do not write a report callout; the Phase 5 report is your final answer.
