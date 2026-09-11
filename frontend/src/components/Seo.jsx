import { useEffect } from "react";

const SITE_URL = (import.meta.env.VITE_SITE_URL || window.location.origin).replace(/\/$/, "");

function definirMeta(seletor, atributo, valor) {
  let elemento = document.head.querySelector(seletor);
  if (!elemento) {
    elemento = document.createElement("meta");
    const [nome, conteudo] = atributo;
    elemento.setAttribute(nome, conteudo);
    document.head.appendChild(elemento);
  }
  elemento.setAttribute("content", valor);
}

export default function Seo({ titulo, descricao, caminho = "/", noindex = false }) {
  useEffect(() => {
    document.title = titulo;
    definirMeta('meta[name="description"]', ["name", "description"], descricao);
    definirMeta('meta[name="robots"]', ["name", "robots"], noindex ? "noindex,nofollow" : "index,follow");
    definirMeta('meta[property="og:title"]', ["property", "og:title"], titulo);
    definirMeta('meta[property="og:description"]', ["property", "og:description"], descricao);
    definirMeta('meta[property="og:url"]', ["property", "og:url"], `${SITE_URL}${caminho}`);

    let canonical = document.head.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = `${SITE_URL}${caminho}`;
  }, [caminho, descricao, noindex, titulo]);

  return null;
}
