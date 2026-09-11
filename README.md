# Pesque & Pague

Sistema web para restaurante e operação de pesque-pague. O cardápio e as
informações da pesca são públicos; pedidos, comandas, pesagens e painéis
operacionais usam autenticação e autorização por papel.

## Recursos

- Cardápio público com busca, categorias, preços e disponibilidade.
- Comanda vinculada à mesa, com total calculado no backend.
- Painel de restaurante separado da operação de pesca.
- Cadastro de lagos, espécies, regras, serviços, horários e galeria.
- Entrada e saída de pescadores, capturas, peso e preço por quilo.
- Fluxo de comandas com transições por papel, idempotência e auditoria de cancelamento.
- Impressão em 58 mm, 80 mm e A4 para cliente, cozinha, balcão e pesca.
- Estados de documento `gerado`, `solicitado` e `reimpresso`, sem duplicar o
  registro ao reimprimir.
- Pagamento online preservado atrás de feature flag e desativado por padrão.
- Login por usuário/senha e integração opcional com Google OAuth.
- Páginas públicas pré-renderizadas, sitemap, metadados sociais e 404 HTTP real.

## Arquitetura

- Backend: Django 5.2 LTS, Django REST Framework, SimpleJWT e PostgreSQL.
- Frontend: React 18, Vite 8, React Router 7 e Axios.
- Produção: Render Blueprint definido em `render.yaml`.
- Arquivos estáticos do Django: WhiteNoise.

## Desenvolvimento local

Backend:

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate
# Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt
copy .env.example .env
python manage.py migrate
python manage.py seed_catalog
python manage.py runserver
```

Frontend, em outro terminal:

```bash
cd frontend
copy .env.example .env
npm ci
npm run dev
```

Abra `http://127.0.0.1:5173`. A API local usa
`http://127.0.0.1:8000/api`.

Para criar um administrador local:

```bash
python manage.py createsuperuser
```

O comando `seed_data` cria credenciais previsíveis para demonstração. Nunca o
execute em produção.

## Segurança

- `DEBUG=False` exige uma `SECRET_KEY` externa e segura.
- Hosts, origens CORS, CSRF e Google OAuth são listas explícitas em produção.
- Login e renovação de token têm limitação de tentativas.
- Mesas, comandas, impressões, pagamentos e operação de pesca exigem login.
- Administração de catálogo, mesas e conteúdo exige gerente ou superusuário.
- Cozinha só avança `enviada -> em preparo -> pronta`; garçom cuida de envio,
  entrega e fechamento; gerente pode executar todas as transições válidas.
- Clientes só consultam e alteram as próprias comandas; testes de IDOR/BOLA
  cobrem leitura, edição e remoção usando IDs de outro cliente.
- Preços e totais são calculados no servidor; valores enviados pelo cliente
  não são confiados.
- Chaves `Idempotency-Key`, transações e bloqueios de linha evitam itens
  duplicados e corridas nas operações críticas.
- Cancelamentos de comanda exigem motivo e registram usuário e horário; os
  endpoints genéricos de exclusão foram desativados para preservar histórico.
- JWT de acesso expira em 30 minutos; o refresh rotaciona, entra em blacklist
  no logout e fica em `sessionStorage`, não em armazenamento persistente.
- Uploads aceitam somente JPEG, PNG e WebP verificados, até 5 MB e 6000 px.
- O webhook do Mercado Pago valida HMAC antes de consultar o pagamento.
- O webhook ignora eventos quando pagamentos estão desativados e falha fechado
  se a integração ativa não tiver segredo.
- O frontend publicado recebe CSP, HSTS, proteção contra framing, MIME sniffing
  e uma política restritiva de permissões.
- O banco PostgreSQL do Blueprint bloqueia conexões externas.

A URL da API é pública por necessidade, mas apenas saúde, cardápio, conteúdo
institucional, cadastro/login e webhook são rotas anônimas. Dados operacionais
continuam protegidos por JWT, papel e autorização por objeto. O token de acesso
continua legível pelo JavaScript da própria página até expirar; evite scripts de
terceiros e mantenha a CSP atualizada ao adicionar integrações.

## Variáveis de ambiente

Backend:

```env
SECRET_KEY=gere-uma-chave-longa-e-aleatoria
DEBUG=False
ALLOWED_HOSTS=pesque-pague-api.onrender.com
CORS_ALLOWED_ORIGINS=https://pesque-pague-web.onrender.com
CSRF_TRUSTED_ORIGINS=https://pesque-pague-web.onrender.com
GOOGLE_ALLOWED_ORIGINS=https://pesque-pague-web.onrender.com
DATABASE_URL=postgresql://...
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
ORDERS_FEATURE_ENABLED=True
ONLINE_PAYMENTS_ENABLED=False
MERCADO_PAGO_ACCESS_TOKEN=
MERCADO_PAGO_WEBHOOK_URL=
MERCADO_PAGO_WEBHOOK_SECRET=
```

