import hashlib
import hmac
from decimal import Decimal

from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from .models import (
    CategoriaCardapio,
    Comanda,
    EspeciePeixe,
    ImpressaoDocumento,
    ItemCardapio,
    LagoPesca,
    Mesa,
    RegistroPesca,
    Usuario,
)


class BaseAPITestCase(APITestCase):
    def setUp(self):
        self.cliente = Usuario.objects.create_user(username="cliente_teste", password="senha-forte-123")
        self.staff = Usuario.objects.create_user(
            username="atendente_teste",
            password="senha-forte-123",
            papel=Usuario.Papel.GERENTE,
        )


class ConteudoPublicoTests(BaseAPITestCase):
    def setUp(self):
        super().setUp()
        categoria = CategoriaCardapio.objects.create(nome="Pratos", ordem=1)
        ItemCardapio.objects.create(
            categoria=categoria,
            nome="Prato teste",
            preco=Decimal("25.00"),
            disponivel=True,
        )
        ItemCardapio.objects.create(
            categoria=categoria,
            nome="Item indisponível",
            preco=Decimal("10.00"),
            disponivel=False,
        )

    def test_cardapio_e_conteudo_sao_publicos(self):
        resposta_cardapio = self.client.get("/api/cardapio/")
        resposta_conteudo = self.client.get("/api/conteudo-publico/")

        self.assertEqual(resposta_cardapio.status_code, status.HTTP_200_OK)
        self.assertEqual(resposta_conteudo.status_code, status.HTTP_200_OK)
        self.assertIn("pedidos_habilitados", resposta_conteudo.data)
        nomes = [item["nome"] for item in resposta_cardapio.data["results"]]
        self.assertNotIn("Item indisponível", nomes)

    def test_mesas_exigem_autenticacao(self):
        resposta = self.client.get("/api/mesas/")
        self.assertEqual(resposta.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_cliente_nao_altera_catalogo(self):
        self.client.force_authenticate(self.cliente)
        resposta = self.client.post(
            "/api/cardapio/",
            {"nome": "Tentativa", "categoria": 1, "preco": "1.00"},
        )
        self.assertEqual(resposta.status_code, status.HTTP_403_FORBIDDEN)


@override_settings(ORDERS_ENABLED=True, ONLINE_PAYMENTS_ENABLED=False)
class ComandaTests(BaseAPITestCase):
    def setUp(self):
        super().setUp()
        self.mesa = Mesa.objects.create(numero=99, ativa=True)
        categoria = CategoriaCardapio.objects.create(nome="Porções", ordem=1)
        self.item = ItemCardapio.objects.create(
            categoria=categoria,
            nome="Porção teste",
            preco=Decimal("20.00"),
            disponivel=True,
        )
        self.client.force_authenticate(self.cliente)

    def abrir_comanda(self):
        resposta = self.client.post("/api/comandas/", {"mesa": self.mesa.id})
        self.assertEqual(resposta.status_code, status.HTTP_201_CREATED)
        return resposta.data

    def test_preco_e_total_sao_calculados_no_backend(self):
        comanda = self.abrir_comanda()
        resposta = self.client.post(
            f"/api/comandas/{comanda['id']}/adicionar_item/",
            {
                "item_cardapio": self.item.id,
                "quantidade": "2.50",
                "preco_unitario": "0.01",
            },
        )

        self.assertEqual(resposta.status_code, status.HTTP_200_OK)
        self.assertEqual(Decimal(resposta.data["itens"][0]["preco_unitario"]), Decimal("20.00"))
        self.assertEqual(Decimal(resposta.data["total"]), Decimal("50.00"))

    def test_quantidade_invalida_e_edicao_pos_envio_sao_bloqueadas(self):
        comanda = self.abrir_comanda()
        invalida = self.client.post(
            f"/api/comandas/{comanda['id']}/adicionar_item/",
            {"item_cardapio": self.item.id, "quantidade": "-1"},
        )
        self.assertEqual(invalida.status_code, status.HTTP_400_BAD_REQUEST)

        item = self.client.post(
            f"/api/comandas/{comanda['id']}/adicionar_item/",
            {"item_cardapio": self.item.id, "quantidade": "1"},
        ).data["itens"][0]
        self.client.post(f"/api/comandas/{comanda['id']}/alterar_status/", {"status": "enviada"})
        edicao = self.client.patch(f"/api/itens-comanda/{item['id']}/", {"quantidade": "3"})
        self.assertEqual(edicao.status_code, status.HTTP_400_BAD_REQUEST)

    def test_pagamento_online_fica_protegido_e_desativado(self):
        comanda = self.abrir_comanda()
        resposta = self.client.post(f"/api/comandas/{comanda['id']}/gerar_pagamento/")
        self.assertEqual(resposta.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(user=None)
        sem_login = self.client.post(f"/api/comandas/{comanda['id']}/gerar_pagamento/")
        self.assertEqual(sem_login.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_documento_de_comanda_nao_duplica_ao_reimprimir(self):
        comanda = self.abrir_comanda()
        url = f"/api/comandas/{comanda['id']}/solicitar_impressao/"
        primeira = self.client.post(url, {"tipo_documento": "comanda_cliente"})
        segunda = self.client.post(url, {"tipo_documento": "comanda_cliente"})

        self.assertEqual(primeira.data["status"], "solicitado")
        self.assertEqual(segunda.data["status"], "reimpresso")
        self.assertEqual(segunda.data["quantidade_solicitacoes"], 2)
        self.assertEqual(ImpressaoDocumento.objects.filter(comanda_id=comanda["id"]).count(), 1)


class RegistroPescaTests(BaseAPITestCase):
    def setUp(self):
        super().setUp()
        self.lago = LagoPesca.objects.create(
            nome="Lago teste",
            modalidade=LagoPesca.Modalidade.PESQUE_PAGUE,
            valor_diaria=Decimal("15.00"),
        )
        self.especie = EspeciePeixe.objects.create(
            nome="Espécie teste",
            preco_quilo=Decimal("42.50"),
        )

    def test_cliente_nao_acessa_operacao_interna(self):
        self.client.force_authenticate(self.cliente)
        resposta = self.client.get("/api/registros-pesca/")
        self.assertEqual(resposta.status_code, status.HTTP_403_FORBIDDEN)

    def test_pesagem_usa_preco_da_especie_e_calcula_total(self):
        self.client.force_authenticate(self.staff)
        registro = self.client.post(
            "/api/registros-pesca/",
            {
                "pescador_nome": "Pescador teste",
                "lago": self.lago.id,
                "modalidade": "pesque_pague",
                "valor_entrada": "15.00",
            },
        )
        self.assertEqual(registro.status_code, status.HTTP_201_CREATED)

        resposta = self.client.post(
            f"/api/registros-pesca/{registro.data['id']}/adicionar_captura/",
            {
                "especie": self.especie.id,
                "peso_kg": "2.000",
                "preco_quilo": "0.01",
            },
        )
        self.assertEqual(resposta.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Decimal(resposta.data["capturas"][0]["preco_quilo"]), Decimal("42.50"))
        self.assertEqual(Decimal(resposta.data["total"]), Decimal("100.00"))

        encerrado = self.client.post(f"/api/registros-pesca/{registro.data['id']}/encerrar/")
        self.assertEqual(encerrado.data["status"], RegistroPesca.Status.ENCERRADO)
        nova_pesagem = self.client.post(
            f"/api/registros-pesca/{registro.data['id']}/adicionar_captura/",
            {"especie": self.especie.id, "peso_kg": "1.000"},
        )
        self.assertEqual(nova_pesagem.status_code, status.HTTP_400_BAD_REQUEST)


class WebhookTests(APITestCase):
    @override_settings(
        ONLINE_PAYMENTS_ENABLED=True,
        MERCADO_PAGO_WEBHOOK_SECRET="segredo-teste",
    )
    def test_webhook_rejeita_assinatura_invalida_e_aceita_valida(self):
        payload = {"type": "payment", "data": {"id": "123"}}
        invalida = self.client.post(
            "/api/pagamentos/webhook/",
            payload,
            format="json",
            HTTP_X_SIGNATURE="ts=100,v1=invalida",
            HTTP_X_REQUEST_ID="req-1",
        )
        self.assertEqual(invalida.status_code, status.HTTP_401_UNAUTHORIZED)

        manifesto = "id:123;request-id:req-1;ts:100;"
        assinatura = hmac.new(
            b"segredo-teste", manifesto.encode("utf-8"), hashlib.sha256
        ).hexdigest()
        valida = self.client.post(
            "/api/pagamentos/webhook/",
            payload,
            format="json",
            HTTP_X_SIGNATURE=f"ts=100,v1={assinatura}",
            HTTP_X_REQUEST_ID="req-1",
        )
        self.assertEqual(valida.status_code, status.HTTP_200_OK)

    @override_settings(ONLINE_PAYMENTS_ENABLED=True, MERCADO_PAGO_WEBHOOK_SECRET="")
    def test_webhook_falha_fechado_sem_segredo(self):
        resposta = self.client.post(
            "/api/pagamentos/webhook/",
            {"type": "payment", "data": {"id": "123"}},
            format="json",
        )
        self.assertEqual(resposta.status_code, status.HTTP_401_UNAUTHORIZED)


class GoogleLoginSecurityTests(APITestCase):
    @override_settings(
        GOOGLE_CLIENT_ID="cliente-teste",
        GOOGLE_CLIENT_SECRET="segredo-teste",
        GOOGLE_ALLOWED_ORIGINS=["https://site.exemplo"],
    )
    def test_rejeita_origem_nao_autorizada_antes_de_chamar_google(self):
        resposta = self.client.post(
            "/api/auth/google/",
            {"code": "codigo", "origin": "https://site-malicioso.exemplo"},
            format="json",
            HTTP_X_REQUESTED_WITH="XmlHttpRequest",
        )
        self.assertEqual(resposta.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Origem não autorizada", resposta.data["detalhe"])
