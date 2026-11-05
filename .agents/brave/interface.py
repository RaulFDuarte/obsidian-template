#!/usr/bin/env python3
"""Aciona os botões do próprio Brave por acessibilidade (AT-SPI): a API de extensão não abre nem fecha grupos salvos.

interface.py abrir <título> | fechar <título>
Responde JSON {"ok": bool, "motivo": str}. Exige o Brave iniciado com --force-renderer-accessibility=form-controls.
Os textos são os da interface em pt-BR.
"""
import json
import os
import re
import sys
import time

import gi

gi.require_version("Atspi", "2.0")
from gi.repository import Atspi  # noqa: E402


def responder(ok, motivo=""):
    print(json.dumps({"ok": ok, "motivo": motivo}))
    sys.exit(0)


def navegador():
    """Processo principal do perfil do serviço: o Brave pode ter outras instâncias abertas."""
    perfil = os.environ.get("FLOW_BRAVE_PERFIL", "")
    perfil = perfil[: -len("/Default")] if perfil.endswith("/Default") else perfil
    mesa = Atspi.get_desktop(0)
    for i in range(mesa.get_child_count()):
        app = mesa.get_child_at_index(i)
        if not app or "brave" not in (app.get_name() or "").lower():
            continue
        try:
            cmd = open(f"/proc/{app.get_process_id()}/cmdline").read()
        except OSError:
            continue
        if f"--user-data-dir={perfil}" in cmd if perfil else "--user-data-dir" not in cmd:
            return app
    return None


def nos(o, prof=0):
    try:
        yield o
        n = o.get_child_count()
    except Exception:
        return
    if prof < 18:
        for i in range(min(n, 300)):
            c = o.get_child_at_index(i)
            if c:
                yield from nos(c, prof + 1)


def achar(app, papel, padrao):
    for o in nos(app):
        try:
            if o.get_role_name() == papel and padrao.search(o.get_name() or ""):
                return o
        except Exception:
            continue
    return None


def agir(o, acao):
    a = o.get_action_iface()
    nomes = [a.get_action_name(i) for i in range(a.get_n_actions())]
    return acao in nomes and a.do_action(nomes.index(acao))


def esperar(f, s=4):
    fim = time.time() + s
    while time.time() < fim:
        r = f()
        if r:
            return r
        time.sleep(0.25)
    return None


def visivel(o):
    return o.get_state_set().contains(Atspi.StateType.SHOWING)


def abrir(app, titulo):
    t = re.escape(titulo)
    fechado = re.compile(rf"^\s*grupo\s+{t}:\s+Fechado$")
    aberto = re.compile(rf"^\s*grupo\s+{t}:\s+Aberto$")
    cabecalho = re.compile(rf"^Grupo\s+{t}\s+–")
    abriu = lambda: achar(app, "button", aberto) or achar(app, "page tab list", cabecalho)  # noqa: E731

    if abriu():
        responder(True, "já aberto")
    # Botão que não cabe na barra aceita o comando e não faz nada; o estado "visível" não distingue isso
    # de uma barra oculta, onde ele funciona. Por isso tenta, confere e só então vai pelo menu.
    botao = achar(app, "button", fechado)
    if botao:
        agir(botao, "open")
        if esperar(abriu, 2.5):
            responder(True)
    menus = [o for o in nos(app) if o.get_role_name() == "button" and o.get_name() == "Grupos de guias"]
    menu = next((o for o in menus if visivel(o)), menus[0] if menus else None)
    if not menu:
        responder(False, "interface indisponível (Brave sem a flag de acessibilidade?)")
    agir(menu, "open")
    item = esperar(lambda: achar(app, "menu item", fechado))
    if item:
        agir(item, "select")
    else:
        agir(menu, "open")  # fecha o menu
    responder(True) if esperar(abriu) else responder(False, "o Brave não abriu o grupo")


def fechar(app, titulo):
    t = re.escape(titulo)
    cabecalho = achar(app, "page tab list", re.compile(rf"^Grupo\s+{t}\s+–"))
    if not cabecalho:
        responder(False, "cabeçalho do grupo não encontrado")
    agir(cabecalho, "showContextMenu")
    botao = esperar(lambda: achar(app, "button", re.compile(r"^Fechar grupo")))
    if not botao:
        responder(False, "botão Fechar grupo não encontrado")
    responder(bool(agir(botao, "press")))


def principal():
    if len(sys.argv) != 3 or sys.argv[1] not in ("abrir", "fechar"):
        responder(False, "uso: interface.py abrir|fechar <título>")
    app = navegador()
    if not app:
        responder(False, "Brave não encontrado na acessibilidade")
    (abrir if sys.argv[1] == "abrir" else fechar)(app, sys.argv[2])


principal()
