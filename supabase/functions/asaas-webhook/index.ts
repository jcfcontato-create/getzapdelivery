// Webhook do Asaas (configurado em Asaas → Integrações → Webhooks, apontando para
// https://<projeto>.supabase.co/functions/v1/asaas-webhook, com o mesmo token do segredo
// ASAAS_WEBHOOK_TOKEN). Publicada sem verificação de JWT, porque quem chama é o Asaas.
//
// O que faz:
//   pagamento confirmado/recebido → libera a assinatura (primeira vez: e-mail com o link de cadastro;
//                                    depois: reativa a loja se estava bloqueada por atraso)
//   pagamento vencido             → bloqueia a loja (plataforma_ativa = false)
//   assinatura removida/inativada → bloqueia a loja e marca como cancelada
import { createClient } from 'npm:@supabase/supabase-js@2'
import { emailLinkCadastro } from '../_shared/asaas.ts'

const db = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const ok = () => new Response(JSON.stringify({ received: true }), { headers: { 'Content-Type': 'application/json' } })
const agora = () => new Date().toISOString()

Deno.serve(async (req) => {
  const esperado = Deno.env.get('ASAAS_WEBHOOK_TOKEN')
  if (!esperado || req.headers.get('asaas-access-token') !== esperado) return new Response('Não autorizado', { status: 401 })
  let ev: any
  try { ev = await req.json() } catch { return ok() }

  const evento = String(ev?.event ?? '')
  const subId = ev?.payment?.subscription ?? ev?.subscription?.id
  if (!subId) return ok() // cobranças avulsas não são da plataforma
  const { data: a } = await db().from('assinaturas').select('*').eq('asaas_subscription_id', subId).maybeSingle()
  if (!a) return ok()

  try {
    if (['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED'].includes(evento)) {
      if (a.status === 'aguardando_pagamento') {
        const { data } = await db().from('assinaturas').update({ status: 'paga', pago_em: agora(), atualizado_em: agora() })
          .eq('id', a.id).eq('status', 'aguardando_pagamento').select('*').maybeSingle()
        if (data) await emailLinkCadastro(data.email, data.nome, data.token)
      } else if (a.status === 'inadimplente' && a.loja_id) {
        await db().from('lojas').update({ plataforma_ativa: true }).eq('id', a.loja_id)
        await db().from('assinaturas').update({ status: 'cadastrada', atualizado_em: agora() }).eq('id', a.id)
      }
    } else if (evento === 'PAYMENT_OVERDUE') {
      if (a.loja_id) {
        await db().from('lojas').update({ plataforma_ativa: false }).eq('id', a.loja_id)
        await db().from('assinaturas').update({ status: 'inadimplente', atualizado_em: agora() }).eq('id', a.id)
      }
    } else if (['SUBSCRIPTION_DELETED', 'SUBSCRIPTION_INACTIVATED'].includes(evento)) {
      if (a.loja_id) await db().from('lojas').update({ plataforma_ativa: false }).eq('id', a.loja_id)
      await db().from('assinaturas').update({ status: 'cancelada', atualizado_em: agora() }).eq('id', a.id)
    }
  } catch (e) {
    console.error('asaas-webhook', evento, e)
    return new Response('Erro', { status: 500 }) // o Asaas tenta de novo
  }
  return ok()
})
