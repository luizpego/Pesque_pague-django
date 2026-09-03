# 🎣 Pesque & Pague — Sistema de Comandas

Sistema web completo para um restaurante do tipo **pesque e pague**: o
cliente escolhe a mesa, monta o carrinho (comanda) com peixes pescados no
local ou pratos prontos, envia o pedido para a cozinha e acompanha o status
em tempo real. A equipe (garçom/cozinha/gerente) tem um painel próprio para
gerenciar as comandas ativas.

- **Backend:** Django 5 + Django REST Framework + JWT (SimpleJWT)
- **Frontend:** React 18 + Vite + React Router + Axios
- **Autenticação:** login obrigatório (site protegido), papéis de usuário
  (cliente, garçom, cozinha, gerente)
- **Pagamento:** Pix com QR Code via Mercado Pago — ver seção
  [Pagamento com Mercado Pago](#-pagamento-com-mercado-pago-pix--qr-code)
- **Acessibilidade:** alto contraste, fonte ampliada, navegação por teclado,
  leitores de tela — ver seção [Acessibilidade](#-acessibilidade)

---

## 📁 Estrutura do projeto

```
pesque-pague/
├── backend/            # API Django REST Framework
│   ├── pescapague/     # Configurações do projeto (settings, urls)
│   └── core/           # App principal: modelos, views, serializers
│       └── management/commands/seed_data.py   # popula dados de exemplo
└── frontend/           # Aplicação React (Vite)
    └── src/
        ├── api/         # cliente axios com JWT
        ├── context/     # AuthContext (login) e CartContext (carrinho)
        ├── components/  # Navbar, barra de acessibilidade, cards
        └── pages/       # telas: login, cardápio, carrinho, painel...
```

---

## ⚙️ Como rodar o backend (Django)

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

pip install -r requirements.txt

cp .env.example .env            # ajuste SECRET_KEY em produção

python manage.py migrate
python manage.py seed_data      # cria mesas, cardápio e usuários de teste
python manage.py runserver      # http://localhost:8000
```

Usuários criados pelo `seed_data` (senha para todos: `pescaria123`):

| Usuário   | Papel               | Uso                                   |
|-----------|---------------------|----------------------------------------|
| `gerente` | Gerente (superuser) | Acesso total, `/admin/` do Django      |
| `garcom`  | Garçom/Atendente    | Painel da equipe                       |
| `cliente` | Cliente             | Faz pedidos pelo cardápio              |

O painel administrativo do Django fica em `http://localhost:8000/admin/`.

### Principais endpoints da API

| Método | Rota                                        | Descrição                          |
|--------|----------------------------------------------|-------------------------------------|
| POST   | `/api/auth/registro/`                        | Cadastro de cliente                 |
| POST   | `/api/auth/login/`                           | Login (retorna tokens JWT)          |
| POST   | `/api/auth/refresh/`                         | Renova o token de acesso            |
| GET/PATCH | `/api/auth/me/`                           | Perfil e preferências               |
| GET    | `/api/categorias/`, `/api/cardapio/`          | Cardápio                            |
| GET    | `/api/mesas/`                                | Mesas disponíveis                   |
| GET/POST | `/api/comandas/`                            | Listar/abrir comanda (carrinho)     |
| POST   | `/api/comandas/{id}/adicionar_item/`          | Adiciona item ao carrinho           |
| POST   | `/api/comandas/{id}/remover_item/{item_id}/`  | Remove item do carrinho             |
| POST   | `/api/comandas/{id}/alterar_status/`          | Envia à cozinha, avança status etc. |
| POST   | `/api/comandas/{id}/gerar_pagamento/`         | Gera cobrança Pix (QR Code) no Mercado Pago |
| GET    | `/api/comandas/{id}/status_pagamento/`        | Consulta status do pagamento (polling) |
| POST   | `/api/pagamentos/webhook/`                    | Webhook de notificação do Mercado Pago |

Todas as rotas (exceto registro/login e o webhook) exigem o header
`Authorization: Bearer <token>`.

---

## ⚙️ Como rodar o frontend (React)

```bash
cd frontend
cp .env.example .env      # aponta para a URL da API
npm install
npm run dev                # http://localhost:5173
```

O frontend espera o backend rodando em `http://localhost:8000` (configurável
via `VITE_API_URL` no `.env`).

---

## 🔒 Site protegido

- Todas as páginas de pedido (cardápio, carrinho, comandas, painel, perfil)
  exigem login — usuários não autenticados são redirecionados para `/entrar`.
- O **Painel da equipe** (`/painel`) só é acessível a usuários com papel
  garçom, cozinha ou gerente.
- A API usa **JWT**: o token de acesso expira em 8h e é renovado
  automaticamente pelo frontend usando o token de atualização (refresh),
  sem precisar logar de novo no meio do uso.
- No backend, permissões (`core/permissions.py`) garantem que um cliente só
  veja e altere as próprias comandas; a equipe operacional vê todas.

---

## 🛒 Comanda / carrinho

1. O cliente faz login e escolhe a mesa (ou "lago") no cardápio.
2. Isso abre uma **comanda** (status `aberta`), que funciona como carrinho:
   itens podem ser adicionados, ter a quantidade somada e ser removidos.
3. Ao confirmar, a comanda muda para `enviada` e a cozinha passa a
   acompanhá-la no Painel da equipe, avançando o status até `fechada`.
4. O histórico completo fica disponível em "Minhas comandas".

Fluxo de status: `aberta → enviada → em_preparo → pronta → entregue → fechada`
(ou `cancelada` a qualquer momento pelo cliente ou pela equipe).

---

## 💳 Pagamento com Mercado Pago (Pix + QR Code)

O pagamento é feito via **Pix**, gerado pela API de Pagamentos do Mercado
Pago. Ao clicar em "Pagar com Pix" no carrinho, o backend cria uma cobrança
e devolve:

- `qr_code_base64`: a imagem do QR Code, exibida direto na tela;
- `qr_code`: o código Pix "copia e cola", com botão para copiar.

### Configuração

1. Crie uma conta em [mercadopago.com.br/developers](https://www.mercadopago.com.br/developers/panel)
   e pegue o **Access Token** (comece pelo de **teste**, em *Credenciais de teste*).
2. No `backend/.env`, defina:
   ```
   MERCADO_PAGO_ACCESS_TOKEN=SEU_ACCESS_TOKEN_AQUI
   ```
3. Rode as migrações (o pagamento adiciona os modelos `Pagamento` e o campo
   `pago` em `Comanda`):
   ```bash
   python manage.py makemigrations
   python manage.py migrate
   ```

### Como o status é atualizado

Duas formas, que funcionam juntas:

- **Webhook** (produção / com URL pública): configure `MERCADO_PAGO_WEBHOOK_URL`
  apontando para `https://SEU-DOMINIO/api/pagamentos/webhook/`. O Mercado
  Pago chama essa URL sempre que o status do pagamento muda.
- **Consulta manual / polling** (funciona mesmo sem URL pública, ótimo para
  rodar localmente): a tela de pagamento do frontend chama
  `GET /api/comandas/{id}/status_pagamento/` a cada poucos segundos, que
  consulta a API do Mercado Pago diretamente e atualiza o banco.

Quando o pagamento é aprovado, a comanda é marcada com `pago = true` e
`pago_em` recebe a data/hora — isso é independente do status de preparo
(`aberta`, `em_preparo` etc.), já que num pesque-pague o cliente pode pagar
antes, durante ou depois de comer.

> ⚠️ Sem um `MERCADO_PAGO_ACCESS_TOKEN` configurado, a rota de gerar
> pagamento responde com erro 503 e uma mensagem explicando o que falta —
> o restante do sistema (cardápio, comandas, painel) continua funcionando
> normalmente.

---

## ♿ Acessibilidade

O sistema foi pensado para ser inclusivo desde a base:

- **Alto contraste** e **fonte ampliada**, ativáveis a qualquer momento pela
  barra fixa no topo de todas as páginas, e também salváveis como
  preferência permanente na tela "Meu perfil".
- **Navegação por teclado**: foco visível em todos os elementos
  interativos, link "Pular para o conteúdo" no início da página.
- **Leitores de tela**: uso de `aria-label`, `aria-pressed`, `role="alert"`
  / `role="status"` para mensagens dinâmicas, texto alternativo (`alt`)
  configurável para cada imagem do cardápio.
- **Formulários** com `<label>` associado a cada campo e mensagens de erro
  anunciadas automaticamente.
- **Contraste de cores** pensado no tema de pescaria (azul-lago escuro,
  areia, verde-mata) já com boa relação de contraste; o modo alto contraste
  reforça ainda mais essa relação para baixa visão.

---

## 🎨 Tema visual

A identidade visual remete a um restaurante de pesque e pague: tons de
azul-lago, areia e madeira, ícones de peixe e vara de pescar, selo "Pescado
no local" nos itens de peixe fresco. Toda a estilização está centralizada em
`frontend/src/styles/index.css`, usando variáveis CSS para facilitar ajustes
de tema (inclusive o próprio modo de alto contraste).

---

## 🚀 Próximos passos sugeridos

- Notificações em tempo real (WebSockets) em vez do polling do painel.
- Impressão de comanda para a cozinha.
- Testes automatizados (pytest para a API, Testing Library para o front).

---

## ☁️ Deploy (GitHub + Render)

O GitHub guarda o código; quem "roda" o site é um serviço conectado a ele.
Aqui usamos o **Render** (tem plano gratuito e funciona bem com Django +
React), mas o mesmo backend também roda em Railway, Fly.io etc.

### 1. Suba o código para o GitHub

```bash
cd pesque-pague
git init
git add .
git commit -m "Primeiro commit — Pesque & Pague"
```

Crie um repositório vazio em [github.com/new](https://github.com/new) (sem
README, sem .gitignore — já temos um) e depois:

```bash
git remote add origin https://github.com/SEU_USUARIO/pesque-pague.git
git branch -M main
git push -u origin main
```

### 2. Backend no Render (Web Service)

1. Em [render.com](https://render.com), crie conta e clique em **New +
   → Web Service**, conectando o repositório do GitHub.
2. Configure:
   - **Root Directory:** `backend`
   - **Build Command:** `./build.sh`
   - **Start Command:** `gunicorn pescapague.wsgi:application`
   - **Instance Type:** Free
3. Em **Environment**, adicione as variáveis:
   ```
   SECRET_KEY=uma-chave-bem-aleatoria-e-secreta
   DEBUG=False
   ALLOWED_HOSTS=SEU-APP.onrender.com
   CORS_ALLOWED_ORIGINS=https://SEU-FRONTEND.onrender.com
   MERCADO_PAGO_ACCESS_TOKEN=seu-token-de-producao-ou-teste
   ```
4. Crie também um banco **PostgreSQL** gratuito no Render (New + →
   PostgreSQL) e copie a "Internal Database URL" gerada para a variável
   `DATABASE_URL` do seu Web Service (o SQLite não é adequado em produção
   porque o disco do Render é apagado a cada novo deploy).
5. Depois do primeiro deploy, rode o seed pelo "Shell" do próprio Render:
   ```bash
   python manage.py seed_data
   ```

### 3. Frontend no Render (Static Site)

1. New + → **Static Site**, mesmo repositório.
2. Configure:
   - **Root Directory:** `frontend`
   - **Build Command:** `npm install && npm run build`
   - **Publish Directory:** `dist`
3. Em **Environment**, adicione:
   ```
   VITE_API_URL=https://SEU-APP.onrender.com/api
   ```
4. Depois do deploy, volte no Web Service do backend e ajuste
   `CORS_ALLOWED_ORIGINS` com a URL real que o Render deu ao frontend.

### 4. Deploy automático

Pronto — a partir daqui, todo `git push` para `main` atualiza o site
automaticamente (backend e frontend), sem precisar mexer no Render de novo.

> 💡 O Render free "dorme" depois de um tempo sem uso e demora ~1 minuto
> para acordar na primeira visita — normal no plano gratuito.
