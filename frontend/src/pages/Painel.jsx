import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ClipboardList, CookingPot, RefreshCcw, Scale, Search, Utensils, XCircle } from "lucide-react";
import { Link } from "react-router-dom";
import api from "../api/axios.js";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import EstadoVazio from "../components/EstadoVazio.jsx";
import PageHeader from "../components/PageHeader.jsx";
import PrintButton from "../components/PrintButton.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import { useToast } from "../context/ToastContext.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { formatadorDataHora, formatadorMoeda } from "../utils/formatters.js";

const PROXIMO_STATUS_POR_PAPEL = {
  cozinha: { enviada: "em_preparo", em_preparo: "pronta" },
  garcom: { aberta: "enviada", pronta: "entregue", entregue: "fechada" },
  gerente: { aberta: "enviada", enviada: "em_preparo", em_preparo: "pronta", pronta: "entregue", entregue: "fechada" },
};

const ROTULO_ACAO = {
  enviada: "Iniciar preparo",
  em_preparo: "Marcar como pronta",
  pronta: "Marcar como entregue",
  entregue: "Fechar comanda",
};

function SkeletonPainel() {
  return (
    <div className="dashboard-grid" aria-hidden="true">
      {Array.from({ length: 3 }).map((_, i) => (
        <div className="command-card" key={i}>
          <div className="skeleton skeleton-linha" style={{ width: "50%", height: "1.4rem" }} />
          <div className="skeleton skeleton-linha" style={{ width: "70%" }} />
          <div className="skeleton skeleton-linha" style={{ width: "60%" }} />
          <div className="skeleton skeleton-linha" style={{ width: "40%" }} />
        </div>
      ))}
    </div>
  );
}

