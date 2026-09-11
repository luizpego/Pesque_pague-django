import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Clock3,
  Fish,
  MapPin,
  Phone,
  RefreshCcw,
  Ruler,
  Wrench,
} from "lucide-react";
import api from "../api/axios.js";
import EstadoVazio from "../components/EstadoVazio.jsx";
import PageHeader from "../components/PageHeader.jsx";
import Spinner from "../components/Spinner.jsx";
import Seo from "../components/Seo.jsx";
import { formatadorMoeda, montarLinkContato } from "../utils/formatters.js";

function resolverImagem(src) {
  if (!src || /^https?:\/\//i.test(src) || src.startsWith("data:")) return src;
  const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:8000/api";
  return `${apiUrl.replace(/\/api\/?$/, "")}${src}`;
}

function formatarHora(valor) {
  return valor ? valor.slice(0, 5) : "";
}

export default function PesquePague() {
  const [conteudo, setConteudo] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  async function carregar() {
    setCarregando(true);
    setErro("");
    try {
      const { data } = await api.get("/conteudo-publico/");
      setConteudo(data);
    } catch {
      setErro("Não foi possível carregar as informações do pesque-pague.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  const estabelecimento = conteudo?.estabelecimento || {};
  const contato = estabelecimento.whatsapp || estabelecimento.telefone;
  const temConteudoOperacional = useMemo(
    () => Boolean(
      conteudo?.lagos?.length ||
      conteudo?.especies?.length ||
      conteudo?.regras?.length ||
      conteudo?.servicos?.length ||
      conteudo?.galeria?.some((imagem) => imagem.area === "pesca")
    ),
    [conteudo]
  );

  if (carregando) {
    return <div className="route-loading" role="status"><Spinner />Carregando informações da pesca...</div>;
  }

  if (erro) {
    return (
      <EstadoVazio
        icone={<RefreshCcw size={36} />}
        titulo="Pesque-pague indisponível"
        descricao={erro}
        acao={<button type="button" className="botao botao-primario" onClick={carregar}>Tentar novamente</button>}
      />
    );
  }

  const galeria = (conteudo?.galeria || []).filter((imagem) => imagem.area === "pesca");

  return (
    <div className="fishing-public-page">
      <Seo
        titulo="Pesque-pague | Lagos, espécies e regras"
        descricao="Consulte horários, lagos, espécies, regras, serviços e preços do pesque-pague."
        caminho="/pesque-pague"
      />
      <PageHeader
        etiqueta="Pesque-pague"
        titulo="Planeje a pescaria com as informações certas."
        descricao={
          estabelecimento.descricao_pesque_pague ||
          "Consulte lagos, modalidades, espécies, valores e regras publicados pela equipe."
        }
        acoes={contato && (
          <a
            className="botao botao-secundario"
            href={montarLinkContato(contato, Boolean(estabelecimento.whatsapp))}
          >
            <Phone size={17} aria-hidden="true" />Contato
          </a>
        )}
      />

      {(conteudo?.horario_hoje || estabelecimento.endereco) && (
        <section className="fishing-visit-strip" aria-label="Funcionamento e localização">
          {conteudo.horario_hoje && (
            <div>
              <Clock3 size={20} aria-hidden="true" />
              <span>
                <strong>{conteudo.aberto_agora ? "Aberto agora" : "Fechado agora"}</strong>
                {conteudo.horario_hoje.fechado
                  ? "Fechado hoje"
                  : `${formatarHora(conteudo.horario_hoje.abre_as)} às ${formatarHora(conteudo.horario_hoje.fecha_as)}`}
              </span>
            </div>
          )}
          {estabelecimento.endereco && (
            estabelecimento.link_mapa ? (
              <a href={estabelecimento.link_mapa} target="_blank" rel="noreferrer">
                <MapPin size={20} aria-hidden="true" />
                <span><strong>Como chegar</strong>{estabelecimento.endereco}</span>
              </a>
            ) : (
              <div><MapPin size={20} aria-hidden="true" /><span><strong>Localização</strong>{estabelecimento.endereco}</span></div>
            )
          )}
        </section>
      )}

      {estabelecimento.aviso_importante && (
        <aside className="important-notice" role="status">
          <AlertTriangle size={18} aria-hidden="true" />
          <span>{estabelecimento.aviso_importante}</span>
        </aside>
      )}

      {!temConteudoOperacional && (
        <EstadoVazio
          icone={<Fish size={38} />}
          titulo="Informações em atualização"
          descricao="A equipe ainda não publicou lagos, espécies, regras ou serviços. Use o contato disponível antes da visita."
        />
      )}

      {conteudo?.lagos?.length > 0 && (
        <section className="public-section" aria-labelledby="lagos-title">
          <div className="section-heading">
            <span className="section-kicker">Estrutura</span>
            <h2 id="lagos-title">Lagos e modalidades</h2>
          </div>
          <div className="fishing-card-grid">
            {conteudo.lagos.map((lago) => (
              <article className="fishing-info-card" key={lago.id}>
                {lago.imagem && <img src={resolverImagem(lago.imagem)} alt={lago.imagem_alt || `Lago ${lago.nome}`} />}
                <div>
                  <span className="info-chip">{lago.modalidade_nome}</span>
                  <h3>{lago.nome}</h3>
                  {lago.descricao && <p>{lago.descricao}</p>}
                  <dl>
                    {Number(lago.valor_diaria) > 0 && <><dt>Diária</dt><dd>{formatadorMoeda.format(lago.valor_diaria)}</dd></>}
                    {lago.capacidade && <><dt>Capacidade</dt><dd>{lago.capacidade} pescadores</dd></>}
                  </dl>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {conteudo?.especies?.length > 0 && (
        <section className="public-section" aria-labelledby="especies-title">
          <div className="section-heading">
            <span className="section-kicker">Espécies</span>
            <h2 id="especies-title">Peixes disponíveis</h2>
          </div>
          <div className="species-grid">
            {conteudo.especies.map((especie) => (
              <article className="species-row" key={especie.id}>
                {especie.imagem ? (
                  <img src={resolverImagem(especie.imagem)} alt={especie.imagem_alt || especie.nome} />
                ) : (
                  <span className="species-icon"><Fish size={22} aria-hidden="true" /></span>
                )}
                <div>
                  <h3>{especie.nome}</h3>
                  {especie.descricao && <p>{especie.descricao}</p>}
                </div>
                <strong>{formatadorMoeda.format(especie.preco_quilo)} / kg</strong>
              </article>
            ))}
          </div>
        </section>
      )}

      {conteudo?.regras?.length > 0 && (
        <section className="public-section rules-section" aria-labelledby="regras-title">
          <div className="section-heading">
            <span className="section-kicker">Antes de pescar</span>
            <h2 id="regras-title">Regras do local</h2>
          </div>
          <ol className="rules-list">
            {conteudo.regras.map((regra, indice) => (
              <li key={regra.id}>
                <span>{String(indice + 1).padStart(2, "0")}</span>
                <div><h3>{regra.titulo}</h3><p>{regra.descricao}</p></div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {conteudo?.servicos?.length > 0 && (
        <section className="public-section" aria-labelledby="servicos-title">
          <div className="section-heading">
            <span className="section-kicker">Apoio</span>
            <h2 id="servicos-title">Serviços e equipamentos</h2>
          </div>
          <div className="services-list">
            {conteudo.servicos.map((servico) => (
              <article key={servico.id}>
                {servico.tipo === "equipamento" ? <Ruler size={20} aria-hidden="true" /> : <Wrench size={20} aria-hidden="true" />}
                <div><h3>{servico.nome}</h3>{servico.descricao && <p>{servico.descricao}</p>}</div>
                {servico.valor !== null && <strong>{formatadorMoeda.format(servico.valor)}</strong>}
              </article>
            ))}
          </div>
        </section>
      )}

      {galeria.length > 0 && (
        <section className="public-section" aria-labelledby="galeria-title">
          <div className="section-heading">
            <span className="section-kicker">Galeria</span>
            <h2 id="galeria-title">Conheça o espaço</h2>
          </div>
          <div className="gallery-grid">
            {galeria.map((imagem) => (
              <figure key={imagem.id}>
                <img src={resolverImagem(imagem.imagem)} alt={imagem.imagem_alt} />
                {imagem.titulo && <figcaption>{imagem.titulo}</figcaption>}
              </figure>
            ))}
          </div>
        </section>
      )}

      {conteudo?.horarios?.length > 0 && (
        <section className="public-section schedule-section" aria-labelledby="horarios-title">
          <div className="section-heading">
            <span className="section-kicker">Funcionamento</span>
            <h2 id="horarios-title">Horários da semana</h2>
          </div>
          <dl className="schedule-list">
            {conteudo.horarios.map((horario) => (
              <div key={horario.id}>
                <dt>{horario.dia_nome}</dt>
                <dd>
                  {horario.fechado ? "Fechado" : `${formatarHora(horario.abre_as)} às ${formatarHora(horario.fecha_as)}`}
                  {horario.observacao && <small>{horario.observacao}</small>}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </div>
  );
}
