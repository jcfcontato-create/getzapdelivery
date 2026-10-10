# Assinaturas pelo Asaas (venda automática do GetZap Delivery)

## Fluxo
1. Botão do plano no site `getzapdelivery.com.br` → `https://app.getzapdelivery.com.br/assinar?plano=mensal` (ou `anual`).
2. O futuro cliente informa nome, e-mail, CPF/CNPJ, WhatsApp e a forma (Pix ou cartão).
3. A Edge Function `assinatura` cria o cliente e a **assinatura recorrente** no Asaas e devolve o link da 1ª cobrança.
4. O cliente paga. A página `/assinar?token=...` confere o pagamento a cada 5 s, e o webhook do Asaas também confirma. Ao confirmar, o cliente recebe um e-mail com o link de cadastro.
5. O cliente cadastra a loja (nome, WhatsApp, cidade/UF e senha). O sistema cria o login, a loja (fechada, com Pix/Dinheiro/Cartão já cadastrados) e envia o e-mail de boas-vindas com o acesso.
6. Renovações: o Asaas cobra sozinho. Se uma cobrança vencer (`PAYMENT_OVERDUE`), a loja é bloqueada (`plataforma_ativa = false`). Quando o cliente paga, ela é liberada de novo. Se a assinatura for cancelada no Asaas, a loja é bloqueada.

## Configuração (feita pelo Jorge, uma vez)
Supabase → Edge Functions → **Secrets**:

| Secret | Valor |
|---|---|
| `ASAAS_API_KEY` | Chave de API do Asaas (Configurações da conta → Integrações) |
| `ASAAS_AMBIENTE` | `producao` (sem isso, usa o sandbox de testes) |
| `ASAAS_WEBHOOK_TOKEN` | Uma senha longa inventada, a mesma colocada no webhook do Asaas |
| `SMTP_HOST` | `smtp.hostinger.com` |
| `SMTP_PORT` | `465` |
| `SMTP_USER` | ex.: `contato@getzapdelivery.com.br` |
| `SMTP_PASS` | senha dessa caixa de e-mail |
| `SMTP_FROM` | `GetZap Delivery <contato@getzapdelivery.com.br>` |

Asaas → Integrações → **Webhooks** → novo webhook:
- URL: `https://<ref-do-projeto>.supabase.co/functions/v1/asaas-webhook`
- Token de autenticação: o mesmo de `ASAAS_WEBHOOK_TOKEN`
- Eventos: cobranças (`PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`, `PAYMENT_OVERDUE`) e assinaturas (`SUBSCRIPTION_DELETED`, `SUBSCRIPTION_INACTIVATED`)

## Testar antes de vender
Use uma chave do **sandbox** (`ASAAS_AMBIENTE` vazio). No sandbox, a cobrança pode ser marcada como paga no próprio painel do Asaas. Depois troque para a chave de produção e `ASAAS_AMBIENTE=producao`.