export default function Painel() {
  const toast = useToast();
  const { usuario, ehGerente } = useAuth();
  const [comandas, setComandas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [atualizandoId, setAtualizandoId] = useState(null);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState("todos");
  const [comandaParaCancelar, setComandaParaCancelar] = useState(null);
  const [motivoCancelamento, setMotivoCancelamento] = useState("");
  const papelOperacional = ehGerente ? "gerente" : usuario?.papel;

  async function carregar(mostrarCarregando = false) {
    if (mostrarCarregando) setCarregando(true);
    setErro("");
    try {
      const { data } = await api.get("/comandas/");
      const lista = (data.results ?? data).filter((c) => !["cancelada", "fechada"].includes(c.status));
      setComandas(lista);
    } catch {
      setErro("Não foi possível carregar as comandas.");
      toast.erro("Não foi possível carregar as comandas.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar(true);
    const intervalo = setInterval(() => carregar(false), 15000);
    return () => clearInterval(intervalo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function avancarStatus(comanda) {
    const proximo = PROXIMO_STATUS_POR_PAPEL[papelOperacional]?.[comanda.status];
    if (!proximo) return;
    setAtualizandoId(comanda.id);
    try {
      await api.post(`/comandas/${comanda.id}/alterar_status/`, { status: proximo });
      toast.sucesso(`Mesa ${comanda.mesa_numero} atualizada.`);
      await carregar(false);
    } catch {
      toast.erro("Não foi possível atualizar o status.");
    } finally {
      setAtualizandoId(null);
    }
  }

  async function cancelarComanda() {
    if (!comandaParaCancelar || motivoCancelamento.trim().length < 5) return;
    setAtualizandoId(comandaParaCancelar.id);
    try {
      await api.post(`/comandas/${comandaParaCancelar.id}/alterar_status/`, {
        status: "cancelada",
        motivo: motivoCancelamento.trim(),
      });
      toast.sucesso(`Comanda #${comandaParaCancelar.id} cancelada com registro de auditoria.`);
      setComandaParaCancelar(null);
      setMotivoCancelamento("");
      await carregar(false);
    } catch (error) {
      toast.erro(error.response?.data?.motivo || error.response?.data?.detalhe || "Não foi possível cancelar a comanda.");
    } finally {
      setAtualizandoId(null);
    }
  }

  const metricas = useMemo(() => {
    const agora = Date.now();
    return [
      { label: "Comandas ativas", value: comandas.length, icon: ClipboardList },
      { label: "Pedidos novos", value: comandas.filter((c) => c.status === "enviada").length, icon: AlertTriangle },
      { label: "Em preparo", value: comandas.filter((c) => c.status === "em_preparo").length, icon: CookingPot },
      { label: "Prontas", value: comandas.filter((c) => c.status === "pronta").length, icon: Utensils },
      { label: "Pendências +30 min", value: comandas.filter((c) => agora - new Date(c.atualizada_em).getTime() > 30 * 60 * 1000).length, icon: AlertTriangle },
    ];
  }, [comandas]);

  const comandasFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return comandas.filter((comanda) => {
      const passaStatus = statusFiltro === "todos" || comanda.status === statusFiltro;
      const passaBusca = !termo || [
        comanda.id,
        comanda.mesa_numero,
        comanda.cliente_nome,
        ...comanda.itens.map((item) => item.item_cardapio_nome),
      ].some((valor) => String(valor || "").toLowerCase().includes(termo));
      return passaStatus && passaBusca;
    });
  }, [busca, comandas, statusFiltro]);

  return (
    <div className="dashboard-page">
      <PageHeader
        etiqueta="Operação"
        titulo="Painel da equipe"
        descricao="Fila de comandas com atualização automática a cada 15 segundos."
        acoes={
          <div className="page-header-button-group">
            <Link className="botao botao-secundario" to="/operacao-pesca">
              <Scale size={16} aria-hidden="true" />
              Operação pesca
            </Link>
            <button type="button" className="botao botao-fantasma" onClick={() => carregar(true)} disabled={carregando}>
              <RefreshCcw size={16} aria-hidden="true" />
              Atualizar
            </button>
          </div>
        }
      />

      <section className="metrics-grid" aria-label="Métricas da operação">
        {metricas.map(({ label, value, icon: Icone }) => (
          <article className="metric-card" key={label}>
            <Icone size={20} aria-hidden="true" />
            <span>{label}</span>
            <strong>{value}</strong>
          </article>
        ))}
      </section>

      <div className="dashboard-toolbar">
        <div className="search-field">
          <Search size={18} aria-hidden="true" />
          <label className="somente-leitor-de-tela" htmlFor="buscar-comanda">Buscar comanda</label>
          <input
            id="buscar-comanda"
            type="search"
            value={busca}
            placeholder="Buscar mesa, cliente ou item"
            onChange={(event) => setBusca(event.target.value)}
          />
        </div>
        <div className="segmented-control" role="group" aria-label="Filtrar por status">
          {["todos", "enviada", "em_preparo", "pronta", "entregue"].map((status) => (
            <button
              key={status}
              type="button"
              aria-pressed={statusFiltro === status}
              onClick={() => setStatusFiltro(status)}
            >
              {status === "todos" ? "Todos" : status.replace("_", " ")}
            </button>
          ))}
        </div>
      </div>

      {carregando ? (
        <SkeletonPainel />
      ) : erro ? (
        <EstadoVazio
          icone={<RefreshCcw size={36} />}
          titulo="Painel indisponível"
          descricao={erro}
          acao={<button type="button" className="botao botao-primario" onClick={() => carregar(true)}>Tentar novamente</button>}
        />
      ) : comandasFiltradas.length === 0 ? (
        <EstadoVazio
          icone={<ClipboardList size={36} />}
          titulo="Nenhuma comanda encontrada"
          descricao="Ajuste a busca ou aguarde novos pedidos enviados pela equipe."
        />
      ) : (
        <div className="dashboard-grid">
          {comandasFiltradas.map((c) => (
            <article className="command-card staff-command-card" key={c.id}>
              <div className="command-card-head">
                <div>
                  <span className="section-kicker">Mesa {c.mesa_numero}</span>
                  <h2>Comanda #{c.id}</h2>
                  <p>Cliente: {c.cliente_nome || "Não identificado"}</p>
                  <small>Aberta em {formatadorDataHora.format(new Date(c.criada_em))}</small>
                </div>
                <div className="badge-group">
                  <StatusBadge status={c.status} />
                </div>
              </div>

              <ul className="command-items">
                {c.itens.map((item) => (
                  <li key={item.id}>
                    <span>
                      {Number(item.quantidade)}x {item.item_cardapio_nome}
                      {item.observacoes && <small>{item.observacoes}</small>}
                    </span>
                    <strong>{formatadorMoeda.format(item.subtotal)}</strong>
                  </li>
                ))}
              </ul>
              <p className="total-carrinho"><span>Total</span><strong>{formatadorMoeda.format(c.total)}</strong></p>
              <div className="print-actions" aria-label={`Impressões da comanda ${c.id}`}>
                <PrintButton origem="comanda" origemId={c.id} tipoDocumento="cozinha" rotulo="Cozinha" compacto />
                <PrintButton origem="comanda" origemId={c.id} tipoDocumento="balcao" rotulo="Balcão" compacto />
                <PrintButton origem="comanda" origemId={c.id} tipoDocumento="resumo_mesa" rotulo="Mesa" compacto />
              </div>
              <div className="page-header-button-group">
              {PROXIMO_STATUS_POR_PAPEL[papelOperacional]?.[c.status] && (
                <button
                  type="button"
                  className="botao botao-primario botao-bloco"
                  onClick={() => avancarStatus(c)}
                  disabled={atualizandoId === c.id}
                >
                  {atualizandoId === c.id ? "Atualizando..." : ROTULO_ACAO[c.status]}
                </button>
              )}
              {(ehGerente || usuario?.papel === "garcom") && (
                <button
                  type="button"
                  className="botao botao-perigo"
                  onClick={() => setComandaParaCancelar(c)}
                  disabled={atualizandoId === c.id}
                >
                  <XCircle size={17} aria-hidden="true" />Cancelar
                </button>
              )}
              </div>
            </article>
          ))}
        </div>
      )}

      <ConfirmDialog
        aberto={Boolean(comandaParaCancelar)}
        titulo={`Cancelar comanda #${comandaParaCancelar?.id || ""}?`}
        descricao="O cancelamento permanece no histórico com usuário, data, itens e valores."
        confirmarTexto="Cancelar comanda"
        perigoso
        carregando={atualizandoId === comandaParaCancelar?.id}
        onConfirmar={cancelarComanda}
        onCancelar={() => {
          setComandaParaCancelar(null);
          setMotivoCancelamento("");
        }}
      >
        <div className="form-grupo">
          <label htmlFor="motivo-cancelamento">Motivo do cancelamento</label>
          <textarea
            id="motivo-cancelamento"
            value={motivoCancelamento}
            minLength={5}
            maxLength={500}
            required
            aria-describedby="motivo-cancelamento-ajuda"
            onChange={(event) => setMotivoCancelamento(event.target.value)}
          />
          <small id="motivo-cancelamento-ajuda">Informe pelo menos 5 caracteres.</small>
        </div>
      </ConfirmDialog>
    </div>
  );
}