Frontend:

```env
VITE_API_URL=https://pesque-pague-api.onrender.com/api
VITE_GOOGLE_CLIENT_ID=
VITE_GOOGLE_AUTH_ENDPOINT=/auth/google/
VITE_ONLINE_PAYMENTS_ENABLED=false
VITE_SITE_URL=https://pesque-pague-web.onrender.com
```

## Google OAuth em produção

Depois de obter a URL definitiva do frontend:

1. No Google Cloud Console, abra o cliente OAuth do tipo Aplicativo da Web.
2. Adicione a URL do frontend, com HTTPS e sem caminho, em Origens JavaScript
   autorizadas.
3. Use a mesma origem em `GOOGLE_ALLOWED_ORIGINS`, `CORS_ALLOWED_ORIGINS` e
   `CSRF_TRUSTED_ORIGINS` no backend.
4. Defina o mesmo Client ID em `GOOGLE_CLIENT_ID` e
   `VITE_GOOGLE_CLIENT_ID`; mantenha `GOOGLE_CLIENT_SECRET` apenas no backend.

O login por usuário e senha funciona mesmo sem as credenciais Google.
Sem um Client ID e Client Secret reais não é possível concluir o teste externo
do Google; o botão informa a ausência de configuração sem impedir o restante do
site.

## Pagamento online

O fluxo Mercado Pago permanece no código, mas não aparece no frontend e é
bloqueado pela API enquanto as flags estiverem falsas. Para reativá-lo:

1. Configure credenciais e segredo de webhook válidos.
2. Aponte `MERCADO_PAGO_WEBHOOK_URL` para
   `https://SEU-BACKEND/api/pagamentos/webhook/`.
3. Altere `ONLINE_PAYMENTS_ENABLED=True` no backend e
   `VITE_ONLINE_PAYMENTS_ENABLED=true` no frontend.
4. Faça um deploy e teste primeiro com credenciais de sandbox.

## Impressão

O botão de impressão abre o diálogo do navegador, que permite escolher uma
impressora térmica ou comum. O sistema registra a solicitação, mas não declara
que o papel foi impresso, pois essa confirmação pertence ao navegador e ao
driver da impressora. Impressão silenciosa exigiria um agente local confiável,
como QZ Tray, configurado separadamente.

## Testes e build

```bash
cd backend
python manage.py test core -v 2
python manage.py makemigrations --check --dry-run
python manage.py check --deploy
pip check

cd ../frontend
npm ci
npm run lint
npm run build
npm run test:e2e
npm audit --omit=dev
```

`npm run test:e2e` prepara apenas os usuários e a Mesa 999 de teste, inicia a
API local caso necessário e executa Playwright/axe em Chromium. A suíte cobre
rotas diretas e reload, 404 real, 320 a 1440 px, API lenta/offline/500,
acessibilidade, sessão inválida e a jornada cadastro -> pedido -> cozinha ->
logout. O GitHub Actions repete backend, lint, build e E2E em cada push/PR.

## Migração de integridade

A migração `core.0003` adiciona auditoria de cancelamento, idempotência e
restrições de uma comanda ativa por mesa e uma comanda aberta por cliente. A
configuração também ativa as migrações oficiais da blacklist do SimpleJWT. Antes
de criar as restrições, `core.0003` preserva o histórico e marca como canceladas
eventuais duplicidades antigas, com uma justificativa técnica.

## Deploy no Render

O `render.yaml` cria três recursos: PostgreSQL privado, API Django e frontend
estático. No painel do Render, crie um Blueprint a partir deste repositório e
aplique-o. O build instala dependências, coleta estáticos, aplica migrações,
carrega o catálogo inicial e executa o checklist de produção.

O frontend gera HTML separado para `/`, `/restaurante`, `/cardapio`,
`/pesque-pague` e `/contato`. Não adicione novamente um rewrite global para
`index.html`: ele transformaria páginas inexistentes em respostas HTTP 200 e
prejudicaria o SEO. Somente as rotas dinâmicas de impressão usam rewrite.

Depois do primeiro deploy:

1. Crie um superusuário com `python manage.py createsuperuser` no Shell do
   serviço de backend.
2. Cadastre no admin os dados reais do estabelecimento, horários, lagos,
   espécies, regras e serviços.
3. Configure o Google OAuth com as URLs finais.
4. Valide cardápio, login, pedido, painel e impressão nas URLs públicas.

Uploads feitos no disco efêmero do Render não são persistentes. Para imagens
administradas em produção, configure um armazenamento externo compatível com
Django (por exemplo, S3 ou Cloudinary) antes de depender de novos uploads.
