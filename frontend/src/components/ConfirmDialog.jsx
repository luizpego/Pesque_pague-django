import { AlertTriangle, X } from "lucide-react";

export default function ConfirmDialog({
  aberto,
  titulo,
  descricao,
  confirmarTexto = "Confirmar",
  cancelarTexto = "Cancelar",
  perigoso = false,
  carregando = false,
  onConfirmar,
  onCancelar,
}) {
  if (!aberto) return null;

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onCancelar}>
      <section
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button type="button" className="icon-button dialog-close" aria-label="Fechar" onClick={onCancelar}>
          <X size={18} aria-hidden="true" />
        </button>
        <div className={`dialog-icon ${perigoso ? "dialog-icon-danger" : ""}`}>
          <AlertTriangle size={22} aria-hidden="true" />
        </div>
        <h2 id="dialog-title">{titulo}</h2>
        {descricao && <p>{descricao}</p>}
        <div className="dialog-actions">
          <button type="button" className="botao botao-fantasma" onClick={onCancelar}>
            {cancelarTexto}
          </button>
          <button
            type="button"
            className={`botao ${perigoso ? "botao-perigo" : "botao-primario"}`}
            onClick={onConfirmar}
            disabled={carregando}
          >
            {carregando ? "Processando..." : confirmarTexto}
          </button>
        </div>
      </section>
    </div>
  );
}
