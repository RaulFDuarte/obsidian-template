#!/usr/bin/env bash
# Roda uma skill do vault em headless (Claude Code ou Kiro CLI, conforme flow.config.json), com a Caixa de Entrada como interface.
# Uso: flow-skill.sh <skill> [argumento]   ex.: flow-skill.sh processar-inbox modo-nota
# O script cuida do que é determinístico (feedback na nota, backup, lock); o agente, do que é semântico.
set -uo pipefail
export PATH="$HOME/.local/bin:$PATH" # o Obsidian não herda o PATH do shell

DIR="$(cd "$(dirname "$0")" && pwd)"
VAULT="$(cd "$DIR/../.." && pwd)"
CAIXA="$VAULT/Prática/Caixa de Entrada.md"
STATE=/tmp/flow-skill
skill="${1:?skill}"; arg="${2:-}"
mkdir -p "$STATE"

caixa() { python3 "$DIR/caixa.py" "$CAIXA" "$@"; }
notify() { command -v notify-send >/dev/null && notify-send "flow: $skill" "$1"; }

exec 9>"$STATE/lock"
flock -n 9 || { notify "já existe uma execução em andamento"; exit 1; }

ts=$(date +%Y%m%d-%H%M%S)
mkdir -p "$STATE/backups/$ts"
cp "$VAULT"/Prática/*.md "$VAULT"/Recursos/*.md "$STATE/backups/$ts/" 2>/dev/null

# Feedback imediato: as capturas saem da tela (vão para o frontmatter) e aparece "processando".
if [ "$(caixa begin)" = "VAZIA" ]; then notify "Caixa vazia"; exit 0; fi

cd "$VAULT"
# Agente e modelo vêm de flow.config.json: "agent" (claude | kiro) e "modelo" (um por agente).
cfg() { python3 -c 'import json,sys; c=json.load(open(sys.argv[1])); print(eval(sys.argv[2]))' "$VAULT/.agents/flow.config.json" "$1" 2>/dev/null; }
agent=$(cfg 'c.get("agent","claude")'); agent=${agent:-claude}
modelo=$(cfg 'c.get("modelo",{}).get(c.get("agent","claude"),"")')
prompt="Hoje é $(date +%F). Execução headless: siga o modo nota da skill."
case "$agent" in
claude)
	out=$(claude -p "/$skill $arg

$prompt" ${modelo:+--model "$modelo"} \
		--permission-mode acceptEdits \
		--allowedTools "Read Edit Write Glob Grep" </dev/null 2>"$STATE/err.log") ;;
kiro)
	out=$(kiro-cli chat --no-interactive --trust-tools=fs_read,fs_write ${modelo:+--model "$modelo"} \
		"Use a skill $skill. Argumento: $arg

$prompt" </dev/null 2>"$STATE/err.log" | sed 's/\x1b\[[?0-9;]*[A-Za-z]//g') ;;
*) echo "agent desconhecido: $agent" >"$STATE/err.log"; false ;;
esac
code=$?
echo "$out" > "$STATE/last.log"

if [ $code -eq 0 ]; then
	caixa finalize
	caixa callout ok "$out"
	notify "$(echo "$out" | head -n 1)"
else
	cp "$STATE/backups/$ts/Caixa de Entrada.md" "$CAIXA" # devolve as capturas à nota
	caixa callout fail "Falhou. Suas capturas foram devolvidas à nota.
Log: $STATE/err.log"
	notify "falhou, veja $STATE/err.log"
fi
exit $code
