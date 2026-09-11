import { ArrowLeft, SearchX } from "lucide-react";
import { Link } from "react-router-dom";
import EstadoVazio from "../components/EstadoVazio.jsx";
import Seo from "../components/Seo.jsx";

export default function NaoEncontrada() {
  return (
    <>
      <Seo
        titulo="Página não encontrada | Pesque & Pague"
        descricao="A página solicitada não existe."
        caminho={window.location.pathname}
        noindex
      />
      <EstadoVazio
        icone={<SearchX size={40} />}
        titulo="Página não encontrada"
        descricao="O endereço informado não corresponde a uma página deste site."
        acao={<Link className="botao botao-primario" to="/"><ArrowLeft size={17} aria-hidden="true" />Voltar ao início</Link>}
      />
    </>
  );
}
