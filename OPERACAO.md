# Operação integrada do pesqueiro

## Implementado

- Administrador/dono (`gerente` ou superusuário), garçom, cozinha, cliente e caixa.
  As permissões são verificadas na API e a interface usa os mesmos papéis.
- Login administrativo abre `/dashboard`: vendas efetivamente fechadas do dia,
  meta, percentual calculado, ocupação, cozinha, estoque e reservas.
- `/administracao`: produtos, categorias, mesas, fotos, banner, textos, contatos,
  horários, pesca, reservas, metas e usuários. Fotos são uploads persistentes.
- `/mesas` e `/atendimento`: comandas independentes na mesma mesa, identificação
  do grupo, vários pedidos, quantidades, observações e histórico de alterações.
- `/minhas-comandas`: somente dados do próprio cliente, pedido, cancelamento
  antes do preparo, acompanhamento, solicitação de fechamento e divisão igual.
  Um garçom pode gerar convite privado de uso único para vincular comanda sem dono.
- `/painel`: pedidos por chegada, recebido/preparando/pronto/entregue, atualização
  a cada 15 segundos, documento térmico e situação da impressão.
- `/estoque`: saldo, mínimo, unidade, controle opcional e movimentações auditadas.
- `/caixa`: abertura com troco, recebimentos, dinheiro esperado, contagem e fechamento.
- `/reservar`: solicitação pública limitada por frequência. O administrador
  confirma, recusa/cancela ou finaliza; pode filtrar data sem apagar histórico.
- `/registros`: dia, semana, mês ou intervalo de até 366 dias; vendas, pagamentos,
  produtos, cancelamentos e histórico. Metas usam vendas fechadas, não pedidos abertos.

## Fluxo e regras

1. Abrir caixa antes de receber. Garçom/cliente abre uma comanda e registra pedidos.
2. Ao confirmar cada pedido, o servidor lê os preços oficiais e preserva nome e
   preço nos itens. Pedido, reserva de estoque e documento pendente são atômicos.
3. A cozinha prepara, marca pronto e entrega. Não reduz estoque novamente.
4. Cancelar devolve somente a quantidade efetivamente baixada, uma única vez.
   Itens e pedidos cancelados permanecem no histórico. Cliente não cancela após preparo.
5. Com todos os pedidos entregues/cancelados, solicitar fechamento. Caixa/gerente
   confere subtotal, desconto e acréscimo e registra dinheiro/PIX/débito/crédito.
6. A soma dos recebimentos precisa igualar exatamente o saldo, em centavos.
   Pagamento, vínculo ao caixa, total congelado e fechamento são uma transação.
7. Comanda fechada não pode ser alterada. A mesa fica livre somente quando não
   houver outra comanda ativa nela. Relatórios usam snapshots, não preços atuais.

Os filtros por produto e forma de pagamento selecionam vendas que contêm o
produto/forma; o faturamento dessas vendas é o total completo. A tela explicita
esse critério. Divisão igual distribui centavos restantes entre as primeiras
pessoas: a soma sempre coincide com o saldo, mas não cobra cada pessoa online.

## Corrigido e segurança

- Backend impede acesso à comanda alheia e nega gestão/financeiro à cozinha.
- Usuário não altera seu próprio papel pelo perfil. Cadastro administrativo
  valida senhas, não aceita criação de superusuário e impede auto-desativação.
- Preços, totais e saldo de estoque são calculados no servidor. Entradas decimais
  inválidas, negativas, fora do limite e fechamento incompleto são rejeitados.
- Transações e bloqueios de linha no PostgreSQL protegem estoque e caixa.
  Versão otimista detecta edição concorrente; chaves de idempotência vinculadas
  ao conteúdo evitam repetir abertura, pedido e recebimento.
- Cancelamento é lógico, com motivo/autor/data. Alterações administrativas,
  movimentações, pagamento e tentativas de impressão deixam auditoria.
- Refresh JWT concorrente compartilha uma única renovação no navegador;
  falha temporária de rede não apaga o refresh nem ressuscita sessão encerrada.
- Imagens: JPEG/PNG/WebP verificados, até 5 MB/6000 px, sem SVG/HTML. Resposta
  pública com tipo correto, ETag e `nosniff`. Não são documentos privados.
- CORS explícito, CSP no frontend, TLS, cookies administrativos seguros e
  CSRF do Django preservados. A API usa Bearer JWT, não cookies de autenticação.
