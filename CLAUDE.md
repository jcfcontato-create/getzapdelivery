# Instruções para o Agente: GetZap Delivery

Você está trabalhando no **GetZap Delivery**, um sistema de delivery para restaurantes e adegas. Ele começa atendendo uma única loja, a **Adega e Restaurante S.O.S**, e foi pensado para virar um SaaS que atende várias lojas.

Este arquivo é o manual do projeto. Leia-o inteiro antes de começar qualquer tarefa. Ele separa o que já foi **decidido** do que ainda é **proposta** e precisa de confirmação.

---

## 1. Sobre o projeto

- **Produto:** cardápio online + pedido pelo WhatsApp + painel de gestão para o dono da loja.
- **Loja nº 1:** Adega e Restaurante S.O.S (slogan: "Boa comida • Boas bebidas • Sempre aqui").
- **Estratégia:** validar com a Adega primeiro; se funcionar, evoluir para SaaS (várias lojas).
- **Domínio:** `getzapdelivery.com.br`, registrado no Registro.br. O nome parece ser a marca da **plataforma**, não só da Adega.
- **Idioma:** interface, textos e comunicação em português do Brasil.
- **Repositório:** `https://github.com/jcfcontato-create/getzapdelivery.git`

## 2. Decisões já tomadas (não mudar sem perguntar)

- Começar pela Adega S.O.S e só depois evoluir para SaaS.
- Escopo do produto: **cardápio online + pedido pelo WhatsApp + painel de gestão**.
- Domínio: `getzapdelivery.com.br`.
- Hospedagem: **Hostinger**, plano inicial **Cloud Professional** (hospedagem de site normal). **Não usar Cloudflare** (já houve problemas).
- Itens da seção 11 (pagamento online, API oficial do WhatsApp etc.) ficam para depois, confirmado pelo Jorge.
- **Stack:** o Jorge não tem preferência técnica e delegou a escolha, pedindo o mais seguro e estável. Escolhida: React + TypeScript + Vite + Tailwind CSS no front-end; Supabase (banco PostgreSQL, login e armazenamento de fotos) no back-end. O resultado é um site estático publicado na Hostinger, sem servidor próprio para manter. Como o React roda em `/adega-sos`, incluir a regra de reescrita (`.htaccess`) para as rotas funcionarem ao recarregar a página.
- **Site de captação:** o GetZap Delivery precisa de um site de apresentação para captar novos clientes (donos de restaurantes e adegas). O Jorge vai enviar a logo do sistema.

## 3. Proposta do planejamento (confirmar com o Jorge antes de implementar)

Estas definições vieram do planejamento inicial e ainda não foram fechadas item a item. Se a tarefa depender de uma delas, **pergunte antes**.

- **Multi-loja desde o início:** toda tabela de dados carrega `loja_id`; a Adega é a loja nº 1. Isso evita reescrever tudo na fase SaaS.
- **Pedido pelo WhatsApp:** o pedido é **salvo no banco primeiro** e depois abre o WhatsApp da loja com a mensagem pronta (link `wa.me`). API oficial do WhatsApp Business fica para depois (tem custo e aprovação).
- **Pagamento no MVP:** na entrega (dinheiro, cartão, Pix na hora). Pagamento online só na fase 2.
- **Taxa de entrega:** valor fixo por bairro/região (não por distância).
- **URLs no MVP:** por caminho, sem subdomínio automático (ver seção 5).

## 4. Fases

1. **MVP da Adega**
   - Cardápio público: categorias, produtos com foto e preço, adicionais/observações, carrinho.
   - Checkout: nome, telefone, entrega ou retirada, endereço, forma de pagamento, taxa de entrega.
   - Envio do pedido pelo WhatsApp (pedido salvo antes).
   - Painel: login, cadastro de produtos e categorias, lista de pedidos com status (novo, em preparo, saiu para entrega, entregue, cancelado), horário de funcionamento, taxa de entrega por bairro, botão abrir/fechar loja.
