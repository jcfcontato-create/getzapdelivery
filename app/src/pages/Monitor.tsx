import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Login } from './Painel'

// Tela para tablet/monitor no balcão: mostra os pedidos de MESA e RETIRADA
// que estão em preparo e, em destaque, os que já estão prontos para o garçom
// levar ou para o cliente retirar. Atualiza sozinha a cada 5 segundos.

type LojaMon = { id: string; nome: string; logo_url: string | null; cor: string }
type PedidoMon = { id: string; numero: number; tipo: string; mesa: number | null; cliente_nome: string; status: string; pronto_em: string | null; criado_em: string }

const MINUTOS_PRONTO_NA_TELA = 30
const primeiroNome = (n: string) => (n || '').trim().split(/\s+/)[0] ?? ''

let ctx: AudioContext | null = null
function aviso() {
  try {
    ctx ??= new AudioContext()
    const agora = ctx.currentTime
    ;[880, 1320].forEach((f, i) => {
      const o = ctx!.createOscillator(), g = ctx!.createGain()
      o.frequency.value = f; o.type = 'sine'
      g.gain.setValueAtTime(0.0001, agora + i * 0.25)
      g.gain.exponentialRampToValueAtTime(0.4, agora + i * 0.25 + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, agora + i * 0.25 + 0.4)
      o.connect(g).connect(ctx!.destination); o.start(agora + i * 0.25); o.stop(agora + i * 0.25 + 0.45)
    })
  } catch { /* sem som disponível */ }
}

export default function Monitor() {
  const [pronto, setPronto] = useState(false)
  const [logado, setLogado] = useState(false)
  useEffect(() => {
    document.title = 'Monitor | GetZap Delivery'
    supabase.auth.getSession().then(({ data }) => { setLogado(!!data.session); setPronto(true) })
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setLogado(!!s))
    return () => data.subscription.unsubscribe()
  }, [])
  if (!pronto) return <p className="p-8">Carregando…</p>
  return logado ? <Tela /> : <Login />
}

