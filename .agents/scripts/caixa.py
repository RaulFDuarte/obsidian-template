#!/usr/bin/env python3
"""Mexe na estrutura da Caixa de Entrada para o flow-skill.sh (a parte determinística).

begin     guarda as capturas no frontmatter, tira o template da tela e mostra "processando"
finalize  limpa o que o agente deixou no frontmatter e mantém o template só quando ocioso
callout   <ok|fail> <texto>: grava o resultado persistente no topo da nota
rodape    arruma a ordem da nota: status · conteúdo · Original
"""
import re
import sys
from datetime import datetime

CAIXA = sys.argv[1]
SECOES = {
    "capturas_para_categorizar": "## 🗂️ Para categorizar",
}
MARCA_A, MARCA_B = "<!--flow-status-->", "<!--/flow-status-->"
# Blocos dataviewjs de versões antigas (botão e OK); a interface agora é o plugin flow-inbox.
BOTAO_RE = re.compile(r"```dataviewjs\n// flow-(?:botao|ok).*?```\n?", re.S)
STATUS_RE = re.compile(rf"{MARCA_A}.*?{MARCA_B}\n?", re.S)
ORIGINAL = re.compile(r"^> \[!note\]- Original.*\n(?:>.*\n?)*", re.M)
TIPOS = {"loading": ("info", "⏳"), "ok": ("success", "✅"), "fail": ("failure", "❌")}


def ler():
    s = open(CAIXA, encoding="utf-8").read()
    m = re.match(r"---\n(.*?)\n---\n", s, re.S)
    return (m.group(1), s[m.end():]) if m else ("", s)


def gravar(fm, corpo):
    cab = f"---\n{fm}\n---\n" if fm else ""
    open(CAIXA, "w", encoding="utf-8").write(cab + corpo)


def fase(fm):
    m = re.search(r"^processar-inbox:\s*(\S+)", fm, re.M)
    return m.group(1) if m else "idle"


def secao(corpo, titulo):
    """(início, fim, conteúdo) da seção `## título` até o próximo `## ` ou o fim."""
    m = re.search(rf"^{re.escape(titulo)}[ \t]*\n", corpo, re.M)
    if not m:
        return None
    prox = re.search(r"^(## |```dataviewjs)", corpo[m.end():], re.M)
    fim = m.end() + prox.start() if prox else len(corpo)
    return m.start(), fim, corpo[m.end():fim].strip("\n")


def tirar_chaves(fm):
    fm = re.sub(r"^status:.*\n?", "", fm, flags=re.M)  # chave antiga do wrapper
    return re.sub(r"^capturas_\w+:.*(?:\n(?: .*)?)*\n?", "", fm, flags=re.M).strip("\n")


def rodape(corpo):
    """Ordem final: status · conteúdo · Original."""
    corpo = BOTAO_RE.sub("", corpo)
    corpo = re.sub(r"^\[▶.*\n?", "", corpo, flags=re.M)  # botão antigo (links)
    corpo = re.sub(r"^(## )?💬( Nota ao agente)?[ \t]*\n+", "", corpo, flags=re.M)  # campo de nota antigo
    st = STATUS_RE.search(corpo)
    status = st.group(0).strip("\n") if st else ""
    if st:
        corpo = corpo[:st.start()] + corpo[st.end():]
    m = ORIGINAL.search(corpo)
    original = m.group(0).rstrip("\n") if m else ""
    if m:
        corpo = corpo[:m.start()] + corpo[m.end():]
    partes = [status, corpo.strip("\n"), original]
    return "\n\n".join(p for p in partes if p) + "\n"


def com_callout(corpo, tipo, texto):
    css, icone = TIPOS[tipo]
    linhas = texto.strip().splitlines() or [""]
    titulo = f"{icone} {datetime.now():%H:%M} · {linhas[0]}"
    card = [f"> [!{css}] {titulo}", *[f"> {l}".rstrip() for l in linhas[1:]]]
    bloco = "\n".join([MARCA_A, *card, MARCA_B]) + "\n"
    corpo = STATUS_RE.sub("", corpo)
    return bloco + "\n" + corpo.lstrip("\n")


def begin():
    fm, corpo = ler()
    fm = tirar_chaves(fm)
    if fase(fm) == "idle":
        achados = {}
        for chave, titulo in SECOES.items():
            s = secao(corpo, titulo)
            achados[chave] = s[2].strip() if s else ""
        if not any(achados.values()):
            gravar(fm, rodape(com_callout(corpo, "ok", "Caixa vazia, nada para processar.")))
            print("VAZIA")
            return
        for chave, titulo in SECOES.items():
            s = secao(corpo, titulo)
            if s:
                corpo = corpo[:s[0]] + corpo[s[1]:]
            if achados[chave]:
                bloco = "\n".join(("  " + l) if l else "" for l in achados[chave].splitlines())
                fm += f"\n{chave}: |-\n{bloco}"
    corpo = com_callout(corpo, "loading", "Agente processando…\nPode levar cerca de 30 s. Não edite a nota até terminar.")
    gravar(fm.strip("\n"), rodape(corpo))


def finalize():
    fm, corpo = ler()
    fm = tirar_chaves(fm)
    for titulo in SECOES.values():
        s = secao(corpo, titulo)
        if fase(fm) == "idle":
            if not s:
                corpo = corpo.rstrip("\n") + f"\n\n{titulo}\n"
        elif s and not s[2].strip():
            corpo = corpo[:s[0]] + corpo[s[1]:]
    gravar(fm, rodape(corpo))


def callout():
    fm, corpo = ler()
    gravar(fm, rodape(com_callout(corpo, sys.argv[3], sys.argv[4])))


def so_rodape():
    fm, corpo = ler()
    gravar(fm, rodape(corpo))


{"begin": begin, "finalize": finalize, "callout": callout, "rodape": so_rodape}[sys.argv[2]]()
