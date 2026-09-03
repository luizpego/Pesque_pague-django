import { useEffect, useState } from "react";
import { CheckCircle2, Fish, RefreshCcw, Search, Table2, Utensils } from "lucide-react";
import api from "../api/axios.js";
import CardapioSkeleton from "../components/CardapioSkeleton.jsx";
import EstadoVazio from "../components/EstadoVazio.jsx";
import ItemCardapioCard from "../components/ItemCardapioCard.jsx";
import PageHeader from "../components/PageHeader.jsx";
import Spinner from "../components/Spinner.jsx";
import { useCart } from "../context/CartContext.jsx";

function CategoriaIcone({ nome }) {
  return String(nome || "").toLowerCase().includes("peixe") ? (
    <Fish size={15} aria-hidden="true" />
  ) : (
    <Utensils size={15} aria-hidden="true" />
  );
}

export default function Cardapio() {
  const { comanda, abrirComanda, adicionarItem, processando } = useCart();
  const [categorias, setCategorias] = useState([]);
  const [itens, setItens] = useState([]);
  const [mesas, setMesas] = useState([]);
  const [categoriaAtiva, setCategoriaAtiva] = useState(null);
  const [mesaEscolhida, setMesaEscolhida] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");

  async function carregarDados() {
    setCarregando(true);
    setErro("");
    Promise.all([
      api.get("/categorias/"),
      api.get("/cardapio/", { params: { disponivel: "true" } }),
      api.get("/mesas/"),
    ])
      .then(([resCategorias, resItens, resMesas]) => {
        setCategorias(resCategorias.data.results ?? resCategorias.data);
        setItens(resItens.data.results ?? resItens.data);
        setMesas((resMesas.data.results ?? resMesas.data).filter((m) => m.ativa));
      })
      .catch(() => setErro("Não foi possível carregar cardápio e mesas agora."))
      .finally(() => setCarregando(false));
  }

  useEffect(() => {
    carregarDados();
  }, []);

  const termoBusca = busca.trim().toLowerCase();
  const itensFiltrados = categoriaAtiva
    ? itens.filter((i) => i.categoria === categoriaAtiva)
    : itens;
  const itensVisiveis = termoBusca
    ? itensFiltrados.filter((item) =>
        [item.nome, item.descricao, item.categoria_nome].some((valor) =>
          String(valor || "").toLowerCase().includes(termoBusca)
        )
      )
    : itensFiltrados;

  async function selecionarMesa(e) {
    e.preventDefault();
    if (!mesaEscolhida) return;
    await abrirComanda(Number(mesaEscolhida));
  }

  return (
    <div className="catalog-page">
      <PageHeader
        etiqueta="Cardápio digital"
        titulo="Escolha com calma. A cozinha recebe tudo organizado."
        descricao="Filtre pratos, informe sua mesa e monte a comanda com quantidades e observações."
        acoes={
          <button type="button" className="botao botao-fantasma" onClick={carregarDados} disabled={carregando}>
            <RefreshCcw size={16} aria-hidden="true" />
            Atualizar
          </button>
        }
      />

      {!comanda && (
        <form onSubmit={selecionarMesa} className="mesa-panel" aria-label="Selecionar mesa">
          <div className="mesa-panel-copy">
            <span className="panel-icon"><Table2 size={20} aria-hidden="true" /></span>
            <div>
              <h2>Primeiro, escolha sua mesa</h2>
              <p>A comanda fica vinculada ao seu atendimento durante toda a visita.</p>
            </div>
          </div>
          <div className="mesa-panel-form">
            <label htmlFor="mesa">Mesa ou ponto de pesca</label>
            <select
              id="mesa"
              value={mesaEscolhida}
              onChange={(e) => setMesaEscolhida(e.target.value)}
              required
            >
              <option value="">Selecione a mesa...</option>
              {mesas.map((m) => (
                <option key={m.id} value={m.id}>
                  Mesa {m.numero} {m.localizacao ? `- ${m.localizacao}` : ""}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="botao botao-primario" disabled={processando || !mesaEscolhida}>
            {processando ? <Spinner claro rotulo="Abrindo comanda" /> : "Abrir comanda"}
          </button>
        </form>
      )}

      {comanda && (
        <div className="mensagem-sucesso order-notice" role="status">
          <CheckCircle2 size={18} aria-hidden="true" />
          <span>Comanda aberta na Mesa {comanda.mesa_numero}. Pode adicionar seus itens.</span>
        </div>
      )}

      {carregando ? (
        <CardapioSkeleton />
      ) : erro ? (
        <EstadoVazio
          icone={<RefreshCcw size={34} />}
          titulo="Não conseguimos carregar o cardápio"
          descricao={erro}
          acao={<button type="button" className="botao botao-primario" onClick={carregarDados}>Tentar novamente</button>}
        />
      ) : itens.length === 0 ? (
        <EstadoVazio
          icone={<Fish size={38} />}
          titulo="Nenhum item no cardápio ainda"
          descricao="Assim que a equipe cadastrar os pratos, eles aparecem aqui."
        />
      ) : (
        <>
          <div className="catalog-toolbar">
            <div className="search-field">
              <Search size={18} aria-hidden="true" />
              <label className="somente-leitor-de-tela" htmlFor="buscar-cardapio">Buscar no cardápio</label>
              <input
                id="buscar-cardapio"
                type="search"
                value={busca}
                placeholder="Buscar peixe, prato ou bebida"
                onChange={(event) => setBusca(event.target.value)}
              />
            </div>
            <span>{itensVisiveis.length} itens encontrados</span>
          </div>

          <div className="tabs" role="tablist" aria-label="Categorias do cardápio">
            <button type="button" role="tab" aria-selected={categoriaAtiva === null} className="tab" onClick={() => setCategoriaAtiva(null)}>
              <Utensils size={15} aria-hidden="true" />
              Todos
            </button>
            {categorias.map((c) => (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={categoriaAtiva === c.id}
                className="tab"
                onClick={() => setCategoriaAtiva(c.id)}
              >
                <CategoriaIcone nome={c.nome} />
                {c.nome}
              </button>
            ))}
          </div>

          {itensVisiveis.length === 0 ? (
            <EstadoVazio
              icone={<Search size={36} />}
              titulo="Nada encontrado"
              descricao="Ajuste a busca ou escolha outra categoria."
            />
          ) : (
            <div className="grade-cardapio" role="list">
              {itensVisiveis.map((item) => (
                <div role="listitem" key={item.id}>
                  <ItemCardapioCard item={item} aoAdicionar={adicionarItem} />
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