- E2E usa banco descartável, sem alterar contas, caixa ou estoque reais.
- Deploy não executa mais carga demonstrativa. Nenhuma senha foi acrescentada
  ao código. Senhas fracas previamente escolhidas devem ser trocadas pelo titular.

Auditoria automatizada e testes não equivalem a garantia de segurança absoluta.
O throttling atual usa cache por processo: para várias instâncias, adote cache
compartilhado e limitação de tentativas na borda conforme a infraestrutura.

## Banco de dados

- `0006`: pedidos, auditoria, snapshots, fechamento e dados de idempotência.
- `0007`: converte itens legados enviados em pedidos e preserva totais fechados.
  Horários/autores ausentes não são inventados. Usa a última atualização legada
  como referência de fechamento e registra essa origem no evento de migração.
- `0008`: várias comandas por mesa, estoque/movimentos, caixa, reservas, metas,
  CMS, convites privados e confirmação de impressão.
- `0009`: armazenamento persistente de imagens no banco.
- `0010`: copia imagens locais ainda disponíveis e prepara documentos pendentes
  de pedidos antigos não finalizados. Não recupera arquivos que já foram perdidos.

Faça backup consistente antes de migrar produção. Não reverta para código antigo
com vendas novas sem plano de compatibilidade. As migrações não apagam comandas,
itens, usuários ou pagamentos. PostgreSQL é necessário para bloqueios concorrentes;
SQLite serve para desenvolvimento, não operação multiusuário do estabelecimento.

## Impressão térmica

1. Instale o driver da impressora na máquina da cozinha e imprima uma página de teste.
2. Em **Cadastros > Site e impressão**, informe o nome da impressora e selecione
   o padrão 80 ou 58 mm. O nome é uma identificação operacional; o navegador
   não permite selecionar um dispositivo USB remoto apenas pelo nome.
3. Abra o pedido na cozinha e clique em imprimir. No diálogo, escolha o dispositivo,
   rolo correspondente, escala de 100%, sem cabeçalhos/rodapés e margens adequadas
   à área imprimível do driver. Os estilos usam largura fixa e quebra de texto.
4. Confira o papel. Clique **Confirmar papel impresso** somente se saiu corretamente.
   Caso contrário, **Registrar falha** e reimprima após corrigir a impressora.

Estados: pendente -> solicitado -> impresso/falha. Uma nova impressão confirmada
após uma anterior confirmada é reimpressão. A confirmação registra operador e
tentativa; uma confirmação de tentativa antiga é rejeitada.

O modo de estação abre o próximo pedido pendente para o diálogo do navegador,
mediante ativação do operador e permissão de pop-ups. Não é um serviço silencioso
contínuo. Automação física sem diálogo exige agente local autenticado ou ambiente
kiosk controlado, vinculado ao pedido/tentativa. Isso depende do equipamento local.

Os testes simulam o diálogo e geram PDFs de 80/58 mm, exercitam falha e nova
tentativa, e verificam ausência de valores financeiros na via da cozinha.
Não atestam saída de papel nem comunicação USB. Recibo de caixa é não fiscal.

## Verificação e publicação

```powershell
cd backend
.\.venv\Scripts\python.exe manage.py migrate
.\.venv\Scripts\python.exe manage.py test core -v 2
.\.venv\Scripts\python.exe manage.py makemigrations --check --dry-run
cd ../frontend
npm run lint
npm run build
npm run test:e2e
```

CI usa PostgreSQL 16 para testar também duas comandas disputando a última unidade.
E2E cobre venda completa, quantidades/cancelamentos, divisão em duas formas,
estoque, cozinha, restrições de acesso, relatórios, CMS/fotos/reserva, sessão,
axe e layouts entre 320 e 1440 px. Evidências ficam em `frontend/test-results/`.

Produção mantém os serviços Render existentes e o PostgreSQL atual. Confirme
backup, CI, migrações, `/api/dashboard/` autenticado e `/api/cardapio/` público.
Sincronize as rotas do Blueprint, especialmente `/imprimir/atendimento/*` para
`/imprimir/atendimento/index.html`; não use rewrite global que esconda 404.

## Dependências externas reais

- Impressora/driver, papel e validação presencial; impressão silenciosa exige
  equipamento/agente local, não controlável pelo servidor web hospedado.
- OAuth Google precisa de credenciais válidas e origens autorizadas pelo titular.
- Mercado Pago permanece desativado. Antes de ativar, valide credenciais, webhook
  e conciliação com caixa em sandbox. PIX manual registra recebimento presencial.
- Publicação e backup remoto dependem de sessão/permissão no GitHub e Render.
