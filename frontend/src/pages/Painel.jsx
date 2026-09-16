import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, Printer, RefreshCcw } from "lucide-react";
import api from "../api/axios.js";
import AtendimentoNav from "../components/AtendimentoNav.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { ACAO, PROXIMO, STATUS_PEDIDO, erroApi, podeAvancar, useOperacao } from "../utils/atendimento.js";
import { formatadorDataHora } from "../utils/formatters.js";
import "../styles/atendimento.css";

export default function Painel() {
  const { usuario } = useAuth();
  const { executar, ocupado } = useOperacao();
  const [lista, setLista] = useState({ results: [], count: 0 });
  const [status, setStatus] = useState("");
  const [pagina, setPagina] = useState(1);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [autoImpressao, setAutoImpressao] = useState(false);
  const solicitados = useRef(new Set());
  const carregar = useCallback(async () => {
    try {
      const { data } = await api.get("/atendimento/fila/", { params: { status, page: pagina } });
      setLista(data); setErro("");
    } catch (e) { setErro(erroApi(e)); }
    finally { setCarregando(false); }
  }, [status, pagina]);
  useEffect(() => {
    if (!autoImpressao) return;
    const proximo = lista.results.find(p => p.impressao?.status === "pendente" && !solicitados.current.has(p.id));
    if (!proximo) return;
    const janela = window.open(`/imprimir/atendimento/${proximo.comanda.id}?pedido=${proximo.id}&auto=1`, "cozinha-impressao");
    if (!janela) { setErro("A janela de impressão foi bloqueada. Libere pop-ups para este site."); setAutoImpressao(false); return; }
    solicitados.current.add(proximo.id);
    // Uma janela por vez; o operador confirma e retorna à fila antes da próxima.
    setAutoImpressao(false);
  }, [autoImpressao, lista]);
  useEffect(() => {
    carregar();
    const timer = setInterval(carregar, 15000);
    return () => clearInterval(timer);
  }, [carregar]);
  async function avancar(pedido) {
    try {
      await executar(`/atendimento/${pedido.comanda.id}/pedidos/${pedido.id}/status/`, {
        versao: pedido.comanda.versao, status: PROXIMO[pedido.status],
      });
      await carregar();
    } catch (e) {
      if (e.response?.status === 409) await carregar();
      setErro(erroApi(e));
    }
  }
  return <div className="service-page">
    <AtendimentoNav />
    <header className="service-heading"><h1>Fila de pedidos</h1><button className="icon-button" aria-label="Atualizar pedidos" title="Atualizar pedidos" onClick={carregar}><RefreshCcw size={18} /></button></header>
    <div className="service-filters"><label>Status do pedido<select value={status} onChange={e => { setStatus(e.target.value); setPagina(1); }}>
      <option value="">Pendentes</option>{Object.entries(STATUS_PEDIDO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
    </select></label><span>{lista.count} pedidos</span></div>
    <label className="service-check"><input type="checkbox" checked={autoImpressao} onChange={e => setAutoImpressao(e.target.checked)} />Abrir próximo pedido pendente na estação de impressão</label>
    {erro && <p role="alert" className="mensagem-erro">{erro}</p>}
    {carregando ? <p role="status">Carregando pedidos...</p> : <div className="service-queue">
      {lista.results.map(p => <article className="service-order" key={p.id}>
        <header><h2>Pedido #{p.id}</h2><span className={`order-status order-${p.status}`}>{STATUS_PEDIDO[p.status]}</span></header>
        {usuario.papel === "cozinha" && !usuario.is_superuser ? <p>Comanda #{p.comanda.id} · {p.comanda.mesa_numero ? `Mesa ${p.comanda.mesa_numero}` : p.comanda.identificacao}</p> : <Link to={`/atendimento?comanda=${p.comanda.id}`}>Comanda #{p.comanda.id} · {p.comanda.mesa_numero ? `Mesa ${p.comanda.mesa_numero}` : p.comanda.identificacao}</Link>}
        <p className="service-small">Há {Math.max(0, Math.floor((Date.now() - new Date(p.criado_em)) / 60000))} min · Impressão: {p.impressao?.status || "pendente"}</p>
        <p className="service-small">{formatadorDataHora.format(new Date(p.criado_em))} · {p.funcionario || "Registro anterior"}</p>
        {p.itens.filter(i => !i.cancelado).map(i => <div className="service-order-line" key={i.id}><div><strong>{i.quantidade} × {i.item_cardapio_nome}</strong>{i.observacoes && <p className="service-kitchen-note">{i.observacoes}</p>}</div></div>)}
        {p.status === "cancelado" && <p>{p.motivo_cancelamento}</p>}
        <div className="service-actions"><Link className="botao botao-fantasma" to={`/imprimir/atendimento/${p.comanda.id}?pedido=${p.id}`}><Printer size={16} />Imprimir pedido</Link>
          {podeAvancar(usuario, p.status) && <button className="botao botao-primario" disabled={ocupado} onClick={() => avancar(p)}>{ACAO[p.status]}</button>}
        </div>
      </article>)}
      {!lista.results.length && <p className="service-empty">Nenhum pedido nesta fila.</p>}
    </div>}
    <div className="service-pagination"><span>Página {pagina}</span><button className="icon-button" aria-label="Página anterior" title="Página anterior" disabled={!lista.previous} onClick={() => setPagina(v => v - 1)}><ChevronLeft size={18} /></button><button className="icon-button" aria-label="Próxima página" title="Próxima página" disabled={!lista.next} onClick={() => setPagina(v => v + 1)}><ChevronRight size={18} /></button></div>
  </div>;
}
