import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// Página de assinatura (botões de plano do site getzapdelivery.com.br levam para cá):
//   /assinar?plano=mensal|anual → dados mínimos → pagamento no Asaas (Pix ou cartão)
//   /assinar?token=...           → aguarda o pagamento → cadastro da loja → painel
const PLANOS = {
  mensal: { nome: 'Plano Mensal', preco: 'R$ 60,00', periodo: '/mês' },
  anual: { nome: 'Plano Anual', preco: 'R$ 660,00', periodo: '/ano' },
} as const
type Plano = keyof typeof PLANOS
const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO']
const campo = 'w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5'
const rotulo = 'mb-1 block text-sm font-semibold text-neutral-800'
const botao = 'w-full rounded-lg bg-[#2EA043] py-3 text-lg font-extrabold text-white shadow disabled:opacity-50'

const mascTel = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2) return d.length ? `(${d}` : ''
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}
const mascDoc = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 14)
  if (d.length <= 11) return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2')
  return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2')
}

async function chamar(corpo: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('assinatura', { body: corpo })
  if (error) {
    let msg = error.message
    try { const ctx = (error as any).context; if (ctx?.json) msg = (await ctx.json()).erro ?? msg } catch { /* mantém a mensagem */ }
    throw new Error(msg)
  }
  if (data?.erro) throw new Error(data.erro)
  return data
}

export default function Assinar() {
  const params = new URLSearchParams(window.location.search)
  const [token, setToken] = useState(params.get('token') ?? '')
  const plano: Plano = params.get('plano') === 'anual' ? 'anual' : 'mensal'
  useEffect(() => {
    document.title = 'Assinar | GetZap Delivery'
    const m = document.createElement('meta'); m.name = 'robots'; m.content = 'noindex'; document.head.appendChild(m)
    return () => m.remove()
  }, [])
  return (
    <div className="min-h-screen bg-neutral-100 text-neutral-900">
      <header className="bg-[#1B2A4A] px-4 py-4 text-center">
        <a href="https://getzapdelivery.com.br" className="inline-flex items-center gap-2">
          <img src="/logo-getzapdelivery.jpg" alt="" className="h-10 w-10 rounded-full bg-white object-contain" />
          <span className="text-xl font-extrabold text-white">Get<span className="text-[#2EA043]">Zap</span> <span className="text-[#F28C28]">Delivery</span></span>
        </a>
      </header>
      <main className="mx-auto max-w-lg px-4 py-6">
        {token ? <Acompanhar token={token} /> : <Iniciar plano={plano} aoIniciar={t => { setToken(t); window.history.replaceState(null, '', `/assinar?token=${t}`) }} />}
      </main>
    </div>
  )
}

