// Edge Function do módulo de Divulgação: recebe a foto real do produto e a descrição da oferta,
// pede à IA (Claude) os textos da arte e a legenda, e devolve tudo para o painel montar a imagem.
//
// Segredo necessário (Supabase → Edge Functions → Secrets): ANTHROPIC_API_KEY
// Segurança: só membros da loja, com o módulo ligado pelo admin, dentro do limite mensal.
import { createClient } from 'npm:@supabase/supabase-js@2'

const LIMITE_MENSAL = 60
const MODELO_IA = 'claude-haiku-4-5-20251001'
const SITE = 'https://app.getzapdelivery.com.br'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

// Início do mês atual no fuso de São Paulo, em UTC
function inicioDoMes() {
  const agora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
  return new Date(Date.UTC(agora.getFullYear(), agora.getMonth(), 1, 3, 0, 0)).toISOString()
}

const TONS: Record<string, string> = {
  divertido: 'divertido, descontraído e com bom humor, usando emojis',
  direto: 'direto e objetivo, focado na oferta e no preço, com poucos emojis',
  sofisticado: 'elegante e apetitoso, valorizando ingredientes e qualidade, com emojis discretos',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ erro: 'Método não permitido.' }, 405)
  const url = Deno.env.get('SUPABASE_URL')!
  const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const chamador = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } })

  let b: any
  try { b = await req.json() } catch { return json({ erro: 'Dados inválidos.' }, 400) }
  const lojaId = String(b.loja_id ?? '')
  const oferta = String(b.oferta ?? '').trim().slice(0, 600)
  const fotoUrl = String(b.foto_url ?? '')
  const tom = TONS[b.tom] ? b.tom : 'divertido'
  if (oferta.length < 5) return json({ erro: 'Descreva a oferta (ex.: "X-Burger + batata por R$ 29,90 só hoje").' }, 400)
  if (!/^https:\/\/[a-z0-9.-]+\.supabase\.co\/storage\/v1\/object\/public\//.test(fotoUrl)) return json({ erro: 'Envie a foto do produto.' }, 400)

  try {
    const { data: u } = await chamador.auth.getUser()
    if (!u?.user) return json({ erro: 'Faça login novamente.' }, 401)
    const { data: membro } = await db.from('membros').select('loja_id').eq('loja_id', lojaId).eq('user_id', u.user.id).maybeSingle()
    if (!membro) return json({ erro: 'Sem acesso a esta loja.' }, 403)
    const { data: loja } = await db.from('lojas').select('nome,slug,cidade,uf,tipo_cozinha,modulo_divulgacao').eq('id', lojaId).single()
    if (!loja?.modulo_divulgacao) return json({ erro: 'O módulo de Divulgação não está liberado para esta loja.' }, 403)

    const { count } = await db.from('divulgacao_usos').select('id', { count: 'exact', head: true }).eq('loja_id', lojaId).gte('criado_em', inicioDoMes())
    if ((count ?? 0) >= LIMITE_MENSAL) return json({ erro: `Você já usou as ${LIMITE_MENSAL} gerações deste mês. O limite renova no dia 1º.` }, 429)

    const chave = Deno.env.get('ANTHROPIC_API_KEY')
    if (!chave) return json({ erro: 'A IA ainda não foi configurada (falta a chave ANTHROPIC_API_KEY).' }, 500)

    const cidade = loja.cidade ? `${loja.cidade}${loja.uf ? '/' + loja.uf : ''}` : ''
    const prompt = `Você é redator de marketing para delivery de comida no Brasil.
Crie uma postagem para redes sociais (Facebook, Instagram e TikTok) a partir da FOTO REAL do produto e da oferta abaixo.

Loja: ${loja.nome}${loja.tipo_cozinha ? ` (${loja.tipo_cozinha})` : ''}${cidade ? ` em ${cidade}` : ''}
Cardápio online para pedir: ${SITE}/${loja.slug}
Oferta descrita pelo dono: """${oferta}"""
Tom: ${TONS[tom]}

Regras:
- Português do Brasil, persuasivo, gerando vontade de pedir agora.
- Use SOMENTE o que está na oferta e na foto. Não invente preço, brinde, prazo ou ingrediente que não foi citado.
- Se a oferta tiver preço, copie exatamente (ex.: "R$ 29,90"). Se não tiver, deixe "preco" vazio.
- "titulo": no máximo 28 caracteres, chamativo, para escrever grande na arte.
- "subtitulo": no máximo 60 caracteres, complementa o título (o que vem no combo, horário etc.).
- "chamada": no máximo 22 caracteres, botão de ação (ex.: "Peça agora!").
- "legenda": texto do post com 3 a 6 linhas curtas, emojis conforme o tom, terminando com o convite para pedir pelo link do cardápio (escreva o link completo).
- "hashtags": de 6 a 10 hashtags sem espaços, misturando o produto${cidade ? ` e a cidade (${loja.cidade})` : ''} e delivery.

Responda APENAS com um JSON válido, sem texto antes ou depois, neste formato:
{"titulo":"","subtitulo":"","chamada":"","preco":"","legenda":"","hashtags":["#exemplo"]}`

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': chave, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODELO_IA,
        max_tokens: 900,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'url', url: fotoUrl } },
          { type: 'text', text: prompt },
        ] }],
      }),
    })
    const resp = await r.json().catch(() => ({}))
    if (!r.ok) { console.error('IA', r.status, JSON.stringify(resp)); return json({ erro: 'A IA não conseguiu gerar agora. Tente novamente em instantes.' }, 502) }
    const texto: string = (resp.content ?? []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('')
    const ini = texto.indexOf('{'), fim = texto.lastIndexOf('}')
    let out: any
    try { out = JSON.parse(texto.slice(ini, fim + 1)) } catch { console.error('JSON da IA', texto); return json({ erro: 'A IA respondeu em um formato inesperado. Tente gerar de novo.' }, 502) }

    await db.from('divulgacao_usos').insert({ loja_id: lojaId })
    const s = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n)
    const hashtags = (Array.isArray(out.hashtags) ? out.hashtags : String(out.hashtags ?? '').split(/\s+/))
      .map((h: string) => String(h).trim().replace(/^#?/, '#').replace(/\s+/g, '')).filter((h: string) => h.length > 1).slice(0, 12)
    return json({
      titulo: s(out.titulo, 40), subtitulo: s(out.subtitulo, 80), chamada: s(out.chamada, 30), preco: s(out.preco, 20),
      legenda: s(out.legenda, 1500), hashtags: hashtags.join(' '), usados: (count ?? 0) + 1, limite: LIMITE_MENSAL,
    })
  } catch (e) {
    console.error(e)
    return json({ erro: 'Erro inesperado. Tente novamente.' }, 500)
  }
})
