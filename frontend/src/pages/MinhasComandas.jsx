import { useEffect, useState } from "react";
import { ClipboardList, Fish, RefreshCcw } from "lucide-react";
import { Link } from "react-router-dom";
import api from "../api/axios.js";
import EstadoVazio from "../components/EstadoVazio.jsx";
import PageHeader from "../components/PageHeader.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import { formatadorDataHora, formatadorMoeda } from "../utils/formatters.js";

function Skeleton() {
  return (
    <div className="command-card" aria-hidden="true">
      <div className="skeleton skeleton-linha" style={{ width: "40%", height: "1.5rem" }} />
      <div className="skeleton skeleton-linha" style={{ width: "25%" }} />
      <div className="skeleton skeleton-linha" style={{ width: "90%" }} />
      <div className="skeleton skeleton-linha" style={{ width: "70%" }} />
    </div>
  );
}

export default function MinhasComandas() {
  const [comandas, setComandas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  async function carregar() {
    setCarregando(true);
    setErro("");
    try {
      const { data } = await api.get("/comandas/");
      setComandas(data.results ?? data);
    } catch {
      setErro("Não foi possível carregar seu histórico de comandas.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  return (
    <div className="orders-page">
      <PageHeader
        etiqueta="Histórico"
        titulo="Suas comandas"
        descricao="Acompanhe pedidos abertos, preparo, pagamento e histórico da sua visita."
        acoes={
          <button type="button" className="botao botao-fantasma" onClick={carregar} disabled={carregando}>
            <RefreshCcw size={16} aria-hidden="true" />
            Atualizar
          </button>
        }
      />

      {carregando && (
        <div className="orders-list">
          <Skeleton />
          <Skeleton />
        </div>
      )}

      {!carregando && erro && (
        <EstadoVazio
          icone={<RefreshCcw size={36} />}
          titulo="Histórico indisponível"
          descricao={erro}
          acao={<button type="button" className="botao botao-primario" onClick={carregar}>Tentar novamente</button>}
        />
      )}

      {!carregando && !erro && comandas.length === 0 && (
        <EstadoVazio
          icone={<ClipboardList size={38} />}
          titulo="Você ainda não fez nenhum pedido"
          descricao="Assim que enviar um pedido para a cozinha, ele aparece aqui."
          acao={<Link className="botao botao-primario" to="/cardapio">Ver cardápio</Link>}
        />
      )}

      {!carregando && !erro && comandas.length > 0 && (
        <div className="orders-list">
          {comandas.map((c) => (
            <article className="command-card" key={c.id}>
              <div className="command-card-head">
                <div>
                  <span className="section-kicker">Mesa {c.mesa_numero}</span>
                  <h2>Comanda #{c.id}</h2>
                  <p>{formatadorDataHora.format(new Date(c.criada_em))}</p>
                </div>
                <div className="badge-group">
                  <StatusBadge status={c.status} />
                  <StatusBadge status={c.pago ? "approved" : "pending"} tipo="pagamento" pago={c.pago} />
                </div>
              </div>

              {c.itens.length === 0 ? (
                <div className="inline-empty"><Fish size={18} aria-hidden="true" />Sem itens lançados.</div>
              ) : (
                <ul className="command-items">
                  {c.itens.map((item) => (
                    <li key={item.id}>
                      <span>{Number(item.quantidade)}x {item.item_cardapio_nome}</span>
                      <strong>{formatadorMoeda.format(item.subtotal)}</strong>
                    </li>
                  ))}
                </ul>
              )}

              <p className="total-carrinho">
                <span>Total</span>
                <strong>{formatadorMoeda.format(c.total)}</strong>
              </p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
