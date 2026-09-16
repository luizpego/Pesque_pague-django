import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, RefreshCcw, Save } from "lucide-react";
import api from "../api/axios.js";
import AtendimentoNav from "../components/AtendimentoNav.jsx";
import { erroApi, FORMAS, useOperacao } from "../utils/atendimento.js";
import { formatadorDataHora as dataHora, formatadorMoeda as moeda } from "../utils/formatters.js";
import "../styles/atendimento.css";

function Paginacao({ dados, pagina, setPagina }) {
  return <div className="service-pagination"><span>Página {pagina}</span><button className="icon-button" title="Anterior" aria-label="Página anterior" disabled={!dados.previous} onClick={() => setPagina(p => p - 1)}><ChevronLeft size={18} /></button><button className="icon-button" title="Próxima" aria-label="Próxima página" disabled={!dados.next} onClick={() => setPagina(p => p + 1)}><ChevronRight size={18} /></button></div>;
}

export function Dashboard() {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const carregar = useCallback(() => {
    api.get("/dashboard/").then(r => { setDados(r.data); setErro(""); }).catch(e => setErro(erroApi(e)));
  }, []);
  useEffect(() => { carregar(); const timer = setInterval(carregar, 15000); return () => clearInterval(timer); }, [carregar]);
  const metricas = dados ? [
    ["Vendas do dia", moeda.format(dados.vendas), "/registros"],
    ["Meta do dia", dados.meta ? moeda.format(dados.meta) : "Não definida", "/administracao?area=metas"],
    [dados.atingida ? "Meta atingida" : "Progresso da meta", dados.percentual ? `${dados.percentual}%` : "Sem meta", "/administracao?area=metas"],
    ["Mesas ocupadas", dados.mesas_ocupadas, "/mesas"], ["Mesas livres", dados.mesas_livres, "/mesas"],
    ["Pedidos novos", dados.pedidos_novos, "/painel"], ["Em preparo", dados.pedidos_preparando, "/painel"], ["Prontos", dados.pedidos_prontos, "/painel"],
    ["Estoque baixo", dados.estoque_baixo, "/estoque"], ["Sem estoque", dados.estoque_esgotado, "/estoque"],
    ["Reservas de hoje", dados.reservas, "/administracao?area=reservas"],
  ] : [];
  return <div className="service-page"><AtendimentoNav /><header className="service-heading"><h1>Visão do estabelecimento</h1><button className="icon-button" aria-label="Atualizar painel" title="Atualizar painel" onClick={carregar}><RefreshCcw size={18} /></button></header>{erro && <p role="alert">{erro}</p>}{!dados && !erro && <p role="status">Carregando indicadores...</p>}<dl className="service-metrics">{metricas.map(([nome, valor, link]) => <div key={nome}><dt><Link to={link}>{nome}</Link></dt><dd>{valor}</dd></div>)}</dl></div>;
}

export function Mesas() {
  const [mesas, setMesas] = useState([]);
  const [erro, setErro] = useState("");
  useEffect(() => {
    const carregar = () => api.get("/atendimento/opcoes/").then(r => setMesas(r.data.mesas)).catch(e => setErro(erroApi(e)));
    carregar(); const timer = setInterval(carregar, 15000); return () => clearInterval(timer);
  }, []);
  return <div className="service-page"><AtendimentoNav /><header className="service-heading"><h1>Mesas e quiosques</h1><Link to="/atendimento?nova=1" className="botao botao-primario">Abrir comanda</Link></header>{erro && <p role="alert">{erro}</p>}<div className="service-queue">{mesas.map(m => <article className="service-order" key={m.id}><header><h2>Mesa {m.numero}</h2><span className={`order-status ${m.ocupada ? "order-cancelado" : "order-pronto"}`}>{m.ocupada ? "Ocupada" : "Livre"}</span></header><p>{m.localizacao}</p><p>{m.comandas_abertas || 0} comandas abertas</p><Link to={`/atendimento?nova=1&mesa=${m.id}`} className="botao botao-fantasma">Nova comanda nesta mesa</Link></article>)}</div></div>;
}

