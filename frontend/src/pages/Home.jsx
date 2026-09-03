import { Link } from "react-router-dom";
import { ArrowRight, Clock3, CreditCard, Fish, MapPin, ShieldCheck, ShoppingBag } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";

const DESTAQUES = [
  { icone: Fish, titulo: "Do lago para a mesa", texto: "Peixes frescos, pratos da casa e preparo acompanhado pela comanda digital." },
  { icone: ShoppingBag, titulo: "Pedido sem fila", texto: "Escolha a mesa, monte o carrinho e envie tudo para a equipe em poucos toques." },
  { icone: CreditCard, titulo: "Pagamento com Pix", texto: "Fluxo preparado para QR Code via Mercado Pago, com status visível ao cliente." },
  { icone: ShieldCheck, titulo: "Operação organizada", texto: "Painel da equipe com status, comandas ativas e atualização recorrente." },
];

const PASSOS = [
  "Escolha sua mesa ou ponto de pesca",
  "Monte a comanda com peixes, pratos e bebidas",
  "Acompanhe preparo, entrega e pagamento",
];

export default function Home() {
  const { estaAutenticado } = useAuth();

  return (
    <div className="home-page">
      <section className="hero">
        <div className="hero-bg" aria-hidden="true" />
        <div className="hero-content">
          <span className="hero-kicker">
            <MapPin size={16} aria-hidden="true" />
            Experiência rural com operação digital
          </span>
          <h1>Pesca, cozinha e comanda em um fluxo tranquilo.</h1>
          <p>
            Um sistema feito para pesque e pague que une lazer no lago,
            cardápio digital, pedidos para a cozinha, histórico do cliente e
            painel operacional para a equipe.
          </p>
          <div className="hero-actions">
            <Link className="botao botao-primario botao-grande" to={estaAutenticado ? "/cardapio" : "/entrar"}>
              {estaAutenticado ? "Abrir cardápio" : "Entrar para pedir"}
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
            <Link className="botao botao-claro botao-grande" to="/cadastro">
              Criar conta
            </Link>
          </div>
          <div className="hero-proof" aria-label="Resumo da operação">
            <span><strong>15 min</strong><small>tempo médio exibido</small></span>
            <span><strong>JWT</strong><small>sessão protegida</small></span>
            <span><strong>Pix</strong><small>pagamento preparado</small></span>
          </div>
        </div>
      </section>

      <section className="section-flow" aria-labelledby="fluxo-title">
        <div className="section-heading">
          <span className="section-kicker">Fluxo do cliente</span>
          <h2 id="fluxo-title">Do primeiro lançamento ao fechamento da conta.</h2>
        </div>
        <ol className="steps">
          {PASSOS.map((passo, index) => (
            <li key={passo}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              {passo}
            </li>
          ))}
        </ol>
      </section>

      <section className="feature-grid" aria-label="Destaques do sistema">
        {DESTAQUES.map(({ icone: Icone, titulo, texto }) => (
          <article className="feature-card reveal" key={titulo}>
            <Icone size={24} aria-hidden="true" />
            <h3>{titulo}</h3>
            <p>{texto}</p>
          </article>
        ))}
      </section>

      <section className="operations-band">
        <div>
          <span className="section-kicker">Equipe</span>
          <h2>Um painel para cozinha, atendimento e gerência enxergarem a mesma fila.</h2>
        </div>
        <div className="operations-list">
          <span><Clock3 size={16} aria-hidden="true" />Atualização periódica</span>
          <span><ShieldCheck size={16} aria-hidden="true" />Rotas por permissão</span>
          <span><ShoppingBag size={16} aria-hidden="true" />Comandas detalhadas</span>
        </div>
      </section>
    </div>
  );
}
