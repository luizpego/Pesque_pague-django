import { useEffect, useState } from "react";
import { RefreshCcw } from "lucide-react";
import api from "../api/axios.js";
import AtendimentoNav from "../components/AtendimentoNav.jsx";
import { erroApi, FORMAS } from "../utils/atendimento.js";
import { formatadorMoeda as moeda, STATUS_COMANDA } from "../utils/formatters.js";
import "../styles/atendimento.css";

export default function Registros() {
  const [filtros, setFiltros] = useState({ periodo: "hoje", inicio: "", fim: "", funcionario: "", produto: "", status: "", forma: "" });
  const [opcoes, setOpcoes] = useState({ funcionarios: [], produtos: [] });
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [revisao, setRevisao] = useState(0);
  useEffect(() => { api.get("/atendimento/opcoes/").then(r => setOpcoes(r.data)).catch(e => setErro(erroApi(e))); }, []);
  useEffect(() => {
    if (filtros.periodo === "personalizado" && (!filtros.inicio || !filtros.fim)) { setDados(null); setCarregando(false); return; }
    const controller = new AbortController();
    setCarregando(true);
    api.get("/atendimento/relatorio/", { params: Object.fromEntries(Object.entries(filtros).filter(([, v]) => v)), signal: controller.signal })
      .then(r => { setDados(r.data); setErro(""); })
      .catch(e => { if (e.code !== "ERR_CANCELED") { setErro(erroApi(e)); setDados(null); } })
      .finally(() => { if (!controller.signal.aborted) setCarregando(false); });
    return () => controller.abort();
  }, [filtros, revisao]);
  const alterar = (campo, valor) => setFiltros(atual => ({ ...atual, [campo]: valor }));
  const metricas = dados ? [
    ["Comandas em aberto", dados.comandas_abertas], ["Comandas pagas e fechadas", dados.comandas_fechadas],
    ["Pedidos registrados", dados.quantidade_pedidos], ["Quantidade vendida", dados.itens_vendidos],
    ["Faturamento", moeda.format(dados.faturamento)], ["Ticket médio", moeda.format(dados.ticket_medio)],
    ["Pedidos cancelados", dados.pedidos_cancelados],
  ] : [];
  return <div className="service-page">
    <AtendimentoNav />
    <header className="service-heading"><h1>Registros de vendas</h1><button className="icon-button" title="Atualizar registros" aria-label="Atualizar registros" onClick={() => setRevisao(v => v + 1)}><RefreshCcw size={18} /></button></header>
    <div className="service-filters">
      <label>Período<select value={filtros.periodo} onChange={e => alterar("periodo", e.target.value)}><option value="hoje">Hoje</option><option value="ontem">Ontem</option><option value="semana">Semana</option><option value="mes">Mês</option><option value="personalizado">Personalizado</option></select></label>
      <label>Pagamento<select value={filtros.forma} onChange={e => alterar("forma", e.target.value)}><option value="">Todos</option>{Object.entries(FORMAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      {filtros.periodo === "personalizado" && <><label>De<input type="date" value={filtros.inicio} onChange={e => alterar("inicio", e.target.value)} /></label><label>Até<input type="date" value={filtros.fim} onChange={e => alterar("fim", e.target.value)} /></label></>}
      <label>Funcionário<select value={filtros.funcionario} onChange={e => alterar("funcionario", e.target.value)}><option value="">Todos</option>{opcoes.funcionarios.map(f => <option key={f.id} value={f.id}>{f.username}</option>)}</select></label>
      <label>Produto<select value={filtros.produto} onChange={e => alterar("produto", e.target.value)}><option value="">Todos</option>{(opcoes.todos_produtos || opcoes.produtos).map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></label>
      <label>Status<select value={filtros.status} onChange={e => alterar("status", e.target.value)}><option value="">Todos</option>{Object.entries(STATUS_COMANDA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
    </div>
    {erro && <p role="alert" className="mensagem-erro">{erro}</p>}
    {carregando ? <p role="status">Consultando registros...</p> : dados && <>
      <dl className="service-metrics">{metricas.map(([nome, valor]) => <div key={nome}><dt>{nome}</dt><dd>{valor}</dd></div>)}</dl>
      <section className="service-ranking"><h2>Produtos mais vendidos</h2><div className="service-table-wrap"><table className="service-table"><thead><tr><th>Produto</th><th>Quantidade</th><th>Valor bruto</th></tr></thead><tbody>{dados.produtos.map((p, i) => <tr key={`${p.id}-${i}`}><td>{p.nome}</td><td>{p.quantidade}</td><td>{moeda.format(p.valor_bruto)}</td></tr>)}</tbody></table></div>{!dados.produtos.length && <p>Nenhuma venda paga no período.</p>}</section>
      <p className="service-small">{dados.criterio}</p>
      <h2>Recebido por forma de pagamento</h2><dl className="service-totals">{Object.entries(dados.por_forma || {}).map(([k, v]) => <div key={k}><dt>{FORMAS[k]}</dt><dd>{moeda.format(v)}</dd></div>)}</dl>
      <h2>Menos vendidos no período</h2>{dados.menos_vendidos?.map(p => <p key={`${p.id}-${p.nome}`}>{p.nome}: {p.quantidade}</p>)}
      <h2>Produtos sem vendas no período</h2>{dados.sem_vendas?.map(p => <p key={p.id}>{p.nome}</p>)}
    </>}
  </div>;
}