function Tela() {
  const [loja, setLoja] = useState<LojaMon | null>(null)
  const [msg, setMsg] = useState('')
  const [pedidos, setPedidos] = useState<PedidoMon[]>([])
  const [iniciado, setIniciado] = useState(false)
  const [agora, setAgora] = useState(new Date())
  const [destaque, setDestaque] = useState<string | null>(null)
  const prontosConhecidos = useRef<Set<string> | null>(null)
  const travaTela = useRef<any>(null)

  useEffect(() => {
    ;(async () => {
      const { data: s } = await supabase.auth.getSession()
      const { data, error } = await supabase.from('membros').select('lojas(id,nome,logo_url,cor)').eq('user_id', s.session?.user.id).limit(1)
      if (error) setMsg(error.message)
      else if (!data?.length) setMsg('Este usuário ainda não está vinculado a uma loja.')
      else setLoja((data[0] as any).lojas)
    })()
  }, [])

  const carregar = useCallback(async () => {
    if (!loja) return
    const desde = new Date(Date.now() - 12 * 3600 * 1000).toISOString()
    const { data, error } = await supabase.from('pedidos')
      .select('id,numero,tipo,mesa,cliente_nome,status,pronto_em,criado_em')
      .eq('loja_id', loja.id).in('status', ['em_preparo', 'pronto']).in('tipo', ['mesa', 'retirada'])
      .gte('criado_em', desde).order('criado_em')
    if (error) { setMsg('Sem conexão com o servidor. Tentando de novo…'); return }
    setMsg('')
    const lista = (data ?? []) as PedidoMon[]
    const prontos = lista.filter(p => p.status === 'pronto')
    if (prontosConhecidos.current) {
      const novos = prontos.filter(p => !prontosConhecidos.current!.has(p.id))
      if (novos.length) { aviso(); setDestaque(novos[novos.length - 1].id) }
    }
    prontosConhecidos.current = new Set(prontos.map(p => p.id))
    setPedidos(lista)
  }, [loja])

  useEffect(() => {
    carregar()
    const t = setInterval(carregar, 5000)
    const r = setInterval(() => setAgora(new Date()), 15000)
    return () => { clearInterval(t); clearInterval(r) }
  }, [carregar])

  // Mantém a tela ligada (quando o navegador permitir) e volta a pedir ao reabrir a aba
  useEffect(() => {
    if (!iniciado) return
    const pedir = async () => { try { travaTela.current = await (navigator as any).wakeLock?.request('screen') } catch { /* ignorado */ } }
    pedir()
    const vis = () => { if (document.visibilityState === 'visible') pedir() }
    document.addEventListener('visibilitychange', vis)
    return () => { document.removeEventListener('visibilitychange', vis); travaTela.current?.release?.() }
  }, [iniciado])

  async function iniciar() {
    try { ctx ??= new AudioContext(); await ctx.resume() } catch { /* ignorado */ }
    try { await document.documentElement.requestFullscreen?.() } catch { /* ignorado */ }
    setIniciado(true)
  }

  if (!loja) return <p className="p-8">{msg || 'Carregando…'}</p>

  const limite = agora.getTime() - MINUTOS_PRONTO_NA_TELA * 60000
  const prontos = pedidos
    .filter(p => p.status === 'pronto' && (!p.pronto_em || new Date(p.pronto_em).getTime() >= limite))
    .sort((a, b) => (b.pronto_em ?? '').localeCompare(a.pronto_em ?? ''))
  const preparando = pedidos.filter(p => p.status === 'em_preparo')
  const titulo = (p: PedidoMon) => p.tipo === 'mesa' ? `MESA ${p.mesa}` : `#${p.numero}`
  const sub = (p: PedidoMon) => p.tipo === 'mesa' ? `Pedido #${p.numero}` : primeiroNome(p.cliente_nome)

  return (
    <div className="flex min-h-screen flex-col bg-neutral-950 text-white">
      <header className="flex items-center justify-between gap-4 px-6 py-4" style={{ background: loja.cor }}>
        <div className="flex items-center gap-3">
          {loja.logo_url && <img src={loja.logo_url} alt="" className="h-12 w-12 rounded-full object-cover" />}
          <h1 className="text-2xl font-extrabold drop-shadow">{loja.nome}</h1>
        </div>
        <p className="text-3xl font-bold tabular-nums drop-shadow">{agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
      </header>
      {msg && <p className="bg-amber-500 px-6 py-2 text-center font-bold text-black">{msg}</p>}

      <main className="grid flex-1 gap-4 p-4 lg:grid-cols-3">
        <section className="rounded-2xl bg-neutral-900 p-5">
          <h2 className="mb-4 text-2xl font-bold uppercase tracking-wide text-neutral-400">Preparando</h2>
          {preparando.length === 0 && <p className="text-xl text-neutral-500">Nenhum pedido em preparo.</p>}
          <ul className="grid grid-cols-2 gap-3">
            {preparando.map(p => (
              <li key={p.id} className="rounded-xl bg-neutral-800 px-4 py-3">
                <p className="text-3xl font-extrabold text-neutral-200">{titulo(p)}</p>
                <p className="truncate text-lg text-neutral-400">{sub(p)}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl bg-neutral-900 p-5 lg:col-span-2">
          <h2 className="mb-4 text-2xl font-bold uppercase tracking-wide text-green-400">Pronto! Pode retirar</h2>
          {prontos.length === 0 && <p className="text-xl text-neutral-500">Assim que um pedido ficar pronto, ele aparece aqui.</p>}
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {prontos.map(p => (
              <li key={p.id} className={`rounded-2xl bg-green-600 px-5 py-6 text-center shadow-lg ${p.id === destaque ? 'animate-pulse ring-8 ring-green-300' : ''}`}>
                <p className="text-6xl font-black leading-none">{titulo(p)}</p>
                <p className="mt-2 truncate text-2xl font-semibold text-green-50">{sub(p)}</p>
              </li>
            ))}
          </ul>
        </section>
      </main>

      {!iniciado && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/85 p-6 text-center">
          <p className="text-2xl font-bold">Monitor de pedidos prontos</p>
          <p className="max-w-md text-neutral-300">Toque no botão para abrir em tela cheia e ativar o aviso sonoro quando um pedido ficar pronto.</p>
          <button onClick={iniciar} className="rounded-full bg-green-600 px-8 py-4 text-xl font-extrabold">Iniciar monitor</button>
        </div>
      )}
    </div>
  )
}
