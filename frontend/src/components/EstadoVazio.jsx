export default function EstadoVazio({ icone = "i", titulo, descricao, acao }) {
  return (
    <div className="estado-vazio">
      <span className="icone" aria-hidden="true">
        {icone}
      </span>
      <h3>{titulo}</h3>
      {descricao && <p>{descricao}</p>}
      {acao}
    </div>
  );
}
