import { type FormEvent, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type LojaAdmin = { id: string; slug: string; nome: string; whatsapp: string; aberta: boolean; plataforma_ativa: boolean; criada_em: string }
type PedidoResumo = { loja_id: string; total: number }

const campo = 'w-full rounded-lg border border-neutral-300 bg-white px-3 py-2'
const botao = 'rounded-lg bg-[#1A7F37] px-4 py-2 font-bold text-white disabled:opacity-50'
const claro = 'rounded-lg border border-neutral-400 bg-white px-3 py-2 disabled:opacity-50'
const R = (n: number) => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const Erro = ({ m }: { m: string }) => (m ? <p role="alert" className="my-2 rounded-lg bg-red-100 p-3 text-red-800">{m}</p> : null)
const Ok = ({ m }: { m: string }) => (m ? <p role="status" className="my-2 rounded-lg bg-green-100 p-3 text-green-800">{m}</p> : null)
const slugify = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

export default function Admin() {
  const [pronto, setPronto] = useState(false)
  const [logado, setLogado] = useState(false)
  useEffect(() => {
    document.title = 'Painel Admin | GetZap Delivery'
    const meta = document.createElement('meta')
    meta.name = 'robots'; meta.content = 'noindex'
    document.head.appendChild(meta)
    supabase.auth.getSession().then(({ data }) => { setLogado(!!data.session); setPronto(true) })
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setLogado(!!s))
    return () => { data.subscription.unsubscribe(); meta.remove() }
  }, [])
  if (!pronto) return <p className="p-8">Carregando…</p>
  return logado ? <Area /> : <Login />
}

function Login() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)
  async function entrar(e: FormEvent) {
    e.preventDefault(); setOcupado(true); setErro('')
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
    setOcupado(false)
    if (error) setErro('E-mail ou senha incorretos.')
  }
  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <h1 className="mb-2 text-2xl font-bold text-[#1B2A4A]">GetZap Delivery — Admin</h1>
      <p className="mb-6">Área restrita ao dono da plataforma.</p>
      <form onSubmit={entrar} className="space-y-3">
        <input required type="email" autoComplete="username" className={campo} placeholder="E-mail" value={email} onChange={e => setEmail(e.target.value)} />
        <input required type="password" autoComplete="current-password" className={campo} placeholder="Senha" value={senha} onChange={e => setSenha(e.target.value)} />
        <Erro m={erro} />
        <button disabled={ocupado} className={botao + ' w-full'}>{ocupado ? 'Entrando…' : 'Entrar'}</button>
      </form>
    </main>
  )
}

function Area() {
  const [checando, setChecando] = useState(true)
  const [ehAdmin, setEhAdmin] = useState(false)
  useEffect(() => {
    supabase.rpc('sou_admin').then(({ data }) => { setEhAdmin(!!data); setChecando(false) })
  }, [])
  if (checando) return <p className="p-8">Carregando…</p>
  if (!ehAdmin) {
    return (
      <main className="mx-auto max-w-sm px-4 py-16 text-center">
        <p className="mb-4">Esta conta não tem acesso ao painel administrativo.</p>
        <button className={claro} onClick={() => supabase.auth.signOut()}>Sair</button>
      </main>
    )
  }
  return <Painel />
}

