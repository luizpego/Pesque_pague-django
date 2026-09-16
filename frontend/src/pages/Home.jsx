import { useEffect, useState } from "react";
import { ArrowRight, Clock3, Fish, MapPin, Phone, ShoppingBag, Utensils } from "lucide-react";
import { Link } from "react-router-dom";
import api from "../api/axios.js";
import Seo from "../components/Seo.jsx";
import { montarLinkContato } from "../utils/formatters.js";
import "../styles/atendimento.css";

export default function Home() {
  const [conteudo, setConteudo] = useState(null);
  const [destaques, setDestaques] = useState([]);

  useEffect(() => {
    api.get("/conteudo-publico/").then(({ data }) => setConteudo(data)).catch(() => {});
    api.get("/cardapio/", { params: { destaque: "true" } }).then(({ data }) => setDestaques((data.results || data).filter(p => p.destaque))).catch(() => {});
  }, []);

  const estabelecimento = conteudo?.estabelecimento || {};
  const contato = estabelecimento.whatsapp || estabelecimento.telefone;

  return (
    <div className="home-page">
      <Seo
        titulo="Pesque & Pague | Restaurante e pesca"
        descricao="Conheça o restaurante, consulte o cardápio e planeje sua visita ao pesque-pague."
        caminho="/"
      />
      <section className="hero">
        <div className="hero-bg" aria-hidden="true" style={estabelecimento.banner ? { backgroundImage: `url("${estabelecimento.banner}")` } : undefined} />
        <div className="hero-content">
          <span className="hero-kicker">
            <MapPin size={16} aria-hidden="true" />
            Restaurante rural e experiência de pesca
          </span>
          <h1>{estabelecimento.nome || "Pesque & Pague"}</h1>
          <p>
            {estabelecimento.descricao_inicio || "Consulte o cardápio, conheça os lagos e planeje sua visita."}
          </p>
          <div className="hero-actions">
            <Link className="botao botao-primario botao-grande" to="/cardapio">
              Ver cardápio
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
            <Link className="botao botao-claro botao-grande" to="/pesque-pague">
              Conhecer a pesca
            </Link>
            <Link className="botao botao-claro" to="/reservar">Reservar</Link>
          </div>
          <div className="hero-proof" aria-label="Informações rápidas">
            <span>
              <Utensils size={18} aria-hidden="true" />
              <small>Cardápio público</small>
            </span>
            <span>
              <Fish size={18} aria-hidden="true" />
              <small>Pesca organizada</small>
            </span>
            {conteudo?.aberto_agora !== null && conteudo?.aberto_agora !== undefined && (
              <span>
                <Clock3 size={18} aria-hidden="true" />
                <small>{conteudo.aberto_agora ? "Aberto agora" : "Fechado agora"}</small>
              </span>
            )}
          </div>
        </div>
      </section>

      {estabelecimento.aviso_importante && (
        <aside className="important-notice" role="status">
          <strong>Aviso importante</strong>
          <span>{estabelecimento.aviso_importante}</span>
        </aside>
      )}

      <section className="experience-split" aria-label="Escolha uma área">
        <article className="experience-panel restaurant-panel">
          <span className="section-kicker">Restaurante</span>
          <Utensils size={30} aria-hidden="true" />
          <h2>Pratos, porções e bebidas em um cardápio fácil de consultar.</h2>
          <p>
            {estabelecimento.descricao_restaurante ||
              "Veja categorias, preços e disponibilidade antes de entrar ou criar uma comanda."}
          </p>
          <Link to="/restaurante" className="text-link">
            Abrir restaurante <ArrowRight size={17} aria-hidden="true" />
          </Link>
        </article>

        <article className="experience-panel fishing-panel">
          <span className="section-kicker">Pesque-pague</span>
          <Fish size={30} aria-hidden="true" />
          <h2>Lagos, espécies, modalidades e regras em um espaço próprio.</h2>
          <p>
            {estabelecimento.descricao_pesque_pague ||
              "Consulte as informações publicadas pela equipe e planeje sua pescaria."}
          </p>
          <Link to="/pesque-pague" className="text-link">
            Ver estrutura de pesca <ArrowRight size={17} aria-hidden="true" />
          </Link>
        </article>
      </section>

      {(estabelecimento.endereco || contato) && (
        <section className="visit-band" aria-labelledby="visita-title">
          <div>
            <span className="section-kicker">Sua visita</span>
            <h2 id="visita-title">Informações diretas, sem esconder o essencial.</h2>
          </div>
          <div className="visit-actions">
            {estabelecimento.endereco && (
              estabelecimento.link_mapa ? (
                <a href={estabelecimento.link_mapa} target="_blank" rel="noreferrer">
                  <MapPin size={18} aria-hidden="true" />
                  {estabelecimento.endereco}
                </a>
              ) : (
                <span><MapPin size={18} aria-hidden="true" />{estabelecimento.endereco}</span>
              )
            )}
            {contato && (
              <a href={montarLinkContato(contato, Boolean(estabelecimento.whatsapp))}>
                <Phone size={18} aria-hidden="true" />
                {contato}
              </a>
            )}
          </div>
        </section>
      )}

      <section className="operations-band">
        <div>
          <span className="section-kicker">Atendimento presencial</span>
          <h2>Monte seu pedido no celular e acerte a conta diretamente no estabelecimento.</h2>
        </div>
        <div className="operations-list">
          <Link className="botao botao-primario" to="/minhas-comandas">Minha comanda</Link>
          <Link className="botao botao-fantasma" to="/entrar">Acesso da equipe</Link>
          <span><ShoppingBag size={16} aria-hidden="true" />Comanda organizada</span>
          <span><Clock3 size={16} aria-hidden="true" />Acompanhamento do preparo</span>
          <span><Fish size={16} aria-hidden="true" />Pesagens separadas</span>
        </div>
      </section>
      {(estabelecimento.descricao_piscinas || estabelecimento.descricao_atrativos) && <section className="visit-band"><div><h2>Piscinas e atrativos</h2><p>{estabelecimento.descricao_piscinas}</p><p>{estabelecimento.descricao_atrativos}</p></div></section>}
      {!!conteudo?.galeria?.length && <section className="public-gallery" aria-label="Fotos do pesqueiro">{conteudo.galeria.map(foto => <figure key={foto.id}><img src={foto.imagem} alt={foto.imagem_alt} loading="lazy" /><figcaption>{foto.titulo}</figcaption></figure>)}</section>}
      {destaques.length > 0 && <section className="visit-band"><h2>Destaques do cardápio</h2><div className="public-highlights">{destaques.map(p => <Link to="/cardapio" key={p.id}>{p.imagem && <img src={p.imagem} alt={p.imagem_alt || p.nome} loading="lazy" />}<strong>{p.nome}</strong><span>R$ {p.preco}</span></Link>)}</div></section>}
    </div>
  );
}
