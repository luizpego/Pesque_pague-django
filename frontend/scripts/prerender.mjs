import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const dist = resolve("dist");
const modelo = await readFile(resolve(dist, "index.html"), "utf8");
const siteUrl = (process.env.VITE_SITE_URL || "https://pesque-pague-web.onrender.com").replace(/\/$/, "");

const paginas = [
  {
    caminho: "/",
    titulo: "Pesque & Pague | Restaurante e pesca",
    descricao: "Conheça o restaurante, consulte o cardápio e planeje sua visita ao pesque-pague.",
    conteudo: "Restaurante e pesque-pague em um só lugar. Consulte cardápio, horários, estrutura de pesca e informações para sua visita.",
  },
  {
    caminho: "/restaurante",
    titulo: "Restaurante | Pesque & Pague",
    descricao: "Conheça o restaurante e consulte o cardápio público antes da visita.",
    conteudo: "Restaurante com pratos, porções e bebidas. Consulte preços e disponibilidade no cardápio público.",
  },
  {
    caminho: "/cardapio",
    titulo: "Cardápio | Pesque & Pague",
    descricao: "Consulte pratos, porções, bebidas, preços e disponibilidade no cardápio público.",
    conteudo: "Cardápio público do restaurante com pratos, porções, bebidas, preços e disponibilidade.",
  },
  {
    caminho: "/pesque-pague",
    titulo: "Pesque-pague | Lagos, espécies e regras",
    descricao: "Consulte horários, lagos, espécies, regras, serviços e preços do pesque-pague.",
    conteudo: "Informações para planejar a pescaria: horários, lagos, espécies, regras, serviços e preços publicados pelo estabelecimento.",
  },
  {
    caminho: "/contato",
    titulo: "Contato e localização | Pesque & Pague",
    descricao: "Confira endereço, contato e horários de funcionamento do Pesque & Pague.",
    conteudo: "Contato, localização e horários de funcionamento do restaurante e pesque-pague.",
  },
];

const rotasAplicacao = [
  "/entrar", "/cadastro", "/carrinho", "/minhas-comandas", "/painel",
  "/operacao-pesca", "/perfil", "/pagamento", "/imprimir/comanda", "/imprimir/pesca",
];

function htmlDaPagina({ caminho, titulo, descricao, conteudo, noindex = false }) {
  const canonical = `${siteUrl}${caminho}`;
  return modelo
    .replace(/<title>.*?<\/title>/, `<title>${titulo}</title>`)
    .replace(/<meta\s+name="description"[\s\S]*?\/>/, `<meta name="description" content="${descricao}" />`)
    .replace(/<meta name="robots" content="[^"]*"\s*\/>/, `<meta name="robots" content="${noindex ? "noindex,nofollow" : "index,follow"}" />`)
    .replace("</head>", `<link rel="canonical" href="${canonical}" /><meta property="og:url" content="${canonical}" /></head>`)
    .replace('<div id="root"></div>', `<div id="root"><main class="prerender-content"><h1>${titulo.split(" |")[0]}</h1><p>${conteudo}</p></main></div>`);
}

for (const pagina of paginas) {
  const pasta = pagina.caminho === "/" ? dist : resolve(dist, pagina.caminho.slice(1));
  await mkdir(pasta, { recursive: true });
  await writeFile(resolve(pasta, "index.html"), htmlDaPagina(pagina));
}

for (const caminho of rotasAplicacao) {
  const pasta = resolve(dist, caminho.slice(1));
  await mkdir(pasta, { recursive: true });
  await writeFile(resolve(pasta, "index.html"), htmlDaPagina({
    caminho,
    titulo: "Área restrita | Pesque & Pague",
    descricao: "Área autenticada do sistema Pesque & Pague.",
    conteudo: "Área restrita. Entre com uma conta autorizada para continuar.",
    noindex: true,
  }));
}

await writeFile(resolve(dist, "404.html"), htmlDaPagina({
  caminho: "/404",
  titulo: "Página não encontrada | Pesque & Pague",
  descricao: "A página solicitada não existe.",
  conteudo: "Página não encontrada. Volte ao início para continuar navegando.",
  noindex: true,
}));

await writeFile(resolve(dist, "robots.txt"), `User-agent: *\nAllow: /\nDisallow: /painel\nDisallow: /operacao-pesca\nDisallow: /carrinho\nDisallow: /minhas-comandas\nDisallow: /perfil\nDisallow: /imprimir\nSitemap: ${siteUrl}/sitemap.xml\n`);
await writeFile(resolve(dist, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paginas.map(({ caminho }) => `  <url><loc>${siteUrl}${caminho}</loc></url>`).join("\n")}\n</urlset>\n`);
