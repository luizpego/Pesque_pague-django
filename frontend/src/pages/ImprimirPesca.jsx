import { useEffect, useState } from "react";
import { ArrowLeft, Printer } from "lucide-react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import api from "../api/axios.js";
import EstadoVazio from "../components/EstadoVazio.jsx";
import { formatadorDataHora, formatadorMoeda } from "../utils/formatters.js";

const TIPOS = {
  registro_pesca: "Registro do pesque-pague",
  comprovante_pesca: "Comprovante de pesca",
  fechamento: "Fechamento da operação",
};

export default function ImprimirPesca() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const tipo = TIPOS[params.get("tipo")] ? params.get("tipo") : "registro_pesca";
  const [registro, setRegistro] = useState(null);
  const [estabelecimento, setEstabelecimento] = useState({ nome: "Pesque & Pague" });
  const [papel, setPapel] = useState("80");
  const [estadoImpressao, setEstadoImpressao] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    Promise.all([api.get(`/registros-pesca/${id}/`), api.get("/conteudo-publico/")])
      .then(([resRegistro, resPublico]) => {
        setRegistro(resRegistro.data);
        setEstabelecimento(resPublico.data.estabelecimento || { nome: "Pesque & Pague" });
      })
      .catch(() => setErro("Não foi possível gerar este documento."))
      .finally(() => setCarregando(false));
  }, [id]);

  async function imprimir() {
    setEstadoImpressao("Registrando solicitação...");
    try {
      const { data } = await api.post(`/registros-pesca/${id}/solicitar_impressao/`, {
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
  if (erro || !registro) return <EstadoVazio titulo="Documento indisponível" descricao={erro} />;

  return (
    <div className="print-page">
      <div className="print-toolbar" role="region" aria-label="Controles de impressão">
        <Link className="botao botao-fantasma" to="/operacao-pesca">
          <ArrowLeft size={17} aria-hidden="true" />Voltar
        </Link>
        <label htmlFor="tamanho-papel-pesca">Papel</label>
        <select id="tamanho-papel-pesca" value={papel} onChange={(event) => setPapel(event.target.value)}>
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
          <p>Registro #{registro.id}</p>
        </header>

        <dl className="receipt-meta">
          <div><dt>Pescador</dt><dd>{registro.pescador_nome}</dd></div>
          {registro.telefone && <div><dt>Contato</dt><dd>{registro.telefone}</dd></div>}
          <div><dt>Lago</dt><dd>{registro.lago_nome}</dd></div>
          <div><dt>Modalidade</dt><dd>{registro.modalidade_nome}</dd></div>
          <div><dt>Entrada</dt><dd>{formatadorDataHora.format(new Date(registro.entrada_em))}</dd></div>
          {registro.saida_em && <div><dt>Saída</dt><dd>{formatadorDataHora.format(new Date(registro.saida_em))}</dd></div>}
        </dl>

        {registro.capturas.length > 0 && (
          <table className="receipt-items fishing-receipt-items">
            <thead><tr><th>Espécie</th><th>Peso</th><th>R$/kg</th><th>Total</th></tr></thead>
            <tbody>
              {registro.capturas.map((captura) => (
                <tr key={captura.id}>
                  <td>{captura.especie_nome}{captura.observacoes && <small>{captura.observacoes}</small>}</td>
                  <td>{Number(captura.peso_kg).toLocaleString("pt-BR")} kg</td>
                  <td>{formatadorMoeda.format(captura.preco_quilo)}</td>
                  <td>{formatadorMoeda.format(captura.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <dl className="receipt-totals">
          <div><dt>Peso total</dt><dd>{Number(registro.peso_total_kg).toLocaleString("pt-BR")} kg</dd></div>
          <div><dt>Entrada/diária</dt><dd>{formatadorMoeda.format(registro.valor_entrada)}</dd></div>
          <div className="grand-total"><dt>Total</dt><dd>{formatadorMoeda.format(registro.total)}</dd></div>
        </dl>
        {registro.observacoes && <p className="receipt-notes"><strong>Observações:</strong> {registro.observacoes}</p>}
        <footer className="receipt-footer">
          <p>Acerto realizado presencialmente no estabelecimento.</p>
          <small>Documento gerado pelo sistema. A confirmação da impressão depende da impressora selecionada.</small>
        </footer>
      </article>
    </div>
  );
}
