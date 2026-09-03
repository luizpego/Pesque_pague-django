import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ClipboardCopy, CreditCard, QrCode, RefreshCcw } from "lucide-react";
import api from "../api/axios.js";
import EstadoVazio from "../components/EstadoVazio.jsx";
import PageHeader from "../components/PageHeader.jsx";
import Spinner from "../components/Spinner.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import { useCart } from "../context/CartContext.jsx";
import { useToast } from "../context/ToastContext.jsx";
import { formatadorMoeda } from "../utils/formatters.js";

export default function Pagamento() {
  const { comanda, recarregar } = useCart();
  const toast = useToast();
  const navigate = useNavigate();

  const [pagamento, setPagamento] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [copiado, setCopiado] = useState(false);
  const intervaloRef = useRef(null);

  const pararPolling = useCallback(() => {
    if (intervaloRef.current) {
      clearInterval(intervaloRef.current);
      intervaloRef.current = null;
    }
  }, []);

  const consultarStatus = useCallback(async () => {
    if (!comanda) return;
    try {
      const { data } = await api.get(`/comandas/${comanda.id}/status_pagamento/`);
      setPagamento(data);
      if (data.status === "approved") {
        pararPolling();
        recarregar();
        toast.sucesso("Pagamento aprovado.");
      }
      if (["rejected", "cancelled"].includes(data.status)) {
        pararPolling();
      }
    } catch {
      // Se ainda não existe pagamento, apenas ignora; o botão de gerar cuida disso.
    }
  }, [comanda, pararPolling, recarregar]);

  const gerarPagamento = useCallback(async () => {
    if (!comanda) return;
    setCarregando(true);
    setErro("");
    try {
      const { data } = await api.post(`/comandas/${comanda.id}/gerar_pagamento/`);
      setPagamento(data);
    } catch (e) {
      setErro(
        e.response?.data?.detalhe ||
          "Não foi possível gerar o pagamento Pix agora. Tente novamente em instantes."
      );
    } finally {
      setCarregando(false);
    }
  }, [comanda]);

  useEffect(() => {
    if (!comanda) return;
    gerarPagamento();
    return pararPolling;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comanda?.id]);

  useEffect(() => {
    if (!pagamento) return;
    if (["pending", "in_process"].includes(pagamento.status)) {
      intervaloRef.current = setInterval(consultarStatus, 4000);
      return pararPolling;
    }
  }, [pagamento, consultarStatus, pararPolling]);

  async function copiarCodigo() {
    if (!pagamento?.qr_code) return;
    try {
      await navigator.clipboard.writeText(pagamento.qr_code);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 3000);
    } catch {
      setErro("Não foi possível copiar automaticamente. Selecione o código manualmente.");
    }
  }

  if (!comanda) {
    return (
      <EstadoVazio
        icone={<CreditCard size={38} />}
        titulo="Nenhuma comanda em aberto"
        descricao="Você precisa ter uma comanda com itens para gerar um pagamento."
        acao={<Link className="botao botao-primario" to="/cardapio">Voltar ao cardápio</Link>}
      />
    );
  }

  return (
    <div className="payment-page">
      <PageHeader
        etiqueta={`Mesa ${comanda.mesa_numero}`}
        titulo="Pagamento via Pix"
        descricao="Gere o QR Code pelo Mercado Pago e acompanhe a confirmação automaticamente."
        acoes={<strong className="payment-total">{formatadorMoeda.format(comanda.total)}</strong>}
      />

      <section className="payment-layout">
        <div className="payment-card">
          <div className="payment-card-head">
            <span className="panel-icon"><QrCode size={22} aria-hidden="true" /></span>
            <div>
              <h2>QR Code Pix</h2>
              <p>O código fica vinculado à comanda #{comanda.id}.</p>
            </div>
          </div>

          {erro && <p className="mensagem-erro" role="alert">{erro}</p>}

          {carregando && !pagamento && (
            <div className="estado-carregando" role="status" aria-live="polite">
              <Spinner /> Gerando QR Code de pagamento...
            </div>
          )}

          {pagamento && (
            <div className="payment-content" aria-live="polite">
              <StatusBadge status={pagamento.status} tipo="pagamento" />

              {pagamento.status === "approved" && (
                <div className="mensagem-sucesso" role="status">
                  <p>Pagamento aprovado. Obrigado pela visita ao Pesque &amp; Pague.</p>
                  <Link className="botao botao-primario" to="/minhas-comandas">
                    Ver minhas comandas
                  </Link>
                </div>
              )}

              {["rejected", "cancelled"].includes(pagamento.status) && (
                <div>
                  <p className="mensagem-erro" role="alert">
                    O pagamento não foi concluído. Você pode tentar gerar um novo QR Code.
                  </p>
                  <button type="button" className="botao botao-primario botao-bloco" onClick={gerarPagamento}>
                    <RefreshCcw size={17} aria-hidden="true" />
                    Gerar novo QR Code
                  </button>
                </div>
              )}

              {["pending", "in_process"].includes(pagamento.status) && (
                <>
                  {pagamento.qr_code_base64 ? (
                    <img
                      className="qr-code"
                      src={`data:image/png;base64,${pagamento.qr_code_base64}`}
                      alt="QR Code Pix para pagamento da comanda no Mercado Pago"
                    />
                  ) : (
                    <div className="qr-placeholder" aria-hidden="true">
                      <QrCode size={54} />
                    </div>
                  )}

                  <div className="form-grupo">
                    <label htmlFor="codigo-pix">Código Pix copia e cola</label>
                    <textarea
                      id="codigo-pix"
                      readOnly
                      rows={4}
                      value={pagamento.qr_code}
                      onFocus={(e) => e.target.select()}
                    />
                  </div>
                  <button type="button" className="botao botao-secundario botao-bloco" onClick={copiarCodigo}>
                    <ClipboardCopy size={17} aria-hidden="true" />
                    {copiado ? "Código copiado" : "Copiar código Pix"}
                  </button>

                  <p className="summary-note" role="status" aria-live="polite">
                    A página consulta o status do Mercado Pago em intervalos curtos.
                  </p>
                </>
              )}
            </div>
          )}
        </div>

        <aside className="payment-summary">
          <h2>Resumo</h2>
          <div><span>Mesa</span><strong>{comanda.mesa_numero}</strong></div>
          <div><span>Comanda</span><strong>#{comanda.id}</strong></div>
          <div><span>Total</span><strong>{formatadorMoeda.format(comanda.total)}</strong></div>
          <button type="button" className="botao botao-fantasma botao-bloco" onClick={() => navigate("/carrinho")}>
            <ArrowLeft size={17} aria-hidden="true" />
            Voltar ao carrinho
          </button>
        </aside>
      </section>
    </div>
  );
}
