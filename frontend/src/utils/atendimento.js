import { useRef, useState } from "react";
import api from "../api/axios.js";

export const STATUS_PEDIDO = { recebido: "Recebido", preparando: "Em preparação", pronto: "Pronto", entregue: "Entregue", cancelado: "Cancelado" };
export const FORMAS = { dinheiro: "Dinheiro", pix: "PIX", debito: "Cartão de débito", credito: "Cartão de crédito" };
export const PROXIMO = { recebido: "preparando", preparando: "pronto", pronto: "entregue" };
export const ACAO = { recebido: "Iniciar preparo", preparando: "Marcar pronto", pronto: "Entregar" };
export function podeAvancar(usuario, status) {
  if (usuario?.is_superuser || usuario?.papel === "gerente") return Boolean(PROXIMO[status]);
  return usuario?.papel === "cozinha" ? ["recebido", "preparando", "pronto"].includes(status) : usuario?.papel === "garcom" && status === "pronto";
}
export function erroApi(error) {
  const data = error.response?.data;
  if (!data) return "Não foi possível conectar ao servidor. Tente novamente.";
  if (typeof data === "string") return data.length < 300 ? data : "O servidor não conseguiu concluir a operação.";
  return Object.values(data).map((v) => typeof v === "string" ? v : JSON.stringify(v)).join(" ");
}
// Mantém a mesma chave ao repetir uma solicitação cujo resultado não foi recebido.
export function useOperacao() {
  const lock = useRef(false);
  const chaves = useRef(new Map());
  const [ocupado, setOcupado] = useState(false);
  async function executar(url, dados, metodo = "post") {
    if (lock.current) return null;
    lock.current = true;
    setOcupado(true);
    const assinatura = JSON.stringify([url, dados, metodo]);
    if (!chaves.current.has(assinatura)) chaves.current.set(assinatura, crypto.randomUUID());
    try {
      const { data } = await api[metodo](url, dados, { headers: { "Idempotency-Key": chaves.current.get(assinatura) } });
      chaves.current.delete(assinatura);
      return data;
    } finally {
      lock.current = false;
      setOcupado(false);
    }
  }
  return { executar, ocupado };
}
