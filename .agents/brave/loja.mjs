// Leitura do banco do Sync, única fonte para grupos fechados (a API de extensão não os expõe).
// Sempre em cópia: é formato interno do Chromium e nunca deve ser escrito.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ClassicLevel } from "classic-level";

const CORES = [undefined, "grey", "blue", "red", "yellow", "green", "pink", "purple", "cyan", "orange"];

export function pastaPerfil(env = process.env) {
  if (env.FLOW_BRAVE_PERFIL) return env.FLOW_BRAVE_PERFIL;
  const h = os.homedir();
  return [`${h}/snap/brave/current/.config/BraveSoftware/Brave-Browser/Default`, `${h}/.config/BraveSoftware/Brave-Browser/Default`]
    .find((p) => fs.existsSync(p)) ?? null;
}

function campos(b) {
  const out = [];
  let i = 0;
  const vi = () => {
    let r = 0n, s = 0n, c;
    do {
      if (i >= b.length) throw new Error("protobuf");
      c = b[i++]; r |= BigInt(c & 127) << s; s += 7n;
    } while (c & 128);
    return r;
  };
  while (i < b.length) {
    const t = vi(), f = Number(t >> 3n), w = Number(t & 7n);
    if (w === 0) out.push([f, vi()]);
    else if (w === 2) { const n = Number(vi()); out.push([f, b.subarray(i, i + n)]); i += n; }
    else if (w === 1) i += 8;
    else if (w === 5) i += 4;
    else throw new Error("protobuf");
  }
  return out;
}
const um = (cs, f) => cs.find((c) => c[0] === f)?.[1];
const texto = (v) => (v ? v.toString("utf8") : "");

export function decodificar(valor) {
  const esp = um(campos(valor), 2);
  if (!esp) return null;
  const e = campos(esp), guid = texto(um(e, 1));
  const g = um(e, 4), t = um(e, 5);
  if (g) {
    const c = campos(g);
    return { tipo: "grupo", guid, titulo: texto(um(c, 2)), cor: CORES[Number(um(c, 3) ?? 0)] ?? "" };
  }
  if (t) {
    const c = campos(t);
    return { tipo: "aba", guid, grupo: texto(um(c, 1)), posicao: Number(um(c, 2) ?? 0), url: texto(um(c, 3)), titulo: texto(um(c, 4)) };
  }
  return null;
}

/** Grupos salvos com abas, ou null se não der para ler (quem chama não pode concluir nada). */
export async function lerLoja(perfil) {
  if (!perfil) return null;
  const origem = path.join(perfil, "Sync Data", "LevelDB");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "flow-brave-"));
  try {
    for (const f of fs.readdirSync(origem)) if (f !== "LOCK") fs.copyFileSync(path.join(origem, f), path.join(tmp, f));
    const db = new ClassicLevel(tmp, { keyEncoding: "buffer", valueEncoding: "buffer", createIfMissing: false });
    const grupos = new Map(), abas = [];
    for await (const [k, v] of db.iterator()) {
      if (!k.toString("latin1").startsWith("saved_tab_group-dt-")) continue;
      const r = decodificar(v);
      if (r?.tipo === "grupo") grupos.set(r.guid, { guid: r.guid, titulo: r.titulo, cor: r.cor, itens: [] });
      else if (r?.tipo === "aba") abas.push(r);
    }
    await db.close();
    for (const a of abas.sort((x, y) => x.posicao - y.posicao)) grupos.get(a.grupo)?.itens.push({ url: a.url, titulo: a.titulo });
    return [...grupos.values()].filter((g) => g.itens.length);
  } catch (e) {
    console.error("loja ilegível:", e.message);
    return null;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
