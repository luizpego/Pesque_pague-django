import { useEffect, useState } from "react";
import { ArrowRight, Clock3, Utensils } from "lucide-react";
import { Link } from "react-router-dom";
import api from "../api/axios.js";
import PageHeader from "../components/PageHeader.jsx";
import Seo from "../components/Seo.jsx";

function resolverImagem(src) {
  if (!src || /^https?:\/\//i.test(src)) return src;
  const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:8000/api";
  return `${apiUrl.replace(/\/api\/?$/, "")}${src}`;
}

export default function Restaurante() {
  const [conteudo, setConteudo] = useState(null);

  useEffect(() => {
    api.get("/conteudo-publico/").then(({ data }) => setConteudo(data)).catch(() => {});
  }, []);

  const estabelecimento = conteudo?.estabelecimento || {};
  const fotos = (conteudo?.galeria || []).filter((imagem) => imagem.area === "restaurante");

  return (
    <div className="restaurant-page">
      <Seo
        titulo="Restaurante | Pesque & Pague"
        descricao="Conheça o restaurante, consulte o cardápio público e veja as informações para sua visita."
        caminho="/restaurante"
      />
      <PageHeader
        etiqueta="Restaurante"
        titulo="Comida feita para acompanhar um dia inteiro de lazer."
        descricao={estabelecimento.descricao_restaurante || "Consulte pratos, porções, bebidas, preços e disponibilidade antes da visita."}
        acoes={
          <Link className="botao botao-primario" to="/cardapio">
            Abrir cardápio <ArrowRight size={17} aria-hidden="true" />
          </Link>
        }
      />

      <section className="restaurant-summary" aria-label="Informações do restaurante">
        <div><Utensils size={22} aria-hidden="true" /><strong>Cardápio público</strong><span>Preços e disponibilidade atualizados pela equipe.</span></div>
        <div><Clock3 size={22} aria-hidden="true" /><strong>Pedido presencial</strong><span>Abra a comanda somente quando já estiver no local.</span></div>
      </section>

      {fotos.length > 0 && (
        <section className="public-section" aria-labelledby="restaurante-galeria">
          <div className="section-heading">
            <span className="section-kicker">Ambiente</span>
            <h2 id="restaurante-galeria">Conheça o restaurante</h2>
          </div>
          <div className="gallery-grid">
            {fotos.map((foto) => (
              <figure key={foto.id}>
                <img src={resolverImagem(foto.imagem)} alt={foto.imagem_alt} loading="lazy" />
                {foto.titulo && <figcaption>{foto.titulo}</figcaption>}
              </figure>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
