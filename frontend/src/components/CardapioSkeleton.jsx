export default function CardapioSkeleton({ quantidade = 6 }) {
  return (
    <div className="grade-cardapio" aria-hidden="true">
      {Array.from({ length: quantidade }).map((_, i) => (
        <div className="menu-card skeleton-menu-card" key={i}>
          <div className="skeleton skeleton-media" />
          <div className="skeleton skeleton-linha" style={{ width: "52%" }} />
          <div className="skeleton skeleton-linha" style={{ width: "88%" }} />
          <div className="skeleton skeleton-linha" style={{ width: "70%" }} />
          <div className="skeleton skeleton-linha" style={{ width: "38%" }} />
        </div>
      ))}
    </div>
  );
}
