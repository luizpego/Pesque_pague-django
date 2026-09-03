import { useEffect, useState } from "react";
import { Contrast, Type } from "lucide-react";

/**
 * Barra de recursos de acessibilidade: alto contraste e fonte ampliada.
 * As preferências ficam salvas no navegador (localStorage) e são aplicadas
 * como classes no <body>, lidas pelo CSS do tema.
 */
export default function BarraAcessibilidade() {
  const [altoContraste, setAltoContraste] = useState(
    localStorage.getItem("pp_alto_contraste") === "true"
  );
  const [fonteGrande, setFonteGrande] = useState(
    localStorage.getItem("pp_fonte_grande") === "true"
  );

  useEffect(() => {
    document.body.classList.toggle("alto-contraste", altoContraste);
    localStorage.setItem("pp_alto_contraste", String(altoContraste));
  }, [altoContraste]);

  useEffect(() => {
    document.body.classList.toggle("fonte-grande", fonteGrande);
    localStorage.setItem("pp_fonte_grande", String(fonteGrande));
  }, [fonteGrande]);

  useEffect(() => {
    function aoSincronizar(event) {
      setAltoContraste(Boolean(event.detail?.altoContraste));
      setFonteGrande(Boolean(event.detail?.fonteGrande));
    }

    window.addEventListener("pp-preferencias-visuais", aoSincronizar);
    return () => window.removeEventListener("pp-preferencias-visuais", aoSincronizar);
  }, []);

  return (
    <div className="barra-acessibilidade" role="region" aria-label="Opções de acessibilidade">
      <span>Preferências visuais</span>
      <button
        type="button"
        aria-pressed={altoContraste}
        onClick={() => setAltoContraste((v) => !v)}
      >
        <Contrast size={14} aria-hidden="true" />
        Alto contraste
      </button>
      <button
        type="button"
        aria-pressed={fonteGrande}
        onClick={() => setFonteGrande((v) => !v)}
      >
        <Type size={14} aria-hidden="true" />
        Fonte ampliada
      </button>
    </div>
  );
}
