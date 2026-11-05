#!/usr/bin/env bash
# Instala as dependências e o serviço de usuário. Depois carregue extension/ em brave://extensions.
set -euo pipefail
cd "$(dirname "$0")"
npm install --omit=dev --silent
mkdir -p ~/.config/systemd/user
sed "s#@NODE@#$(command -v node)#; s#@DIR@#$PWD#" flow-brave.service.in > ~/.config/systemd/user/flow-brave.service
systemctl --user daemon-reload
systemctl --user enable --now flow-brave.service
systemctl --user restart flow-brave.service
echo "Extensão: Modo do desenvolvedor > Carregar sem compactação > $PWD/extension"
