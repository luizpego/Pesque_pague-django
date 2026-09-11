from decimal import Decimal

from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from .models import (
    CategoriaCardapio,
    Comanda,
    ItemCardapio,
    ItemComanda,
    LagoPesca,
    Mesa,
    RegistroPesca,
    Usuario,
)


class SecurityMatrixTests(APITestCase):
    def setUp(self):
        self.cliente = Usuario.objects.create_user("cliente_a", password="senha-forte-123")
        self.outro_cliente = Usuario.objects.create_user("cliente_b", password="senha-forte-123")
        self.garcom = Usuario.objects.create_user(
            "garcom_a", password="senha-forte-123", papel=Usuario.Papel.GARCOM
        )
        self.cozinha = Usuario.objects.create_user(
            "cozinha_a", password="senha-forte-123", papel=Usuario.Papel.COZINHA
        )
        self.gerente = Usuario.objects.create_user(
            "gerente_a", password="senha-forte-123", papel=Usuario.Papel.GERENTE
        )
        self.mesa = Mesa.objects.create(numero=10)
        self.outra_mesa = Mesa.objects.create(numero=11)
        self.categoria = CategoriaCardapio.objects.create(nome="Testes")
        self.item = ItemCardapio.objects.create(
            categoria=self.categoria,
            nome="Tilápia teste",
            preco=Decimal("35.00"),
        )
        self.comanda = Comanda.objects.create(mesa=self.mesa, cliente=self.cliente)
        self.item_comanda = ItemComanda.objects.create(
            comanda=self.comanda,
            item_cardapio=self.item,
            quantidade=1,
            preco_unitario=self.item.preco,
        )

    def autenticar(self, usuario):
        self.client.force_authenticate(usuario)

    def test_idor_cliente_nao_le_nem_edita_comanda_de_outro_cliente(self):
        self.autenticar(self.outro_cliente)

        leitura = self.client.get(f"/api/comandas/{self.comanda.id}/")
        edicao = self.client.patch(
            f"/api/itens-comanda/{self.item_comanda.id}/", {"quantidade": "9"}
        )
        remocao = self.client.post(
            f"/api/comandas/{self.comanda.id}/remover_item/{self.item_comanda.id}/"
        )

        self.assertEqual(leitura.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(edicao.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(remocao.status_code, status.HTTP_404_NOT_FOUND)
        self.item_comanda.refresh_from_db()
        self.assertEqual(self.item_comanda.quantidade, Decimal("1"))

    def test_permissoes_administrativas_sao_exclusivas_da_gerencia(self):
        payload = {"nome": "Categoria bloqueada", "ordem": 1, "icone": "x"}
        for usuario in (self.cliente, self.garcom, self.cozinha):
            self.autenticar(usuario)
            resposta = self.client.post("/api/categorias/", payload)
            self.assertEqual(resposta.status_code, status.HTTP_403_FORBIDDEN)

        self.autenticar(self.gerente)
        resposta = self.client.post("/api/categorias/", payload)
        self.assertEqual(resposta.status_code, status.HTTP_201_CREATED)

    def test_cozinha_nao_opera_pesca_nem_abre_comanda(self):
        self.autenticar(self.cozinha)
        pesca = self.client.get("/api/registros-pesca/")
        abertura = self.client.post("/api/comandas/", {"mesa": self.outra_mesa.id})

        self.assertEqual(pesca.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(abertura.status_code, status.HTTP_403_FORBIDDEN)

    def test_mesa_inativa_nao_aceita_nova_comanda(self):
        self.outra_mesa.ativa = False
        self.outra_mesa.save(update_fields=["ativa"])
        self.autenticar(self.outro_cliente)

        resposta = self.client.post("/api/comandas/", {"mesa": self.outra_mesa.id})

        self.assertEqual(resposta.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(Comanda.objects.filter(mesa=self.outra_mesa).exists())

    def test_transicoes_respeitam_estado_e_papel(self):
        self.autenticar(self.cliente)
        salto = self.client.post(
            f"/api/comandas/{self.comanda.id}/alterar_status/", {"status": "pronta"}
        )
        cancelamento = self.client.post(
            f"/api/comandas/{self.comanda.id}/alterar_status/",
            {"status": "cancelada", "motivo": "Cliente tentou cancelar"},
        )
        envio = self.client.post(
            f"/api/comandas/{self.comanda.id}/alterar_status/", {"status": "enviada"}
        )

        self.assertEqual(salto.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(cancelamento.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(envio.status_code, status.HTTP_200_OK)

        self.autenticar(self.cozinha)
        preparo = self.client.post(
            f"/api/comandas/{self.comanda.id}/alterar_status/", {"status": "em_preparo"}
        )
        pronta = self.client.post(
            f"/api/comandas/{self.comanda.id}/alterar_status/", {"status": "pronta"}
        )
        entrega_negada = self.client.post(
            f"/api/comandas/{self.comanda.id}/alterar_status/", {"status": "entregue"}
        )

        self.assertEqual(preparo.status_code, status.HTTP_200_OK)
        self.assertEqual(pronta.status_code, status.HTTP_200_OK)
        self.assertEqual(entrega_negada.status_code, status.HTTP_403_FORBIDDEN)

    def test_cancelamento_exige_motivo_e_registra_auditoria(self):
        self.autenticar(self.garcom)
        sem_motivo = self.client.post(
            f"/api/comandas/{self.comanda.id}/alterar_status/",
            {"status": "cancelada"},
        )
        self.assertEqual(sem_motivo.status_code, status.HTTP_400_BAD_REQUEST)

        resposta = self.client.post(
            f"/api/comandas/{self.comanda.id}/alterar_status/",
            {"status": "cancelada", "motivo": "Pedido lançado na mesa incorreta"},
        )
        self.assertEqual(resposta.status_code, status.HTTP_200_OK)
        self.comanda.refresh_from_db()
        self.assertEqual(self.comanda.cancelada_por, self.garcom)
        self.assertIsNotNone(self.comanda.cancelada_em)
        self.assertEqual(self.comanda.motivo_cancelamento, "Pedido lançado na mesa incorreta")

    def test_idempotency_key_impede_retry_de_duplicar_quantidade(self):
        self.autenticar(self.cliente)
        headers = {"HTTP_IDEMPOTENCY_KEY": "pedido-unico-123"}
        payload = {"item_cardapio": self.item.id, "quantidade": "2", "observacoes": "sem sal"}

        primeira = self.client.post(
            f"/api/comandas/{self.comanda.id}/adicionar_item/", payload, **headers
        )
        segunda = self.client.post(
            f"/api/comandas/{self.comanda.id}/adicionar_item/", payload, **headers
        )

        self.assertEqual(primeira.status_code, status.HTTP_200_OK)
        self.assertEqual(segunda.status_code, status.HTTP_200_OK)
        linha = ItemComanda.objects.get(comanda=self.comanda, observacoes="sem sal")
        self.assertEqual(linha.quantidade, Decimal("2"))

    def test_requisicao_rejeitada_nao_consumira_chave_idempotente(self):
        self.autenticar(self.cliente)
        headers = {"HTTP_IDEMPOTENCY_KEY": "pedido-corrigido-123"}

        rejeitada = self.client.post(
            f"/api/comandas/{self.comanda.id}/adicionar_item/",
            {"item_cardapio": self.item.id, "quantidade": "100"},
            **headers,
        )
        corrigida = self.client.post(
            f"/api/comandas/{self.comanda.id}/adicionar_item/",
            {"item_cardapio": self.item.id, "quantidade": "1"},
            **headers,
        )

        self.assertEqual(rejeitada.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(corrigida.status_code, status.HTTP_200_OK)
        self.item_comanda.refresh_from_db()
        self.assertEqual(self.item_comanda.quantidade, Decimal("2"))

    def test_preco_fica_congelado_depois_do_pedido(self):
        self.autenticar(self.cliente)
        resposta = self.client.post(
            f"/api/comandas/{self.comanda.id}/adicionar_item/",
            {"item_cardapio": self.item.id, "quantidade": "1", "observacoes": "novo"},
        )
        self.assertEqual(resposta.status_code, status.HTTP_200_OK)
        linha = ItemComanda.objects.get(comanda=self.comanda, observacoes="novo")

        self.item.preco = Decimal("99.00")
        self.item.save(update_fields=["preco"])
        linha.refresh_from_db()
        self.assertEqual(linha.preco_unitario, Decimal("35.00"))

    def test_endpoints_genericos_nao_permitem_criar_ou_apagar_itens(self):
        self.autenticar(self.cliente)
        criar = self.client.post(
            "/api/itens-comanda/",
            {"comanda": self.comanda.id, "item_cardapio": self.item.id, "quantidade": 1},
        )
        apagar = self.client.delete(f"/api/itens-comanda/{self.item_comanda.id}/")
        apagar_comanda = self.client.delete(f"/api/comandas/{self.comanda.id}/")

        self.assertEqual(criar.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        self.assertEqual(apagar.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        self.assertEqual(apagar_comanda.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

    def test_upload_disfarcado_de_imagem_e_rejeitado(self):
        self.autenticar(self.gerente)
        falso_png = SimpleUploadedFile(
            "ataque.png", b"<script>alert(1)</script>", content_type="image/png"
        )
        resposta = self.client.post(
            "/api/cardapio/",
            {
                "categoria": self.categoria.id,
                "nome": "Arquivo inválido",
                "preco": "10.00",
                "imagem": falso_png,
            },
            format="multipart",
        )
        self.assertEqual(resposta.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("imagem", resposta.data)


class LogoutSecurityTests(APITestCase):
    def test_logout_revoga_refresh_token(self):
        usuario = Usuario.objects.create_user("logout_teste", password="senha-forte-123")
        refresh = RefreshToken.for_user(usuario)
        self.client.force_authenticate(usuario)

        logout = self.client.post("/api/auth/logout/", {"refresh": str(refresh)})
        self.assertEqual(logout.status_code, status.HTTP_204_NO_CONTENT)

        self.client.force_authenticate(user=None)
        renovacao = self.client.post("/api/auth/refresh/", {"refresh": str(refresh)})
        self.assertEqual(renovacao.status_code, status.HTTP_401_UNAUTHORIZED)


class FishingIntegrityTests(APITestCase):
    def setUp(self):
        self.garcom = Usuario.objects.create_user(
            "garcom_pesca", password="senha-forte-123", papel=Usuario.Papel.GARCOM
        )
        self.lago = LagoPesca.objects.create(
            nome="Lago teste",
            modalidade=LagoPesca.Modalidade.MISTA,
            valor_diaria=Decimal("25.00"),
        )
        self.registro = RegistroPesca.objects.create(
            pescador_nome="Pescador teste",
            lago=self.lago,
            modalidade=RegistroPesca.Modalidade.DIARIA,
            valor_entrada=Decimal("25.00"),
            responsavel_entrada=self.garcom,
        )
        self.client.force_authenticate(self.garcom)

    def test_registro_nao_pode_ser_excluido_por_endpoint_generico(self):
        resposta = self.client.delete(f"/api/registros-pesca/{self.registro.id}/")
        self.assertEqual(resposta.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        self.assertTrue(RegistroPesca.objects.filter(pk=self.registro.pk).exists())

    def test_registro_encerrado_nao_pode_ser_editado(self):
        encerrado = self.client.post(f"/api/registros-pesca/{self.registro.id}/encerrar/")
        alteracao = self.client.patch(
            f"/api/registros-pesca/{self.registro.id}/",
            {"pescador_nome": "Nome adulterado"},
        )

        self.assertEqual(encerrado.status_code, status.HTTP_200_OK)
        self.assertEqual(alteracao.status_code, status.HTTP_400_BAD_REQUEST)
        self.registro.refresh_from_db()
        self.assertEqual(self.registro.pescador_nome, "Pescador teste")
