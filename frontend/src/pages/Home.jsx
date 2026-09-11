import { useEffect, useState } from "react";
import { ArrowRight, Clock3, Fish, MapPin, Phone, ShoppingBag, Utensils } from "lucide-react";
import { Link } from "react-router-dom";
import api from "../api/axios.js";
import Seo from "../components/Seo.jsx";
import { montarLinkContato } from "../utils/formatters.js";

export default function Home() {
  const [conteudo, setConteudo] = useState(null);

  useEffect(() => {
    api.get("/conteudo-publico/").then(({ data }) => setConteudo(data)).catch(() => {});
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
        <div className="hero-bg" aria-hidden="true" />
        <div className="hero-content">
          <span className="hero-kicker">
            <MapPin size={16} aria-hidden="true" />
            Restaurante rural e experiência de pesca
          </span>
          <h1>{estabelecimento.nome || "Pesque & Pague"}</h1>
          <p>
            Consulte o cardápio sem cadastro, conheça a estrutura dos lagos e
            encontre as informações da sua visita em dois ambientes bem separados.
          </p>
          <div className="hero-actions">
            <Link className="botao botao-primario botao-grande" to="/cardapio">
              Ver cardápio
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
            <Link className="botao botao-claro botao-grande" to="/pesque-pague">
              Conhecer a pesca
            </Link>
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
          <span><ShoppingBag size={16} aria-hidden="true" />Comanda organizada</span>
          <span><Clock3 size={16} aria-hidden="true" />Acompanhamento do preparo</span>
          <span><Fish size={16} aria-hidden="true" />Pesagens separadas</span>
        </div>
      </section>
    </div>
  );
}
