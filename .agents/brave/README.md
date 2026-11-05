# Flow Brave

Cada grupo de abas do Brave vira uma nota em `Prática/Tarefas/Brave/` e uma tarefa em `Projetos`. Editar qualquer lado muda o outro.

## Instalar

1. `.agents/brave/instalar.sh` (dependências e serviço de usuário systemd)
2. `brave://extensions` > Modo do desenvolvedor > Carregar sem compactação > `.agents/brave/extension`
3. `brave://settings/getStarted` > **Continuar de onde parou**. Sem isso, todo grupo fecha ao reiniciar.

Log: `journalctl --user -u flow-brave -f`. Testes: `npm test` e `npm run e2e` (abre um Brave isolado).

## Como funciona

| Você faz | Acontece |
|---|---|
| Cria ou edita grupo no Brave | Nota e tarefa criadas ou atualizadas |
| Adiciona, apaga ou reordena links na nota | Abas abrem, fecham ou se movem |
| Move a linha para outra nota | A mesma aba muda de grupo |
| Cria uma nota na pasta | Cria o grupo e a tarefa |
| Renomeia nota ou grupo, ou muda `cor:` | Replica no outro lado |
| Conclui ou cancela a tarefa | Apaga o grupo (também no Sync); a nota fica como registro |
| Reabre a tarefa | Recria o grupo |
| Clica no link da nota, no PC | Foca a aba já aberta em vez de duplicar |

Outras linhas de texto na nota são preservadas. Em `_Soltas_`, abas fixadas ficam de fora, e a seção 📱 é só leitura: mostra as abas do celular.

## Limites

- A API de extensão não enxerga grupos fechados e não consegue reabri-los sem criar outro grupo salvo. Eles são lidos do banco do Sync (formato interno do Chromium, só em cópia, nunca escrito) e a nota fica `estado: fechado`, com aviso na Caixa para abrir à mão. Edições na nota valem quando o grupo abrir. Se a leitura falhar, nada é dado como apagado.
- Grupos sem nome são ignorados até ganharem nome.
- Grupo renomeado com o PC desligado aparece como grupo novo.
- Mudanças no navegador exigem o Brave aberto no PC; as do celular chegam pelo Sync ou pelo obsidian-git.

## Segurança

- O serviço só aceita conexões da origem da extensão, porque páginas web também alcançam `localhost`.
- Mudança de nota que fecharia mais de 20 abas de uma vez é desfeita, com aviso na Caixa. Nota com marcador de conflito do git suspende a sincronização.
- Se a mesma nota mudou nos dois lados, a remoção da nota não fecha a aba.
- Estado local: `~/.local/state/flow-brave/`. É seguro apagar: a próxima sincronização une os dois lados sem fechar nada.
