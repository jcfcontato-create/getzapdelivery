// Edge Function: cria uma loja nova (linha em "lojas"), o login do dono (usuário no
// Supabase Auth) e o vínculo entre os dois (linha em "membros") — tudo de uma vez.
//
// Por quê isso não pode ser feito direto do navegador: criar um usuário de login exige
// a "service role key" do Supabase, uma chave mestra que ignora toda regra de acesso
// (RLS). Ela nunca pode aparecer no código do painel nem no repositório. Aqui ela fica
// só nos "Secrets" do Supabase (o Supabase já injeta automaticamente as variáveis
// SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY para toda Edge Function,
// sem precisar configurar nada a mais).
//
// Segurança: antes de fazer qualquer coisa, a função confere se quem está chamando é um
// admin da plataforma (via a função sou_admin() do banco, que respeita RLS). Só depois
// disso ela usa a chave de serviço para criar o usuário e as linhas no banco.
import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ erro: 'Método não permitido.' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  // Cliente "como o usuário que chamou", só para confirmar que ele é admin (respeita RLS).
  const authHeader = req.headers.get('Authorization') ?? ''
  const clienteChamador = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } })
  const { data: ehAdmin, error: erroAdmin } = await clienteChamador.rpc('sou_admin')
  if (erroAdmin || !ehAdmin) return json({ erro: 'Acesso restrito ao administrador da plataforma.' }, 403)

  let body: any
  try { body = await req.json() } catch { return json({ erro: 'Dados inválidos.' }, 400) }
  const nome = String(body?.nome ?? '').trim()
  const slug = String(body?.slug ?? '').trim().toLowerCase()
  const whatsapp = String(body?.whatsapp ?? '').replace(/\D/g, '')
  const email = String(body?.email ?? '').trim().toLowerCase()
  const senha = String(body?.senha ?? '')

  if (!nome) return json({ erro: 'Informe o nome da loja.' }, 400)
  if (!/^[a-z0-9-]+$/.test(slug)) return json({ erro: 'O endereço da loja deve ter só letras minúsculas, números e hífen.' }, 400)
  if (!/^[0-9]{12,13}$/.test(whatsapp)) return json({ erro: 'WhatsApp inválido: use o formato 55 + DDD + número, só dígitos.' }, 400)
  if (!email || !email.includes('@')) return json({ erro: 'Informe um e-mail válido para o dono da loja.' }, 400)
  if (senha.length < 6) return json({ erro: 'A senha precisa ter pelo menos 6 caracteres.' }, 400)

  // Daqui pra frente usamos a chave de serviço: ignora RLS, então validamos tudo antes.
  const admin = createClient(url, serviceKey)

  const { data: existente } = await admin.from('lojas').select('id').eq('slug', slug).maybeSingle()
  if (existente) return json({ erro: 'Já existe uma loja com esse endereço.' }, 400)

  const { data: novoUsuario, error: erroUsuario } = await admin.auth.admin.createUser({
    email, password: senha, email_confirm: true,
  })
  if (erroUsuario || !novoUsuario?.user) {
    const msg = erroUsuario?.message?.includes('already been registered')
      ? 'Já existe um usuário cadastrado com esse e-mail.'
      : (erroUsuario?.message ?? 'Não foi possível criar o login do dono.')
    return json({ erro: msg }, 400)
  }

  const { data: novaLoja, error: erroLoja } = await admin.from('lojas')
    .insert({ nome, slug, whatsapp, plataforma_ativa: true, aberta: true })
    .select('id, slug').single()
  if (erroLoja || !novaLoja) {
    // Não deixa um usuário órfão (sem loja) para trás.
    await admin.auth.admin.deleteUser(novoUsuario.user.id)
    return json({ erro: erroLoja?.message ?? 'Não foi possível criar a loja.' }, 400)
  }

  const { error: erroMembro } = await admin.from('membros').insert({ loja_id: novaLoja.id, user_id: novoUsuario.user.id })
  if (erroMembro) {
    await admin.from('lojas').delete().eq('id', novaLoja.id)
    await admin.auth.admin.deleteUser(novoUsuario.user.id)
    return json({ erro: erroMembro.message }, 400)
  }

  return json({ ok: true, loja_id: novaLoja.id, slug: novaLoja.slug })
})
