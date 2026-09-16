import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";

const pythonLocal = resolve("../backend/.venv/Scripts/python.exe");
const python = existsSync(pythonLocal) ? pythonLocal : (process.env.PYTHON || "python");
const pasta = await mkdtemp(join(tmpdir(), "pesque-e2e-"));
const env = { ...process.env, DEBUG: "True", DATABASE_URL: `sqlite:///${join(pasta, "pesque_e2e.sqlite3").replaceAll("\\", "/")}`,
  E2E_ISOLATED_DATABASE: "1", E2E_PASSWORD: randomBytes(24).toString("base64url"), ORDERS_FEATURE_ENABLED: "True", ONLINE_PAYMENTS_ENABLED: "False" };
const processos = [];
function iniciar(executavel, args) {
  const filho = spawn(executavel, args, { stdio: "inherit", env });
  processos.push(filho);
  return filho;
}
async function executar(executavel, args) {
  const filho = iniciar(executavel, args);
  const codigo = await new Promise((resolveExit, reject) => { filho.once("exit", resolveExit); filho.once("error", reject); });
  if (codigo !== 0) throw new Error(`Processo terminou com código ${codigo}.`);
}
async function portaLivre(porta) {
  const server = createServer();
  await new Promise((resolvePort, reject) => { server.once("error", () => reject(new Error(`Porta ${porta} ocupada. Nenhum servidor existente será reutilizado.`))); server.listen(porta, "127.0.0.1", resolvePort); });
  await new Promise(resolveClose => server.close(resolveClose));
}
async function aguardar(url) {
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok) return; } catch { /* Processo iniciando. */ }
    await new Promise(resolveDelay => setTimeout(resolveDelay, 250));
  }
  throw new Error(`Servidor não iniciou: ${url}`);
}
try {
  await portaLivre(8000);
  await portaLivre(4173);
  for (const comando of ["migrate", "seed_catalog", "prepare_e2e"]) await executar(python, [resolve("../backend/manage.py"), comando]);
  iniciar(python, [resolve("../backend/manage.py"), "runserver", "127.0.0.1:8000", "--noreload"]);
  iniciar(process.execPath, [resolve("scripts/serve-static.mjs")]);
  await aguardar("http://127.0.0.1:8000/api/cardapio/");
  await aguardar("http://127.0.0.1:4173/");
  await executar(process.execPath, [resolve("node_modules/@playwright/test/cli.js"), "test", ...process.argv.slice(2)]);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
} finally {
  for (const filho of processos) {
    if (filho.exitCode === null && filho.signalCode === null) {
      const encerrado = new Promise(resolveExit => filho.once("exit", resolveExit));
      filho.kill("SIGTERM");
      await encerrado;
    }
  }
  await rm(pasta, { recursive: true, force: true });
}
