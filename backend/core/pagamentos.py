"""
Integração com o Mercado Pago para pagamento via Pix com QR Code.

Fluxo:
1. `criar_pagamento_pix` cria uma cobrança Pix na API do Mercado Pago para
   o valor total da comanda e devolve o QR Code (imagem em base64 e o
   código "copia e cola").
2. O Mercado Pago notifica o backend via webhook (`/api/pagamentos/webhook/`)
   quando o status do pagamento muda.
3. Como nem sempre há uma URL pública disponível em desenvolvimento, o
   frontend também pode chamar `atualizar_status_pagamento` via
   `/api/comandas/{id}/status_pagamento/`, que consulta a API do Mercado
   Pago diretamente (polling).

Para usar de verdade, crie uma conta de testes no Mercado Pago Developers
(https://www.mercadopago.com.br/developers) e configure `MERCADO_PAGO_ACCESS_TOKEN`
no arquivo `.env` do backend com o "Access Token" (de teste ou de produção).
"""
import mercadopago
from django.conf import settings
from django.utils import timezone

from .models import Pagamento


class MercadoPagoNaoConfiguradoError(Exception):
    """Levantado quando MERCADO_PAGO_ACCESS_TOKEN não está definido."""


def _obter_sdk():
    if not settings.MERCADO_PAGO_ACCESS_TOKEN:
        raise MercadoPagoNaoConfiguradoError(
            "Defina MERCADO_PAGO_ACCESS_TOKEN no .env do backend para habilitar pagamentos."
        )
    return mercadopago.SDK(settings.MERCADO_PAGO_ACCESS_TOKEN)


def criar_pagamento_pix(comanda, usuario):
    """Cria uma cobrança Pix no Mercado Pago para o total da comanda."""
    sdk = _obter_sdk()

    dados_pagamento = {
        "transaction_amount": float(comanda.total),
        "description": f"Comanda #{comanda.id} - Mesa {comanda.mesa.numero} - Pesque & Pague",
        "payment_method_id": "pix",
        "payer": {
            "email": usuario.email or f"cliente{usuario.id}@pesqueepague.com.br",
            "first_name": usuario.first_name or usuario.username,
        },
        "external_reference": str(comanda.id),
    }
    if settings.MERCADO_PAGO_WEBHOOK_URL:
        dados_pagamento["notification_url"] = settings.MERCADO_PAGO_WEBHOOK_URL

    resultado = sdk.payment().create(dados_pagamento)
    resposta = resultado["response"]

    if resultado["status"] not in (200, 201):
        raise RuntimeError(
            f"Mercado Pago recusou a criação do pagamento: {resposta.get('message', resposta)}"
        )

    dados_transacao = resposta.get("point_of_interaction", {}).get("transaction_data", {})

    pagamento = Pagamento.objects.create(
        comanda=comanda,
        mercado_pago_id=str(resposta["id"]),
        status=resposta.get("status", Pagamento.Status.PENDENTE),
        valor=comanda.total,
        qr_code=dados_transacao.get("qr_code", ""),
        qr_code_base64=dados_transacao.get("qr_code_base64", ""),
    )
    return pagamento


def atualizar_status_pagamento(pagamento):
    """Consulta o status atual do pagamento na API do Mercado Pago e sincroniza."""
    sdk = _obter_sdk()
    resultado = sdk.payment().get(pagamento.mercado_pago_id)
    resposta = resultado["response"]
    novo_status = resposta.get("status", pagamento.status)

    if novo_status != pagamento.status:
        pagamento.status = novo_status
        pagamento.save(update_fields=["status", "atualizado_em"])

        if novo_status == Pagamento.Status.APROVADO and not pagamento.comanda.pago:
            comanda = pagamento.comanda
            comanda.pago = True
            comanda.pago_em = timezone.now()
            comanda.save(update_fields=["pago", "pago_em"])

    return pagamento
