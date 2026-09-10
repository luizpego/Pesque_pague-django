import { useEffect, useMemo, useState } from "react";
import {
  ClipboardList,
  DoorOpen,
  Fish,
  Plus,
  RefreshCcw,
  Scale,
  Search,
  Users,
} from "lucide-react";
import api from "../api/axios.js";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import EstadoVazio from "../components/EstadoVazio.jsx";
import PageHeader from "../components/PageHeader.jsx";
import PrintButton from "../components/PrintButton.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import { useToast } from "../context/ToastContext.jsx";
import { formatadorDataHora, formatadorMoeda } from "../utils/formatters.js";

const REGISTRO_INICIAL = {
  pescador_nome: "",
  telefone: "",
  lago: "",
  modalidade: "pesque_pague",
  valor_entrada: "",
  observacoes: "",
};

function listaDaResposta(data) {
  return data.results ?? data;
}

export default function OperacaoPesca() {
  const toast = useToast();
  const [registros, setRegistros] = useState([]);
  const [lagos, setLagos] = useState([]);
  const [especies, setEspecies] = useState([]);
  const [novoRegistro, setNovoRegistro] = useState(REGISTRO_INICIAL);
  const [capturas, setCapturas] = useState({});
  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState("aberto");
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [processandoId, setProcessandoId] = useState(null);
  const [registroParaEncerrar, setRegistroParaEncerrar] = useState(null);
  const [erro, setErro] = useState("");

  async function carregar() {
    setCarregando(true);
    setErro("");
    try {
      const [resRegistros, resLagos, resEspecies] = await Promise.all([
        api.get("/registros-pesca/"),
        api.get("/lagos/"),
        api.get("/especies/"),
      ]);
      setRegistros(listaDaResposta(resRegistros.data));
      setLagos(listaDaResposta(resLagos.data).filter((lago) => lago.disponivel));
      setEspecies(listaDaResposta(resEspecies.data).filter((especie) => especie.disponivel));
    } catch {
      setErro("Não foi possível carregar a operação do pesque-pague.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  function atualizarRegistro(campo) {
    return (event) => {
      const valor = event.target.value;
      setNovoRegistro((atual) => {
        const proximo = { ...atual, [campo]: valor };
        if (campo === "lago") {
          const lago = lagos.find((item) => item.id === Number(valor));
          if (lago && !atual.valor_entrada) proximo.valor_entrada = lago.valor_diaria;
          if (lago?.modalidade === "esportiva") proximo.modalidade = "esportiva";
          if (lago?.modalidade === "pesque_pague") proximo.modalidade = "pesque_pague";
        }
        return proximo;
      });
    };
  }

  async function criarRegistro(event) {
    event.preventDefault();
    setSalvando(true);
    try {
      await api.post("/registros-pesca/", {
        ...novoRegistro,
        lago: Number(novoRegistro.lago),
        valor_entrada: novoRegistro.valor_entrada || "0.00",
      });
      setNovoRegistro(REGISTRO_INICIAL);
      toast.sucesso("Entrada do pescador registrada.");
      await carregar();
    } catch (err) {
      const dados = err.response?.data;
      const mensagem = dados?.detail || dados?.detalhe || Object.values(dados || {})[0];
      toast.erro(Array.isArray(mensagem) ? mensagem[0] : mensagem || "Não foi possível registrar a entrada.");
    } finally {
      setSalvando(false);
    }
  }

  function dadosCaptura(registroId) {
    return capturas[registroId] || { especie: "", peso_kg: "", observacoes: "" };
  }

  function atualizarCaptura(registroId, campo, valor) {
    setCapturas((atual) => ({
      ...atual,
      [registroId]: {
        ...(atual[registroId] || { especie: "", peso_kg: "", observacoes: "" }),
        [campo]: valor,
      },
    }));
  }

  async function adicionarCaptura(event, registroId) {
    event.preventDefault();
    const dados = dadosCaptura(registroId);
    setProcessandoId(registroId);
    try {
      await api.post(`/registros-pesca/${registroId}/adicionar_captura/`, {
        especie: Number(dados.especie),
        peso_kg: dados.peso_kg,
        observacoes: dados.observacoes,
      });
      setCapturas((atual) => ({ ...atual, [registroId]: { especie: "", peso_kg: "", observacoes: "" } }));
      toast.sucesso("Pesagem registrada com o preço atual da espécie.");
      await carregar();
    } catch (err) {
      const dadosErro = err.response?.data;
      const mensagem = dadosErro?.detail || dadosErro?.detalhe || Object.values(dadosErro || {})[0];
      toast.erro(Array.isArray(mensagem) ? mensagem[0] : mensagem || "Não foi possível registrar a pesagem.");
    } finally {
      setProcessandoId(null);
    }
  }

  async function encerrarRegistro() {
    if (!registroParaEncerrar) return;
    setProcessandoId(registroParaEncerrar.id);
    try {
      await api.post(`/registros-pesca/${registroParaEncerrar.id}/encerrar/`);
      toast.sucesso("Saída registrada. O atendimento foi encerrado.");
      setRegistroParaEncerrar(null);
      await carregar();
    } catch {
      toast.erro("Não foi possível encerrar o atendimento.");
    } finally {
      setProcessandoId(null);
    }
  }

  const registrosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return registros.filter((registro) => {
      const passaStatus = statusFiltro === "todos" || registro.status === statusFiltro;
      const passaBusca = !termo || [registro.id, registro.pescador_nome, registro.lago_nome]
        .some((valor) => String(valor || "").toLowerCase().includes(termo));
      return passaStatus && passaBusca;
    });
  }, [busca, registros, statusFiltro]);

  const metricas = useMemo(() => {
    const abertos = registros.filter((registro) => registro.status === "aberto");
    return [
      { label: "Pescadores ativos", value: abertos.length, icon: Users },
      { label: "Pesagens hoje", value: abertos.reduce((total, registro) => total + registro.capturas.length, 0), icon: Scale },
      { label: "Peso em aberto", value: `${abertos.reduce((total, registro) => total + Number(registro.peso_total_kg), 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} kg`, icon: Fish },
    ];
  }, [registros]);

  return (
    <div className="fishing-operations-page">
      <PageHeader
        etiqueta="Operação"
        titulo="Pesque-pague"
        descricao="Registre entrada, pesagens e saída sem misturar a pesca com as comandas do restaurante."
        acoes={
          <button type="button" className="botao botao-fantasma" onClick={carregar} disabled={carregando}>
            <RefreshCcw size={16} aria-hidden="true" />Atualizar
          </button>
        }
      />

      <section className="metrics-grid fishing-metrics" aria-label="Resumo da pesca">
        {metricas.map(({ label, value, icon: Icone }) => (
          <article className="metric-card" key={label}>
            <Icone size={20} aria-hidden="true" /><span>{label}</span><strong>{value}</strong>
          </article>
        ))}
      </section>

      <section className="fishing-entry-panel" aria-labelledby="entrada-title">
        <div className="section-heading compact-heading">
          <span className="section-kicker">Check-in</span>
          <h2 id="entrada-title">Nova entrada</h2>
        </div>
        {lagos.length === 0 ? (
          <p className="mensagem-aviso">Cadastre ao menos um lago no painel administrativo antes de abrir atendimentos.</p>
        ) : (
          <form onSubmit={criarRegistro}>
            <div className="operation-form-grid">
              <div className="form-grupo">
                <label htmlFor="pescador_nome">Nome do pescador</label>
                <input id="pescador_nome" required maxLength={120} value={novoRegistro.pescador_nome} onChange={atualizarRegistro("pescador_nome")} />
              </div>
              <div className="form-grupo">
                <label htmlFor="telefone_pescador">Telefone</label>
                <input id="telefone_pescador" maxLength={30} value={novoRegistro.telefone} onChange={atualizarRegistro("telefone")} />
              </div>
              <div className="form-grupo">
                <label htmlFor="lago_pesca">Lago</label>
                <select id="lago_pesca" required value={novoRegistro.lago} onChange={atualizarRegistro("lago")}>
                  <option value="">Selecione...</option>
                  {lagos.map((lago) => <option value={lago.id} key={lago.id}>{lago.nome}</option>)}
                </select>
              </div>
              <div className="form-grupo">
                <label htmlFor="modalidade_pesca">Modalidade</label>
                <select id="modalidade_pesca" value={novoRegistro.modalidade} onChange={atualizarRegistro("modalidade")}>
                  <option value="pesque_pague">Pesque-pague</option>
                  <option value="esportiva">Pesca esportiva</option>
                  <option value="diaria">Diária</option>
                </select>
              </div>
              <div className="form-grupo">
                <label htmlFor="valor_entrada">Valor de entrada</label>
                <input id="valor_entrada" type="number" min="0" step="0.01" value={novoRegistro.valor_entrada} onChange={atualizarRegistro("valor_entrada")} />
              </div>
              <div className="form-grupo operation-notes">
                <label htmlFor="observacoes_entrada">Observações</label>
                <input id="observacoes_entrada" maxLength={500} value={novoRegistro.observacoes} onChange={atualizarRegistro("observacoes")} />
              </div>
            </div>
            <button type="submit" className="botao botao-primario" disabled={salvando || !novoRegistro.lago}>
              <Plus size={17} aria-hidden="true" />{salvando ? "Registrando..." : "Registrar entrada"}
            </button>
          </form>
        )}
      </section>

      <div className="dashboard-toolbar fishing-toolbar">
        <div className="search-field">
          <Search size={18} aria-hidden="true" />
          <label className="somente-leitor-de-tela" htmlFor="buscar-pescador">Buscar pescador</label>
          <input id="buscar-pescador" type="search" value={busca} placeholder="Buscar nome, lago ou número" onChange={(event) => setBusca(event.target.value)} />
        </div>
        <div className="segmented-control" role="group" aria-label="Filtrar registros de pesca">
          {["aberto", "encerrado", "todos"].map((valor) => (
            <button type="button" key={valor} aria-pressed={statusFiltro === valor} onClick={() => setStatusFiltro(valor)}>
              {valor === "aberto" ? "Em andamento" : valor === "encerrado" ? "Encerrados" : "Todos"}
            </button>
          ))}
        </div>
      </div>

      {carregando ? (
        <div className="route-loading" role="status">Carregando operação...</div>
      ) : erro ? (
        <EstadoVazio icone={<RefreshCcw size={36} />} titulo="Operação indisponível" descricao={erro} acao={<button className="botao botao-primario" type="button" onClick={carregar}>Tentar novamente</button>} />
      ) : registrosFiltrados.length === 0 ? (
        <EstadoVazio icone={<ClipboardList size={38} />} titulo="Nenhum registro encontrado" descricao="Abra uma nova entrada ou ajuste os filtros." />
      ) : (
        <div className="fishing-record-list">
          {registrosFiltrados.map((registro) => {
            const captura = dadosCaptura(registro.id);
            const especieSelecionada = especies.find((item) => item.id === Number(captura.especie));
            return (
              <article className="fishing-record" key={registro.id}>
                <header>
                  <div>
                    <span className="section-kicker">Registro #{registro.id}</span>
                    <h2>{registro.pescador_nome}</h2>
                    <p>{registro.lago_nome} · {registro.modalidade_nome}</p>
                    <small>Entrada: {formatadorDataHora.format(new Date(registro.entrada_em))}</small>
                  </div>
                  <StatusBadge status={registro.status} tipo="pesca" />
                </header>

                <div className="fishing-record-summary">
                  <span><small>Peso total</small><strong>{Number(registro.peso_total_kg).toLocaleString("pt-BR")} kg</strong></span>
                  <span><small>Entrada</small><strong>{formatadorMoeda.format(registro.valor_entrada)}</strong></span>
                  <span><small>Total</small><strong>{formatadorMoeda.format(registro.total)}</strong></span>
                </div>

                {registro.capturas.length > 0 && (
                  <div className="capture-table-wrap">
                    <table className="capture-table">
                      <thead><tr><th>Espécie</th><th>Peso</th><th>Preço/kg</th><th>Total</th></tr></thead>
                      <tbody>
                        {registro.capturas.map((item) => (
                          <tr key={item.id}>
                            <td>{item.especie_nome}{item.observacoes && <small>{item.observacoes}</small>}</td>
                            <td>{Number(item.peso_kg).toLocaleString("pt-BR")} kg</td>
                            <td>{formatadorMoeda.format(item.preco_quilo)}</td>
                            <td>{formatadorMoeda.format(item.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {registro.status === "aberto" && (
                  <form className="capture-form" onSubmit={(event) => adicionarCaptura(event, registro.id)}>
                    <div className="form-grupo">
                      <label htmlFor={`especie-${registro.id}`}>Espécie</label>
                      <select id={`especie-${registro.id}`} required value={captura.especie} onChange={(event) => atualizarCaptura(registro.id, "especie", event.target.value)}>
                        <option value="">Selecione...</option>
                        {especies.map((especie) => <option value={especie.id} key={especie.id}>{especie.nome}</option>)}
                      </select>
                    </div>
                    <div className="form-grupo">
                      <label htmlFor={`peso-${registro.id}`}>Peso (kg)</label>
                      <input id={`peso-${registro.id}`} type="number" min="0.001" step="0.001" required value={captura.peso_kg} onChange={(event) => atualizarCaptura(registro.id, "peso_kg", event.target.value)} />
                    </div>
                    <div className="form-grupo capture-observation">
                      <label htmlFor={`captura-obs-${registro.id}`}>Observação</label>
                      <input id={`captura-obs-${registro.id}`} maxLength={200} value={captura.observacoes} onChange={(event) => atualizarCaptura(registro.id, "observacoes", event.target.value)} />
                    </div>
                    <div className="capture-price">
                      <small>Preço aplicado</small>
                      <strong>{especieSelecionada ? `${formatadorMoeda.format(especieSelecionada.preco_quilo)} / kg` : "Selecione a espécie"}</strong>
                    </div>
                    <button className="botao botao-secundario" type="submit" disabled={processandoId === registro.id || especies.length === 0}>
                      <Scale size={17} aria-hidden="true" />Registrar pesagem
                    </button>
                  </form>
                )}

                <footer className="record-actions">
                  <div className="print-actions">
                    <PrintButton origem="pesca" origemId={registro.id} tipoDocumento="registro_pesca" rotulo="Registro" compacto />
                    <PrintButton origem="pesca" origemId={registro.id} tipoDocumento="comprovante_pesca" rotulo="Comprovante" compacto />
                    {registro.status === "encerrado" && <PrintButton origem="pesca" origemId={registro.id} tipoDocumento="fechamento" rotulo="Fechamento" compacto />}
                  </div>
                  {registro.status === "aberto" && (
                    <button type="button" className="botao botao-primario" onClick={() => setRegistroParaEncerrar(registro)}>
                      <DoorOpen size={17} aria-hidden="true" />Registrar saída
                    </button>
                  )}
                </footer>
              </article>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        aberto={Boolean(registroParaEncerrar)}
        titulo="Encerrar atendimento de pesca?"
        descricao={registroParaEncerrar ? `A saída de ${registroParaEncerrar.pescador_nome} será registrada com os totais atuais.` : ""}
        confirmarTexto="Registrar saída"
        carregando={processandoId === registroParaEncerrar?.id}
        onConfirmar={encerrarRegistro}
        onCancelar={() => setRegistroParaEncerrar(null)}
      />
    </div>
  );
}
