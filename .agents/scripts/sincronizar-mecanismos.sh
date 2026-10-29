#!/usr/bin/env bash
# Sincroniza os mecanismos entre um vault privado e o template público (remote `upstream`), nos dois sentidos.
# Uso (de dentro do vault privado): sincronizar-mecanismos.sh "mensagem do commit"
# 1. traz o que mudou no upstream (ex.: feito em outra máquina);
# 2. publica no upstream só os caminhos de MECANISMOS. Dados nunca saem daqui, mesmo que estejam no mesmo commit.
set -euo pipefail

MECANISMOS=(.agents .claude .kiro .obsidian "Prática/Tarefas.md" .gitignore .gitattributes README.md)

VAULT="$(cd "$(dirname "$0")/../.." && pwd)"
msg="${1:?uso: sincronizar-mecanismos.sh \"mensagem do commit\"}"
cd "$VAULT"

git remote get-url upstream >/dev/null 2>&1 || { echo "Falta o remote upstream (git remote add upstream <url do template>)"; exit 1; }
[ -z "$(git status --porcelain -- "${MECANISMOS[@]}")" ] || { echo "Há mudanças de mecanismo sem commit. Commite (ou espere o obsidian-git) e rode de novo."; exit 1; }
git config merge.ours.driver true # usado pelo .gitattributes: no merge, os dados locais sempre vencem

# 1. Receber
git fetch -q upstream
git merge -q --no-edit upstream/main || { echo "Conflito ao trazer o upstream. Resolva já (o obsidian-git pode commitar os marcadores)."; exit 1; }

# 2. Publicar: monta o commit numa worktree do upstream, copiando só os mecanismos do vault
tmp="$(mktemp -d)"
trap 'git -C "$VAULT" worktree remove --force "$tmp"' EXIT
git worktree add -q --detach "$tmp" upstream/main
cd "$tmp"
git restore --source="$(git -C "$VAULT" rev-parse HEAD)" --staged --worktree -- "${MECANISMOS[@]}"
if git diff --cached --quiet; then echo "Nada a publicar."; exit 0; fi

git diff --cached --stat
read -rp "Publicar isso no upstream (público)? [s/N] " ok
[ "$ok" = s ] || { echo "Cancelado."; exit 1; }
git commit -q -m "$msg"
git push -q upstream HEAD:main
cd "$VAULT"
git merge -q --no-edit upstream/main # liga o commit publicado ao histórico privado
echo "Publicado."