2. **Melhorias:** aviso sonoro de pedido novo, impressão do pedido, cupons, relatório de vendas, Pix online.
3. **SaaS:** cadastro de novas lojas, subdomínio por loja, logo e cores por loja, planos e cobrança, domínio próprio como recurso extra.

**Frente paralela: site de captação do GetZap Delivery.** Landing page de vendas em `getzapdelivery.com.br` para atrair novos clientes: proposta de valor, como funciona, benefícios, a Adega S.O.S como primeiro caso, oferta/planos quando definidos, perguntas frequentes e botão de contato (WhatsApp ou formulário). Usa a logo do sistema que o Jorge vai enviar. Pode ser publicada antes do app ficar pronto.

Trabalhe **uma fase por vez**. Não antecipe funcionalidades das fases seguintes.

## 5. Endereços e hospedagem

**MVP (plano Cloud Professional da Hostinger):**

- `getzapdelivery.com.br`: site de captação de clientes (landing page de vendas do produto)
- `app.getzapdelivery.com.br/adega-sos`: cardápio público da Adega (o mesmo aplicativo React atende o cardápio e o painel)
- `app.getzapdelivery.com.br/painel`: painel de gestão

**Fase SaaS (migrar para VPS da Hostinger):**

- `adegasos.getzapdelivery.com.br` e um subdomínio por loja, com registro DNS curinga (`*`) e certificado SSL curinga.
- Motivo: na Hostinger, o SSL curinga só existe em planos VPS; nos planos Web/Cloud cada subdomínio é criado manualmente.
- O DNS pode continuar no Registro.br ou apontar para os nameservers da Hostinger. Decidir na fase SaaS.

Mantenha o cardápio, o banco e o painel desacoplados da hospedagem para a migração ser pequena.

## 6. Modelo de dados (proposta inicial)

Tabelas principais, todas com `loja_id`: `lojas`, `categorias`, `produtos`, `adicionais`, `pedidos`, `itens_pedido`, `zonas_entrega` (bairro + taxa), `horarios_funcionamento`, e a ligação entre usuários (donos) e lojas.

- Use **políticas de acesso por linha (RLS)** no Supabase: cada dono só enxerga os dados da própria loja.
- O cardápio público lê apenas produtos ativos de uma loja; nunca expõe dados de pedidos.
- Guardar os pedidos com o preço vigente na hora da compra (o preço do produto pode mudar depois).

## 7. Identidade visual

- **Adega S.O.S (tema da loja nº 1):** fundo preto, dourado nos contornos e ícones, vermelho como destaque, branco no texto principal. Cores aproximadas: preto `#000000`, dourado `#C9A24B`, vermelho `#D0021B`. Conferir contra o arquivo da logo antes de fixar.
- **Plataforma GetZap Delivery:** a logo mostra um robô simpático com um celular (WhatsApp) e uma impressora de pedidos. Cores aproximadas: azul-escuro `#1B2A4A` ("GET"), verde `#2EA043` ("ZAP"), laranja `#F28C28` ("DELIVERY") e azul do robô `#3B82C4`. Conferir contra o arquivo da logo antes de fixar.
- Cores e logo devem vir de **configuração por loja** (não fixas no código), para facilitar a fase SaaS.
- O layout precisa funcionar muito bem no **celular** (o cliente pede pelo telefone).

## 8. Como você deve trabalhar

**1. Leia antes de agir.** Comece pelas decisões deste arquivo e pelos workflows em `workflows/`. Se algo contradiz este arquivo, pergunte.

**2. Procure o que já existe.** Antes de criar um componente, script ou tabela, verifique se já há algo parecido no projeto.

**3. Pergunte nas decisões grandes.** Mudança de stack, de estrutura de dados, de hospedagem, de fluxo de pedido ou qualquer item da seção 3: pergunte antes. Para detalhes pequenos, decida e registre.

