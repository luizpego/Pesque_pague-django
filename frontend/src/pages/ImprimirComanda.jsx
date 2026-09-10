import { useEffect, useState } from "react";
import { ArrowLeft, Printer } from "lucide-react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import api from "../api/axios.js";
import EstadoVazio from "../components/EstadoVazio.jsx";
import { formatadorDataHora, formatadorMoeda, formatarQuantidade } from "../utils/formatters.js";

const TIPOS = {
  comanda_cliente: "Comanda do cliente",
  cozinha: "Via da cozinha",
  balcao: "Via do balcão",
  resumo_mesa: "Resumo da mesa",
};

export default function ImprimirComanda() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const tipo = TIPOS[params.get("tipo")] ? params.get("tipo") : "comanda_cliente";
  const [comanda, setComanda] = useState(null);
  const [estabelecimento, setEstabelecimento] = useState({ nome: "Pesque & Pague" });
  const [papel, setPapel] = useState("80");
  const [estadoImpressao, setEstadoImpressao] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    Promise.all([api.get(`/comandas/${id}/`), api.get("/conteudo-publico/")])
      .then(([resComanda, resPublico]) => {
        setComanda(resComanda.data);
        setEstabelecimento(resPublico.data.estabelecimento || { nome: "Pesque & Pague" });
      })
      .catch(() => setErro("Não foi possível gerar este documento."))
      .finally(() => setCarregando(false));
  }, [id]);

  async function imprimir() {
    setEstadoImpressao("Registrando solicitação...");
    try {
      const { data } = await api.post(`/comandas/${id}/solicitar_impressao/`, {
        tipo_documento: tipo,
      });
      setEstadoImpressao(
        data.status === "reimpresso"
          ? `Reimpressão solicitada (${data.quantidade_solicitacoes} solicitações).`
          : "Solicitação de impressão registrada."
      );
      window.print();
    } catch {
      setEstadoImpressao("Não foi possível registrar a solicitação de impressão.");
    }
  }

  if (carregando) return <div className="route-loading" role="status">Gerando documento...</div>;
  if (erro || !comanda) return <EstadoVazio titulo="Documento indisponível" descricao={erro} />;

  const exibirValores = tipo !== "cozinha";

  return (
    <div className="print-page">
      <div className="print-toolbar" role="region" aria-label="Controles de impressão">
        <Link className="botao botao-fantasma" to={tipo === "comanda_cliente" ? "/minhas-comandas" : "/painel"}>
          <ArrowLeft size={17} aria-hidden="true" />Voltar
        </Link>
        <label htmlFor="tamanho-papel">Papel</label>
        <select id="tamanho-papel" value={papel} onChange={(event) => setPapel(event.target.value)}>
          <option value="58">Térmica 58 mm</option>
          <option value="80">Térmica 80 mm</option>
          <option value="a4">A4 / comum</option>
        </select>
        <button type="button" className="botao botao-primario" onClick={imprimir}>
          <Printer size={17} aria-hidden="true" />Imprimir
        </button>
        {estadoImpressao && <span className="print-state" role="status">{estadoImpressao}</span>}
      </div>

      <article className={`print-sheet paper-${papel}`}>
        <header className="receipt-header">
          <strong>{estabelecimento.nome || "Pesque & Pague"}</strong>
          <h1>{TIPOS[tipo]}</h1>
          <p>Comanda #{comanda.id}</p>
        </header>

        <dl className="receipt-meta">
          <div><dt>Data</dt><dd>{formatadorDataHora.format(new Date(comanda.criada_em))}</dd></div>
          <div><dt>Mesa</dt><dd>{comanda.mesa_numero}</dd></div>
          {comanda.cliente_nome && <div><dt>Cliente</dt><dd>{comanda.cliente_nome}</dd></div>}
          <div><dt>Status</dt><dd>{comanda.status.replace("_", " ")}</dd></div>
        </dl>

        <table className="receipt-items">
          <thead>
            <tr><th>Qtd.</th><th>Item</th>{exibirValores && <th>Subtotal</th>}</tr>
          </thead>
          <tbody>
            {comanda.itens.map((item) => (
              <tr key={item.id}>
                <td>{formatarQuantidade(item.quantidade)}</td>
                <td>
                  {item.item_cardapio_nome}
                  {item.observacoes && <small>Obs.: {item.observacoes}</small>}
                </td>
                {exibirValores && <td>{formatadorMoeda.format(item.subtotal)}</td>}
              </tr>
            ))}
          </tbody>
        </table>

        {comanda.observacoes && <p className="receipt-notes"><strong>Observações:</strong> {comanda.observacoes}</p>}
        {exibirValores && (
          <p className="receipt-total"><span>Total</span><strong>{formatadorMoeda.format(comanda.total)}</strong></p>
        )}
        <footer className="receipt-footer">
          <p>Pagamento realizado presencialmente.</p>
          <small>Documento gerado pelo sistema. A confirmação da impressão depende da impressora selecionada.</small>
        </footer>
      </article>
    </div>
  );
}
