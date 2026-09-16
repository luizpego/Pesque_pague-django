from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from decimal import Decimal
from io import BytesIO
from threading import Barrier
from uuid import uuid4

from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import close_old_connections
from django.test import TransactionTestCase, override_settings, skipUnlessDBFeature
from django.utils import timezone
from PIL import Image
from rest_framework.test import APIClient, APITestCase

from .models import (ArquivoMidia, CategoriaCardapio, Comanda, EventoComanda,
    ItemCardapio, ItemComanda, Mesa, MetaDiaria, MovimentoEstoque, Pagamento,
    Pedido, Reserva, SessaoCaixa, Usuario)


@override_settings(ORDERS_ENABLED=True, ONLINE_PAYMENTS_ENABLED=False)
class AtendimentoTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = Usuario.objects.create(username="dono", papel="gerente")
        cls.garcom = Usuario.objects.create(username="garcom", papel="garcom")
        cls.cozinha = Usuario.objects.create(username="cozinha", papel="cozinha")
        cls.caixa = Usuario.objects.create(username="caixa", papel="caixa")
        cls.cliente = Usuario.objects.create(username="cliente", papel="cliente")
        cls.outro = Usuario.objects.create(username="outro", papel="cliente")
        cls.mesa = Mesa.objects.create(numero=5)
        categoria = CategoriaCardapio.objects.create(nome="Pratos")
        cls.produto = ItemCardapio.objects.create(categoria=categoria, nome="Peixe", preco="12.35", controla_estoque=True, estoque_atual="10")
        cls.bebida = ItemCardapio.objects.create(categoria=categoria, nome="Bebida", preco="3.20")

    def req(self, url, data=None, user=None, expected=200, key=None, method="post"):
        self.client.force_authenticate(user or self.admin)
        resposta = getattr(self.client, method)("/api/" + url, data or {}, format="json", HTTP_IDEMPOTENCY_KEY=key or str(uuid4()))
        self.assertEqual(resposta.status_code, expected, resposta.data)
        return resposta.data

    def abrir(self, user=None):
        return self.req("atendimento/", {"mesa": self.mesa.pk, "identificacao": "Família"}, user=user, expected=201)["id"]

    def mut(self, pk, action, data=None, **kwargs):
        dados = {"versao": Comanda.objects.get(pk=pk).versao, **(data or {})}
        return self.req(f"atendimento/{pk}/{action}/", dados, **kwargs)

    def pedido(self, pk, itens=None, user=None):
        return self.mut(pk, "pedidos", {"itens": itens or [{"item_cardapio": self.produto.pk, "quantidade": "1"}]}, user=user, expected=201)

    def entregar(self, pk):
        for pedido in Pedido.objects.filter(comanda_id=pk).exclude(status="cancelado"):
            for status in ["preparando", "pronto", "entregue"]:
                self.mut(pk, f"pedidos/{pedido.pk}/status", {"status": status})

    def abrir_caixa(self):
        return self.req("caixa/abrir/", {"valor_inicial": "50.00"}, user=self.caixa, expected=201)

    def test_jornada_completa_financeiro_historico_e_precos(self):
        pk = self.abrir(self.garcom)
        a = self.pedido(pk, [{"item_cardapio": self.produto.pk, "quantidade": "2", "preco_unitario": "0.01"}, {"item_cardapio": self.bebida.pk, "quantidade": "3"}], self.garcom)
        self.assertEqual(a["total"], "34.30")
        primeiro, bebida = a["itens"]
        a = self.mut(pk, f"itens/{primeiro['id']}", {"quantidade": "3", "observacoes": "Sem cebola"}, method="patch", user=self.garcom)
        self.assertEqual(a["total"], "46.65")
        self.mut(pk, f"itens/{bebida['id']}/cancelar", {"motivo": "Cliente desistiu"}, user=self.garcom)
        a = self.pedido(pk, [{"item_cardapio": self.bebida.pk, "quantidade": "1"}], self.garcom)
        self.assertEqual(a["total"], "40.25")
        a = self.pedido(pk)
        self.mut(pk, f"pedidos/{a['pedidos'][-1]['id']}/status", {"status": "cancelado", "motivo": "Pedido duplicado"})
        self.entregar(pk)
        self.mut(pk, "aguardar_pagamento", user=self.garcom)
        caixa = self.abrir_caixa()
        dados = {"versao": Comanda.objects.get(pk=pk).versao, "desconto": "1.25", "acrescimo": "2.50", "pagamentos": [{"forma": "dinheiro", "valor": "20.00"}, {"forma": "pix", "valor": "21.50"}]}
        chave = str(uuid4())
        final = self.req(f"atendimento/{pk}/fechar/", dados, user=self.caixa, key=chave)
        self.req(f"atendimento/{pk}/fechar/", dados, user=self.caixa, key=chave)
        self.assertEqual(final["total"], "41.50")
        self.assertEqual(Decimal(final["subtotal"]) + Decimal(final["acrescimo"]) - Decimal(final["desconto"]), Decimal(final["total"]))
        self.assertEqual(Pagamento.objects.filter(comanda_id=pk).count(), 2)
        self.assertEqual(Comanda.objects.get(pk=pk).fechada_por, self.caixa)
        self.produto.preco, self.produto.nome = Decimal("99"), "Novo nome"
        self.produto.save()
        impressao = self.req(f"atendimento/{pk}/impressao/")
        self.assertEqual(impressao["itens"][0]["preco_unitario"], "12.35")
        self.assertEqual(impressao["itens"][0]["item_cardapio_nome"], "Peixe")
        relatorio = self.req("atendimento/relatorio/", method="get")
        self.assertEqual(relatorio["faturamento"], "41.50")
        self.assertEqual(relatorio["itens_vendidos"], "4.00")
        self.assertEqual(relatorio["pedidos_cancelados"], 1)
        caixa_final = self.req(f"caixa/{caixa['id']}/", user=self.caixa, method="get")
        self.assertEqual(caixa_final["resumo"]["dinheiro_esperado"], "70.00")
        self.assertFalse(self.req("atendimento/opcoes/", method="get")["mesas"][0]["ocupada"])
        self.assertEqual(self.req("atendimento/", {"status": "fechada", "busca": str(pk)}, method="get")["count"], 1)

    def test_ultima_unidade_e_devolucao_unica(self):
        ItemCardapio.objects.filter(pk=self.produto.pk).update(estoque_atual=1)
        a, b = self.abrir(), self.abrir()
        pedido = self.pedido(a)["pedidos"][0]
        self.assertFalse(any(p["id"] == self.produto.pk for p in self.req("atendimento/opcoes/", method="get")["produtos"]))
        self.mut(b, "pedidos", {"itens": [{"item_cardapio": self.produto.pk, "quantidade": "1"}]}, expected=400)
        self.assertEqual(Pedido.objects.filter(comanda_id=b).count(), 0)
        self.mut(a, f"pedidos/{pedido['id']}/status", {"status": "cancelado", "motivo": "Desistência válida"})
        self.mut(a, f"pedidos/{pedido['id']}/status", {"status": "cancelado", "motivo": "Desistência válida"}, expected=400)
        self.produto.refresh_from_db()
        self.assertEqual(self.produto.estoque_atual, 1)
        self.assertEqual(MovimentoEstoque.objects.count(), 2)

    def test_dois_grupos_na_mesma_mesa_independentes(self):
        a, b = self.abrir(), self.abrir()
        self.pedido(a)
        self.pedido(b, [{"item_cardapio": self.bebida.pk, "quantidade": "2"}])
        self.entregar(a)
        self.abrir_caixa()
        self.mut(a, "fechar", {"pagamentos": [{"forma": "debito", "valor": "12.35"}]})
        mesa = self.req("atendimento/opcoes/", method="get")["mesas"][0]
        self.assertTrue(mesa["ocupada"])
        self.assertEqual(mesa["comandas_abertas"], 1)
        self.assertEqual(Comanda.objects.get(pk=b).total, Decimal("6.40"))

    def test_cliente_so_acessa_propria_comanda_e_acompanha_cozinha(self):
        pk = self.abrir(self.cliente)
        a = self.pedido(pk, user=self.cliente)
        outro = self.abrir(self.outro)
        self.req(f"atendimento/{outro}/", user=self.cliente, method="get", expected=404)
        self.mut(outro, "pedidos", {"itens": [{"item_cardapio": self.produto.pk, "quantidade": "1"}]}, user=self.cliente, expected=404)
        self.assertEqual(self.req("atendimento/", user=self.cliente, method="get")["count"], 1)
        for status in ["preparando", "pronto", "entregue"]:
            self.mut(pk, f"pedidos/{a['pedidos'][0]['id']}/status", {"status": status}, user=self.cozinha)
        atual = self.req(f"atendimento/{pk}/", user=self.cliente, method="get")
        self.assertEqual(atual["pedidos"][0]["status"], "entregue")
        self.mut(pk, "aguardar_pagamento", user=self.cliente)

    def test_permissoes_cozinha_caixa_cliente(self):
        pk = self.abrir()
        self.pedido(pk)
        for url in ["dashboard/", "usuarios-gestao/", "caixa/", "estoque/", "configuracao/", "reservas/", "atendimento/relatorio/", f"atendimento/{pk}/", "comandas/", "itens-comanda/"]:
            self.req(url, user=self.cozinha, method="get", expected=403)
        fila = self.req("atendimento/fila/", user=self.cozinha, method="get")
        self.assertNotIn("preco_unitario", fila["results"][0]["itens"][0])
        self.mut(pk, "fechar", user=self.garcom, expected=403)
        self.req("atendimento/", {"mesa": self.mesa.pk}, user=self.caixa, expected=403)
        self.req("atendimento/fila/", user=self.cliente, method="get", expected=403)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get("/api/atendimento/").status_code, 401)

    def test_cancelamento_cliente_so_antes_do_preparo(self):
        pk = self.abrir(self.cliente)
        pedido = self.pedido(pk, user=self.cliente)["pedidos"][0]
        self.mut(pk, f"pedidos/{pedido['id']}/status", {"status": "preparando"}, user=self.cozinha)
        self.mut(pk, f"pedidos/{pedido['id']}/status", {"status": "cancelado", "motivo": "Desistência"}, user=self.cliente, expected=403)

    def test_validacoes_financeiras_e_fechamento_imutavel(self):
        pk = self.abrir()
        self.mut(pk, "fechar", expected=400)
        self.abrir_caixa()
        self.mut(pk, "fechar", expected=400)
        self.pedido(pk)
        self.mut(pk, "fechar", {"pagamentos": [{"forma": "dinheiro", "valor": "12.35"}]}, expected=400)
        self.entregar(pk)
        for valor in ["12.34", "12.36", "-1"]:
            self.mut(pk, "fechar", {"pagamentos": [{"forma": "pix", "valor": valor}]}, expected=400)
        self.mut(pk, "fechar", {"desconto": "13", "pagamentos": []}, expected=400)
        self.assertEqual(Pagamento.objects.count(), 0)
        self.mut(pk, "fechar", {"pagamentos": [{"forma": "credito", "valor": "12.35"}]})
        self.mut(pk, "pedidos", {"itens": [{"item_cardapio": self.produto.pk, "quantidade": "1"}]}, expected=400)
        self.mut(pk, "cancelar", {"motivo": "Cancelamento posterior"}, expected=400)
        self.mut(pk, "fechar", {"pagamentos": [{"forma": "pix", "valor": "12.35"}]}, expected=400)

    def test_conflito_versao_ids_manipulados_e_validacao_itens(self):
        a, b = self.abrir(), self.abrir()
        item = self.pedido(b)["itens"][0]
        self.mut(a, f"itens/{item['id']}", {"quantidade": "2", "observacoes": ""}, method="patch", expected=404)
        for qtd in ["-1", "0", "NaN", "Infinity", "0.001", "101"]:
            self.mut(a, "pedidos", {"itens": [{"item_cardapio": self.produto.pk, "quantidade": qtd}]}, expected=400)
        self.mut(a, "pedidos", {"itens": [{"item_cardapio": 999999, "quantidade": "1"}]}, expected=400)
        versao = Comanda.objects.get(pk=a).versao
        self.pedido(a)
        self.req(f"atendimento/{a}/pedidos/", {"versao": versao, "itens": [{"item_cardapio": self.produto.pk, "quantidade": "1"}]}, expected=409)

    def test_idempotencia_pedido_e_abertura(self):
        chave = str(uuid4())
        dados = {"mesa": self.mesa.pk}
        a = self.req("atendimento/", dados, key=chave, expected=201)
        self.req("atendimento/", dados, key=chave)
        self.req("atendimento/", {"mesa": self.mesa.pk, "identificacao": "Outro grupo"}, key=chave, expected=409)
        self.assertEqual(Comanda.objects.count(), 1)
        chave = str(uuid4())
        dados = {"versao": a["versao"], "itens": [{"item_cardapio": self.produto.pk, "quantidade": "1"}]}
        self.req(f"atendimento/{a['id']}/pedidos/", dados, key=chave, expected=201)
        self.req(f"atendimento/{a['id']}/pedidos/", dados, key=chave)
        self.assertEqual(Pedido.objects.count(), 1)
        self.assertEqual(MovimentoEstoque.objects.count(), 1)

    def test_impressao_falha_nao_perde_pedido_e_reimpressao_sem_precos(self):
        pk = self.abrir()
        pedido = self.pedido(pk)["pedidos"][0]
        a = self.req(f"atendimento/{pk}/impressao/", {"pedido": pedido["id"]}, user=self.cozinha)
        self.assertNotIn("total", a)
        self.assertNotIn("preco_unitario", a["itens"][0])
        self.req(f"atendimento/{pk}/confirmar_impressao/", {"pedido": pedido["id"], "tentativa": a["tentativa"], "status": "falha"}, user=self.cozinha)
        self.assertEqual(Pedido.objects.get(pk=pedido["id"]).status, "recebido")
        b = self.req(f"atendimento/{pk}/impressao/", {"pedido": pedido["id"]}, user=self.cozinha)
        self.req(f"atendimento/{pk}/confirmar_impressao/", {"pedido": pedido["id"], "tentativa": b["tentativa"], "status": "impresso"}, user=self.cozinha)
        self.assertEqual(Pedido.objects.get(pk=pedido["id"]).impressao.status, "impresso")
        self.req(f"atendimento/{pk}/impressao/", user=self.cozinha, expected=403)

    def test_divisao_exata_centavos_e_convite_consumido(self):
        pk = self.abrir()
        self.pedido(pk)
        link = self.req(f"atendimento/{pk}/convite/")
        self.req("atendimento/vincular/", link, user=self.cliente)
        self.req("atendimento/vincular/", link, user=self.outro, expected=404)
        partes = self.req(f"atendimento/{pk}/dividir/", {"pessoas": 3}, user=self.cliente, method="get")
        self.assertEqual(sum(map(Decimal, partes["partes"])), Decimal("12.35"))
        self.assertEqual(max(map(Decimal, partes["partes"])) - min(map(Decimal, partes["partes"])), Decimal("0.01"))

    def test_meta_programatica_e_caixa_fechado_impede_recebimento(self):
        pk = self.abrir()
        self.pedido(pk)
        self.entregar(pk)
        caixa = self.abrir_caixa()
        self.req(f"caixa/{caixa['id']}/fechar/", {"dinheiro_contado": "50"}, user=self.caixa)
        self.mut(pk, "fechar", {"pagamentos": [{"forma": "pix", "valor": "12.35"}]}, expected=400)
        MetaDiaria.objects.create(data=timezone.localdate(), valor="5000")
        Comanda.objects.create(status="fechada", pago=True, total_fechamento="4350", subtotal_fechamento="4350", fechada_em=timezone.now())
        self.assertEqual(self.req("dashboard/", method="get")["percentual"], "87.00")

    def test_reserva_publica_nao_lista_dados_e_admin_preserva_historico(self):
        self.client.force_authenticate(None)
        dados = {"nome": "Família", "telefone": "11999998888", "data": str(timezone.localdate() + timedelta(days=1)), "horario": "12:00", "pessoas": 3, "status": "confirmada"}
        chave = str(uuid4())
        a = self.client.post("/api/reservas/solicitar/", dados, format="json", HTTP_IDEMPOTENCY_KEY=chave)
        self.assertEqual(a.status_code, 201, a.data)
        self.assertEqual(self.client.get("/api/reservas/").status_code, 401)
        self.assertEqual(Reserva.objects.get().status, "pendente")
        self.client.post("/api/reservas/solicitar/", dados, format="json", HTTP_IDEMPOTENCY_KEY=chave)
        self.assertEqual(Reserva.objects.count(), 1)
        self.req(f"reservas/{a.data['protocolo']}/", {"status": "confirmada"}, method="patch")
        self.req(f"reservas/{a.data['protocolo']}/", {"status": "finalizada"}, method="patch")

    def test_cancelamento_comanda_restaura_estoque_uma_vez(self):
        pk = self.abrir()
        self.pedido(pk)
        self.mut(pk, "cancelar", {"motivo": "Cliente saiu do estabelecimento"})
        self.mut(pk, "cancelar", {"motivo": "Tentativa repetida"}, expected=400)
        self.produto.refresh_from_db()
        self.assertEqual(self.produto.estoque_atual, Decimal("10"))
        self.assertEqual(MovimentoEstoque.objects.filter(quantidade__gt=0).count(), 1)

    def test_gestao_usuarios_nao_permite_escalar_privilegios(self):
        for user in [self.cliente, self.cozinha, self.garcom, self.caixa]:
            self.req("usuarios-gestao/", method="get", user=user, expected=403)
        self.req("auth/me/", {"papel": "gerente", "is_superuser": True}, user=self.cliente, method="patch")
        self.cliente.refresh_from_db()
        self.assertEqual(self.cliente.papel, "cliente")
        self.assertFalse(self.cliente.is_superuser)
        self.req(f"usuarios-gestao/{self.admin.pk}/", {"is_active": False}, method="patch", expected=400)

    def test_filtros_invalidos_retornam_erro_de_validacao(self):
        self.req("atendimento/", {"produto": "abc"}, method="get", expected=400)
        self.req("atendimento/", {"funcionario": "9" * 30}, method="get", expected=400)
        self.req("atendimento/relatorio/", {"inicio": "data-invalida"}, method="get", expected=400)
        self.req("atendimento/", {"mesa": 10 ** 30}, expected=400)

    def test_imagem_persiste_no_banco_e_publicacao(self):
        bruto = BytesIO()
        Image.new("RGB", (10, 10), "green").save(bruto, "PNG")
        self.client.force_authenticate(self.admin)
        resposta = self.client.post("/api/galeria/", {"area": "piscina", "imagem_alt": "Piscina", "imagem": SimpleUploadedFile("foto.png", bruto.getvalue(), content_type="image/png")}, format="multipart")
        self.assertEqual(resposta.status_code, 201, resposta.data)
        self.assertEqual(ArquivoMidia.objects.count(), 1)
        self.client.force_authenticate(None)
        foto = self.client.get(resposta.data["imagem"])
        self.assertEqual(foto.status_code, 200)
        self.assertEqual(foto["Content-Type"], "image/png")


