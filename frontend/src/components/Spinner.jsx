export default function Spinner({ claro = false, rotulo = "Carregando" }) {
  return <span className={`spinner ${claro ? "spinner-claro" : ""}`} role="status" aria-label={rotulo} />;
}
