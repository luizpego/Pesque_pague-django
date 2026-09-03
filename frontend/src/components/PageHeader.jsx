export default function PageHeader({ etiqueta, titulo, descricao, acoes, children }) {
  return (
    <section className="page-header">
      <div>
        {etiqueta && <span className="section-kicker">{etiqueta}</span>}
        <h1>{titulo}</h1>
        {descricao && <p>{descricao}</p>}
        {children}
      </div>
      {acoes && <div className="page-header-actions">{acoes}</div>}
    </section>
  );
}