function Iniciar({ plano, aoIniciar }: { plano: Plano; aoIniciar: (token: string) => void }) {
  const [p, setP] = useState<Plano>(plano)
  const [f, setF] = useState({ nome: '', email: '', doc: '', whatsapp: '', forma: 'PIX' as 'PIX' | 'CREDIT_CARD' })
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [aceito, setAceito] = useState(false)
  async function enviar(e: FormEvent) {
    e.preventDefault(); setErro('')
    if (!aceito) return setErro('Para continuar, aceite os Termos de Uso e a Política de Privacidade.')
    setEnviando(true)
    try {
      const r = await chamar({ acao: 'iniciar', plano: p, nome: f.nome, email: f.email, cpf_cnpj: f.doc, whatsapp: f.whatsapp, forma: f.forma })
      aoIniciar(r.token)
    } catch (e: any) { setErro(e.message) } finally { setEnviando(false) }
  }
  return (
    <form onSubmit={enviar} className="space-y-4 rounded-2xl bg-white p-5 shadow">
      <h1 className="text-2xl font-extrabold text-[#1B2A4A]">Assine o GetZap Delivery</h1>
      <div className="grid grid-cols-2 gap-2">
        {(Object.keys(PLANOS) as Plano[]).map(k => (
          <button type="button" key={k} onClick={() => setP(k)} aria-pressed={p === k}
            className={`rounded-xl border-2 p-3 text-left ${p === k ? 'border-[#2EA043] bg-green-50' : 'border-neutral-200'}`}>
            <span className="block text-sm font-semibold">{PLANOS[k].nome}</span>
            <span className="text-xl font-extrabold">{PLANOS[k].preco}</span><span className="text-sm">{PLANOS[k].periodo}</span>
            {k === 'anual' && <span className="mt-1 block text-xs font-bold text-[#2EA043]">Economize 1 mês</span>}
          </button>
        ))}
      </div>
      <p className="text-sm text-neutral-600">Preencha seus dados para gerar o pagamento. Logo depois de pagar, você cadastra sua loja e recebe o acesso por e-mail.</p>
      <label className="block"><span className={rotulo}>Nome completo</span>
        <input required className={campo} autoComplete="name" value={f.nome} onChange={e => setF({ ...f, nome: e.target.value })} /></label>
      <label className="block"><span className={rotulo}>E-mail (será o seu login)</span>
        <input required type="email" className={campo} autoComplete="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></label>
      <label className="block"><span className={rotulo}>CPF ou CNPJ</span>
        <input required className={campo} inputMode="numeric" placeholder="000.000.000-00" value={f.doc} onChange={e => setF({ ...f, doc: mascDoc(e.target.value) })} /></label>
      <label className="block"><span className={rotulo}>WhatsApp</span>
        <input required className={campo} inputMode="tel" autoComplete="tel" placeholder="(11) 99999-9999" value={f.whatsapp} onChange={e => setF({ ...f, whatsapp: mascTel(e.target.value) })} /></label>
      <fieldset>
        <legend className={rotulo}>Forma de pagamento</legend>
        <div className="grid grid-cols-2 gap-2">
          {([['PIX', 'Pix'], ['CREDIT_CARD', 'Cartão de crédito']] as const).map(([v, n]) => (
            <label key={v} className={`flex cursor-pointer items-center gap-2 rounded-lg border-2 p-3 font-semibold ${f.forma === v ? 'border-[#2EA043] bg-green-50' : 'border-neutral-200'}`}>
              <input type="radio" name="forma" checked={f.forma === v} onChange={() => setF({ ...f, forma: v })} /> {n}
            </label>
          ))}
        </div>
        <p className="mt-1 text-xs text-neutral-500">{f.forma === 'CREDIT_CARD' ? 'O cartão fica salvo no Asaas para as próximas renovações automáticas.' : 'A cada renovação, você recebe um novo Pix por e-mail.'}</p>
      </fieldset>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={aceito} onChange={e => setAceito(e.target.checked)} />
        <span>Li e aceito os <a className="underline" href="https://getzapdelivery.com.br/termos-de-uso" target="_blank" rel="noreferrer">Termos de Uso</a> e a <a className="underline" href="https://getzapdelivery.com.br/politica-de-privacidade" target="_blank" rel="noreferrer">Política de Privacidade</a>.</span></label>
      {erro && <p role="alert" className="rounded-lg bg-red-100 p-3 text-red-800">{erro}</p>}
      <button disabled={enviando} className={botao}>{enviando ? 'Gerando pagamento…' : `Ir para o pagamento - ${PLANOS[p].preco}`}</button>
      <p className="text-center text-xs text-neutral-500">Pagamento processado com segurança pelo Asaas.</p>
    </form>
  )
}

function Acompanhar({ token }: { token: string }) {
  const [info, setInfo] = useState<{ status: string; plano: Plano; email: string; nome: string; whatsapp: string | null; link: string | null } | null>(null)
  const [erro, setErro] = useState('')
  const carregar = useCallback(async () => {
    try { setInfo(await chamar({ acao: 'status', token })); setErro('') } catch (e: any) { setErro(e.message) }
  }, [token])
  useEffect(() => {
    carregar()
    const t = setInterval(() => { if (document.visibilityState === 'visible') carregar() }, 5000)
    return () => clearInterval(t)
  }, [carregar])
  if (!info) return <p className="rounded-2xl bg-white p-5 shadow">{erro || 'Carregando…'}</p>

  if (info.status === 'aguardando_pagamento') return (
    <div className="space-y-4 rounded-2xl bg-white p-5 text-center shadow">
      <h1 className="text-2xl font-extrabold text-[#1B2A4A]">Falta só o pagamento</h1>
      <p>{PLANOS[info.plano].nome}: <b>{PLANOS[info.plano].preco}</b>{PLANOS[info.plano].periodo}</p>
      {info.link && <a href={info.link} target="_blank" rel="noreferrer" className={botao + ' block'}>Pagar agora</a>}
      <p className="flex items-center justify-center gap-2 text-sm text-neutral-600">
        <span className="h-3 w-3 animate-pulse rounded-full bg-[#F28C28]" /> Aguardando a confirmação do pagamento…
      </p>
      <p className="text-sm text-neutral-600">Pode deixar esta página aberta: assim que o pagamento for confirmado, o cadastro da loja aparece aqui. Também enviamos o link para <b>{info.email}</b>.</p>
    </div>
  )
  if (info.status === 'paga') return <Cadastro token={token} email={info.email} whatsapp={info.whatsapp} />
  if (info.status === 'cadastrada') return (
    <div className="space-y-4 rounded-2xl bg-white p-5 text-center shadow">
      <h1 className="text-2xl font-extrabold text-[#1B2A4A]">Sua loja já está cadastrada</h1>
      <p>Entre no painel com o e-mail <b>{info.email}</b>.</p>
      <a href="/painel" className={botao + ' block'}>Entrar no painel</a>
    </div>
  )
  return (
    <div className="space-y-3 rounded-2xl bg-white p-5 text-center shadow">
      <h1 className="text-2xl font-extrabold text-[#1B2A4A]">Assinatura {info.status === 'cancelada' ? 'cancelada' : 'com pagamento pendente'}</h1>
      <p>Fale com o suporte do GetZap Delivery pelo WhatsApp para regularizar.</p>
      <a href="https://wa.me/5511937729068" className={botao + ' block'}>Falar com o suporte</a>
    </div>
  )
}

