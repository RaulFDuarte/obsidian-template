# obsidian-git: correções e ajustes deste vault

Plugin: Git (Vinzent03), versão 2.42.0. Arquivos em `.obsidian/plugins/obsidian-git/`, versionados no repositório (vale para desktop e celular).

## Bug: "ed is not defined" (snackbar repetindo no celular)

- **Sintoma:** no celular aparece o aviso `ed is not defined` sem parar, e o sync automático para.
- **Causa:** o `main.js` do plugin tem, na rotina de diff, `for(ed=m+2*b,...` atribuindo a uma variável `ed` que nunca é declarada. No celular o código roda em modo estrito, então vira `ReferenceError`. Já existia na 2.41.1. O gatilho é o refresh periódico da view de source control (`refreshSourceControl`).
- **Correção (patch no `main.js`):** declarar a variável.

```bash
cd .obsidian/plugins/obsidian-git
sed -i 's/for(ed=m+2\*b,/for(var ed=m+2*b,/' main.js
grep -c 'for(var ed=m+2\*b,' main.js   # deve imprimir 1
node --check main.js                    # sintaxe ok
```

- **Depois de aplicar:** deixar o sync enviar o `main.js`, e no celular fazer pull e reiniciar o Obsidian (ou desativar e reativar o plugin).
- **Quando reaplicar:** sempre que o plugin for atualizado, pois a atualização sobrescreve o `main.js`. Antes de atualizar, conferir se a versão nova já corrige. Se `grep -o 'for(ed=' main.js` não achar nada, o patch não é necessário.
- **Mitigação adicional:** `"refreshSourceControl": false` no `data.json` evita chamar a rotina de diff periodicamente.

## Configuração em `data.json`

Valores usados, por que, e como editar.

| Chave | Valor | Motivo |
|---|---|---|
| `autoSaveInterval` | `0.5` | Commit e sync 30s depois da última edição (`autoBackupAfterFileChange: true`). Fracionário só funciona editando o arquivo, a interface exige inteiro. |
| `autoPullInterval` | `0.5` | Pull a cada 30s. Valores menores gastam rede e bateria no celular. |
| `autoPullOnBoot` | `true` | Puxa ao abrir o app. |
| `pullBeforePush` | `true` | Evita push rejeitado. |
| `squashCommitsBeforePush` | `false` | Com `true`, o push falhava no celular (isomorphic-git não faz o squash). |
| `mergeStrategy` | `theirs` | Em conflito vale a versão do remoto, sem marcadores dentro da nota. A versão descartada fica no histórico. |
| `refreshSourceControl` | `false` | Menos CPU e bateria, e evita o bug acima. |

- **Não editar esses campos pela tela de configurações do plugin:** ela só aceita inteiros e pode sobrescrever os valores fracionários.
- Depois de mudar o `data.json`, desativar e reativar o plugin (ou reiniciar o Obsidian) em cada aparelho.

## `.gitignore`

```
.obsidian/workspace.json
.obsidian/workspace-mobile.json
```

Esses arquivos mudam o tempo todo e eram a causa dos conflitos e do "cannot pull with uncommitted working tree" no celular. Foram removidos do índice com `git rm --cached`.

## Se o celular travar de novo

1. Abrir a view do Git e olhar a lista "Changes". Arquivo que não deveria estar ali (workspace, por exemplo) é a causa.
2. Descartar essas mudanças (discard). Se for só layout de abas, não há perda.
3. Fazer pull. Se ainda recusar, apagar `.obsidian/workspace-mobile.json` pelo gerenciador de arquivos e repetir.
4. Se aparecer branch `conflito`, o plugin criou ao não conseguir mesclar. Voltar para a `main` depois de resolver.

## Remote no celular

O isomorphic-git do celular não suporta SSH. O remote do celular precisa ser HTTPS (`https://github.com/RaulFDuarte/flow.git`) com usuário e Personal Access Token (escopo `repo`) nas configurações do plugin. O remote do desktop (`git@github.com:RaulFDuarte/flow.git`) é configuração local de cada aparelho.
