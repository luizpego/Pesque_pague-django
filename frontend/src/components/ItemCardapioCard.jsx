import { useState } from "react";
import { BadgeCheck, Clock3, PlusCircle } from "lucide-react";
import QuantitySelector from "./QuantitySelector.jsx";
import Spinner from "./Spinner.jsx";
import { formatadorMoeda } from "../utils/formatters.js";

function resolverImagem(src) {
  if (!src) return "/assets/pesque-pague-hero.png";
  if (/^https?:\/\//i.test(src) || src.startsWith("data:")) return src;
  const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:8000/api";
  const origem = apiUrl.replace(/\/api\/?$/, "");
  return `${origem}${src}`;
}

export default function ItemCardapioCard({ item, aoAdicionar }) {
  const [quantidade, setQuantidade] = useState(1);
  const [observacoes, setObservacoes] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function submeter(e) {
    e.preventDefault();
    setEnviando(true);
    try {
      await aoAdicionar(item.id, quantidade, observacoes, item.nome);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <article className={`menu-card item-cardapio ${item.eh_pescado_no_local ? "pescado" : ""}`}>
      <div className="menu-card-media">
        <img
          src={resolverImagem(item.imagem)}
          alt={item.imagem_alt || `Foto do prato ${item.nome}`}
          loading="lazy"
        />
        {item.eh_pescado_no_local && (
          <span className="selo-pescado">
            <BadgeCheck size={14} aria-hidden="true" />
            Pescado no local
          </span>
        )}
      </div>

      <div className="menu-card-body">
        <div className="menu-card-heading">
          <h3>{item.nome}</h3>
          {item.tempo_preparo_min && (
            <span className="menu-meta">
              <Clock3 size={14} aria-hidden="true" />
              {item.tempo_preparo_min} min
            </span>
          )}
        </div>
        {item.descricao && <p>{item.descricao}</p>}
        <p className="preco">
          {formatadorMoeda.format(item.preco)}
          {item.unidade === "kg" && " / kg"}
          {item.unidade === "porcao" && " / porção"}
        </p>
      </div>

      <form onSubmit={submeter}>
        <div className="menu-card-controls">
          <QuantitySelector
            id={`quantidade-${item.id}`}
            label={`quantidade de ${item.nome}`}
            value={quantidade}
            onChange={setQuantidade}
            disabled={enviando}
          />
          <div className="form-grupo compact">
            <label htmlFor={`observacoes-${item.id}`}>Observação</label>
            <input
              id={`observacoes-${item.id}`}
              value={observacoes}
              maxLength={200}
              placeholder="Ex.: sem cebola"
              onChange={(event) => setObservacoes(event.target.value)}
            />
          </div>
        </div>
        <button type="submit" className="botao botao-primario botao-bloco" disabled={enviando}>
          {enviando ? <Spinner claro rotulo="Adicionando" /> : <><PlusCircle size={17} aria-hidden="true" />Adicionar</>}
        </button>
      </form>
    </article>
  );
}