function Cadastro({ token, email, whatsapp }: { token: string; email: string; whatsapp: string | null }) {
  const [f, setF] = useState({ nome_loja: '', whatsapp: whatsapp ? mascTel(whatsapp) : '', cidade: '', uf: '', senha: '', senha2: '' })
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [feito, setFeito] = useState<{ slug: string } | null>(null)
  async function enviar(e: FormEvent) {
    e.preventDefault(); setErro('')
    if (f.senha.length < 8) return setErro('A senha precisa ter pelo menos 8 caracteres.')
    if (f.senha !== f.senha2) return setErro('As senhas não conferem.')
    setEnviando(true)
    try {
      const r = await chamar({ acao: 'cadastrar', token, nome_loja: f.nome_loja, whatsapp: f.whatsapp, cidade: f.cidade, uf: f.uf, senha: f.senha })
      await supabase.auth.signInWithPassword({ email, password: f.senha })
      setFeito({ slug: r.slug })
    } catch (e: any) { setErro(e.message) } finally { setEnviando(false) }
  }
  if (feito) return (
    <div className="space-y-4 rounded-2xl bg-white p-5 text-center shadow">
      <h1 className="text-2xl font-extrabold text-[#1B2A4A]">Tudo pronto! 🎉</h1>
      <p>Enviamos os dados de acesso para <b>{email}</b>.</p>
      <p className="text-sm">Link do seu cardápio: <a className="font-semibold underline" href={`/${feito.slug}`} target="_blank" rel="noreferrer">app.getzapdelivery.com.br/{feito.slug}</a></p>
      <a href="/painel" className={botao + ' block'}>Ir para o painel e montar o cardápio</a>
    </div>
  )
  return (
    <form onSubmit={enviar} className="space-y-4 rounded-2xl bg-white p-5 shadow">
      <p className="rounded-lg bg-green-100 p-3 text-center font-bold text-green-800">✓ Pagamento confirmado!</p>
      <h1 className="text-2xl font-extrabold text-[#1B2A4A]">Cadastre sua loja</h1>
      <label className="block"><span className={rotulo}>Nome do restaurante</span>
        <input required className={campo} placeholder="Ex.: Pizzaria do João" value={f.nome_loja} onChange={e => setF({ ...f, nome_loja: e.target.value })} /></label>
      <label className="block"><span className={rotulo}>WhatsApp que recebe os pedidos</span>
        <input required className={campo} inputMode="tel" placeholder="(11) 99999-9999" value={f.whatsapp} onChange={e => setF({ ...f, whatsapp: mascTel(e.target.value) })} /></label>
      <div className="grid grid-cols-[1fr_5.5rem] gap-2">
        <label className="block"><span className={rotulo}>Cidade</span>
          <input required className={campo} value={f.cidade} onChange={e => setF({ ...f, cidade: e.target.value })} /></label>
        <label className="block"><span className={rotulo}>UF</span>
          <select required className={campo} value={f.uf} onChange={e => setF({ ...f, uf: e.target.value })}>
            <option value="">--</option>{UFS.map(u => <option key={u}>{u}</option>)}
          </select></label>
      </div>
      <div className="rounded-lg bg-neutral-50 p-3 text-sm">Login do painel: <b>{email}</b></div>
      <label className="block"><span className={rotulo}>Crie uma senha (mínimo 8 caracteres)</span>
        <input required type="password" autoComplete="new-password" className={campo} value={f.senha} onChange={e => setF({ ...f, senha: e.target.value })} /></label>
      <label className="block"><span className={rotulo}>Repita a senha</span>
        <input required type="password" autoComplete="new-password" className={campo} value={f.senha2} onChange={e => setF({ ...f, senha2: e.target.value })} /></label>
      {erro && <p role="alert" className="rounded-lg bg-red-100 p-3 text-red-800">{erro}</p>}
      <button disabled={enviando} className={botao}>{enviando ? 'Criando sua loja…' : 'Criar minha loja'}</button>
    </form>
  )
}
