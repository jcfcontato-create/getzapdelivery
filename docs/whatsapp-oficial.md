# WhatsApp oficial (API Cloud da Meta) — número da plataforma GetZap

## O que faz
Quando a loja clica em **Iniciar preparo** ou **Saiu para entrega**, o cliente recebe automaticamente,
pelo número oficial do GetZap, um aviso como:
> Olá, Maria! Seu pedido #12 na Big Açaí foi confirmado e já está em preparo. ✅

- Ligado **por loja** no Painel Admin (coluna "WhatsApp oficial").
- Não envia para pedidos de mesa nem de balcão, nem para pedidos sem telefone.
- Cada aviso é registrado na tabela `whatsapp_envios` (enviado ou erro) e não é repetido para o mesmo pedido.
- Edge Function: `whatsapp-enviar`.

## Custo
A Meta cobra **por mensagem entregue** (categoria "utilidade"). A referência para o Brasil é de cerca de
**US$ 0,0068 por mensagem** (confira a tabela atual em developers.facebook.com → WhatsApp → Pricing).
A cobrança é no cartão cadastrado na conta do WhatsApp Business da plataforma.

## Configuração (feita pelo Jorge, uma vez)
1. **Gerenciador de Negócios da Meta** (business.facebook.com): crie a conta da empresa e faça a
   **verificação da empresa** (Configurações → Central de segurança), com o CNPJ.
2. **App na Meta**: em developers.facebook.com → Meus apps → Criar app → tipo **Empresa** → adicione o
   produto **WhatsApp**. Ligue o app ao Gerenciador de Negócios.
3. **Número**: em WhatsApp → Configuração da API → **Adicionar número de telefone**. Use um número que
   **não esteja** no app WhatsApp comum (ou apague a conta do app antes). Defina o nome de exibição
   "GetZap Delivery" e cadastre a forma de pagamento.
4. Copie o **Phone number ID** (ID do número de telefone), que aparece nessa mesma tela.
5. **Token permanente**: Gerenciador de Negócios → Configurações → Usuários → **Usuários do sistema** →
   adicionar (Administrador) → Atribuir ativos (o app e a conta do WhatsApp, controle total) →
   **Gerar token** com as permissões `whatsapp_business_messaging` e `whatsapp_business_management`,
   validade **Nunca**.
6. **Modelos de mensagem** (WhatsApp Manager → Modelos de mensagem → Criar), categoria **Utilidade**,
   idioma **Português (BR)**:
   - Nome `pedido_em_preparo`, corpo:
     `Olá, {{1}}! Seu pedido #{{2}} na {{3}} foi confirmado e já está em preparo. ✅`
   - Nome `pedido_saiu_entrega`, corpo:
     `Olá, {{1}}! Seu pedido #{{2}} da {{3}} saiu para entrega e logo chega até você. 🛵`
   Exemplos para a análise: {{1}} = Maria, {{2}} = 12, {{3}} = Big Açaí. Aguarde o status **Ativo**.
7. **Segredos** no Supabase (Edge Functions → Secrets):
   - `WHATSAPP_TOKEN` = token do passo 5
   - `WHATSAPP_PHONE_ID` = ID do passo 4
   - (opcional) `WHATSAPP_TEMPLATE_PREPARO` / `WHATSAPP_TEMPLATE_ENTREGA` se usar outros nomes de modelo
   - (opcional) `WHATSAPP_API_VERSION` (padrão `v23.0`)
8. No **Painel Admin**, marque "WhatsApp oficial" na loja e faça um pedido de teste com o seu celular.

## Problemas comuns
- **Nada chega e não aparece erro**: a loja está desligada no admin, o pedido não tem telefone, ou os segredos não foram cadastrados.
- **Erro "Template name does not exist"**: o nome do modelo é diferente ou ainda não foi aprovado.
- **Erro de parâmetros**: o modelo precisa ter exatamente 3 variáveis ({{1}}, {{2}}, {{3}}).
- **Token expirado**: gere um token de usuário do sistema com validade "Nunca" (o token temporário da tela de teste dura 24 h).
