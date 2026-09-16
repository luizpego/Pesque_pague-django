import { useEffect, useMemo, useState } from "react";
import {
  ChevronRight,
  ClipboardList,
  Fish,
  LayoutDashboard,
  MapPinned,
  Pencil,
  Plus,
  RefreshCcw,
  Save,
  Settings2,
  Store,
  Tags,
  Utensils,
  X,
} from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { recursosGestao } from "../utils/adminRecursos.js";
import AtendimentoNav from "../components/AtendimentoNav.jsx";
import api from "../api/axios.js";
import EstadoVazio from "../components/EstadoVazio.jsx";
import PageHeader from "../components/PageHeader.jsx";
import Spinner from "../components/Spinner.jsx";
import { useToast } from "../context/ToastContext.jsx";

const RECURSOS = {
  ...recursosGestao,
  categorias: {
    titulo: "Categorias",
    singular: "categoria",
    endpoint: "/categorias/",
    icone: Tags,
    resumo: (item) => `${item.icone || "•"} ${item.nome}`,
    detalhe: (item) => `Ordem ${item.ordem}`,
    campos: [
      { nome: "nome", rotulo: "Nome", required: true },
      { nome: "icone", rotulo: "Ícone", required: true, maxLength: 10 },
      { nome: "ordem", rotulo: "Ordem", tipo: "number", min: 0, required: true },
    ],
  },
  cardapio: {
    titulo: "Itens do cardápio",
    singular: "item",
    endpoint: "/cardapio/",
    icone: Utensils,
    resumo: (item) => item.nome,
    detalhe: (item) => `${item.categoria_nome} · R$ ${Number(item.preco).toFixed(2).replace(".", ",")} · ${item.disponivel ? "Disponível" : "Indisponível"}`,
    campos: [
      { nome: "categoria", rotulo: "Categoria", tipo: "categoria", required: true },
      { nome: "nome", rotulo: "Nome do produto", required: true },
      { nome: "descricao", rotulo: "Descrição", tipo: "textarea", largo: true },
      { nome: "preco", rotulo: "Preço", tipo: "number", step: "0.01", min: 0, required: true },
      { nome: "unidade", rotulo: "Unidade", tipo: "select", required: true, opcoes: [["un", "Unidade"], ["kg", "Quilo"], ["porcao", "Porção"]] },
      { nome: "tempo_preparo_min", rotulo: "Preparo (min)", tipo: "number", min: 0, required: true },
      { nome: "imagem_alt", rotulo: "Descrição da foto", largo: true },
      { nome: "disponivel", rotulo: "Disponível para venda", tipo: "checkbox" },
      { nome: "eh_pescado_no_local", rotulo: "Pescado no local", tipo: "checkbox" },
      { nome: "imagem", rotulo: "Foto do produto", tipo: "file" },
      { nome: "destaque", rotulo: "Destaque no site", tipo: "checkbox" },
    ],
  },
  mesas: {
    titulo: "Mesas e pontos",
    singular: "mesa",
    endpoint: "/mesas/",
    icone: Store,
    resumo: (item) => `Mesa ${item.numero}`,
    detalhe: (item) => `${item.localizacao || "Sem localização"} · ${item.capacidade} lugares · ${item.ativa ? "Ativa" : "Inativa"}`,
    campos: [
      { nome: "numero", rotulo: "Número", tipo: "number", min: 1, required: true },
      { nome: "capacidade", rotulo: "Capacidade", tipo: "number", min: 1, required: true },
      { nome: "localizacao", rotulo: "Localização", largo: true },
      { nome: "ativa", rotulo: "Mesa ativa", tipo: "checkbox" },
    ],
  },
  lagos: {
    titulo: "Lagos",
    singular: "lago",
    endpoint: "/lagos/",
    icone: MapPinned,
    resumo: (item) => item.nome,
    detalhe: (item) => `${item.modalidade_nome || item.modalidade} · R$ ${Number(item.valor_diaria).toFixed(2).replace(".", ",")} · ${item.disponivel ? "Disponível" : "Indisponível"}`,
    campos: [
      { nome: "nome", rotulo: "Nome", required: true },
      { nome: "modalidade", rotulo: "Modalidade", tipo: "select", required: true, opcoes: [["pesque_pague", "Pesque-pague"], ["esportiva", "Pesca esportiva"], ["mista", "Mista"]] },
      { nome: "valor_diaria", rotulo: "Valor da diária", tipo: "number", step: "0.01", min: 0, required: true },
      { nome: "capacidade", rotulo: "Capacidade", tipo: "number", min: 1 },
      { nome: "descricao", rotulo: "Descrição", tipo: "textarea", largo: true },
      { nome: "imagem_alt", rotulo: "Descrição da foto", largo: true },
      { nome: "disponivel", rotulo: "Lago disponível", tipo: "checkbox" },
      { nome: "imagem", rotulo: "Foto do lago", tipo: "file" },
    ],
  },
  especies: {
    titulo: "Espécies e preços",
    singular: "espécie",
    endpoint: "/especies/",
    icone: Fish,
    resumo: (item) => item.nome,
    detalhe: (item) => `R$ ${Number(item.preco_quilo).toFixed(2).replace(".", ",")}/kg · ${item.disponivel ? "Disponível" : "Indisponível"}`,
    campos: [
      { nome: "nome", rotulo: "Espécie", required: true },
      { nome: "preco_quilo", rotulo: "Preço por quilo", tipo: "number", step: "0.01", min: 0, required: true },
      { nome: "descricao", rotulo: "Descrição", tipo: "textarea", largo: true },
      { nome: "imagem_alt", rotulo: "Descrição da foto", largo: true },
      { nome: "disponivel", rotulo: "Espécie disponível", tipo: "checkbox" },
      { nome: "imagem", rotulo: "Foto da espécie", tipo: "file" },
    ],
  },
  regras: {
    titulo: "Regras da pesca",
    singular: "regra",
    endpoint: "/regras-pesca/",
    icone: ClipboardList,
    resumo: (item) => item.titulo,
    detalhe: (item) => `Ordem ${item.ordem} · ${item.ativa ? "Ativa" : "Inativa"}`,
    campos: [
      { nome: "titulo", rotulo: "Título", required: true },
      { nome: "ordem", rotulo: "Ordem", tipo: "number", min: 0, required: true },
      { nome: "descricao", rotulo: "Descrição", tipo: "textarea", largo: true, required: true },
      { nome: "ativa", rotulo: "Regra ativa", tipo: "checkbox" },
    ],
  },
  servicos: {
    titulo: "Serviços e equipamentos",
    singular: "serviço",
    endpoint: "/servicos-pesca/",
    icone: Settings2,
    resumo: (item) => item.nome,
    detalhe: (item) => `${item.tipo_nome || item.tipo} · ${item.valor ? `R$ ${Number(item.valor).toFixed(2).replace(".", ",")}` : "Preço sob consulta"} · ${item.disponivel ? "Disponível" : "Indisponível"}`,
    campos: [
      { nome: "nome", rotulo: "Nome", required: true },
      { nome: "tipo", rotulo: "Tipo", tipo: "select", required: true, opcoes: [["servico", "Serviço"], ["equipamento", "Equipamento"]] },
      { nome: "valor", rotulo: "Valor", tipo: "number", step: "0.01", min: 0 },
      { nome: "descricao", rotulo: "Descrição", tipo: "textarea", largo: true },
      { nome: "disponivel", rotulo: "Disponível", tipo: "checkbox" },
    ],
  },
};