**4. Comece pelo plano.** Em tarefas não triviais, planeje antes de editar (modo plano do Claude Code: Shift+Tab ou `/plan`) e só implemente depois da aprovação.

**5. Aprenda com as falhas.** Quando algo der errado: leia o erro completo, corrija, teste de novo e **registre o aprendizado** no workflow ou em `docs/`. Se o teste usar serviço pago ou consumir créditos, pergunte antes de repetir.

**6. Mantenha os workflows atualizados**, mas **não crie nem sobrescreva workflows sem perguntar**, a menos que o Jorge peça explicitamente.

**7. Segredos só no `.env`.** Chaves do Supabase, tokens e senhas nunca vão para o código, para o repositório ou para este arquivo. Ao criar o repositório, inclua `.env` no `.gitignore`. **Nunca peça nem aceite login e senha** de contas (Supabase, Hostinger, Registro.br): o Jorge configura as chaves do projeto sozinho, no `.env`, com a sua orientação.

**8. Não invente dados da loja.** Cardápio, preços, horários, bairros atendidos e número de WhatsApp da Adega vêm do Jorge. Se faltar, pergunte ou use dados de exemplo claramente marcados como exemplo.

**9. Git e GitHub.** Faça commits pequenos, com mensagens claras em português. Nunca faça commit de `.env`, chaves ou arquivos de credenciais. O envio (`git push`) é feito pelo Jorge, com o acesso dele na máquina dele: não peça tokens nem senhas. Recomende manter o repositório **privado**, por ser um produto comercial.

## 9. Estrutura de pastas (proposta)

```
app/            # Código do aplicativo (cardápio público + painel)
supabase/       # Migrações SQL e políticas de acesso (RLS)
workflows/      # SOPs em Markdown (tarefas repetidas)
tools/          # Scripts de apoio (ex.: importar cardápio de planilha)
docs/           # Decisões, planejamento e aprendizados
.tmp/           # Arquivos temporários, descartáveis
.env            # Segredos (NUNCA versionar)
CLAUDE.md       # Este arquivo
README.md       # Apresentação do repositório
.env.example    # Modelo do .env, sem valores reais (este sim vai para o Git)
```

Entregas finais são **código no repositório e o site publicado**. Arquivos em `.tmp/` são descartáveis.

## 10. Workflows previstos

Crie estes SOPs (sempre com aprovação do Jorge) conforme forem necessários:

- `cadastrar_nova_loja.md`: passo a passo para adicionar uma loja (dados, tema, subdomínio, usuário do dono).
- `publicar_na_hostinger.md`: como gerar o build e publicar cardápio e painel.
- `importar_cardapio.md`: como carregar produtos de uma planilha.
- `configurar_dominio_dns.md`: apontamentos no Registro.br/Hostinger, incluindo o curinga na fase SaaS.

Cada workflow define: objetivo, entradas necessárias, passos, saída esperada e como tratar problemas comuns.

## 11. Fora de escopo por enquanto

Pagamento online, API oficial do WhatsApp Business, cálculo de frete por distância, aplicativo nativo, cobrança de planos e domínio próprio por loja. Só entram nas fases 2 e 3 (o Jorge confirmou que ficam para depois).

## 12. Perguntas em aberto

- Dados reais da Adega: cardápio, fotos, horários, bairros atendidos e taxas. (O WhatsApp e o endereço já foram informados.)
- Impressão automática do pedido (aparece na logo do sistema): confirmar se entra já na promessa do site e em qual fase do app.
- Briefing do site de captação (público, oferta, provas, objeções, tom e tráfego) em andamento com o Jorge. O número de WhatsApp de contato é fornecido por ele e configurado no site, sem ficar fixo no código.
- Conteúdo do site de captação: oferta/planos e preços do SaaS, meio de contato (WhatsApp ou formulário) e prova social disponível.

---

**Resumo:** você conecta o que o Jorge quer (este arquivo e os workflows) ao que realmente é entregue (o código). Seja pragmático, confiável e vá melhorando o projeto a cada tarefa.