export function Estoque() {
  const [pagina, setPagina] = useState(1);
  const [lista, setLista] = useState({ results: [] });
  const [movimentos, setMovimentos] = useState({ results: [] });
  const [paginaMov, setPaginaMov] = useState(1);
  const [selecionado, setSelecionado] = useState(null);
  const [dados, setDados] = useState({ quantidade: "0", minimo: "0", controlar: true, motivo: "" });
  const [erro, setErro] = useState("");
  const { executar, ocupado } = useOperacao();
  const carregar = useCallback(() => api.get("/estoque/", { params: { page: pagina } }).then(r => setLista(r.data)).catch(e => setErro(erroApi(e))), [pagina]);
  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => {
    api.get("/estoque/movimentos/", { params: { page: paginaMov, produto: selecionado?.id } }).then(r => setMovimentos(r.data)).catch(e => setErro(erroApi(e)));
  }, [paginaMov, selecionado, lista]);
  async function salvar(e) {
    e.preventDefault();
    try {
      const data = await executar(`/estoque/${selecionado.id}/ajustar/`, { ...dados, saldo_esperado: selecionado.estoque_atual });
      if (data) { setSelecionado(null); setErro(""); await carregar(); }
    } catch (error) { setErro(erroApi(error)); if (error.response?.status === 409) await carregar(); }
  }
  const estados = { bom: "Estoque bom", baixo: "Estoque baixo", sem_estoque: "Sem estoque", sem_controle: "Sem controle" };
  return <div className="service-page"><AtendimentoNav /><h1>Estoque</h1>{erro && <p className="mensagem-erro" role="alert">{erro}</p>}
    {selecionado && <form className="service-open-form" onSubmit={salvar}><h2>{selecionado.nome} · Saldo {selecionado.estoque_atual} {selecionado.unidade}</h2><div className="service-fields"><label>Movimentação (+ entrada / - saída)<input type="number" step="0.01" required value={dados.quantidade} onChange={e => setDados({ ...dados, quantidade: e.target.value })} /></label><label>Estoque mínimo<input type="number" min="0" step="0.01" value={dados.minimo} onChange={e => setDados({ ...dados, minimo: e.target.value })} /></label><label>Motivo<input minLength={5} maxLength={500} required value={dados.motivo} onChange={e => setDados({ ...dados, motivo: e.target.value })} /></label></div><label className="service-check"><input type="checkbox" checked={dados.controlar} onChange={e => setDados({ ...dados, controlar: e.target.checked })} />Controlar estoque</label><div className="service-actions"><button className="botao botao-primario" disabled={ocupado}><Save size={17} />Salvar movimentação</button><button type="button" className="botao botao-fantasma" onClick={() => setSelecionado(null)}>Cancelar</button></div></form>}
    <div className="service-table-wrap"><table className="service-table"><thead><tr><th>Produto</th><th>Saldo</th><th>Mínimo</th><th>Status</th><th>Ação</th></tr></thead><tbody>{lista.results.map(p => <tr key={p.id}><td>{p.nome}</td><td>{p.estoque_atual} {p.unidade}</td><td>{p.estoque_minimo}</td><td><span className={`order-status ${p.status_estoque === "bom" ? "order-pronto" : p.status_estoque === "baixo" ? "order-preparando" : "order-cancelado"}`}>{estados[p.status_estoque]}</span></td><td><button className="botao botao-fantasma" onClick={() => { setSelecionado(p); setPaginaMov(1); setDados({ quantidade: "0", minimo: p.estoque_minimo, controlar: p.controla_estoque, motivo: "" }); }}>Movimentar</button></td></tr>)}</tbody></table></div><Paginacao dados={lista} pagina={pagina} setPagina={setPagina} />
    <h2>Movimentações {selecionado ? `de ${selecionado.nome}` : "recentes"}</h2><div className="service-table-wrap"><table className="service-table"><thead><tr><th>Quando</th><th>Produto</th><th>Movimento</th><th>Saldo</th><th>Motivo / pedido</th><th>Funcionário</th></tr></thead><tbody>{movimentos.results.map(m => <tr key={m.id}><td>{dataHora.format(new Date(m.criado_em))}</td><td>{m.produto_nome}</td><td>{m.quantidade}</td><td>{m.saldo}</td><td>{m.motivo} {m.pedido ? `#${m.pedido}` : ""}</td><td>{m.funcionario}</td></tr>)}</tbody></table></div><Paginacao dados={movimentos} pagina={paginaMov} setPagina={setPaginaMov} />
  </div>;
}

