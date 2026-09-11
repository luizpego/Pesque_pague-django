import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

async function executar(processo, argumentos) {
  const filho = spawn(processo, argumentos, { stdio: "inherit" });
  const codigo = await new Promise((resolveExit) => filho.on("exit", resolveExit));
  if (codigo !== 0) throw new Error(`${processo} terminou com código ${codigo}.`);
}

const pythonLocal = resolve("../backend/.venv/Scripts/python.exe");
const python = existsSync(pythonLocal) ? pythonLocal : (process.env.PYTHON || "python");
await executar(python, [resolve("../backend/manage.py"), "prepare_e2e"]);

async function apiDisponivel() {
  try {
    const resposta = await fetch("http://127.0.0.1:8000/api/cardapio/", {
      signal: AbortSignal.timeout(1000),
    });
    return resposta.status < 500;
  } catch {
    return false;
  }
}

let api = null;
if (!(await apiDisponivel())) {
  api = spawn(
    python,
    [resolve("../backend/manage.py"), "runserver", "127.0.0.1:8000", "--noreload"],
    { stdio: "inherit" }
  );
}

const servidor = spawn(process.execPath, [resolve("scripts/serve-static.mjs")], {
  stdio: "inherit",
});

async function aguardarServidor() {
  for (let tentativa = 0; tentativa < 40; tentativa += 1) {
    try {
      const resposta = await fetch("http://127.0.0.1:4173/");
      if (resposta.ok) return;
    } catch {
      // O processo ainda está iniciando.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  throw new Error("O servidor E2E não iniciou no tempo esperado.");
}

async function aguardarApi() {
  for (let tentativa = 0; tentativa < 40; tentativa += 1) {
    if (await apiDisponivel()) return;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  throw new Error("A API E2E não iniciou no tempo esperado.");
}

let codigoSaida = 1;
try {
  await aguardarApi();
  await aguardarServidor();
  try {
    await executar(process.execPath, [
      resolve("node_modules/@playwright/test/cli.js"),
      "test",
      ...process.argv.slice(2),
    ]);
    codigoSaida = 0;
  } catch {
    codigoSaida = 1;
  }
} finally {
  if (servidor.exitCode === null && servidor.signalCode === null) {
    servidor.kill("SIGTERM");
    await new Promise((resolveExit) => servidor.once("exit", resolveExit));
  }
  if (api && api.exitCode === null && api.signalCode === null) {
    api.kill("SIGTERM");
    await new Promise((resolveExit) => api.once("exit", resolveExit));
  }
}

process.exitCode = codigoSaida ?? 1;