const VALORES_PADRAO = {
  papel_cozinha: "80mm", is_active: true, papel: "cliente", status: "pendente", pessoas: 1,
  disponivel: true,
  ativa: true,
  ordem: 0,
  capacidade: 4,
  unidade: "un",
  tempo_preparo_min: 15,
  modalidade: "pesque_pague",
  tipo: "servico",
  eh_pescado_no_local: false,
};

function mensagemErro(error) {
  const dados = error.response?.data;
  if (!dados) return "Não foi possível salvar. Verifique sua conexão.";
  if (typeof dados === "string") return dados;
  return Object.entries(dados)
    .map(([campo, mensagens]) => `${campo}: ${Array.isArray(mensagens) ? mensagens.join(" ") : mensagens}`)
    .join(" ");
}

function valoresIniciais(configuracao, item = null) {
  return Object.fromEntries(configuracao.campos.map((campo) => {
    const valor = item?.[campo.nome];
    return [campo.nome, valor ?? VALORES_PADRAO[campo.nome] ?? ""];
  }));
}

function CampoAdmin({ campo, valor, categorias, onChange }) {
  if (campo.tipo === "file") return <label className="form-grupo">{campo.rotulo}{typeof valor === "string" && valor && <img src={valor} alt="Imagem atual" style={{ width: 100, height: 70, objectFit: "cover" }} />}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => onChange(e.target.files[0] || "")} /></label>;
  if (campo.tipo === "checkbox") {
    return (
      <label className="admin-check-field">
        <input type="checkbox" checked={Boolean(valor)} onChange={(event) => onChange(event.target.checked)} />
        <span>{campo.rotulo}</span>
      </label>
    );
  }

  const propriedades = {
    id: `admin-${campo.nome}`,
    name: campo.nome,
    required: campo.required,
    value: valor,
    min: campo.min,
    maxLength: campo.maxLength,
    step: campo.step,
    onChange: (event) => onChange(event.target.value),
  };

  return (
    <div className={`form-grupo ${campo.largo ? "admin-field-wide" : ""}`}>
      <label htmlFor={propriedades.id}>{campo.rotulo}{campo.required ? " *" : ""}</label>
      {campo.tipo === "textarea" ? (
        <textarea {...propriedades} rows={3} />
      ) : campo.tipo === "select" || campo.tipo === "categoria" ? (
        <select {...propriedades}>
          <option value="">Selecione</option>
          {(campo.tipo === "categoria"
            ? categorias.map((categoria) => [categoria.id, categoria.nome])
            : campo.opcoes
          ).map(([chave, rotulo]) => <option key={chave} value={chave}>{rotulo}</option>)}
        </select>
      ) : (
        <input {...propriedades} type={campo.tipo || "text"} />
      )}
    </div>
  );
}

