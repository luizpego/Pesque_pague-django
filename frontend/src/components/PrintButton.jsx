import { useState } from "react";
import { Printer } from "lucide-react";
import api from "../api/axios.js";
import { useToast } from "../context/ToastContext.jsx";

export default function PrintButton({
  origem,
  origemId,
  tipoDocumento,
  rotulo = "Visualizar impressão",
  compacto = false,
}) {
  const toast = useToast();
  const [gerando, setGerando] = useState(false);

  async function abrirPrevia() {
    const janela = window.open("about:blank", "_blank");
    if (janela) janela.opener = null;
    setGerando(true);
    try {
      const recurso = origem === "pesca" ? "registros-pesca" : "comandas";
      await api.post(`/${recurso}/${origemId}/gerar_impressao/`, {
        tipo_documento: tipoDocumento,
      });
      const destino = `/imprimir/${origem}/${origemId}?tipo=${encodeURIComponent(tipoDocumento)}`;
      if (janela) janela.location.href = destino;
      else window.location.assign(destino);
    } catch {
      if (janela) janela.close();
      toast.erro("Não foi possível gerar a prévia de impressão.");
    } finally {
      setGerando(false);
    }
  }

  return (
    <button
      type="button"
      className={`botao botao-fantasma ${compacto ? "botao-compacto" : "botao-bloco"}`}
      onClick={abrirPrevia}
      disabled={gerando}
    >
      <Printer size={16} aria-hidden="true" />
      {gerando ? "Gerando..." : rotulo}
    </button>
  );
}
