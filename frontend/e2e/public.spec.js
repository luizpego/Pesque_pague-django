import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const API_URL = "http://127.0.0.1:8000/api";
const rotasPublicas = [
  ["/", /Pesque & Pague/i],
  ["/restaurante", /Comida feita/i],
  ["/cardapio", /Escolha pratos/i],
  ["/pesque-pague", /Planeje a pescaria/i],
  ["/contato", /planejar a visita/i],
];

test.describe("conteúdo público", () => {
  for (const [rota, titulo] of rotasPublicas) {
    test(`${rota} abre diretamente, atualiza e não transborda`, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 800 });
      await page.goto(rota);
      await expect(page.getByRole("heading", { level: 1, name: titulo })).toBeVisible();
      await page.reload();
      await expect(page.getByRole("heading", { level: 1, name: titulo })).toBeVisible();
      const transborda = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      expect(transborda).toBe(false);
    });
  }

  test("layout permanece estável nas larguras suportadas", async ({ page }) => {
    for (const width of [320, 360, 390, 430, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/cardapio");
      await expect(page.getByRole("heading", { level: 1, name: /Escolha pratos/i })).toBeVisible();
      const medidas = await page.evaluate(() => ({
        viewport: window.innerWidth,
        pagina: document.documentElement.scrollWidth,
      }));
      expect(medidas.pagina, `overflow horizontal em ${width}px`).toBeLessThanOrEqual(medidas.viewport);
    }
  });

  test("páginas públicas têm HTML rastreável e metadados", async ({ request }) => {
    const resposta = await request.get("/cardapio");
    const html = await resposta.text();
    expect(resposta.status()).toBe(200);
    expect(html).toContain("Cardápio público do restaurante");
    expect(html).toContain('rel="canonical"');
    expect(html).toContain('content="index,follow"');
  });

  test("rota inexistente devolve 404 verdadeiro", async ({ page }) => {
    const resposta = await page.goto("/pagina-que-nao-existe");
    expect(resposta.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Página não encontrada" })).toBeVisible();
  });

  test("cardápio trata API offline e erro 500", async ({ page }) => {
    await page.route("**/api/cardapio/**", (route) => route.abort());
    await page.goto("/cardapio");
    await expect(page.getByRole("heading", { name: /não conseguimos carregar/i })).toBeVisible();

    await page.unroute("**/api/cardapio/**");
    await page.route("**/api/cardapio/**", (route) => route.fulfill({ status: 500, body: "{}" }));
    await page.reload();
    await expect(page.getByRole("heading", { name: /não conseguimos carregar/i })).toBeVisible();
  });

  test("cardápio mantém loading com API lenta", async ({ page }) => {
    await page.route("**/api/**", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 600));
      await route.continue();
    });
    await page.goto("/cardapio");
    await expect(page.locator(".skeleton").first()).toBeVisible();
    await expect(page.locator(".catalog-toolbar")).toBeVisible();
  });

  test("páginas públicas não têm violações axe sérias ou críticas", async ({ page }) => {
    for (const [rota] of rotasPublicas) {
      await page.goto(rota);
      const resultado = await new AxeBuilder({ page }).analyze();
      const relevantes = resultado.violations.filter((item) => ["serious", "critical"].includes(item.impact));
      expect(relevantes, `violações de acessibilidade em ${rota}`).toEqual([]);
    }
  });
});

test.describe("autenticação", () => {
  test("login inválido é neutro e campos obrigatórios funcionam", async ({ page }) => {
    await page.goto("/entrar");
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    expect(await page.getByLabel("Usuário").evaluate((campo) => campo.validity.valueMissing)).toBe(true);

    await page.getByLabel("Usuário").fill("usuario-inexistente");
    await page.locator("#password").fill("senha-incorreta");
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText(/usuário ou senha inválidos/i);
  });

  test("sessão inválida é encerrada e rota de cliente volta ao login", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      sessionStorage.setItem("pp_access_token", "token-invalido");
      sessionStorage.setItem("pp_refresh_token", "refresh-invalido");
    });
    await page.goto("/perfil");
    await expect(page).toHaveURL(/\/entrar$/);
  });

  test("cadastro, pedido idempotente, envio e logout completam a jornada", async ({ page, request }) => {
    const sufixo = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const username = `e2e_${sufixo}`;
    const password = "Teste-seguro-927!";
    const cadastro = await request.post(`${API_URL}/auth/registro/`, {
      data: { username, password, email: `${username}@example.test` },
    });
    expect(cadastro.status()).toBe(201);
    const login = await request.post(`${API_URL}/auth/login/`, { data: { username, password } });
    expect(login.status()).toBe(200);
    const tokens = await login.json();

    await page.goto("/cardapio");
    await page.evaluate(({ access, refresh }) => {
      sessionStorage.setItem("pp_access_token", access);
      sessionStorage.setItem("pp_refresh_token", refresh);
    }, tokens);
    await page.reload();
    await page.getByLabel("Mesa ou ponto de pesca").selectOption({ label: "Mesa 999 - Teste E2E" });
    const [respostaComanda] = await Promise.all([
      page.waitForResponse(
        (response) => response.url().endsWith("/api/comandas/") && response.request().method() === "POST"
      ),
      page.getByRole("button", { name: "Abrir comanda" }).click(),
    ]);
    expect(respostaComanda.status()).toBe(201);
    await expect(page.locator("#selecao-mesa")).toHaveCount(0);
    const adicionar = page.getByRole("button", { name: "Adicionar", exact: true }).first();
    await Promise.all([
      page.waitForResponse((response) => response.url().includes("/adicionar_item/") && response.request().method() === "POST"),
      adicionar.dblclick(),
    ]);
    await page.goto("/carrinho");
    await expect(page.locator(".cart-item")).toHaveCount(1);
    await expect(page.locator(".quantity-control input").first()).toHaveValue("1");
    await page.getByRole("button", { name: /Enviar para cozinha/i }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Enviar pedido" }).click();
    await expect(page.getByText(/já saiu do modo edição/i)).toBeVisible();

    const botaoMenu = page.getByRole("button", { name: "Abrir menu" });
    if (await botaoMenu.isVisible()) await botaoMenu.click();
    await expect(page.getByRole("link", { name: /carrinho/i })).toBeVisible();
    await page.getByRole("button", { name: /sair/i }).click();
    await expect(page).toHaveURL(/\/entrar$/);
    expect(await page.evaluate(() => sessionStorage.getItem("pp_refresh_token"))).toBeNull();
  });
});
