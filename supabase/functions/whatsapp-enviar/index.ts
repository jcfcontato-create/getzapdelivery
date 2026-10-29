// Envia o aviso de status do pedido pelo WhatsApp OFICIAL (API Cloud da Meta), usando o
// número da plataforma GetZap. Chamada pelo painel ao mudar o status para "em preparo"
// ou "saiu para entrega".
//
// Segredos (Supabase → Edge Functions → Secrets), configurados pelo Jorge:
//   WHATSAPP_TOKEN        token permanente do usuário do sistema (Meta Business)
//   WHATSAPP_PHONE_ID     "Phone number ID" do número na Meta (não é o número em si)
//   WHATSAPP_API_VERSION  opcional, padrão v23.0
//   WHATSAPP_TEMPLATE_PREPARO / WHATSAPP_TEMPLATE_ENTREGA  opcionais (nomes dos modelos aprovados)
// Os modelos precisam ter 3 variáveis no corpo: {{1}} nome do cliente, {{2}} número do pedido, {{3}} nome da loja.
import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } })
const MODELOS: Record<string, string> = {
  em_preparo: Deno.env.get('WHATSAPP_TEMPLATE_PREPARO') || 'pedido_em_preparo',
  saiu_para_entrega: Deno.env.get('WHATSAPP_TEMPLATE_ENTREGA') || 'pedido_saiu_entrega',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ erro: 'Método não permitido.' }, 405)
  const url = Deno.env.get('SUPABASE_URL')!
  const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const chamador = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } })
  let b: any
  try { b = await req.json() } catch { return json({ erro: 'Dados inválidos.' }, 400) }
  const evento = String(b.evento ?? '')
  if (!MODELOS[evento]) return json({ erro: 'Evento inválido.' }, 400)

  const { data: u } = await chamador.auth.getUser()
  if (!u?.user) return json({ erro: 'Faça login novamente.' }, 401)
  const { data: p } = await db.from('pedidos').select('id,loja_id,numero,cliente_nome,cliente_telefone,tipo,status').eq('id', String(b.pedido_id ?? '')).maybeSingle()
  if (!p) return json({ erro: 'Pedido não encontrado.' }, 404)
  const { data: membro } = await db.from('membros').select('loja_id').eq('loja_id', p.loja_id).eq('user_id', u.user.id).maybeSingle()
  if (!membro) return json({ erro: 'Sem acesso a esta loja.' }, 403)
  const { data: loja } = await db.from('lojas').select('nome,modulo_whatsapp').eq('id', p.loja_id).single()
  if (!loja?.modulo_whatsapp) return json({ ok: false, motivo: 'desligado' })
  if (p.tipo === 'mesa' || p.tipo === 'balcao') return json({ ok: false, motivo: 'tipo' })

  let fone = String(p.cliente_telefone ?? '').replace(/\D/g, '')
  if (fone.length === 10 || fone.length === 11) fone = '55' + fone
  if (!/^55\d{10,11}$/.test(fone)) return json({ ok: false, motivo: 'sem_telefone' })

  // Não repete o mesmo aviso do mesmo pedido
  const { data: ja } = await db.from('whatsapp_envios').select('id,status').eq('pedido_id', p.id).eq('evento', evento).maybeSingle()
  if (ja?.status === 'enviado') return json({ ok: true, repetido: true })

  const token = Deno.env.get('WHATSAPP_TOKEN'), phoneId = Deno.env.get('WHATSAPP_PHONE_ID')
  if (!token || !phoneId) return json({ ok: false, motivo: 'nao_configurado' })
  const versao = Deno.env.get('WHATSAPP_API_VERSION') || 'v23.0'
  const primeiroNome = String(p.cliente_nome ?? '').trim().split(/\s+/)[0] || 'cliente'

  const r = await fetch(`https://graph.facebook.com/${versao}/${phoneId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp', to: fone, type: 'template',
      template: { name: MODELOS[evento], language: { code: 'pt_BR' }, components: [{ type: 'body', parameters: [
        { type: 'text', text: primeiroNome.slice(0, 60) }, { type: 'text', text: String(p.numero) }, { type: 'text', text: String(loja.nome).slice(0, 60) },
      ] }] },
    }),
  })
  const resp = await r.json().catch(() => ({}))
  const ok = r.ok && resp?.messages?.[0]?.id
  const registro = { loja_id: p.loja_id, pedido_id: p.id, evento, telefone: fone, status: ok ? 'enviado' : 'erro', mensagem_id: ok ? resp.messages[0].id : null, erro: ok ? null : String(resp?.error?.message ?? `HTTP ${r.status}`).slice(0, 500) }
  await db.from('whatsapp_envios').upsert(registro, { onConflict: 'pedido_id,evento' })
  if (!ok) { console.error('WhatsApp', r.status, JSON.stringify(resp)); return json({ ok: false, motivo: 'erro_meta', erro: registro.erro }) }
  return json({ ok: true })
})