function Painel() {
  const [lojas, setLojas] = useState<LojaAdmin[] | null>(null)
  const [erro, setErro] = useState('')
  const [mostrarForm, setMostrarForm] = useState(false)

  async function carregar() {
    const { data, error } = await supabase.from('lojas').select('id,slug,nome,whatsapp,aberta,plataforma_ativa,criada_em').order('criada_em', { ascending: false })
    if (error) setErro(error.message); else setLojas(data as LojaAdmin[])
  }
  useEffect(() => { carregar() }, [])

  async function alternarAtiva(l: LojaAdmin) {
    const { error } = await supabase.from('lojas').update({ plataforma_ativa: !l.plataforma_ativa }).eq('id', l.id)
    if (error) setErro(error.message); else carregar()
  }
  async function excluir(l: LojaAdmin) {
    if (!confirm(`Excluir definitivamente a loja "${l.nome}"? Isso apaga cardápio, pedidos e tudo o mais dessa loja, e não pode ser desfeito.`)) return
    const { error } = await supabase.from('lojas').delete().eq('id', l.id)
    if (error) setErro(error.message); else carregar()
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-[#1B2A4A]">Painel Admin — GetZap Delivery</h1>
        <button className={claro} onClick={() => supabase.auth.signOut()}>Sair</button>
      </div>
      <Erro m={erro} />

      <section className="mb-10">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold">Lojas cadastradas</h2>
          <button className={botao} onClick={() => setMostrarForm(v => !v)}>{mostrarForm ? 'Cancelar' : 'Cadastrar loja nova'}</button>
        </div>
        {mostrarForm && <FormNovaLoja onCriada={carregar} />}
        {lojas === null ? <p>Carregando…</p> : lojas.length === 0 ? <p>Nenhuma loja cadastrada ainda.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b"><th className="py-2 pr-3">Loja</th><th className="py-2 pr-3">Endereço</th><th className="py-2 pr-3">WhatsApp</th><th className="py-2 pr-3">Status</th><th className="py-2 pr-3">Ações</th></tr></thead>
              <tbody>
                {lojas.map(l => (
                  <tr key={l.id} className="border-b align-top">
                    <td className="py-2 pr-3 font-semibold">{l.nome}</td>
                    <td className="py-2 pr-3">/{l.slug}</td>
                    <td className="py-2 pr-3">{l.whatsapp}</td>
                    <td className="py-2 pr-3">{l.plataforma_ativa ? <span className="text-green-700">Ativa</span> : <span className="text-red-700">Desativada</span>}</td>
                    <td className="py-2 pr-3">
                      <div className="flex flex-wrap gap-2">
                        <button className={claro} onClick={() => alternarAtiva(l)}>{l.plataforma_ativa ? 'Desativar' : 'Ativar'}</button>
                        <button className="rounded-lg bg-red-700 px-3 py-2 font-semibold text-white" onClick={() => excluir(l)}>Excluir</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <FaturamentoEntreLojas lojas={lojas ?? []} />
    </main>
  )
}

function FormNovaLoja({ onCriada }: { onCriada: () => void }) {
  const [nome, setNome] = useState('')
  const [slug, setSlug] = useState('')
  const [slugEditado, setSlugEditado] = useState(false)
  const [whatsapp, setWhatsapp] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState('')
  const [enviando, setEnviando] = useState(false)

  function mudarNome(v: string) {
    setNome(v)
    if (!slugEditado) setSlug(slugify(v))
  }

  async function criar(e: FormEvent) {
    e.preventDefault(); setEnviando(true); setErro(''); setOk('')
    const { data, error } = await supabase.functions.invoke('admin-criar-loja', {
      body: { nome, slug, whatsapp, email, senha },
    })
    setEnviando(false)
    if (error || data?.erro) {
      // Quando a função responde com erro (4xx), o supabase-js só traz uma mensagem
      // genérica em "error.message" ("Edge Function returned a non-2xx status code"):
      // o motivo de verdade (ex.: "já existe uma loja com esse endereço") vem no corpo
      // da resposta, acessível via error.context. Tenta ler de lá antes de desistir.
      let motivo = data?.erro as string | undefined
      if (!motivo && error && 'context' in error) {
        try { motivo = (await (error as any).context.json())?.erro } catch { /* resposta sem JSON */ }
      }
      setErro(motivo ?? error?.message ?? 'Não foi possível criar a loja.')
      return
    }
    setOk(`Loja "${nome}" criada! Cardápio em /${data.slug} — o dono entra em /painel com o e-mail e a senha cadastrados aqui.`)
    setNome(''); setSlug(''); setSlugEditado(false); setWhatsapp(''); setEmail(''); setSenha('')
    onCriada()
  }

  return (
    <form onSubmit={criar} className="mb-6 space-y-3 rounded-lg border border-neutral-300 p-4">
      <div>
        <label className="mb-1 block text-sm font-semibold">Nome da loja</label>
        <input required className={campo} value={nome} onChange={e => mudarNome(e.target.value)} />
      </div>
      <div>
        <label className="mb-1 block text-sm font-semibold">Endereço (parte da URL, ex.: adega-sos)</label>
        <input required className={campo} value={slug} onChange={e => { setSlug(slugify(e.target.value)); setSlugEditado(true) }} />
      </div>
      <div>
        <label className="mb-1 block text-sm font-semibold">WhatsApp (só dígitos, com 55 + DDD)</label>
        <input required className={campo} placeholder="5511999999999" value={whatsapp} onChange={e => setWhatsapp(e.target.value)} />
      </div>
      <div>
        <label className="mb-1 block text-sm font-semibold">E-mail do dono (login do painel dele)</label>
        <input required type="email" className={campo} value={email} onChange={e => setEmail(e.target.value)} />
      </div>
      <div>
        <label className="mb-1 block text-sm font-semibold">Senha temporária do dono</label>
        <input required type="text" minLength={6} className={campo} value={senha} onChange={e => setSenha(e.target.value)} />
      </div>
      <Erro m={erro} />
      <Ok m={ok} />
      <button disabled={enviando} className={botao}>{enviando ? 'Criando…' : 'Criar loja'}</button>
    </form>
  )
}

function FaturamentoEntreLojas({ lojas }: { lojas: LojaAdmin[] }) {
  const [periodo, setPeriodo] = useState<'hoje' | '7dias' | 'mes'>('hoje')
  const [pedidos, setPedidos] = useState<PedidoResumo[] | null>(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    const agora = new Date()
    let desde: Date
    if (periodo === 'hoje') desde = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate())
    else if (periodo === '7dias') desde = new Date(agora.getTime() - 7 * 24 * 60 * 60 * 1000)
    else desde = new Date(agora.getFullYear(), agora.getMonth(), 1)
    supabase.from('pedidos').select('loja_id,total').eq('status', 'entregue').gte('criado_em', desde.toISOString())
      .then(({ data, error }) => { if (error) setErro(error.message); else setPedidos(data as PedidoResumo[]) })
  }, [periodo])

  const porLoja = new Map<string, { qtd: number; total: number }>()
  ;(pedidos ?? []).forEach(p => {
    const atual = porLoja.get(p.loja_id) ?? { qtd: 0, total: 0 }
    atual.qtd += 1; atual.total += Number(p.total)
    porLoja.set(p.loja_id, atual)
  })
  const totalGeral = [...porLoja.values()].reduce((s, v) => s + v.total, 0)

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold">Faturamento entre lojas</h2>
        <div className="flex gap-2">
          <button className={periodo === 'hoje' ? botao : claro} onClick={() => setPeriodo('hoje')}>Hoje</button>
          <button className={periodo === '7dias' ? botao : claro} onClick={() => setPeriodo('7dias')}>7 dias</button>
          <button className={periodo === 'mes' ? botao : claro} onClick={() => setPeriodo('mes')}>Este mês</button>
        </div>
      </div>
      <Erro m={erro} />
      {pedidos === null ? <p>Carregando…</p> : lojas.length === 0 ? <p>Nenhuma loja cadastrada ainda.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b"><th className="py-2 pr-3">Loja</th><th className="py-2 pr-3">Pedidos entregues</th><th className="py-2 pr-3">Faturamento</th></tr></thead>
            <tbody>
              {lojas.map(l => {
                const r = porLoja.get(l.id) ?? { qtd: 0, total: 0 }
                return <tr key={l.id} className="border-b"><td className="py-2 pr-3">{l.nome}</td><td className="py-2 pr-3">{r.qtd}</td><td className="py-2 pr-3">{R(r.total)}</td></tr>
              })}
              <tr className="font-bold"><td className="py-2 pr-3">Total</td><td className="py-2 pr-3">{(pedidos ?? []).length}</td><td className="py-2 pr-3">{R(totalGeral)}</td></tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
