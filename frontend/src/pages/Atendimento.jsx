import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, ChevronLeft, ChevronRight, Plus, Printer, RefreshCcw, Search, X } from "lucide-react";
import api from "../api/axios.js";
import AtendimentoNav from "../components/AtendimentoNav.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import QuantitySelector from "../components/QuantitySelector.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useToast } from "../context/ToastContext.jsx";
import { formatadorDataHora as dataHora, formatadorMoeda as moeda, STATUS_COMANDA } from "../utils/formatters.js";
import { ACAO, FORMAS, PROXIMO, STATUS_PEDIDO, erroApi, podeAvancar, useOperacao } from "../utils/atendimento.js";
import "../styles/atendimento.css";

function CamposFiltro({ filtros, setFiltros, opcoes }) {
  return <div className="service-filters">
    <label>Buscar comanda ou cliente<div className="service-search"><Search size={17} /><input type="search" value={filtros.busca} onChange={e => setFiltros({ ...filtros, busca: e.target.value })} /></div></label>
    <label>Status<select value={filtros.status} onChange={e => setFiltros({ ...filtros, status: e.target.value })}>
      <option value="ativas">Em aberto</option><option value="todas">Todos</option>
      {Object.entries(STATUS_COMANDA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
    </select></label>
    <label>De<input type="date" value={filtros.inicio} onChange={e => setFiltros({ ...filtros, inicio: e.target.value })} /></label>
    <label>Até<input type="date" value={filtros.fim} onChange={e => setFiltros({ ...filtros, fim: e.target.value })} /></label>
    <label>Funcionário<select value={filtros.funcionario} onChange={e => setFiltros({ ...filtros, funcionario: e.target.value })}>
      <option value="">Todos</option>{opcoes.funcionarios.map(f => <option key={f.id} value={f.id}>{f.username}</option>)}
    </select></label>
  </div>;
}

function NovoPedido({ produtos, comanda, enviar, ocupado }) {
  const [busca, setBusca] = useState("");
  const [itens, setItens] = useState([]);
  const visiveis = produtos.filter(p => p.nome.toLocaleLowerCase().includes(busca.toLocaleLowerCase()));
  function adicionar(produto) {
    setItens(atual => [...atual, { key: crypto.randomUUID(), produto, quantidade: 1, observacoes: "" }]);
  }
  function alterar(key, campo, valor) {
    setItens(atual => atual.map(i => i.key === key ? { ...i, [campo]: valor } : i));
  }
  async function salvar(e) {
    e.preventDefault();
    const ok = await enviar(`/atendimento/${comanda.id}/pedidos/`, {
      versao: comanda.versao,
      itens: itens.map(i => ({ item_cardapio: i.produto.id, quantidade: String(i.quantidade), observacoes: i.observacoes })),
    });
    if (ok) setItens([]);
  }
  return <section className="service-new-order" aria-label="Novo pedido">
    <h2>Novo pedido</h2>
    <label className="service-search"><Search size={18} /><input aria-label="Buscar produto" type="search" placeholder="Buscar produto" value={busca} onChange={e => setBusca(e.target.value)} /></label>
    <div className="service-products">
      {visiveis.map(p => <button type="button" key={p.id} onClick={() => adicionar(p)} disabled={ocupado}>
        <span>{p.nome}<small>{moeda.format(p.preco)} / {p.unidade}</small></span><Plus size={18} />
      </button>)}
      {!visiveis.length && <p>Nenhum produto disponível.</p>}
    </div>
    {itens.length > 0 && <form onSubmit={salvar} className="service-draft">
      {itens.map(i => <div className="service-draft-line" key={i.key}>
        <strong>{i.produto.nome}</strong>
        <QuantitySelector value={i.quantidade} min={0.01} max={100} step={i.produto.unidade === "kg" ? 0.01 : 1} onChange={v => alterar(i.key, "quantidade", v)} label={`Quantidade de ${i.produto.nome}`} />
        <button type="button" className="icon-button" aria-label={`Retirar ${i.produto.nome} do pedido`} title="Retirar" onClick={() => setItens(atual => atual.filter(a => a.key !== i.key))}><X size={18} /></button>
        <input aria-label={`Observações de ${i.produto.nome}`} placeholder="Observações" maxLength={200} value={i.observacoes} onChange={e => alterar(i.key, "observacoes", e.target.value)} />
      </div>)}
      <button className="botao botao-primario" disabled={ocupado}>{ocupado ? "Registrando..." : "Registrar pedido"}</button>
    </form>}
  </section>;
}

function Caixa({ comanda, enviar, ocupado }) {
  const [desconto, setDesconto] = useState("0.00");
  const [acrescimo, setAcrescimo] = useState("0.00");
  const [previa, setPrevia] = useState(null);
  const [erro, setErro] = useState("");
  const [calculando, setCalculando] = useState(false);
  const [parcelas, setParcelas] = useState([{ forma: "dinheiro", valor: "" }]);
  useEffect(() => {
    const controller = new AbortController();
    setPrevia(null);
    setCalculando(true);
    const timer = setTimeout(() => {
      api.post(`/atendimento/${comanda.id}/previa_fechamento/`, { versao: comanda.versao, desconto, acrescimo },
        { signal: controller.signal })
        .then(({ data }) => { setPrevia(data); setErro(""); })
        .catch(e => { if (e.code !== "ERR_CANCELED") setErro(erroApi(e)); })
        .finally(() => { if (!controller.signal.aborted) setCalculando(false); });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [comanda.id, comanda.versao, desconto, acrescimo]);
  async function fechar(e) {
    e.preventDefault();
    if (!previa) return;
    await enviar(`/atendimento/${comanda.id}/fechar/`, {
      versao: comanda.versao, desconto, acrescimo,
      pagamentos: Number(previa.restante) === 0 ? [] : parcelas,
    });
  }
  return <form className="service-checkout" onSubmit={fechar}>
    <h2>Fechamento de caixa</h2>
    <div className="service-fields">
      <label>Desconto (R$)<input type="number" min="0" step="0.01" required value={desconto} onChange={e => setDesconto(e.target.value)} /></label>
      <label>Acréscimo (R$)<input type="number" min="0" step="0.01" required value={acrescimo} onChange={e => setAcrescimo(e.target.value)} /></label>
    </div>
    {calculando && <p role="status">Calculando fechamento...</p>}
    {erro && <p role="alert" className="mensagem-erro">{erro}</p>}
    {previa && <dl className="service-totals">
      <div><dt>Subtotal</dt><dd>{moeda.format(previa.subtotal)}</dd></div>
      <div><dt>Total final</dt><dd>{moeda.format(previa.total)}</dd></div>
      <div><dt>Já recebido</dt><dd>{moeda.format(previa.recebido)}</dd></div>
      <div><dt>A receber</dt><dd>{moeda.format(previa.restante)}</dd></div>
    </dl>}
    {previa && Number(previa.restante) > 0 && <>
      {parcelas.map((p, index) => <div className="service-payment" key={index}>
        <label>Forma {index + 1}<select value={p.forma} onChange={e => setParcelas(atual => atual.map((a, i) => i === index ? { ...a, forma: e.target.value } : a))}>
          {Object.entries(FORMAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select></label>
        <label>Valor {index + 1} (R$)<input type="number" step="0.01" min="0.01" required value={p.valor} onChange={e => setParcelas(atual => atual.map((a, i) => i === index ? { ...a, valor: e.target.value } : a))} /></label>
        <button type="button" title="Remover pagamento" aria-label={`Remover pagamento ${index + 1}`} className="icon-button" disabled={parcelas.length === 1} onClick={() => setParcelas(atual => atual.filter((_, i) => i !== index))}><X size={18} /></button>
      </div>)}
      <div className="service-actions">
        <button type="button" className="botao botao-fantasma" onClick={() => setParcelas([{ forma: parcelas[0].forma, valor: previa.restante }])}>Valor integral</button>
        <button type="button" className="botao botao-fantasma" disabled={parcelas.length >= 10} onClick={() => setParcelas(atual => [...atual, { forma: "pix", valor: "" }])}><Plus size={16} />Dividir pagamento</button>
      </div>
    </>}
    <button className="botao botao-primario" disabled={!previa || ocupado || calculando}>Registrar pagamento e fechar</button>
  </form>;
}

function Divisao({ comanda }) {
  const [pessoas, setPessoas] = useState(2);
  const [divisao, setDivisao] = useState(null);
  const [erro, setErro] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    api.get(`/atendimento/${comanda.id}/dividir/`, { params: { pessoas }, signal: controller.signal }).then(r => { setDivisao(r.data); setErro(""); }).catch(e => { if (e.code !== "ERR_CANCELED") setErro(erroApi(e)); });
    return () => controller.abort();
  }, [pessoas, comanda.id, comanda.versao]);
  return <details><summary>Dividir conta</summary><label>Pessoas<input type="number" min="1" max="50" value={pessoas} onChange={e => setPessoas(e.target.value)} /></label>{erro && <p role="alert">{erro}</p>}{divisao?.partes.map((valor, i) => <p key={i}>Pessoa {i + 1}: {moeda.format(valor)}</p>)}</details>;
}

function Detalhe({ id, opcoes, atualizarLista }) {
  const { usuario, ehGerente } = useAuth();
  const toast = useToast();
  const { executar, ocupado } = useOperacao();
  const [comanda, setComanda] = useState(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [cancelamento, setCancelamento] = useState(null);
  const [motivo, setMotivo] = useState("");
  const [edicao, setEdicao] = useState(null);
  const [caixa, setCaixa] = useState(false);
  const [convite, setConvite] = useState("");
  const cliente = usuario.papel === "cliente" && !ehGerente;
  const carregar = useCallback(async () => {
    try { const { data } = await api.get(`/atendimento/${id}/`); setComanda(data); setErro(""); }
    catch (e) { setErro(erroApi(e)); }
    finally { setCarregando(false); }
  }, [id]);
  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => {
    if (ocupado || edicao || cancelamento || caixa) return;
    const timer = setInterval(carregar, 15000);
    return () => clearInterval(timer);
  }, [carregar, ocupado, edicao, cancelamento, caixa]);
  async function enviar(url, dados, metodo = "post") {
    try {
      const data = await executar(url, dados, metodo);
      if (!data) return false;
      setComanda(data);
      setErro("");
      atualizarLista();
      return true;
    } catch (e) {
      setErro(erroApi(e));
      if (e.response?.status === 409) { await carregar(); toast.info("Comanda atualizada. Confira os dados antes de tentar novamente."); }
      return false;
    }
  }
  if (carregando) return <p role="status">Carregando comanda...</p>;
  if (!comanda) return <p role="alert">{erro}</p>;
  const encerrada = ["fechada", "cancelada"].includes(comanda.status);
  const atende = ehGerente || usuario.papel === "garcom" || cliente;
  const podeCaixa = ehGerente || usuario.papel === "caixa";
  const pendentes = comanda.pedidos.some(p => !["entregue", "cancelado"].includes(p.status));
  const rascunhos = comanda.itens.filter(i => !i.pedido && !i.cancelado);
  return <div className="service-detail">
    <header className="service-detail-head">
      <div><h1>Comanda #{comanda.id}</h1><p>{comanda.mesa_numero ? `Mesa ${comanda.mesa_numero}` : "Balcão"} · {comanda.identificacao || comanda.cliente_nome || "Sem identificação"}</p></div>
      <StatusBadge status={comanda.status} />
      <button className="icon-button" title="Atualizar comanda" aria-label="Atualizar comanda" disabled={ocupado} onClick={carregar}><RefreshCcw size={18} /></button>
    </header>
    <div className="service-meta"><span>Abertura: {dataHora.format(new Date(comanda.criada_em))}</span><span>Responsável: {comanda.funcionario || "Registro anterior"}</span></div>
    <div className="service-actions">
      <Link className="botao botao-fantasma" to={`/imprimir/atendimento/${id}`}><Printer size={16} />Imprimir comanda</Link>
      {!encerrada && atende && !cliente && !comanda.pago && <button className="botao botao-perigo" disabled={ocupado} onClick={() => setCancelamento({ url: `/atendimento/${id}/cancelar/`, titulo: "Cancelar comanda" })}>Cancelar comanda</button>}
      {!encerrada && atende && !cliente && !comanda.cliente_nome && <button className="botao botao-fantasma" onClick={async () => {
        try { const { data } = await api.post(`/atendimento/${id}/convite/`); setConvite(`${window.location.origin}/minhas-comandas?vinculo=${data.token}`); }
        catch (e) { setErro(erroApi(e)); }
      }}>Gerar acesso para cliente</button>}
      {!encerrada && !pendentes && !rascunhos.length && (atende || podeCaixa) && comanda.status !== "aguardando_pagamento" && <button className="botao botao-secundario" disabled={ocupado} onClick={() => enviar(`/atendimento/${id}/aguardar_pagamento/`, { versao: comanda.versao })}>Encaminhar ao caixa</button>}
      {!encerrada && podeCaixa && <button className="botao botao-primario" disabled={ocupado || pendentes || rascunhos.length > 0} onClick={() => setCaixa(v => !v)}>Fechar comanda</button>}
    </div>
    {erro && <p role="alert" className="mensagem-erro">{erro}</p>}
    {convite && <p className="service-invite">Link privado do cliente: <a href={convite}>{convite}</a></p>}
    {rascunhos.length > 0 && <section className="service-new-order" aria-label="Carrinho pendente">
      <h2>Carrinho pendente</h2>
      {rascunhos.map(i => <div className="service-order-line" key={i.id}>
        <div><strong>{i.quantidade} × {i.item_cardapio_nome}</strong><p>{i.observacoes}</p></div><strong>{moeda.format(i.subtotal)}</strong>
        {!encerrada && atende && !comanda.pago && comanda.status !== "aguardando_pagamento" && <div className="service-actions">
          <button className="botao botao-fantasma botao-compacto" disabled={ocupado} onClick={() => setEdicao({ ...i })}>Editar item</button>
          <button className="botao botao-fantasma botao-compacto" disabled={ocupado} onClick={() => setCancelamento({ url: `/atendimento/${id}/itens/${i.id}/cancelar/`, titulo: `Cancelar ${i.item_cardapio_nome}` })}>Cancelar item</button>
        </div>}
      </div>)}
      {!encerrada && atende && !comanda.pago && comanda.status !== "aguardando_pagamento" && <button className="botao botao-primario" disabled={ocupado} onClick={() => enviar(`/atendimento/${id}/enviar_carrinho/`, { versao: comanda.versao })}>Enviar carrinho à cozinha</button>}
    </section>}
    <div className="service-detail-columns">
      <section className="service-orders" aria-label="Pedidos da comanda">
        <h2>Pedidos ({comanda.pedidos.length})</h2>
        {!comanda.pedidos.length && <p>Nenhum pedido registrado.</p>}
        {comanda.pedidos.map(p => <article className={`service-order ${p.status === "cancelado" ? "is-cancelled" : ""}`} key={p.id}>
          <header><strong>Pedido #{p.id}</strong><span className={`order-status order-${p.status}`}>{STATUS_PEDIDO[p.status]}</span></header>
          <p className="service-small">{dataHora.format(new Date(p.criado_em))} · {p.funcionario || "Registro anterior"}</p>
          {p.itens.map(i => <div key={i.id} className={`service-order-line ${i.cancelado ? "is-cancelled" : ""}`}>
            <div><strong>{i.quantidade} × {i.item_cardapio_nome}</strong><p>{i.observacoes}</p><small>{moeda.format(i.preco_unitario)} cada</small>{i.cancelado && <p>Cancelado: {i.motivo_cancelamento}</p>}</div>
            <strong>{moeda.format(i.subtotal)}</strong>
            {!encerrada && atende && (!cliente || p.status === "recebido") && !i.cancelado && !comanda.pago && comanda.status !== "aguardando_pagamento" && <div className="service-actions">
              {p.status === "recebido" && <button className="botao botao-fantasma botao-compacto" disabled={ocupado} onClick={() => setEdicao({ ...i })}>Editar item</button>}
              <button className="botao botao-fantasma botao-compacto" disabled={ocupado} onClick={() => setCancelamento({ url: `/atendimento/${id}/itens/${i.id}/cancelar/`, titulo: `Cancelar ${i.item_cardapio_nome}` })}>Cancelar item</button>
            </div>}
          </div>)}
          <div className="service-actions">
            {!cliente && <Link className="botao botao-fantasma botao-compacto" to={`/imprimir/atendimento/${id}?pedido=${p.id}`}><Printer size={16} />Imprimir pedido</Link>}
            {!encerrada && podeAvancar(usuario, p.status) && <button className="botao botao-secundario" disabled={ocupado} onClick={() => enviar(`/atendimento/${id}/pedidos/${p.id}/status/`, { versao: comanda.versao, status: PROXIMO[p.status] })}>{ACAO[p.status]}</button>}
            {!encerrada && atende && (!cliente || p.status === "recebido") && p.status !== "cancelado" && !comanda.pago && comanda.status !== "aguardando_pagamento" && <button className="botao botao-fantasma" disabled={ocupado} onClick={() => setCancelamento({ url: `/atendimento/${id}/pedidos/${p.id}/status/`, titulo: `Cancelar pedido #${p.id}`, pedido: true })}>Cancelar pedido</button>}
          </div>
        </article>)}
      </section>
      <aside className="service-summary">
        <h2>Consumo</h2>
        {!encerrada && <Divisao comanda={comanda} />}
        <dl className="service-totals"><div><dt>Subtotal</dt><dd>{moeda.format(comanda.subtotal)}</dd></div><div><dt>Acréscimos</dt><dd>{moeda.format(comanda.acrescimo)}</dd></div><div><dt>Descontos</dt><dd>{moeda.format(comanda.desconto)}</dd></div><div className="service-grand-total"><dt>Total</dt><dd data-testid="comanda-total">{moeda.format(comanda.total)}</dd></div></dl>
        {comanda.pagamentos.filter(p => p.status === "approved").map(p => <p key={p.id}>{FORMAS[p.forma]}: {moeda.format(p.valor)}</p>)}
        {comanda.fechada_em && <p>Fechada em {dataHora.format(new Date(comanda.fechada_em))} por {comanda.fechamento_funcionario || "Registro anterior"}</p>}
      </aside>
    </div>
    {!encerrada && !caixa && atende && !comanda.pago && comanda.status !== "aguardando_pagamento" && <NovoPedido comanda={comanda} produtos={opcoes.produtos} enviar={enviar} ocupado={ocupado} />}
    {!encerrada && caixa && podeCaixa && <Caixa comanda={comanda} enviar={enviar} ocupado={ocupado} />}
    {!cliente && <details className="service-audit"><summary>Histórico de alterações ({comanda.eventos.length})</summary>
      {comanda.eventos.map(e => <div key={e.id}><strong>{e.acao.replaceAll("_", " ")}</strong><small>{dataHora.format(new Date(e.criado_em))} · {e.usuario_nome || "Sistema"}</small><pre>{JSON.stringify(e.dados, null, 2)}</pre></div>)}
    </details>}
    <ConfirmDialog aberto={Boolean(cancelamento)} titulo={cancelamento?.titulo} descricao="O cancelamento ficará registrado no histórico." perigoso carregando={ocupado} confirmarTexto="Confirmar cancelamento" onCancelar={() => { setCancelamento(null); setMotivo(""); }} onConfirmar={async () => {
      if (motivo.trim().length < 5) { setErro("Informe um motivo com pelo menos 5 caracteres."); return; }
      if (await enviar(cancelamento.url, { versao: comanda.versao, motivo, ...(cancelamento.pedido ? { status: "cancelado" } : {}) })) { setCancelamento(null); setMotivo(""); }
    }}><label className="service-label">Motivo<textarea minLength={5} maxLength={500} value={motivo} onChange={e => setMotivo(e.target.value)} /></label>{erro && <p role="alert">{erro}</p>}</ConfirmDialog>
    <ConfirmDialog aberto={Boolean(edicao)} titulo="Editar item" carregando={ocupado} confirmarTexto="Salvar item" onCancelar={() => setEdicao(null)} onConfirmar={async () => {
      if (await enviar(`/atendimento/${id}/itens/${edicao.id}/`, { versao: comanda.versao, quantidade: String(edicao.quantidade), observacoes: edicao.observacoes }, "patch")) setEdicao(null);
    }}>{edicao && <div className="service-fields"><label>Quantidade<input type="number" min="0.01" max="100" step="0.01" value={edicao.quantidade} onChange={e => setEdicao({ ...edicao, quantidade: e.target.value })} /></label><label>Observações<input maxLength={200} value={edicao.observacoes} onChange={e => setEdicao({ ...edicao, observacoes: e.target.value })} /></label></div>}{erro && <p role="alert">{erro}</p>}</ConfirmDialog>
  </div>;
}

export default function Atendimento({ historico = false }) {
  const { usuario, ehGerente } = useAuth();
  const cliente = usuario.papel === "cliente" && !ehGerente;
  const [params, setParams] = useSearchParams();
  const id = params.get("comanda");
  const [filtros, setFiltros] = useState({ busca: "", status: historico ? "todas" : "ativas", inicio: "", fim: "", funcionario: "" });
  const [pagina, setPagina] = useState(1);
  const [lista, setLista] = useState({ results: [], count: 0 });
  const [opcoes, setOpcoes] = useState({ produtos: [], mesas: [], funcionarios: [] });
  const [erro, setErro] = useState("");
  const [nova, setNova] = useState(params.get("nova") === "1");
  const [dados, setDados] = useState({ mesa: params.get("mesa") || "", identificacao: "", observacoes: "" });
  const [carregando, setCarregando] = useState(true);
  const { executar, ocupado } = useOperacao();
  const vinculo = params.get("vinculo");
  useEffect(() => {
    if (!vinculo) return;
    api.post("/atendimento/vincular/", { token: vinculo }).then(r => setParams({ comanda: r.data.id })).catch(e => setErro(erroApi(e)));
  }, [vinculo, setParams]);
  const carregar = useCallback(async (signal) => {
    try {
      const { data } = await api.get("/atendimento/", { params: { ...Object.fromEntries(Object.entries(filtros).filter(([, v]) => v)), page: pagina }, signal });
      setLista(data); setErro("");
    } catch (e) { if (e.code !== "ERR_CANCELED") setErro(erroApi(e)); }
    finally { if (!signal?.aborted) setCarregando(false); }
  }, [filtros, pagina]);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => carregar(controller.signal), 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [carregar]);
  useEffect(() => {
    api.get("/atendimento/opcoes/").then(({ data }) => setOpcoes(data)).catch(e => setErro(erroApi(e)));
  }, [id]);
  async function abrir(e) {
    e.preventDefault();
    try {
      const data = await executar("/atendimento/", { ...dados, mesa: dados.mesa ? Number(dados.mesa) : null });
      if (data) { setParams({ comanda: data.id }); setNova(false); setDados({ mesa: "", identificacao: "", observacoes: "" }); carregar(); }
    } catch (error) { setErro(erroApi(error)); }
  }
  return <div className="service-page">
    {!cliente && <AtendimentoNav />}
    {id ? <><button className="botao botao-fantasma service-back" onClick={() => setParams({})}><ArrowLeft size={17} />Voltar às comandas</button><Detalhe key={id} id={id} opcoes={opcoes} atualizarLista={carregar} /></> : <>
      <header className="service-heading"><div><span className="section-kicker">Atendimento</span><h1>{cliente ? "Suas comandas" : historico ? "Histórico de comandas" : "Comandas em atendimento"}</h1></div>
        <div className="service-actions"><button className="icon-button" aria-label="Atualizar lista" title="Atualizar lista" onClick={() => carregar()}><RefreshCcw size={18} /></button>
          {(ehGerente || usuario.papel === "garcom" || cliente) && <button className="botao botao-primario" onClick={() => setNova(v => !v)}><Plus size={18} />Abrir comanda</button>}
        </div>
      </header>
      {nova && <form className="service-open-form" onSubmit={abrir}><h2>Nova comanda</h2><div className="service-fields">
        <label>Mesa / local<select value={dados.mesa} onChange={e => setDados({ ...dados, mesa: e.target.value })}><option value="">Balcão / identificação</option>{opcoes.mesas.map(m => <option key={m.id} value={m.id}>Mesa {m.numero} {m.localizacao} {m.ocupada ? "(ocupada)" : ""}</option>)}</select></label>
        <label>Cliente ou identificação<input maxLength={120} required={!dados.mesa} value={dados.identificacao} onChange={e => setDados({ ...dados, identificacao: e.target.value })} /></label>
        <label>Observações da comanda<input maxLength={500} value={dados.observacoes} onChange={e => setDados({ ...dados, observacoes: e.target.value })} /></label>
      </div><button disabled={ocupado} className="botao botao-primario">Confirmar abertura</button></form>}
      <CamposFiltro filtros={filtros} setFiltros={v => { setFiltros(v); setPagina(1); }} opcoes={opcoes} />
      {erro && <p role="alert" className="mensagem-erro">{erro}</p>}
      {carregando ? <p role="status">Carregando comandas...</p> : <div className="service-table-wrap"><table className="service-table">
        <thead><tr><th>Comanda</th><th>Abertura</th><th>Responsável</th><th>Pedidos</th><th>Total</th><th>Pagamento</th><th>Status</th></tr></thead>
        <tbody>{lista.results.map(c => <tr key={c.id}>
          <td><Link to={`?comanda=${c.id}`}>#{c.id} {c.mesa_numero ? `· Mesa ${c.mesa_numero}` : ""}<small>{c.identificacao || c.cliente_nome}</small></Link></td>
          <td>{dataHora.format(new Date(c.criada_em))}</td><td>{c.funcionario || "Registro anterior"}</td><td>{c.quantidade_pedidos}</td>
          <td>{moeda.format(c.total)}</td><td>{c.pago ? c.pagamentos.filter(p => p.status === "approved").map(p => FORMAS[p.forma]).join(" + ") || "Pago" : "Pendente"}</td><td><StatusBadge status={c.status} /></td>
        </tr>)}</tbody>
      </table>{!lista.results.length && <p className="service-empty">Nenhuma comanda encontrada.</p>}</div>}
      <div className="service-pagination"><span>{lista.count} comandas · Página {pagina}</span><button className="icon-button" title="Página anterior" aria-label="Página anterior" disabled={!lista.previous} onClick={() => setPagina(v => v - 1)}><ChevronLeft size={18} /></button><button className="icon-button" title="Próxima página" aria-label="Próxima página" disabled={!lista.next} onClick={() => setPagina(v => v + 1)}><ChevronRight size={18} /></button></div>
    </>}
  </div>;
}
