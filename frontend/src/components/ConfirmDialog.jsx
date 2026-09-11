import { useEffect, useId, useRef } from "react";
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
  children,
}) {
  const tituloId = useId();
  const descricaoId = useId();
  const dialogRef = useRef(null);
  const botaoCancelarRef = useRef(null);
  const focoAnteriorRef = useRef(null);
  const onCancelarRef = useRef(onCancelar);
  const carregandoRef = useRef(carregando);

  useEffect(() => {
    onCancelarRef.current = onCancelar;
    carregandoRef.current = carregando;
  }, [carregando, onCancelar]);

  useEffect(() => {
    if (!aberto) return undefined;
    focoAnteriorRef.current = document.activeElement;
    botaoCancelarRef.current?.focus();
    function controlarTeclado(event) {
      if (event.key === "Escape" && !carregandoRef.current) {
        onCancelarRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focaveis = dialogRef.current?.querySelectorAll(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]'
      );
      if (!focaveis?.length) return;
      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];
      if (event.shiftKey && document.activeElement === primeiro) {
        event.preventDefault();
        ultimo.focus();
      } else if (!event.shiftKey && document.activeElement === ultimo) {
        event.preventDefault();
        primeiro.focus();
      }
    }
    document.addEventListener("keydown", controlarTeclado);
    return () => {
      document.removeEventListener("keydown", controlarTeclado);
      focoAnteriorRef.current?.focus?.();
    };
  }, [aberto]);

  if (!aberto) return null;

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={() => !carregando && onCancelar()}
    >
      <section
        ref={dialogRef}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        aria-describedby={descricao ? descricaoId : undefined}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="icon-button dialog-close"
          aria-label="Fechar"
          onClick={onCancelar}
          disabled={carregando}
        >
          <X size={18} aria-hidden="true" />
        </button>
        <div className={`dialog-icon ${perigoso ? "dialog-icon-danger" : ""}`}>
          <AlertTriangle size={22} aria-hidden="true" />
        </div>
        <h2 id={tituloId}>{titulo}</h2>
        {descricao && <p id={descricaoId}>{descricao}</p>}
        {children}
        <div className="dialog-actions">
          <button
            ref={botaoCancelarRef}
            type="button"
            className="botao botao-fantasma"
            onClick={onCancelar}
            disabled={carregando}
          >
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
