import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Printer } from "lucide-react";
import api from "../api/axios.js";
import { useAuth } from "../context/AuthContext.jsx";
import { erroApi, FORMAS, STATUS_PEDIDO } from "../utils/atendimento.js";
import { formatadorDataHora as dataHora, formatadorMoeda as moeda, STATUS_COMANDA } from "../utils/formatters.js";
import "../styles/atendimento.css";

export default function ImprimirAtendimento() {
  const { ehStaffOperacional, usuario } = useAuth();
  const { id } = useParams();
  const [params] = useSearchParams();
  const pedidoId = params.get("pedido");
  const [documento, setDocumento] = useState(null);
  const [papel, setPapel] = useState("80mm");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [confirmacao, setConfirmacao] = useState("");
  const [impressora, setImpressora] = useState("");
  const automaticoSolicitado = useRef(false);
  const operacaoEmAndamento = useRef(false);
  useEffect(() => {
    api.get(`/atendimento/${id}/impressao/`, { params: pedidoId ? { pedido: pedidoId } : {} }).then(r => {
      if (pedidoId && !r.data.pedidos.some(p => String(p.id) === pedidoId)) throw new Error("Pedido não encontrado nesta comanda.");
      setDocumento(r.data);
    }).catch(e => setErro(e.response ? erroApi(e) : e.message));
  }, [id, pedidoId]);
  useEffect(() => {
    if (!ehStaffOperacional) return;
    api.get("/atendimento/configuracao_impressao/").then(r => { setPapel(r.data.papel); setImpressora(r.data.impressora); }).catch(e => setErro(erroApi(e)));
  }, [ehStaffOperacional]);
  async function confirmar(status) {
    if (operacaoEmAndamento.current || !documento?.tentativa) return;
    operacaoEmAndamento.current = true;
    setOcupado(true);
    setErro("");
    try {
      await api.post(`/atendimento/${id}/confirmar_impressao/`, { pedido: Number(pedidoId), tentativa: documento.tentativa, status, motivo: status === "falha" ? "Falha informada pelo operador" : "" });
      setConfirmacao(status === "falha" ? "Falha registrada. Pedido preservado; reimpressão disponível." : "Impressão confirmada pelo operador.");
    } catch (e) { setErro(erroApi(e)); }
    finally { operacaoEmAndamento.current = false; setOcupado(false); }
  }
  const imprimir = useCallback(async () => {
    if (operacaoEmAndamento.current) return;
    operacaoEmAndamento.current = true;
    setOcupado(true);
    setConfirmacao("");
    setErro("");
    setDocumento(atual => atual ? { ...atual, tentativa: null } : atual);
    try {
      const { data } = await api.post(`/atendimento/${id}/impressao/`, pedidoId ? { pedido: Number(pedidoId) } : {});
      flushSync(() => { setDocumento(data); setErro(""); });
      window.print();
    } catch (e) { setErro(erroApi(e)); }
    finally { operacaoEmAndamento.current = false; setOcupado(false); }
  }, [id, pedidoId]);
  useEffect(() => {
    if (documento && params.get("auto") === "1" && ehStaffOperacional && !automaticoSolicitado.current) {
      automaticoSolicitado.current = true;
      imprimir();
    }
  }, [documento, params, ehStaffOperacional, imprimir]);
  const pedido = documento?.pedidos.find(p => String(p.id) === pedidoId);
  const itens = (pedido ? pedido.itens : documento?.itens || []).filter(i => !i.cancelado);
  return <div className="print-page service-print">
    <div className="print-toolbar"><Link className="botao botao-fantasma" to={usuario?.papel === "cozinha" ? "/painel" : `${ehStaffOperacional ? "/atendimento" : "/minhas-comandas"}?comanda=${id}`}><ArrowLeft size={17} />Voltar</Link>
      <label htmlFor="papel-impressao">Papel</label><select id="papel-impressao" value={papel} onChange={e => setPapel(e.target.value)}><option value="80mm">80 mm</option><option value="58mm">58 mm</option></select>
      <button className="botao botao-primario" disabled={!documento || ocupado} onClick={imprimir}><Printer size={17} />{pedidoId ? "Imprimir pedido" : "Imprimir comanda"}</button>
      {impressora && <span>Impressora: {impressora}</span>}
      {pedidoId && documento?.tentativa && ehStaffOperacional && <><button className="botao botao-secundario" disabled={ocupado} onClick={() => confirmar("impresso")}>Confirmar papel impresso</button><button className="botao botao-perigo" disabled={ocupado} onClick={() => confirmar("falha")}>Registrar falha</button></>}
      {confirmacao && <p role="status">{confirmacao}</p>}
    </div>
    {erro && <p className="mensagem-erro" role="alert">{erro}</p>}
    {!documento && !erro && <p role="status">Carregando impressão...</p>}
    {documento && <article className={`print-sheet paper-${papel} service-receipt ${pedido ? "kitchen-receipt" : ""}`}>
      <header><h1>{documento.estabelecimento_nome || "Pesque & Pague"}</h1>{pedido && <h2>PEDIDO #{pedido.id}</h2>}<h2>COMANDA {String(documento.id).padStart(4, "0")}</h2></header>
      <p>{documento.mesa_numero ? `Mesa ${documento.mesa_numero}` : "Balcão"}{documento.identificacao ? ` · ${documento.identificacao}` : ""}</p>
      {documento.cliente_nome && <p>Cliente: {documento.cliente_nome}</p>}
      <p>{dataHora.format(new Date(pedido ? pedido.criado_em : documento.criada_em))}</p>
      <p>Atendente: {(pedido ? pedido.funcionario : documento.funcionario) || "Não registrado"}</p>
      <p>{pedido ? STATUS_PEDIDO[pedido.status] : STATUS_COMANDA[documento.status]}</p>
      {documento.observacoes && <p>Observações: {documento.observacoes}</p>}
      {pedido ? <div className="kitchen-items">{itens.map(i => <section key={i.id}><h3>{i.quantidade} × {i.item_cardapio_nome}</h3>{i.observacoes && <p>{i.observacoes}</p>}</section>)}</div> : <>
        <table className="receipt-items"><thead><tr><th>Item / quantidade</th><th>Valor</th></tr></thead><tbody>{itens.map(i => <tr key={i.id}><td><strong>{i.item_cardapio_nome}</strong><small>{i.quantidade} × {moeda.format(i.preco_unitario)}</small>{i.observacoes && <small>{i.observacoes}</small>}</td><td>{moeda.format(i.subtotal)}</td></tr>)}</tbody></table>
        <dl className="receipt-totals"><div><dt>Subtotal</dt><dd>{moeda.format(documento.subtotal)}</dd></div><div><dt>Acréscimos</dt><dd>{moeda.format(documento.acrescimo)}</dd></div><div><dt>Desconto</dt><dd>{moeda.format(documento.desconto)}</dd></div><div className="receipt-grand"><dt>TOTAL</dt><dd>{moeda.format(documento.total)}</dd></div></dl>
        <section className="receipt-payments"><h3>Pagamento</h3>{documento.pagamentos.filter(p => p.status === "approved").map(p => <p key={p.id}>{FORMAS[p.forma]}: {moeda.format(p.valor)}</p>)}{!documento.pago && <p>PENDENTE</p>}</section>
        {documento.fechada_em && <p>Fechamento: {dataHora.format(new Date(documento.fechada_em))}<br />{documento.fechamento_funcionario || "Não registrado"}</p>}
        <footer>Obrigado pela preferência!<br />Comprovante não fiscal</footer>
      </>}
      {pedido?.status === "cancelado" && <p>PEDIDO CANCELADO: {pedido.motivo_cancelamento}</p>}
    </article>}
  </div>;
}
