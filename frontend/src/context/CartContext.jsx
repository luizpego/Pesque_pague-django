import { createContext, useCallback, useContext, useEffect, useState } from "react";
import api from "../api/axios.js";
import { useAuth } from "./AuthContext.jsx";
import { useToast } from "./ToastContext.jsx";

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const { estaAutenticado } = useAuth();
  const toast = useToast();
  const [comanda, setComanda] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [processando, setProcessando] = useState(false);

  const buscarComandaAberta = useCallback(async () => {
    if (!estaAutenticado) return;
    setCarregando(true);
    try {
      const { data } = await api.get("/comandas/", { params: { status: "aberta" } });
      const lista = data.results ?? data;
      setComanda(lista.length ? lista[0] : null);
    } catch {
      toast.erro("Não foi possível carregar sua comanda.");
    } finally {
      setCarregando(false);
    }
  }, [estaAutenticado]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (estaAutenticado) buscarComandaAberta();
    else setComanda(null);
  }, [estaAutenticado, buscarComandaAberta]);

  async function abrirComanda(mesaId) {
    setProcessando(true);
    try {
      const { data } = await api.post("/comandas/", { mesa: mesaId });
      setComanda(data);
      toast.sucesso(`Comanda aberta na Mesa ${data.mesa_numero}!`);
      return data;
    } catch {
      toast.erro("Não foi possível abrir a comanda. Verifique a mesa escolhida.");
      throw new Error("falha ao abrir comanda");
    } finally {
      setProcessando(false);
    }
  }

  async function adicionarItem(itemCardapioId, quantidade = 1, observacoes = "", nomeItem = "Item") {
    if (!comanda) {
      toast.erro("Escolha uma mesa antes de adicionar itens ao carrinho.");
      return;
    }
    try {
      const { data } = await api.post(`/comandas/${comanda.id}/adicionar_item/`, {
        item_cardapio: itemCardapioId,
        quantidade,
        observacoes,
      });
      setComanda(data);
      toast.sucesso(`${nomeItem} adicionado ao carrinho.`);
    } catch {
      toast.erro("Não foi possível adicionar o item ao carrinho.");
    }
  }

  async function removerItem(itemComandaId) {
    if (!comanda) return;
    try {
      const { data } = await api.post(`/comandas/${comanda.id}/remover_item/${itemComandaId}/`);
      setComanda(data);
      toast.info("Item removido da comanda.");
    } catch {
      toast.erro("Não foi possível remover o item.");
    }
  }

  async function atualizarQuantidade(itemComandaId, quantidade) {
    if (!comanda) return;
    try {
      await api.patch(`/itens-comanda/${itemComandaId}/`, { quantidade });
      await buscarComandaAberta();
      toast.info("Quantidade atualizada.");
    } catch {
      toast.erro("Não foi possível atualizar a quantidade.");
    }
  }

  async function enviarParaCozinha() {
    if (!comanda) return;
    setProcessando(true);
    try {
      const { data } = await api.post(`/comandas/${comanda.id}/alterar_status/`, {
        status: "enviada",
      });
      setComanda(data);
      toast.sucesso("Pedido enviado para a cozinha.");
      return data;
    } catch {
      toast.erro("Não foi possível enviar a comanda.");
      throw new Error("falha ao enviar comanda");
    } finally {
      setProcessando(false);
    }
  }

  const totalItens = comanda?.itens?.reduce((soma, i) => soma + Number(i.quantidade), 0) ?? 0;

  const valor = {
    comanda,
    carregando,
    processando,
    totalItens,
    abrirComanda,
    adicionarItem,
    removerItem,
    atualizarQuantidade,
    enviarParaCozinha,
    recarregar: buscarComandaAberta,
  };

  return <CartContext.Provider value={valor}>{children}</CartContext.Provider>;
}

export function useCart() {
  const contexto = useContext(CartContext);
  if (!contexto) throw new Error("useCart precisa estar dentro de <CartProvider>");
  return contexto;
}