function GestorRecurso({ recursoId, categorias, onAtualizarContagem }) {
  const toast = useToast();
  const configuracao = RECURSOS[recursoId];
  const [itens, setItens] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [formularioAberto, setFormularioAberto] = useState(false);
  const [itemEditando, setItemEditando] = useState(null);
  const [dados, setDados] = useState(() => valoresIniciais(configuracao));
  const [pagina, setPagina] = useState(1);
  const [paginacao, setPaginacao] = useState({});
  const [dataReserva, setDataReserva] = useState("");

  async function carregar() {
    setCarregando(true);
    try {
      const { data } = await api.get(configuracao.endpoint, { params: { page: pagina, ...(recursoId === "reservas" && dataReserva ? { data: dataReserva } : {}) } });
      setPaginacao(data);
      const lista = data.results ?? data;
      setItens(lista);
      onAtualizarContagem(recursoId, data.count ?? lista.length);
    } catch {
      toast.erro(`Não foi possível carregar ${configuracao.titulo.toLowerCase()}.`);
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recursoId, pagina, dataReserva]);

  function abrirFormulario(item = null) {
    setItemEditando(item);
    setDados(valoresIniciais(configuracao, item));
    setFormularioAberto(true);
  }

  async function salvar(event) {
    event.preventDefault();
    setSalvando(true);
    try {
      const url = itemEditando ? `${configuracao.endpoint}${itemEditando.id}/` : configuracao.endpoint;
      let payload = Object.fromEntries(configuracao.campos.filter(c => c.tipo !== "file" || dados[c.nome] instanceof File).map((campo) => {
        const valor = dados[campo.nome];
        return [campo.nome, ["number", "time"].includes(campo.tipo) && valor === "" ? null : valor];
      }));
      if (Object.values(payload).some(v => v instanceof File)) {
        const form = new FormData();
        Object.entries(payload).forEach(([k, v]) => { if (v !== null) form.append(k, v); });
        payload = form;
      }
      if (itemEditando) await api.patch(url, payload);
      else await api.post(url, payload);
      toast.sucesso(`${itemEditando ? "Alteração" : "Cadastro"} salvo com sucesso.`);
      setFormularioAberto(false);
      await carregar();
    } catch (error) {
      toast.erro(mensagemErro(error));
    } finally {
      setSalvando(false);
    }
  }

  const Icone = configuracao.icone;
  return (
    <section className="admin-workspace" aria-labelledby="admin-resource-title">
      <div className="admin-resource-heading">
        <div>
          <span className="section-kicker">Cadastros</span>
          <h2 id="admin-resource-title">{configuracao.titulo}</h2>
          <p>{paginacao.count ?? itens.length} registros</p>
        </div>
        <div className="page-header-button-group">
          <button className="icon-button" type="button" onClick={carregar} aria-label="Atualizar lista" title="Atualizar lista">
            <RefreshCcw size={18} aria-hidden="true" />
          </button>
          <button className="botao botao-primario" type="button" onClick={() => abrirFormulario()}>
            <Plus size={17} aria-hidden="true" /> Novo
          </button>
        </div>
      </div>

      {recursoId === "reservas" && <div className="service-filters">
        <label>Dia da reserva<input type="date" value={dataReserva} onChange={e => { setDataReserva(e.target.value); setPagina(1); }} /></label>
        <button className="botao botao-fantasma" onClick={() => { const d = new Date(); setDataReserva(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`); setPagina(1); }}>Hoje</button>
        <button className="botao botao-fantasma" onClick={() => { setDataReserva(""); setPagina(1); }}>Todas as datas</button>
      </div>}

      {formularioAberto && (
        <form className="admin-editor" onSubmit={salvar}>
          <div className="admin-editor-heading">
            <div>
              <span className="section-kicker">{itemEditando ? "Editar" : "Novo cadastro"}</span>
              <h3>{itemEditando ? configuracao.resumo(itemEditando) : `Adicionar ${configuracao.singular}`}</h3>
            </div>
            <button type="button" className="icon-button" onClick={() => setFormularioAberto(false)} aria-label="Fechar formulário" title="Fechar">
              <X size={18} aria-hidden="true" />
            </button>
          </div>
          <div className="admin-form-grid">
            {configuracao.campos.map((campo) => (
              <CampoAdmin
                key={campo.nome}
                campo={campo}
                valor={dados[campo.nome]}
                categorias={categorias}
                onChange={(valor) => setDados((atual) => ({ ...atual, [campo.nome]: valor }))}
              />
            ))}
          </div>
          <div className="admin-editor-actions">
            <button type="button" className="botao botao-fantasma" onClick={() => setFormularioAberto(false)}>Cancelar</button>
            <button type="submit" className="botao botao-primario" disabled={salvando}>
              {salvando ? <Spinner claro rotulo="Salvando" /> : <Save size={17} aria-hidden="true" />}
              Salvar
            </button>
          </div>
        </form>
      )}

      {carregando ? (
        <div className="route-loading" role="status"><Spinner />Carregando registros...</div>
      ) : itens.length === 0 ? (
        <EstadoVazio
          icone={<Icone size={34} />}
          titulo={`Nenhuma ${configuracao.singular} cadastrada`}
          descricao="Use o botão Novo para fazer o primeiro cadastro."
        />
      ) : (
        <div className="admin-record-list">
          {itens.map((item) => (
            <article className="admin-record" key={item.id}>
              <span className="admin-record-icon"><Icone size={19} aria-hidden="true" /></span>
              <div>
                <strong>{configuracao.resumo(item)}</strong>
                <small>{configuracao.detalhe(item)}</small>
              </div>
              <button type="button" className="botao botao-fantasma" onClick={() => abrirFormulario(item)}>
                <Pencil size={16} aria-hidden="true" /> Editar
              </button>
            </article>
          ))}
        </div>
      )}
      <div className="service-pagination"><span>Página {pagina}</span><button className="botao botao-fantasma" disabled={!paginacao.previous} onClick={() => setPagina(p => p - 1)}>Anterior</button><button className="botao botao-fantasma" disabled={!paginacao.next} onClick={() => setPagina(p => p + 1)}>Próxima</button></div>
    </section>
  );
}

export default function Administracao() {
  const [params, setParams] = useSearchParams();
  const recursoAtivo = RECURSOS[params.get("area")] ? params.get("area") : "cardapio";
  const setRecursoAtivo = area => setParams({ area });
  const [categorias, setCategorias] = useState([]);
  const [contagens, setContagens] = useState({});

  useEffect(() => {
    api.get("/categorias/").then(({ data }) => setCategorias(data.results ?? data)).catch(() => {});
  }, [recursoAtivo]);

  const grupos = useMemo(() => [
    { titulo: "Restaurante", itens: ["cardapio", "categorias", "mesas"] },
    { titulo: "Pesque-pague", itens: ["lagos", "especies", "regras", "servicos"] },
    { titulo: "Gestão", itens: ["reservas", "metas", "usuarios"] },
    { titulo: "Site", itens: ["configuracao", "horarios", "galeria"] },
  ], []);

  return (
    <div className="admin-page">
      <AtendimentoNav />
      <PageHeader
        etiqueta="Administração"
        titulo="Central de gestão"
        descricao="Cadastros e operação do restaurante e do pesque-pague em um único lugar."
        acoes={
          <div className="page-header-button-group">
            <Link className="botao botao-secundario" to="/painel"><LayoutDashboard size={17} aria-hidden="true" />Pedidos</Link>
            <Link className="botao botao-fantasma" to="/perfil">Meu perfil</Link>
          </div>
        }
      />

      <div className="admin-shell">
        <aside className="admin-sidebar" aria-label="Áreas administrativas">
          {grupos.map((grupo) => (
            <div className="admin-nav-group" key={grupo.titulo}>
              <span>{grupo.titulo}</span>
              {grupo.itens.map((id) => {
                const recurso = RECURSOS[id];
                const Icone = recurso.icone;
                return (
                  <button key={id} type="button" className={recursoAtivo === id ? "ativo" : ""} onClick={() => setRecursoAtivo(id)}>
                    <Icone size={18} aria-hidden="true" />
                    <span>{recurso.titulo}</span>
                    {contagens[id] !== undefined && <small>{contagens[id]}</small>}
                    <ChevronRight size={16} aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          ))}
        </aside>

        <GestorRecurso
          key={recursoAtivo}
          recursoId={recursoAtivo}
          categorias={categorias}
          onAtualizarContagem={(id, total) => setContagens((atual) => ({ ...atual, [id]: total }))}
        />
      </div>
    </div>
  );
}
