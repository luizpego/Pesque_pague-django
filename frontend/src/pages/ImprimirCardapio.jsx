import { useEffect, useState } from "react";
import { ArrowLeft, Printer } from "lucide-react";
import { Link } from "react-router-dom";
import api from "../api/axios.js";
import EstadoVazio from "../components/EstadoVazio.jsx";
import Seo from "../components/Seo.jsx";
import { formatadorMoeda } from "../utils/formatters.js";

const ROTULO_UNIDADE = { un: "unidade", kg: "quilo", porcao: "porção" };

export default function ImprimirCardapio() {
  const [nome, setNome] = useState("Clube Imperial");
  const [secoes, setSecoes] = useState([]);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    async function carregar() {
      try {
        const [resPublico, resCategorias] = await Promise.all([
          api.get("/conteudo-publico/"),
          api.get("/categorias/"),
        ]);
        setNome(resPublico.data.estabelecimento?.nome || "Clube Imperial");
        const categorias = resCategorias.data.results ?? resCategorias.data;
        const todas = [];
        let url = "/cardapio/?page_size=100";
        while (url) {
          const { data } = await api.get(url);
          const itens = data.results ?? data;
          todas.push(...itens);
          if (!data.next) break;
          const proxima = new URL(data.next);
          url = proxima.pathname.replace(/^\/api/, "") + proxima.search;
        }
        const ordem = new Map(categorias.map((c, i) => [c.id, i]));
        const porCategoria = new Map();
        for (const item of todas) {
          if (!porCategoria.has(item.categoria)) porCategoria.set(item.categoria, []);
          porCategoria.get(item.categoria).push(item);
        }
        const nomeCategoria = new Map(categorias.map((c) => [c.id, `${c.icone ? `${c.icone} ` : ""}${c.nome}`]));
        setSecoes(
          [...porCategoria.entries()]
            .sort(([a], [b]) => (ordem.get(a) ?? 99) - (ordem.get(b) ?? 99))
            .map(([categoriaId, itens]) => ({
              titulo: nomeCategoria.get(categoriaId) || "Cardápio",
              itens: itens.filter((i) => i.disponivel),
            }))
            .filter((s) => s.itens.length > 0)
        );
      } catch {
        setErro("Não foi possível carregar o cardápio para impressão.");
      } finally {
        setCarregando(false);
      }
    }
    carregar();
  }, []);

  if (carregando) return <div className="route-loading" role="status">Montando cardápio...</div>;
  if (erro) return <EstadoVazio titulo="Cardápio indisponível" descricao={erro} />;

  return (
    <div className="print-page">
      <Seo titulo="Cardápio para impressão | Clube Imperial" noindex />
      <div className="print-toolbar" role="region" aria-label="Controles de impressão">
        <Link className="botao botao-fantasma" to="/cardapio">
          <ArrowLeft size={17} aria-hidden="true" />Voltar ao cardápio
        </Link>
        <button type="button" className="botao botao-primario" onClick={() => window.print()}>
          <Printer size={17} aria-hidden="true" />Imprimir
        </button>
      </div>

      <article className="print-sheet paper-a4 menu-sheet">
        <header className="menu-sheet-header">
          <img src="/assets/clube-imperial-logo.png" alt="" className="menu-sheet-logo" />
          <div>
            <h1>{nome}</h1>
            <p>Cardápio</p>
          </div>
        </header>
        {secoes.map((secao) => (
          <section key={secao.titulo} className="menu-section">
            <h2>{secao.titulo}</h2>
            <ul>
              {secao.itens.map((item) => (
                <li key={item.id}>
                  <div>
                    <strong>{item.nome}</strong>
                    {item.descricao && <small>{item.descricao}</small>}
                  </div>
                  <span>
                    {formatadorMoeda.format(item.preco)}
                    <small> / {ROTULO_UNIDADE[item.unidade] || item.unidade}</small>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </article>
    </div>
  );
}
