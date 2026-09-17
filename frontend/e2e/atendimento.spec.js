import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const API = "http://127.0.0.1:8000/api";
const tokens = new Map();
async function login(page, request, papel) {
  if (!tokens.has(papel)) {
    const response = await request.post(`${API}/auth/login/`, { data: { username: `e2e_${papel}`, password: process.env.E2E_PASSWORD } });
    expect(response.status()).toBe(200);
    tokens.set(papel, await response.json());
  }
  await page.goto("/");
  await page.evaluate(t => { sessionStorage.setItem("pp_access_token", t.access); sessionStorage.setItem("pp_refresh_token", t.refresh); }, tokens.get(papel));
  await page.reload();
  return { Authorization: `Bearer ${tokens.get(papel).access}` };
}
async function semOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test("venda integrada, falha de impressão, estoque, caixa e histórico", async ({ page, request }, testInfo) => {
  test.setTimeout(180000);
  const erros = [];
  page.on("pageerror", e => erros.push(e.message));
  const headers = await login(page, request, "gerente");
  const opcoes = await (await request.get(`${API}/atendimento/opcoes/`, { headers })).json();
  const [produto, bebida] = opcoes.produtos;
  await page.goto("/caixa");
  await page.getByLabel("Troco inicial (R$)").fill("50.00");
  await page.getByRole("button", { name: "Abrir caixa", exact: true }).click();
  await expect(page.getByText("Dinheiro esperado, com troco")).toBeVisible();
  await page.goto("/estoque");
  await page.getByRole("row").filter({ hasText: produto.nome }).getByRole("button", { name: "Movimentar" }).click();
  await page.getByLabel("Movimentação (+ entrada / - saída)").fill("10");
  await page.getByLabel("Estoque mínimo").fill("2");
  await page.getByLabel("Motivo", { exact: true }).fill("Entrada para teste de atendimento");
  await page.getByLabel("Controlar estoque").check();
  await page.getByRole("button", { name: "Salvar movimentação" }).click();
  await expect(page.getByText("Entrada para teste de atendimento")).toBeVisible();

  await login(page, request, "garcom");
  await page.goto("/atendimento");
  await page.getByRole("button", { name: "Abrir comanda", exact: true }).click();
  await page.getByLabel("Mesa / local").selectOption(String(opcoes.mesas[0].id));
  await page.getByLabel("Cliente ou identificação").fill("Família E2E");
  await page.getByRole("button", { name: "Confirmar abertura" }).click();
  await expect(page.getByRole("heading", { name: /Comanda #/ })).toBeVisible();
  const id = new URL(page.url()).searchParams.get("comanda");
  await page.locator(".service-products button").filter({ hasText: produto.nome }).click();
  await page.locator(".service-products button").filter({ hasText: bebida.nome }).click();
  await page.getByLabel(`Quantidade de ${produto.nome}`, { exact: true }).fill("2");
  await page.getByLabel(`Observações de ${produto.nome}`, { exact: true }).fill("Sem cebola");
  await page.getByRole("button", { name: "Registrar pedido", exact: true }).click();
  await expect(page.locator(".service-orders .service-order")).toHaveCount(1);
  const primeiro = page.locator(".service-orders .service-order").first();
  await primeiro.locator(".service-order-line").filter({ hasText: produto.nome }).getByRole("button", { name: "Editar item" }).click();
  await page.getByRole("dialog").getByLabel("Quantidade", { exact: true }).fill("3");
  await page.getByRole("dialog").getByRole("button", { name: "Salvar item" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await primeiro.locator(".service-order-line").filter({ hasText: bebida.nome }).getByRole("button", { name: "Cancelar item" }).click();
  await page.getByRole("dialog").getByLabel("Motivo").fill("Cliente desistiu deste item");
  await page.getByRole("dialog").getByRole("button", { name: "Confirmar cancelamento" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.locator(".service-products button").filter({ hasText: bebida.nome }).click();
  await page.getByRole("button", { name: "Registrar pedido", exact: true }).click();
  await expect(page.locator(".service-orders .service-order")).toHaveCount(2);
  await page.screenshot({ path: testInfo.outputPath("atendimento-desktop.png"), fullPage: true });
  for (const width of [320, 390, 768]) { await page.setViewportSize({ width, height: 900 }); await semOverflow(page); }
  await page.setViewportSize({ width: 390, height: 900 });
  await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo({ top: 0, left: 0, behavior: "instant" }); });
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await page.screenshot({ path: testInfo.outputPath("atendimento-mobile.png"), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });

  await login(page, request, "cozinha");
  await page.goto("/painel");
  const card = page.locator(".service-queue .service-order").filter({ hasText: `Comanda #${id} ·` }).first();
  await expect(card).toBeVisible();
  await card.getByRole("link", { name: "Imprimir pedido" }).click();
  const print = page;
  await expect(print.locator(".service-receipt")).toBeVisible();
  await expect(print.locator(".service-receipt")).not.toContainText("R$");
  await print.evaluate(() => { window.print = () => {}; });
  await print.getByRole("button", { name: "Imprimir pedido", exact: true }).click();
  await print.getByRole("button", { name: "Registrar falha" }).click();
  await expect(print.getByRole("status")).toContainText("Falha registrada");
  await print.getByRole("button", { name: "Imprimir pedido", exact: true }).click();
  await print.getByRole("button", { name: "Confirmar papel impresso" }).click();
  await expect(print.getByRole("status")).toContainText("confirmada pelo operador");
  await print.emulateMedia({ media: "print" });
  await expect(print.locator(".site-header")).toBeHidden();
  await print.pdf({ path: testInfo.outputPath("pedido-80mm.pdf"), width: "80mm", height: "200mm", printBackground: true });
  await print.screenshot({ path: testInfo.outputPath("pedido-termico.png"), fullPage: true });
  await print.emulateMedia({ media: "screen" });
  await print.getByLabel("Papel", { exact: true }).selectOption("58mm");
  await print.emulateMedia({ media: "print" });
  await print.pdf({ path: testInfo.outputPath("pedido-58mm.pdf"), width: "58mm", height: "200mm", printBackground: true });
  await print.screenshot({ path: testInfo.outputPath("pedido-58mm.png"), fullPage: true });
  await print.emulateMedia({ media: "screen" });
  await page.goto("/painel");
  for (let i = 0; i < 2; i++) {
    await card.getByRole("button", { name: "Iniciar preparo" }).click();
    await card.getByRole("button", { name: "Marcar pronto" }).click();
    await card.getByRole("button", { name: "Entregar", exact: true }).click();
  }
  await page.goto("/estoque");
  await expect(page.getByRole("heading", { name: "Estoque", exact: true })).toHaveCount(0);

  await login(page, request, "caixa");
  await page.goto(`/atendimento?comanda=${id}`);
  await page.getByRole("button", { name: "Fechar comanda", exact: true }).click();
  await page.getByLabel("Desconto (R$)").fill("1.25");
  await page.getByLabel("Acréscimo (R$)").fill("2.50");
  const subtotalCentavos = Math.round(Number(produto.preco) * 100) * 3 + Math.round(Number(bebida.preco) * 100);
  const total = (subtotalCentavos + 250 - 125) / 100;
  await expect(page.getByText("A receber", { exact: true })).toBeVisible();
  await page.getByLabel("Valor 1 (R$)").fill("10.00");
  await page.getByRole("button", { name: "Dividir pagamento" }).click();
  await page.getByLabel("Valor 2 (R$)").fill((total - 10).toFixed(2));
  await page.getByRole("button", { name: "Registrar pagamento e fechar" }).click();
  await expect(page.locator(".service-detail-head .status-badge")).toHaveText("Fechada");
  await expect(page.getByRole("heading", { name: "Novo pedido", exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "Imprimir comanda" }).click();
  const estado = await (await request.get(`${API}/atendimento/${id}/`, { headers })).json();
  expect(Number(estado.total)).toBe(total);
  expect(estado.pagamentos).toHaveLength(2);
  expect(estado.eventos.some(e => e.acao === "fechamento")).toBe(true);

  await login(page, request, "gerente");
  for (const rota of ["/dashboard", "/registros", "/historico", "/estoque", "/mesas", "/caixa", "/administracao?area=reservas", "/administracao?area=configuracao"]) {
    await page.goto(rota);
    await expect(page.locator("main h1")).toBeVisible();
    for (const width of [390, 1280]) { await page.setViewportSize({ width, height: 900 }); await semOverflow(page); }
  }
  await page.goto("/registros");
  const relatorio = await (await request.get(`${API}/atendimento/relatorio/`, { headers })).json();
  expect(Number(relatorio.faturamento)).toBe(total);
  await page.goto("/dashboard");
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations.filter(v => ["serious", "critical"].includes(v.impact))).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("dashboard.png"), fullPage: true });
  expect(erros).toEqual([]);
});

test("cliente faz pedido, divide consumo e não consulta outra comanda", async ({ page, request }) => {
  const headers = await login(page, request, "cliente");
  await page.goto("/minhas-comandas");
  await page.getByRole("button", { name: "Abrir comanda", exact: true }).click();
  await page.getByLabel("Cliente ou identificação").fill("Cliente celular");
  await page.getByRole("button", { name: "Confirmar abertura" }).click();
  await expect(page.getByRole("heading", { name: /Comanda #/ })).toBeVisible();
  const comandaCliente = new URL(page.url()).searchParams.get("comanda");
  const produtosCliente = await (await request.get(`${API}/atendimento/opcoes/`, { headers })).json();
  const carrinho = await request.post(`${API}/comandas/${comandaCliente}/adicionar_item/`, { headers, data: { item_cardapio: produtosCliente.produtos[0].id, quantidade: "1" } });
  expect(carrinho.ok()).toBe(true);
  await page.reload();
  await page.getByRole("button", { name: "Enviar carrinho à cozinha" }).click();
  await expect(page.getByRole("region", { name: "Carrinho pendente" })).toHaveCount(0);
  await page.locator(".service-products button").first().click();
  await page.getByRole("button", { name: "Registrar pedido", exact: true }).click();
  await expect(page.locator(".service-orders .service-order")).toHaveCount(2);
  await page.getByText("Dividir conta", { exact: true }).click();
  await page.getByLabel("Pessoas", { exact: true }).fill("3");
  await expect(page.getByText(/Pessoa 3:/)).toBeVisible();
  const c = new URL(page.url()).searchParams.get("comanda");
  expect((await request.get(`${API}/atendimento/`, { headers })).ok()).toBe(true);
  expect((await request.get(`${API}/atendimento/${Number(c) + 999}/`, { headers })).status()).toBe(404);
  await page.setViewportSize({ width: 320, height: 800 });
  await semOverflow(page);
});

test("admin publica conteúdo e foto, cadastra meta e confirma reserva pública", async ({ page, request }) => {
  test.setTimeout(60000);
  const headers = await login(page, request, "gerente");
  await page.goto("/administracao?area=configuracao");
  await page.getByRole("button", { name: "Novo", exact: true }).click();
  await page.getByLabel("Nome do pesqueiro").fill("Pesque & Pague");
  await page.getByLabel("Apresentação", { exact: true }).fill("Visite nosso pesqueiro. Conteúdo publicado no painel.");
  await page.getByLabel("Piscinas", { exact: true }).fill("Piscinas com área de descanso.");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.locator(".admin-editor")).toHaveCount(0);
  await page.goto("/administracao?area=galeria");
  await page.getByRole("button", { name: "Novo", exact: true }).click();
  await page.getByLabel("Título").fill("Piscina teste");
  await page.getByLabel("Descrição da foto").fill("Piscina cadastrada no painel");
  await page.getByRole("combobox", { name: "Área *", exact: true }).selectOption("piscina");
  await page.getByLabel("Foto", { exact: true }).setInputFiles("public/og-pesque-pague.png");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.locator(".admin-record").filter({ hasText: "Piscina teste" })).toBeVisible();
  await page.goto("/");
  await expect(page.getByText("Visite nosso pesqueiro. Conteúdo publicado no painel.")).toBeVisible();
  const foto = page.getByRole("img", { name: "Piscina cadastrada no painel" });
  await foto.scrollIntoViewIfNeeded();
  await expect.poll(() => foto.evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);

  const hoje = new Date();
  const dataLocal = d => {
    const partes = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(d);
    const valor = tipo => partes.find(parte => parte.type === tipo).value;
    return `${valor("year")}-${valor("month")}-${valor("day")}`;
  };
  await page.goto("/administracao?area=metas");
  await page.getByRole("button", { name: "Novo", exact: true }).click();
  await page.getByLabel("Data", { exact: false }).fill(dataLocal(hoje));
  await page.getByLabel("Meta (R$)").fill("5000.00");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.locator(".admin-editor")).toHaveCount(0);
  const painel = await (await request.get(`${API}/dashboard/`, { headers })).json();
  expect(Number(painel.meta)).toBe(5000);
  expect(Number(painel.percentual)).toBe(Number((Number(painel.vendas) / 5000 * 100).toFixed(2)));

  await page.evaluate(() => sessionStorage.clear());
  await page.goto("/reservar");
  const amanha = new Date(); amanha.setDate(amanha.getDate() + 1);
  await page.getByLabel("Nome", { exact: true }).fill("Reserva integrada E2E");
  await page.getByLabel("Telefone com DDD").fill("11999998888");
  await page.getByLabel("Data", { exact: true }).fill(dataLocal(amanha));
  await page.getByLabel("Horário", { exact: true }).fill("12:30");
  await page.getByLabel("Número de pessoas").fill("6");
  await page.getByRole("button", { name: "Solicitar reserva", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Aguarde a confirmação");
  await login(page, request, "gerente");
  await page.goto("/administracao?area=reservas");
  await page.getByLabel("Dia da reserva").fill(dataLocal(amanha));
  const reserva = page.locator(".admin-record").filter({ hasText: "Reserva integrada E2E" });
  await reserva.getByRole("button", { name: "Editar" }).click();
  await page.getByLabel("Status").selectOption("confirmada");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(reserva).toContainText("confirmada");
  await page.setViewportSize({ width: 320, height: 800 });
  await semOverflow(page);
});
