import { useState } from "react";
import Spinner from "./Spinner.jsx";

const GOOGLE_SCRIPT_ID = "google-identity-services";

function carregarGoogleIdentity() {
  if (window.google?.accounts?.oauth2) {
    return Promise.resolve(window.google);
  }

  return new Promise((resolve, reject) => {
    const existente = document.getElementById(GOOGLE_SCRIPT_ID);
    if (existente) {
      existente.addEventListener("load", () => resolve(window.google), { once: true });
      existente.addEventListener("error", reject, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = GOOGLE_SCRIPT_ID;
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(window.google);
    script.onerror = () => reject(new Error("Falha ao carregar Google Identity Services."));
    document.head.appendChild(script);
  });
}

export default function GoogleLoginButton({ onCode, onConfigMissing, onError }) {
  const [carregando, setCarregando] = useState(false);
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  async function entrarComGoogle() {
    if (!clientId) {
      onConfigMissing?.();
      return;
    }

    setCarregando(true);
    try {
      const google = await carregarGoogleIdentity();
      const cliente = google.accounts.oauth2.initCodeClient({
        client_id: clientId,
        scope: "openid email profile",
        ux_mode: "popup",
        callback: async (resposta) => {
          if (resposta.error) {
            onError?.("O login com Google foi cancelado ou recusado.");
            setCarregando(false);
            return;
          }

          try {
            await onCode(resposta.code);
          } finally {
            setCarregando(false);
          }
        },
      });
      cliente.requestCode();
    } catch {
      setCarregando(false);
      onError?.("Não foi possível iniciar o Google Login agora.");
    }
  }

  return (
    <button
      type="button"
      className="google-button"
      onClick={entrarComGoogle}
      disabled={carregando}
    >
      {carregando ? (
        <Spinner rotulo="Abrindo Google Login" />
      ) : (
        <svg className="google-mark" aria-hidden="true" viewBox="0 0 18 18" width="18" height="18">
          <path fill="#4285F4" d="M17.6 9.2c0-.6-.1-1.3-.2-1.8H9v3.5h4.8c-.2 1.1-.8 2.1-1.8 2.7v2.3h2.9c1.7-1.6 2.7-3.9 2.7-6.7z" />
          <path fill="#34A853" d="M9 18c2.4 0 4.5-.8 6-2.2l-2.9-2.3c-.8.5-1.8.9-3.1.9-2.4 0-4.4-1.6-5.1-3.7H.9V13c1.5 3 4.6 5 8.1 5z" />
          <path fill="#FBBC05" d="M3.9 10.7c-.2-.5-.3-1.1-.3-1.7s.1-1.2.3-1.7V5H.9C.3 6.2 0 7.6 0 9s.3 2.8.9 4l3-2.3z" />
          <path fill="#EA4335" d="M9 3.6c1.3 0 2.5.5 3.4 1.3L15 2.3C13.5.9 11.4 0 9 0 5.5 0 2.4 2 .9 5l3 2.3C4.6 5.2 6.6 3.6 9 3.6z" />
        </svg>
      )}
      Continuar com Google
    </button>
  );
}
