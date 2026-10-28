// Edge Function pública: cadastro de DEMONSTRAÇÃO de 15 dias (página /demonstracao,
// botão "Solicite um período de demonstração" do site getzapdelivery.com.br).
// Cria o login do dono com a senha que ele escolheu no cadastro, a loja (fechada, com formas de pagamento
// padrão) e o vínculo, e envia por e-mail o link do painel e o login.
// Proteções: campo-isca contra robôs, limite por IP e por dia, e-mail já cadastrado é recusado.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { CORS, json, enviarEmail, SITE } from '../_shared/asaas.ts'

const DIAS_DEMO = 15
const MAX_POR_IP_DIA = 3
const MAX_TOTAL_DIA = 40
const RESERVADOS = new Set(['painel', 'admin', 'monitor', 'assinar', 'demonstracao', 'seo', 'assets', 'banners', 'api', 'www', 'app'])

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))
function slugify(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ erro: 'Método não permitido.' }, 405)
  let b: any
  try { b = await req.json() } catch { return json({ erro: 'Dados inválidos.' }, 400) }

  // Campo-isca: invisível para pessoas; robôs costumam preencher
  if (String(b.site ?? '').trim()) return json({ ok: true })

  const nome = String(b.nome ?? '').trim().slice(0, 80)
  let slug = slugify(String(b.slug ?? '') || nome)
  const fone = String(b.whatsapp ?? '').replace(/\D/g, '')
  const email = String(b.email ?? '').trim().toLowerCase()
  const senha = String(b.senha ?? '')
  if (nome.length < 2) return json({ erro: 'Informe o nome do restaurante.' }, 400)
  if (slug.length < 3) return json({ erro: 'O endereço do cardápio precisa ter pelo menos 3 letras.' }, 400)
  if (RESERVADOS.has(slug)) return json({ erro: 'Esse endereço é reservado. Escolha outro.' }, 400)
  const whatsapp = fone.length === 10 || fone.length === 11 ? '55' + fone : fone
  if (!/^55[0-9]{10,11}$/.test(whatsapp)) return json({ erro: 'Informe o WhatsApp com DDD.' }, 400)
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ erro: 'Informe um e-mail válido.' }, 400)
  if (senha.length < 8 || senha.length > 72) return json({ erro: 'A senha precisa ter pelo menos 8 caracteres.' }, 400)

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || null
  try {
    const ontem = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
    const [{ count: porIp }, { count: total }] = await Promise.all([
      ip ? db.from('demonstracoes').select('id', { count: 'exact', head: true }).eq('ip', ip).gte('criado_em', ontem) : Promise.resolve({ count: 0 }),
      db.from('demonstracoes').select('id', { count: 'exact', head: true }).gte('criado_em', ontem),
    ])
    if ((porIp ?? 0) >= MAX_POR_IP_DIA || (total ?? 0) >= MAX_TOTAL_DIA) {
      return json({ erro: 'Recebemos muitos pedidos agora. Tente novamente mais tarde ou fale com a gente pelo WhatsApp.' }, 429)
    }
    const { data: existe } = await db.from('lojas').select('id').eq('slug', slug).maybeSingle()
    if (existe) return json({ erro: `O endereço "${slug}" já está em uso. Escolha outro (ex.: ${slug}-${Math.floor(Math.random() * 90 + 10)}).` }, 400)

    const { data: u, error: eu } = await db.auth.admin.createUser({ email, password: senha, email_confirm: true })
    if (eu || !u?.user) {
      return json({ erro: eu?.message?.includes('already') ? 'Esse e-mail já tem acesso ao GetZap Delivery. Entre pelo painel ou use "Esqueci minha senha".' : 'Não foi possível criar o acesso. Tente novamente.' }, 400)
    }
    const demoAte = new Date(Date.now() + DIAS_DEMO * 24 * 3600 * 1000)
    const { data: loja, error: el } = await db.from('lojas')
      .insert({ nome, slug, whatsapp, email, plataforma_ativa: true, aberta: false, demo_ate: demoAte.toISOString() })
      .select('id,slug').single()
    if (el || !loja) { await db.auth.admin.deleteUser(u.user.id); throw new Error(el?.message ?? 'Falha ao criar a loja.') }
    const { error: em } = await db.from('membros').insert({ loja_id: loja.id, user_id: u.user.id })
    if (em) { await db.from('lojas').delete().eq('id', loja.id); await db.auth.admin.deleteUser(u.user.id); throw new Error(em.message) }
    await db.from('formas_pagamento').insert([
      { loja_id: loja.id, nome: 'Pix', aceita_troco: false, ordem: 1 },
      { loja_id: loja.id, nome: 'Dinheiro', aceita_troco: true, ordem: 2 },
      { loja_id: loja.id, nome: 'Cartão na entrega', aceita_troco: false, ordem: 3 },
    ]).then(({ error }) => { if (error) console.error('formas_pagamento', error) })
    await db.from('demonstracoes').insert({ ip, email, loja_id: loja.id })

    const ate = demoAte.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    const enviado = await enviarEmail(email, `Seu acesso de demonstração ao GetZap Delivery - ${nome}`,
      'Sua demonstração está pronta!',
      [`A loja <b>${esc(nome)}</b> foi criada para você testar o GetZap Delivery por <b>${DIAS_DEMO} dias</b> (até ${ate}).`,
       `<b>Painel de gestão:</b> <a href="${SITE}/painel">${SITE}/painel</a><br><b>Login:</b> ${esc(email)}<br><b>Senha:</b> a que você criou no cadastro.`,
       `<b>Cardápio dos seus clientes:</b> <a href="${SITE}/${loja.slug}">${SITE}/${loja.slug}</a>`,
       'Primeiros passos: entre no painel, cadastre as categorias e os produtos na aba Cardápio, os bairros e taxas na aba Loja, e abra a loja para receber pedidos.',
       'Se esquecer a senha, use "Esqueci minha senha" na tela de login.'],
      { texto: 'Entrar no painel', url: `${SITE}/painel` })
    // Aviso ao dono da plataforma
    const admin = Deno.env.get('SMTP_USER') || 'contato@getzapdelivery.com.br'
    await enviarEmail(admin, `Nova demonstração: ${nome}`, 'Nova loja em demonstração',
      [`<b>${esc(nome)}</b> (${esc(email)}, WhatsApp ${whatsapp}) pediu demonstração até ${ate}.`, `Cardápio: ${SITE}/${loja.slug}`]).catch(() => false)

    return json({ ok: true, email, slug: loja.slug, email_enviado: enviado, ate })
  } catch (e) {
    console.error(e)
    return json({ erro: 'Erro inesperado. Tente novamente em instantes.' }, 500)
  }
})
