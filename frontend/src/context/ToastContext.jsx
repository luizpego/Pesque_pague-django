import { createContext, useCallback, useContext, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";

const ToastContext = createContext(null);
let proximoId = 1;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef({});

  const remover = useCallback((id) => {
    setToasts((atual) => atual.map((t) => (t.id === id ? { ...t, saindo: true } : t)));
    setTimeout(() => {
      setToasts((atual) => atual.filter((t) => t.id !== id));
    }, 200);
    clearTimeout(timers.current[id]);
    delete timers.current[id];
  }, []);

  const notificar = useCallback(
    (mensagem, tipo = "info", duracao = 4000) => {
      const id = proximoId++;
      setToasts((atual) => [...atual, { id, mensagem, tipo, saindo: false }]);
      timers.current[id] = setTimeout(() => remover(id), duracao);
      return id;
    },
    [remover]
  );

  function renderizarIcone(tipo) {
    if (tipo === "sucesso") return <CheckCircle2 size={18} aria-hidden="true" />;
    if (tipo === "erro") return <AlertTriangle size={18} aria-hidden="true" />;
    return <Info size={18} aria-hidden="true" />;
  }

  const valor = {
    sucesso: (msg, duracao) => notificar(msg, "sucesso", duracao),
    erro: (msg, duracao) => notificar(msg, "erro", duracao ?? 6000),
    info: (msg, duracao) => notificar(msg, "info", duracao),
  };

  return (
    <ToastContext.Provider value={valor}>
      {children}
      <div className="toast-container" aria-live="polite" aria-atomic="false">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.tipo} ${t.saindo ? "saindo" : ""}`} role="status">
            {renderizarIcone(t.tipo)}
            <span>{t.mensagem}</span>
            <button
              type="button"
              className="toast-fechar"
              aria-label="Fechar notificação"
              onClick={() => remover(t.id)}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const contexto = useContext(ToastContext);
  if (!contexto) throw new Error("useToast precisa estar dentro de <ToastProvider>");
  return contexto;
}