export function Caixa() {
  const [lista, setLista] = useState({ results: [] });
  const [pagina, setPagina] = useState(1);
  const [selecionado, setSelecionado] = useState(null);
  const [movimentos, setMovimentos] = useState({ results: [] });
  const [paginaMov, setPaginaMov] = useState(1);
  const [valorInicial, setValorInicial] = useState("0.00");
  const [contado, setContado] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [erro, setErro] = useState("");
  const { executar, ocupado } = useOperacao();
  const carregar = useCallback(async () => {
    try { const { data } = await api.get("/caixa/", { params: { page: pagina } }); setLista(data); }
    catch (e) { setErro(erroApi(e)); }
  }, [pagina]);
  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => {
    if (selecionado) api.get(`/caixa/${selecionado.id}/movimentos/`, { params: { page: paginaMov } }).then(r => setMovimentos(r.data)).catch(e => setErro(erroApi(e)));
  }, [selecionado, paginaMov]);
  const ativo = lista.results.find(c => !c.fechada_em);
  async function operar(url, data) {
    try { const c = await executar(url, data); if (c) { setSelecionado(c); setErro(""); await carregar(); } }
    catch (e) { setErro(erroApi(e)); }
  }
  return <div className="service-page"><AtendimentoNav /><header className="service-heading"><h1>Caixa</h1><Link to="/atendimento" className="botao botao-primario">Contas para receber</Link></header>{erro && <p className="mensagem-erro" role="alert">{erro}</p>}
    {!ativo && pagina === 1 && <form className="service-open-form" onSubmit={e => { e.preventDefault(); operar("/caixa/abrir/", { valor_inicial: valorInicial }); }}><div className="service-fields"><label>Troco inicial (R$)<input type="number" step="0.01" min="0" required value={valorInicial} onChange={e => setValorInicial(e.target.value)} /></label><button className="botao botao-primario" disabled={ocupado}>Abrir caixa</button></div></form>}
    <div className="service-table-wrap"><table className="service-table"><thead><tr><th>Caixa</th><th>Abertura</th><th>Responsável</th><th>Recebido</th><th>Status</th></tr></thead><tbody>{lista.results.map(c => <tr key={c.id}><td><button className="botao botao-fantasma" onClick={() => { setSelecionado(c); setPaginaMov(1); }}>#{c.id}</button></td><td>{dataHora.format(new Date(c.aberta_em))}</td><td>{c.aberta_por_nome}</td><td>{moeda.format(c.resumo.total_recebido)}</td><td>{c.fechada_em ? "Fechado" : "Aberto"}</td></tr>)}</tbody></table></div><Paginacao dados={lista} pagina={pagina} setPagina={setPagina} />
    {selecionado && <section className="service-checkout"><h2>Caixa #{selecionado.id}</h2><dl className="service-totals">{Object.entries(selecionado.resumo.formas).map(([k, v]) => <div key={k}><dt>{FORMAS[k]}</dt><dd>{moeda.format(v)}</dd></div>)}<div><dt>Dinheiro esperado, com troco</dt><dd>{moeda.format(selecionado.resumo.dinheiro_esperado)}</dd></div>{selecionado.fechada_em && <div><dt>Diferença da conferência</dt><dd>{moeda.format(selecionado.resumo.diferenca)}</dd></div>}</dl>
      {!selecionado.fechada_em && <form onSubmit={e => { e.preventDefault(); operar(`/caixa/${selecionado.id}/fechar/`, { dinheiro_contado: contado, observacoes }); }}><div className="service-fields"><label>Dinheiro contado (R$)<input type="number" min="0" step="0.01" required value={contado} onChange={e => setContado(e.target.value)} /></label><label>Observações<input maxLength={500} value={observacoes} onChange={e => setObservacoes(e.target.value)} /></label></div><button className="botao botao-primario" disabled={ocupado}>Conferir e fechar caixa</button></form>}
      <h2>Recebimentos</h2>{movimentos.results.map(m => <div className="service-order-line" key={m.id}><Link to={`/historico?comanda=${m.comanda}`}>Comanda #{m.comanda}</Link><span>{FORMAS[m.forma]} · {moeda.format(m.valor)}</span><small>{dataHora.format(new Date(m.criado_em))} · {m.funcionario}</small></div>)}<Paginacao dados={movimentos} pagina={paginaMov} setPagina={setPaginaMov} />
    </section>}
  </div>;
}
