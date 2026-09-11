import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";

const raiz = resolve("dist");
const tipos = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".xml": "application/xml; charset=utf-8",
};

async function localizar(pathname) {
  const caminhoLimpo = decodeURIComponent(pathname).replace(/^\/+/, "");
  let arquivo = resolve(raiz, caminhoLimpo);
  if (arquivo !== raiz && !arquivo.startsWith(`${raiz}${sep}`)) return null;
  if (pathname.startsWith("/imprimir/comanda/")) arquivo = resolve(raiz, "imprimir/comanda/index.html");
  if (pathname.startsWith("/imprimir/pesca/")) arquivo = resolve(raiz, "imprimir/pesca/index.html");
  try {
    const info = await stat(arquivo);
    if (info.isDirectory()) arquivo = resolve(arquivo, "index.html");
    await stat(arquivo);
    return arquivo;
  } catch {
    return null;
  }
}

const servidor = createServer(async (req, res) => {
  const pathname = new URL(req.url, "http://127.0.0.1").pathname;
  const arquivo = await localizar(pathname);
  const destino = arquivo || resolve(raiz, "404.html");
  res.statusCode = arquivo ? 200 : 404;
  res.setHeader("Content-Type", tipos[extname(destino)] || "application/octet-stream");
  res.setHeader("Cache-Control", pathname.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache");
  createReadStream(destino).pipe(res);
});

function encerrar() {
  servidor.close(() => process.exit(0));
}

process.on("SIGINT", encerrar);
process.on("SIGTERM", encerrar);

servidor.listen(4173, "127.0.0.1", () => {
  process.stdout.write("Static test server listening on http://127.0.0.1:4173\n");
});
