import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, CreditCard, Fish, Send, Trash2 } from "lucide-react";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import EstadoVazio from "../components/EstadoVazio.jsx";
import PageHeader from "../components/PageHeader.jsx";
import QuantitySelector from "../components/QuantitySelector.jsx";
import Spinner from "../components/Spinner.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import { useCart } from "../context/CartContext.jsx";
import { formatadorMoeda } from "../utils/formatters.js";
import { useState } from "react";

export default function Carrinho() {
  const { comanda, removerItem, atualizarQuantidade, enviarParaCozinha, processando } = useCart();
  const navigate = useNavigate();
  const [itemParaRemover, setItemParaRemover] = useState(null);
  const [confirmarEnvio, setConfirmarEnvio] = useState(false);
  const [atualizandoItemId, setAtualizandoItemId] = useState(null);

  async function confirmarPedido() {
    try {
      await enviarParaCozinha();
      setConfirmarEnvio(false);
    } catch {
      // feedback já tratado via toast no contexto
    }
  }

  async function confirmarRemocao() {
    if (!itemParaRemover) return;
    setAtualizandoItemId(itemParaRemover.id);
    await removerItem(itemParaRemover.id);
    setAtualizandoItemId(null);
    setItemParaRemover(null);
  }

  async function alterarQuantidade(item, quantidade) {
    setAtualizandoItemId(item.id);
    await atualizarQuantidade(item.id, quantidade);
    setAtualizandoItemId(null);
  }

  if (!comanda) {
    return (
      <EstadoVazio
        icone={<Fish size={38} />}
        titulo="Seu carrinho está vazio"
        descricao="Você ainda não abriu uma comanda. Volte ao cardápio e escolha sua mesa para começar a pedir."
        acao={
          <Link className="botao botao-primario" to="/cardapio">
            Ir ao cardápio
          </Link>
        }
      />
    );
  }

  return (
    <div className="cart-page">
      <PageHeader
        etiqueta={`Mesa ${comanda.mesa_numero}`}
        titulo={`Comanda #${comanda.id}`}
        descricao="Revise itens, quantidades e subtotais antes de enviar para a cozinha ou gerar o Pix."
        acoes={<StatusBadge status={comanda.status} />}
      />

      <section className="cart-layout">
        <div className="cart-list">
        {comanda.itens.length === 0 ? (
          <EstadoVazio
            icone={<Fish size={38} />}
            titulo="Comanda ainda sem itens"
            descricao="Volte ao cardápio para escolher seus pratos."
          />
        ) : (
          comanda.itens.map((item) => (
            <article className="cart-item" key={item.id}>
              <div className="cart-item-main">
                <strong>{item.item_cardapio_nome}</strong>
                {item.observacoes && <span>Obs.: {item.observacoes}</span>}
                <small>{formatadorMoeda.format(item.preco_unitario)} cada</small>
              </div>
              <div className="cart-item-actions">
                <QuantitySelector
                  id={`cart-quantidade-${item.id}`}
                  label={`quantidade de ${item.item_cardapio_nome}`}
                  value={Number(item.quantidade) || 1}
                  disabled={comanda.status !== "aberta" || atualizandoItemId === item.id}
                  onChange={(quantidade) => alterarQuantidade(item, quantidade)}
                />
                <span className="cart-subtotal">{formatadorMoeda.format(item.subtotal)}</span>
                <button
                  type="button"
                  className="icon-button danger"
                  onClick={() => setItemParaRemover(item)}
                  aria-label={`Remover ${item.item_cardapio_nome} da comanda`}
                  disabled={comanda.status !== "aberta"}
                >
                  <Trash2 size={18} aria-hidden="true" />
                </button>
              </div>
            </article>
          ))
        )}
        </div>

        <aside className="cart-summary" aria-label="Resumo da comanda">
          <div>
            <span>Itens</span>
            <strong>{comanda.itens.length}</strong>
          </div>
          <div>
            <span>Status</span>
            <StatusBadge status={comanda.status} />
          </div>
          <div className="total-carrinho">
            <span>Total</span>
            <strong>{formatadorMoeda.format(comanda.total)}</strong>
          </div>

          {comanda.pago ? (
            <p className="mensagem-sucesso" role="status">
              Comanda paga. Obrigado pela visita!
            </p>
          ) : (
            comanda.itens.length > 0 && (
              <button
                type="button"
                className="botao botao-primario botao-bloco"
                onClick={() => navigate("/pagamento")}
              >
                <CreditCard size={17} aria-hidden="true" />
                Pagar com Pix
              </button>
            )
          )}

          {comanda.status === "aberta" ? (
            <button
              type="button"
              className="botao botao-secundario botao-bloco"
              onClick={() => setConfirmarEnvio(true)}
              disabled={processando || comanda.itens.length === 0}
            >
              {processando ? <Spinner claro rotulo="Enviando pedido" /> : <><Send size={17} aria-hidden="true" />Enviar para cozinha</>}
            </button>
          ) : (
            <p className="summary-note">A comanda já saiu do modo edição.</p>
          )}

          <button
            type="button"
            className="botao botao-fantasma botao-bloco"
            onClick={() => navigate("/cardapio")}
          >
            <ArrowLeft size={17} aria-hidden="true" />
            Continuar escolhendo
          </button>
        </aside>
      </section>

      <ConfirmDialog
        aberto={Boolean(itemParaRemover)}
        titulo="Remover item da comanda?"
        descricao={itemParaRemover ? `${itemParaRemover.item_cardapio_nome} será removido da comanda aberta.` : ""}
        confirmarTexto="Remover"
        perigoso
        carregando={atualizandoItemId === itemParaRemover?.id}
        onConfirmar={confirmarRemocao}
        onCancelar={() => setItemParaRemover(null)}
      />

      <ConfirmDialog
        aberto={confirmarEnvio}
        titulo="Enviar pedido para a cozinha?"
        descricao="Depois do envio, a equipe assume o preparo e a comanda deixa de ser editável pelo cliente."
        confirmarTexto="Enviar pedido"
        carregando={processando}
        onConfirmar={confirmarPedido}
        onCancelar={() => setConfirmarEnvio(false)}
      />
    </div>
  );
}
