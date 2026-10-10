// Utilidades compartilhadas pelas funções de assinatura (Asaas + e-mail).
//
// Segredos (configurados pelo dono da plataforma em Supabase → Edge Functions → Secrets):
//   ASAAS_API_KEY        chave de API do Asaas (Minha conta → Integrações)
//   ASAAS_AMBIENTE       "producao" para cobrar de verdade; qualquer outro valor usa o sandbox
//   ASAAS_WEBHOOK_TOKEN  token de autenticação definido no webhook do Asaas
//   SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / SMTP_FROM  e-mail da Hostinger
import nodemailer from 'npm:nodemailer@6.9.16'

export const SITE = 'https://app.getzapdelivery.com.br'

export const PLANOS = {
  mensal: { valor: 60, ciclo: 'MONTHLY', nome: 'Plano Mensal', descricao: 'GetZap Delivery - Plano Mensal' },
  anual: { valor: 660, ciclo: 'YEARLY', nome: 'Plano Anual', descricao: 'GetZap Delivery - Plano Anual' },
} as const
export type Plano = keyof typeof PLANOS

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

function baseAsaas() {
  return Deno.env.get('ASAAS_AMBIENTE') === 'producao' ? 'https://api.asaas.com/v3' : 'https://api-sandbox.asaas.com/v3'
}
export async function asaas(caminho: string, metodo = 'GET', corpo?: unknown) {
  const chave = Deno.env.get('ASAAS_API_KEY')
  if (!chave) throw new Error('Pagamento ainda não configurado (falta a chave do Asaas).')
  const r = await fetch(baseAsaas() + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'GetZapDelivery', access_token: chave },
    body: corpo ? JSON.stringify(corpo) : undefined,
  })
  const dados = await r.json().catch(() => ({}))
  if (!r.ok) {
    const msg = dados?.errors?.map((e: any) => e.description).join(' ') || `Erro ${r.status} no Asaas.`
    throw new Error(msg)
  }
  return dados
}

// Data de hoje no fuso de São Paulo, no formato do Asaas (AAAA-MM-DD)
export const hojeSP = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })

export function cpfCnpjValido(v: string) {
  const d = v.replace(/\D/g, '')
  if (d.length === 11) {
    if (/^(\d)\1+$/.test(d)) return false
    const calc = (n: number) => { let s = 0; for (let i = 0; i < n; i++) s += +d[i] * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r }
    return calc(9) === +d[9] && calc(10) === +d[10]
  }
  if (d.length === 14) {
    if (/^(\d)\1+$/.test(d)) return false
    const calc = (n: number) => { const p = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; let s = 0; for (let i = 0; i < n; i++) s += +d[i] * p[i]; const r = s % 11; return r < 2 ? 0 : 11 - r }
    return calc(12) === +d[12] && calc(13) === +d[13]
  }
  return false
}

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))

// Envia e-mail pelo SMTP da Hostinger. Não derruba o fluxo se falhar: só registra o erro.
export async function enviarEmail(para: string, assunto: string, titulo: string, paragrafos: string[], botao?: { texto: string; url: string }) {
  // Padrões do e-mail da Hostinger (não são secretos); só a senha fica nos Secrets (SMTP_PASS)
  const host = Deno.env.get('SMTP_HOST') || 'smtp.hostinger.com'
  const user = Deno.env.get('SMTP_USER') || 'contato@getzapdelivery.com.br'
  const pass = Deno.env.get('SMTP_PASS')
  if (!pass) { console.error('SMTP_PASS não configurado; e-mail não enviado para', para); return false }
  const porta = Number(Deno.env.get('SMTP_PORT') || 465)
  const de = Deno.env.get('SMTP_FROM') || `GetZap Delivery <${user}>`
  const html = `<!doctype html><html><body style="margin:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#1B2A4A">
<div style="max-width:560px;margin:0 auto;padding:24px">
<div style="background:#1B2A4A;border-radius:12px 12px 0 0;padding:18px 24px;color:#fff;font-size:20px;font-weight:bold">Get<span style="color:#2EA043">Zap</span> <span style="color:#F28C28">Delivery</span></div>
<div style="background:#fff;border-radius:0 0 12px 12px;padding:24px">
<h1 style="font-size:22px;margin:0 0 16px">${esc(titulo)}</h1>
${paragrafos.map(p => `<p style="font-size:15px;line-height:1.5;margin:0 0 12px">${p}</p>`).join('')}
${botao ? `<p style="margin:24px 0"><a href="${botao.url}" style="background:#2EA043;color:#fff;text-decoration:none;font-weight:bold;padding:14px 22px;border-radius:8px;display:inline-block">${esc(botao.texto)}</a></p>
<p style="font-size:12px;color:#666">Se o botão não abrir, copie este endereço no navegador:<br>${botao.url}</p>` : ''}
</div>
<p style="font-size:12px;color:#888;text-align:center;margin-top:16px">GetZap Delivery · getzapdelivery.com.br</p>
</div></body></html>`
  try {
    const t = nodemailer.createTransport({ host, port: porta, secure: porta === 465, auth: { user, pass } })
    await t.sendMail({ from: de, to: para, subject: assunto, html })
    return true
  } catch (e) {
    console.error('Falha ao enviar e-mail:', e)
    return false
  }
}

export function emailLinkCadastro(para: string, nome: string, token: string) {
  return enviarEmail(para, 'Pagamento confirmado! Cadastre sua loja no GetZap Delivery',
    `Pagamento confirmado, ${nome.split(' ')[0]}!`,
    ['Obrigado por assinar o GetZap Delivery. Agora falta só um passo: cadastrar os dados da sua loja para receber o acesso ao painel.',
     'Leva menos de 2 minutos.'],
    { texto: 'Cadastrar minha loja', url: `${SITE}/assinar?token=${token}` })
}

export function emailBoasVindas(para: string, nomeLoja: string, slug: string) {
  return enviarEmail(para, `Seu acesso ao GetZap Delivery está pronto - ${nomeLoja}`,
    'Bem-vindo ao GetZap Delivery!',
    [`A loja <b>${esc(nomeLoja)}</b> foi criada com sucesso.`,
     `<b>Painel de gestão:</b> <a href="${SITE}/painel">${SITE}/painel</a><br><b>Login:</b> ${esc(para)}<br><b>Senha:</b> a que você criou no cadastro.`,
     `<b>Link do seu cardápio para os clientes:</b> <a href="${SITE}/${slug}">${SITE}/${slug}</a>`,
     'Primeiros passos: entre no painel, cadastre as categorias e produtos na aba Cardápio, os bairros e taxas na aba Loja, e compartilhe o link do cardápio no WhatsApp e no Instagram.'],
    { texto: 'Entrar no painel', url: `${SITE}/painel` })
}
