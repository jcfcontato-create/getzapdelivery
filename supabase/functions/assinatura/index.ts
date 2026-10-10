// Edge Function pública da assinatura do GetZap Delivery (chamada pela página /assinar).
// Ações (campo "acao" no corpo):
//   iniciar   → cria cliente + assinatura no Asaas e devolve o link de pagamento
//   status    → informa se o pagamento já foi confirmado (consulta o Asaas se preciso)
//   cadastrar → depois de pago, cria o login do dono, a loja e o vínculo, e envia o acesso por e-mail
// O "token" de cada assinatura é aleatório e longo: só quem iniciou (ou recebeu o e-mail) o tem.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { CORS, json, asaas, PLANOS, type Plano, hojeSP, cpfCnpjValido, emailBoasVindas, emailLinkCadastro } from '../_shared/asaas.ts'

const db = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const RESERVADOS = new Set(['painel', 'admin', 'monitor', 'assinar', 'seo', 'assets', 'banners', 'api', 'www', 'app'])

function slugify(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'loja'
}

// Confere no Asaas se a primeira cobrança da assinatura já foi paga
async function conferirPagamento(a: any) {
  if (a.status !== 'aguardando_pagamento' || !a.asaas_subscription_id) return a
  try {
    const r = await asaas(`/subscriptions/${a.asaas_subscription_id}/payments`)
    const pago = (r.data ?? []).some((p: any) => ['CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH'].includes(p.status))
    if (pago) {
      const { data } = await db().from('assinaturas').update({ status: 'paga', pago_em: new Date().toISOString(), atualizado_em: new Date().toISOString() })
        .eq('id', a.id).eq('status', 'aguardando_pagamento').select('*').maybeSingle()
      if (data) { await emailLinkCadastro(data.email, data.nome, data.token); return data }
    }
  } catch (e) { console.error('conferirPagamento', e) }
  return a
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ erro: 'Método não permitido.' }, 405)
  let b: any
  try { b = await req.json() } catch { return json({ erro: 'Dados inválidos.' }, 400) }

  try {
    if (b.acao === 'iniciar') {
      const plano = b.plano as Plano
      const nome = String(b.nome ?? '').trim()
      const email = String(b.email ?? '').trim().toLowerCase()
      const cpfCnpj = String(b.cpf_cnpj ?? '').replace(/\D/g, '')
      const whatsapp = String(b.whatsapp ?? '').replace(/\D/g, '')
      const forma = b.forma === 'CREDIT_CARD' ? 'CREDIT_CARD' : 'PIX'
      if (!PLANOS[plano]) return json({ erro: 'Plano inválido.' }, 400)
      if (nome.length < 3) return json({ erro: 'Informe seu nome completo.' }, 400)
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ erro: 'Informe um e-mail válido.' }, 400)
      if (!cpfCnpjValido(cpfCnpj)) return json({ erro: 'CPF ou CNPJ inválido.' }, 400)
      if (whatsapp.length < 10 || whatsapp.length > 11) return json({ erro: 'Informe o WhatsApp com DDD.' }, 400)

      // Já existe login com esse e-mail? Evita cobrar quem já é cliente.
      const { data: usuarios } = await db().auth.admin.listUsers({ page: 1, perPage: 1000 })
      if (usuarios?.users?.some(u => u.email?.toLowerCase() === email)) {
        return json({ erro: 'Esse e-mail já tem acesso ao GetZap Delivery. Entre pelo painel ou use outro e-mail.' }, 400)
      }
      // Reaproveita uma assinatura ainda não paga do mesmo e-mail/plano/forma (evita cobranças duplicadas)
      const { data: pendente } = await db().from('assinaturas').select('*').ilike('email', email)
        .eq('plano', plano).eq('forma_pagamento', forma).eq('status', 'aguardando_pagamento').order('criado_em', { ascending: false }).limit(1).maybeSingle()
      // Só reaproveita se a cobrança for do mesmo ambiente do Asaas (sandbox x produção)
      const producao = Deno.env.get('ASAAS_AMBIENTE') === 'producao'
      const mesmoAmbiente = (l?: string | null) => !!l && (l.includes('sandbox.asaas.com') !== producao)
      if (pendente?.link_pagamento && mesmoAmbiente(pendente.link_pagamento)) return json({ token: pendente.token, link: pendente.link_pagamento })
      if (pendente) await db().from('assinaturas').update({ status: 'cancelada', atualizado_em: new Date().toISOString() }).eq('id', pendente.id)

      const { data: a, error } = await db().from('assinaturas')
        .insert({ plano, forma_pagamento: forma, nome, email, cpf_cnpj: cpfCnpj, whatsapp }).select('*').single()
      if (error || !a) throw new Error(error?.message ?? 'Não foi possível iniciar a assinatura.')

      const cliente = await asaas('/customers', 'POST', { name: nome, email, cpfCnpj, mobilePhone: whatsapp, externalReference: a.id, notificationDisabled: false })
      const p = PLANOS[plano]
      const assinatura = await asaas('/subscriptions', 'POST', {
        customer: cliente.id, billingType: forma, value: p.valor, nextDueDate: hojeSP(), cycle: p.ciclo,
        description: p.descricao, externalReference: a.id,
      })
      const cobrancas = await asaas(`/subscriptions/${assinatura.id}/payments`)
      const link = cobrancas.data?.[0]?.invoiceUrl
      if (!link) throw new Error('O Asaas não devolveu o link de pagamento. Tente novamente.')
      await db().from('assinaturas').update({ asaas_customer_id: cliente.id, asaas_subscription_id: assinatura.id, link_pagamento: link, atualizado_em: new Date().toISOString() }).eq('id', a.id)
      return json({ token: a.token, link })
    }

    const token = String(b.token ?? '')
    if (!/^[0-9a-f]{48}$/.test(token)) return json({ erro: 'Link de assinatura inválido.' }, 400)
    let { data: a } = await db().from('assinaturas').select('*').eq('token', token).maybeSingle()
    if (!a) return json({ erro: 'Assinatura não encontrada.' }, 404)

    if (b.acao === 'status') {
      a = await conferirPagamento(a)
      return json({ status: a.status, plano: a.plano, email: a.email, nome: a.nome, whatsapp: a.whatsapp, link: a.link_pagamento })
    }

    if (b.acao === 'cadastrar') {
      a = await conferirPagamento(a)
      if (a.status === 'cadastrada') return json({ erro: 'Essa assinatura já tem uma loja cadastrada. Entre pelo painel.' }, 400)
      if (a.status !== 'paga') return json({ erro: 'O pagamento ainda não foi confirmado.' }, 400)
      const nomeLoja = String(b.nome_loja ?? '').trim()
      const whatsapp = String(b.whatsapp ?? '').replace(/\D/g, '')
      const cidade = String(b.cidade ?? '').trim() || null
      const uf = /^[A-Z]{2}$/.test(String(b.uf ?? '')) ? b.uf : null
      const senha = String(b.senha ?? '')
      if (nomeLoja.length < 2) return json({ erro: 'Informe o nome do restaurante.' }, 400)
      if (whatsapp.length < 10 || whatsapp.length > 11) return json({ erro: 'Informe o WhatsApp da loja com DDD.' }, 400)
      if (senha.length < 8) return json({ erro: 'A senha precisa ter pelo menos 8 caracteres.' }, 400)

      // Endereço do cardápio a partir do nome (único)
      const base = slugify(nomeLoja)
      let slug = RESERVADOS.has(base) ? `${base}-loja` : base
      for (let n = 2; ; n++) {
        const { data: existe } = await db().from('lojas').select('id').eq('slug', slug).maybeSingle()
        if (!existe) break
        slug = `${base}-${n}`
      }

      const { data: u, error: eu } = await db().auth.admin.createUser({ email: a.email, password: senha, email_confirm: true })
      if (eu || !u?.user) return json({ erro: eu?.message?.includes('already') ? 'Esse e-mail já tem acesso. Entre pelo painel.' : (eu?.message ?? 'Não foi possível criar o login.') }, 400)
      const { data: loja, error: el } = await db().from('lojas')
        .insert({ nome: nomeLoja, slug, whatsapp: '55' + whatsapp, cidade, uf, email: a.email, cpf_cnpj: a.cpf_cnpj, plataforma_ativa: true, aberta: false })
        .select('id,slug').single()
      if (el || !loja) { await db().auth.admin.deleteUser(u.user.id); throw new Error(el?.message ?? 'Não foi possível criar a loja.') }
      const { error: em } = await db().from('membros').insert({ loja_id: loja.id, user_id: u.user.id })
      if (em) { await db().from('lojas').delete().eq('id', loja.id); await db().auth.admin.deleteUser(u.user.id); throw new Error(em.message) }
      await db().from('assinaturas').update({ status: 'cadastrada', loja_id: loja.id, atualizado_em: new Date().toISOString() }).eq('id', a.id)
      // Formas de pagamento padrão para a loja já começar a receber pedidos
      await db().from('formas_pagamento').insert([
        { loja_id: loja.id, nome: 'Pix', aceita_troco: false, ordem: 1 },
        { loja_id: loja.id, nome: 'Dinheiro', aceita_troco: true, ordem: 2 },
        { loja_id: loja.id, nome: 'Cartão na entrega', aceita_troco: false, ordem: 3 },
      ]).then(({ error }) => { if (error) console.error('formas_pagamento', error) })
      await emailBoasVindas(a.email, nomeLoja, loja.slug)
      return json({ ok: true, slug: loja.slug, email: a.email })
    }

    return json({ erro: 'Ação inválida.' }, 400)
  } catch (e) {
    console.error(e)
    return json({ erro: (e as Error).message || 'Erro inesperado. Tente novamente.' }, 500)
  }
})