@skipUnlessDBFeature("has_select_for_update")
@override_settings(ORDERS_ENABLED=True)
class ConcorrenciaEstoqueTests(TransactionTestCase):
    def test_duas_comandas_disputam_ultima_unidade(self):
        usuario = Usuario.objects.create(username="atendente", papel="gerente")
        categoria = CategoriaCardapio.objects.create(nome="Porções")
        produto = ItemCardapio.objects.create(categoria=categoria, nome="Última porção", preco="10", controla_estoque=True, estoque_atual=1)
        comandas = [Comanda.objects.create(identificacao=str(i)) for i in range(2)]
        barreira = Barrier(2)

        def pedir(pk):
            close_old_connections()
            try:
                client = APIClient()
                client.force_authenticate(Usuario.objects.get(pk=usuario.pk))
                barreira.wait(timeout=10)
                return client.post(f"/api/atendimento/{pk}/pedidos/", {"versao": 0, "itens": [{"item_cardapio": produto.pk, "quantidade": "1"}]}, format="json", HTTP_IDEMPOTENCY_KEY=str(uuid4())).status_code
            finally:
                close_old_connections()

        with ThreadPoolExecutor(max_workers=2) as pool:
            resultados = list(pool.map(pedir, [c.pk for c in comandas]))
        self.assertEqual(sorted(resultados), [201, 400])
        produto.refresh_from_db()
        self.assertEqual(produto.estoque_atual, 0)
        self.assertEqual(Pedido.objects.count(), 1)
        self.assertEqual(MovimentoEstoque.objects.count(), 1)
