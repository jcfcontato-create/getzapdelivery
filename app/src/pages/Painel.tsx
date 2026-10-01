import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

type Loja = { id: string; slug: string; nome: string; whatsapp: string; aberta: boolean; aceita_retirada: boolean; endereco: string | null; impressora: string | null; logo_url: string | null; email: string | null; cpf_cnpj: string | null; imprime_via_cozinha: boolean; vias_impressao: number; plataforma_ativa: boolean; cor: string }
type ItemAdEscolhido = { nome: string; qtd: number; preco_unit: number }
type Item = { id: string; nome: string; qtd: number; preco_unit: number; itens_pedido_adicionais: ItemAdEscolhido[] }
type Pedido = { id: string; numero: number; status: string; cliente_nome: string; cliente_telefone: string; tipo: string; bairro: string | null; endereco: string | null; pagamento: string; troco_para: string | null; observacao: string | null; subtotal: number; taxa_entrega: number; desconto: number; cupom_codigo: string | null; total: number; criado_em: string; itens_pedido: Item[] }
type Cat = { id: string; nome: string; ordem: number }
type Prod = { id: string; categoria_id: string; nome: string; descricao: string | null; preco: number; ativo: boolean; foto_url: string | null; dias_semana: number[] | null }
type Zona = { id: string; bairro: string; taxa: number }
type Grupo = { id: string; nome: string; tipo: 'unica' | 'multipla'; obrigatorio: boolean; maximo: number | null }
type ItemAd = { id: string; grupo_id: string; nome: string; preco: number; permite_quantidade: boolean; quantidade_maxima: number; ativo: boolean }
type Aba = 'pedidos' | 'cardapio' | 'adicionais' | 'bairros' | 'loja' | 'relatorios'
type Horario = { dia_semana: number; abre: string | null; fecha: string | null; fechado: boolean }
type FormaPagamento = { id: string; nome: string; aceita_troco: boolean; ordem: number }
type Rede = 'instagram' | 'facebook' | 'tiktok' | 'youtube' | 'twitter' | 'whatsapp' | 'site'
type RedeSocial = { id: string; rede: Rede; url: string; ordem: number }
const REDES: [Rede, string][] = [['instagram', 'Instagram'], ['facebook', 'Facebook'], ['tiktok', 'TikTok'], ['youtube', 'YouTube'], ['twitter', 'X (Twitter)'], ['whatsapp', 'WhatsApp'], ['site', 'Site']]
type TipoCupom = 'percentual' | 'fixo' | 'frete_gratis'
type AplicaEm = 'pedido' | 'produtos'
type Cupom = {
  id: string; codigo: string; tipo: TipoCupom; valor: number; aplica_em: AplicaEm
  valido_de: string | null; valido_ate: string | null
  limite_uso_total: number | null; limite_uso_por_cliente: number | null
  ativo: boolean; ordem: number
  cupom_produtos: { produto_id: string }[]; cupom_categorias: { categoria_id: string }[]
}

const R = (n: number) => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const NUM = (s: string) => Number(s.replace(',', '.'))
const STATUS: Record<string, string> = { novo: 'Novo', em_preparo: 'Em preparo', saiu_para_entrega: 'Saiu para entrega', entregue: 'Entregue', cancelado: 'Cancelado' }
const PROXIMO: Record<string, string> = { novo: 'em_preparo', em_preparo: 'saiu_para_entrega', saiu_para_entrega: 'entregue' }
const ROTULO: Record<string, string> = { em_preparo: 'Iniciar preparo', saiu_para_entrega: 'Saiu para entrega', entregue: 'Marcar como entregue' }
const PAG: Record<string, string> = { pix: 'Pix na entrega', dinheiro: 'Dinheiro', cartao: 'Cartão na entrega' }
const ABERTOS = ['novo', 'em_preparo', 'saiu_para_entrega']
const DIAS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado']
const HM = (v: string) => v ? v.slice(0, 5) : ''
// Registra uma linha no log de atividades da loja (aba Loja > Exportar log). Não trava a
// tela nem mostra erro ao usuário se falhar: é um registro de apoio, não pode impedir o
// trabalho normal do painel.
function registrarLog(lojaId: string, acao: string) {
  supabase.auth.getUser().then(({ data }) => {
    supabase.from('logs_atividade').insert({ loja_id: lojaId, usuario_email: data.user?.email ?? null, acao }).then()
  })
}
const campo ='w-full rounded-lg border border-neutral-300 bg-white px-3 py-2'
const botao = 'rounded-lg bg-[#1A7F37] px-4 py-2 font-bold text-white disabled:opacity-50'
const claro = 'rounded-lg border border-neutral-400 bg-white px-3 py-2'
const Sino = ({ off }: { off: boolean }) => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" />{off && <path d="M3 3l18 18" />}
  </svg>
)
// Ícones das abas do painel: no celular a aba mostra só o ícone (mais fácil de tocar),
// a partir da tela sm (tablets/desktop) o texto volta a aparecer ao lado do ícone.
const IconAba = ({ id }: { id: Aba }) => {
  const p = { viewBox: '0 0 24 24', className: 'h-5 w-5 shrink-0', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
  if (id === 'pedidos') return <svg {...p}><rect x="9" y="3" width="6" height="4" rx="1" /><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" /><path d="M9 12h6M9 16h6" /></svg>
  if (id === 'cardapio') return <svg {...p}><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /><path d="M8 7h8M8 11h8" /></svg>
  if (id === 'adicionais') return <svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></svg>
  if (id === 'bairros') return <svg {...p}><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></svg>
  if (id === 'relatorios') return <svg {...p}><path d="M4 20V10M10 20V4M16 20v-6" /><path d="M2 20h20" /></svg>
  return <svg {...p}><path d="M3 9l1.2-5h15.6L21 9" /><path d="M4 9v10a1 1 0 0 0 1 1h4v-6h6v6h4a1 1 0 0 0 1-1V9" /><path d="M3 9h18" /></svg>
}
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))

// Imprime o pedido em formato de cupom (papel de 80 mm), sem alterar a tela do painel
function imprimirPedido(p: Pedido, loja: Loja, titulo?: string, semPreco?: boolean) {
  const linhas = p.itens_pedido.map(i => `<tr><td>${i.qtd}x ${esc(i.nome)}</td><td class="d">${semPreco ? '' : R(i.qtd * i.preco_unit)}</td></tr>` +
    (i.itens_pedido_adicionais ?? []).map(a => `<tr><td class="ad">+ ${a.qtd}x ${esc(a.nome)}</td><td></td></tr>`).join('')).join('')
  const data = new Date(p.criado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
  const totais = semPreco ? '' : `<table><tr><td>Subtotal</td><td class="d">${R(p.subtotal)}</td></tr>${p.tipo === 'entrega' ? `<tr><td>Entrega</td><td class="d">${R(p.taxa_entrega)}</td></tr>` : ''}${p.desconto > 0 ? `<tr><td>Cupom${p.cupom_codigo ? ' ' + esc(p.cupom_codigo) : ''}</td><td class="d">-${R(p.desconto)}</td></tr>` : ''}<tr class="b"><td>TOTAL</td><td class="d">${R(p.total)}</td></tr></table><hr>
<p>Pagamento: ${PAG[p.pagamento] ?? esc(p.pagamento)}${p.troco_para ? ` (troco para ${esc(p.troco_para)})` : ''}</p>`
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Pedido #${p.numero}</title><style>
@page{size:80mm auto;margin:3mm}
body{font:13px/1.35 "Courier New",monospace;color:#000;margin:0;width:72mm;text-transform:uppercase}
h1,h2,p{margin:0}h1{font-size:15px;text-align:center}h2{font-size:19px;text-align:center;margin:6px 0}
hr{border:0;border-top:1px dashed #000;margin:6px 0}table{width:100%;border-collapse:collapse}
td{vertical-align:top;padding:1px 0}.d{text-align:right;white-space:nowrap}.b{font-weight:bold}.ad{padding-left:8px;font-size:11px;color:#333}
</style></head><body>
<h1>${esc(loja.nome)}</h1>
<h2>${titulo ?? 'PEDIDO #' + p.numero}</h2>
<p>${data}</p><hr>
<p class="b">${esc(p.cliente_nome)}</p>${semPreco ? '' : `<p>${esc(p.cliente_telefone)}</p>`}
<p>${p.tipo === 'entrega' ? `ENTREGA: ${esc(p.endereco ?? '')}, ${esc(p.bairro ?? '')}` : 'RETIRADA NA LOJA'}</p><hr>
<table>${linhas}</table><hr>
${totais}
${p.observacao ? `<p>Obs: ${esc(p.observacao)}</p>` : ''}
</body></html>`
  const f = document.createElement('iframe')
  f.style.cssText = 'position:fixed;left:0;top:0;width:80mm;height:1px;opacity:0;pointer-events:none;border:0'
  f.srcdoc = html
  f.onload = () => { f.contentWindow?.focus(); f.contentWindow?.print(); setTimeout(() => f.remove(), 60000) }
  document.body.appendChild(f)
}
// Imprime a quantidade de vias com preço configurada na aba Loja (padrão: 1) e, se a
// via da cozinha estiver ligada, mais uma via extra sem preço nem telefone do cliente.
// Cada via sai em sequência, com um intervalo, para não sobrepor as janelas de impressão.
// Devolve quanto tempo (ms) essa impressão toda vai levar, para quem chama poder
// enfileirar a impressão do próximo pedido só depois.
function imprimirConformeConfig(p: Pedido, loja: Loja, atraso = 0): number {
  const vias = Math.min(5, Math.max(1, loja.vias_impressao || 1))
  for (let i = 0; i < vias; i++) setTimeout(() => imprimirPedido(p, loja), atraso + i * 1200)
  if (loja.imprime_via_cozinha) setTimeout(() => imprimirPedido(p, loja, `COZINHA #${p.numero}`, true), atraso + vias * 1200)
  return (vias + (loja.imprime_via_cozinha ? 1 : 0)) * 1200
}
const pedidoTeste: Pedido = { id: 'teste', numero: 0, status: 'novo', cliente_nome: 'Cliente de teste', cliente_telefone: '(00) 00000-0000', tipo: 'entrega', bairro: 'Centro', endereco: 'Rua Exemplo, 1', pagamento: 'pix', troco_para: null, observacao: 'Se este papel saiu, a impressão está funcionando.', subtotal: 10, taxa_entrega: 5, desconto: 0, cupom_codigo: null, total: 15, criado_em: new Date().toISOString(), itens_pedido: [{ id: 'teste', nome: 'Produto de teste', qtd: 1, preco_unit: 10, itens_pedido_adicionais: [] }] }
const Erro = ({ m }: { m: string }) => (m ? <p role="alert" className="my-2 rounded-lg bg-red-100 p-3 text-red-800">{m}</p> : null)

export default function Painel() {
  const [pronto, setPronto] = useState(false)
  const [logado, setLogado] = useState(false)
  useEffect(() => {
    document.title = 'Painel | GetZap Delivery'
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
      <h1 className="mb-2 text-2xl font-bold text-[#1B2A4A]">GetZap Delivery</h1>
      <p className="mb-6">Entre para gerenciar a sua loja.</p>
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
  const [loja, setLoja] = useState<Loja | null>(null)
  const [msg, setMsg] = useState('')
  const [aba, setAba] = useState<Aba>('pedidos')
  const [som, setSom] = useState(() => { try { return localStorage.getItem('gz_som') !== '0' } catch { return true } })
  const [travado, setTravado] = useState(false)
  const [aviso, setAviso] = useState('')
  const [versao, setVersao] = useState(0)
  const [imprimir, setImprimir] = useState(() => { try { return localStorage.getItem('gz_imp') === '1' } catch { return false } })
  const imprimirRef = useRef(imprimir)
  function alternarImp() {
    const novo = !imprimir
    setImprimir(novo); imprimirRef.current = novo
    try { localStorage.setItem('gz_imp', novo ? '1' : '0') } catch { /* sem armazenamento */ }
  }
  const somRef = useRef(som)
  const audio = useRef<AudioContext | null>(null)
  const conhecidos = useRef<Set<string> | null>(null)
  const contexto = () => {
    if (!audio.current) audio.current = new (window.AudioContext || (window as any).webkitAudioContext)()
    return audio.current
  }
  // Toca "ding-dong-ding" (gerado no navegador, sem arquivo de áudio) e vibra no celular
  const tocar = () => {
    const c = contexto()
    if (c.state === 'suspended') c.resume()
    const t = c.currentTime
    ;[880, 660, 880].forEach((freq, i) => {
      const o = c.createOscillator(), g = c.createGain(), ini = t + i * 0.35
      o.type = 'sine'; o.frequency.value = freq
      g.gain.setValueAtTime(0.0001, ini)
      g.gain.exponentialRampToValueAtTime(0.7, ini + 0.03)
      g.gain.exponentialRampToValueAtTime(0.0001, ini + 0.3)
      o.connect(g); g.connect(c.destination); o.start(ini); o.stop(ini + 0.32)
    })
    navigator.vibrate?.([200, 100, 200])
  }
  function alternarSom() {
    const novo = !som
    setSom(novo); somRef.current = novo
    try { localStorage.setItem('gz_som', novo ? '1' : '0') } catch { /* sem armazenamento */ }
    if (novo) { tocar(); setTravado(false) }
  }
  // Navegadores só liberam o som depois de um toque do usuário
  useEffect(() => {
    setTravado(contexto().state === 'suspended')
    const liberar = () => { contexto().resume().then(() => setTravado(false)) }
    window.addEventListener('pointerdown', liberar); window.addEventListener('keydown', liberar)
    return () => { window.removeEventListener('pointerdown', liberar); window.removeEventListener('keydown', liberar) }
  }, [])
  // Verifica novos pedidos a cada 10 segundos, em qualquer aba do painel
  useEffect(() => {
    if (!loja) return
    const checar = async () => {
      const { data } = await supabase.from('pedidos').select('id,numero').eq('loja_id', loja.id).eq('status', 'novo')
      if (!data) return
      if (conhecidos.current) {
        const novos = data.filter((p: any) => !conhecidos.current!.has(p.id))
        if (novos.length) {
          setAviso(novos.length === 1 ? `Novo pedido #${novos[0].numero}` : `Novos pedidos: ${novos.map((p: any) => '#' + p.numero).join(', ')}`)
          setVersao(v => v + 1)
          if (somRef.current) tocar()
          if (imprimirRef.current) {
            const { data: cheios } = await supabase.from('pedidos').select('*, itens_pedido(nome,qtd,preco_unit,itens_pedido_adicionais(nome,qtd,preco_unit))').in('id', novos.map((p: any) => p.id))
            let atraso = 0
            ;(cheios as Pedido[] | null)?.forEach(p => { atraso += imprimirConformeConfig(p, loja, atraso) })
          }
        }
      }
      conhecidos.current = new Set<string>(data.map((p: any) => p.id))
    }
    checar()
    const t = setInterval(checar, 10000)
    return () => clearInterval(t)
  }, [loja])
  useEffect(() => { document.title = aviso ? `(!) ${aviso}` : 'Painel | GetZap Delivery' }, [aviso])
  useEffect(() => {
    ;(async () => {
      const { data: s } = await supabase.auth.getSession()
      const { data, error } = await supabase.from('membros').select('lojas(id,slug,nome,whatsapp,aberta,aceita_retirada,endereco,impressora,logo_url,email,cpf_cnpj,imprime_via_cozinha,vias_impressao,plataforma_ativa,cor)').eq('user_id', s.session?.user.id).limit(1)
      if (error) setMsg(error.message)
      else if (!data || !data.length) setMsg('Este usuário ainda não está vinculado a uma loja. Fale com o suporte do GetZap.')
      else setLoja((data[0] as any).lojas)
    })()
  }, [])
  async function alternar() {
    if (!loja) return
    const aberta = !loja.aberta
    const { error } = await supabase.from('lojas').update({ aberta }).eq('id', loja.id)
    if (error) setMsg(error.message); else { setLoja({ ...loja, aberta }); registrarLog(loja.id, aberta ? 'Loja aberta' : 'Loja fechada') }
  }
  const sair = () => supabase.auth.signOut()
  if (!loja) return <main className="p-8"><p>{msg || 'Carregando…'}</p><button className={claro + ' mt-4'} onClick={sair}>Sair</button></main>
  if (!loja.plataforma_ativa) return (
    <main className="p-8">
      <p className="mb-4">Esta loja está temporariamente indisponível na plataforma GetZap Delivery. Fale com o suporte para regularizar o acesso.</p>
      <button className={claro} onClick={sair}>Sair</button>
    </main>
  )
  const abas: [Aba, string][] = [['pedidos', 'Pedidos'], ['cardapio', 'Cardápio'], ['adicionais', 'Adicionais'], ['bairros', 'Bairros'], ['relatorios', 'Relatórios'], ['loja', 'Loja']]
  return (
    <div className="mx-auto min-h-screen max-w-3xl bg-neutral-50 pb-16">
      <header className="flex flex-wrap items-center justify-between gap-2 bg-[#1B2A4A] px-4 py-3 text-white">
        <div><p className="font-bold">{loja.nome}</p><a className="text-sm underline" href={`/${loja.slug}`} target="_blank" rel="noreferrer">Ver cardápio</a></div>
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={alternar} className={`rounded-full px-4 py-2 font-bold ${loja.aberta ? 'bg-[#1A7F37]' : 'bg-red-700'}`}>{loja.aberta ? 'Loja aberta' : 'Loja fechada'}</button>
          <button onClick={alternarSom} aria-pressed={som} className={`flex items-center gap-2 rounded-full border-2 px-3 py-2 font-bold ${som ? 'border-white text-white' : 'border-neutral-400 text-neutral-300'}`}>
            <Sino off={!som} />{som ? 'Som ligado' : 'Som desligado'}
          </button>
          <button onClick={sair} className="underline">Sair</button>
        </div>
      </header>
      <nav className="flex border-b border-neutral-200 bg-white">
        {abas.map(([id, nome]) => (
          <button key={id} onClick={() => { setAba(id); if (id === 'pedidos') setAviso('') }} aria-current={aba === id} title={nome} aria-label={nome} className={`flex flex-1 flex-col items-center justify-center gap-1 py-2 font-semibold sm:flex-row sm:py-3 ${aba === id ? 'border-b-4 border-[#1A7F37] text-[#1B2A4A]' : 'text-neutral-600'}`}>
            <IconAba id={id} /><span className="hidden sm:inline">{nome}</span>
          </button>
        ))}
      </nav>
      {som && travado && <p role="status" className="bg-amber-100 p-2 text-center text-sm text-amber-900">Toque em qualquer lugar da tela para ativar o som dos avisos.</p>}
      <main className="p-4">
        {aviso && (
          <div role="alert" className="mb-3 flex items-center justify-between gap-3 rounded-lg bg-[#1A7F37] p-3 font-bold text-white">
            <span>{aviso}</span>
            <button className="rounded bg-white px-3 py-1 text-[#1B2A4A]" onClick={() => { setAba('pedidos'); setAviso('') }}>Ver</button>
          </div>
        )}
        <Erro m={msg} />
        {aba === 'pedidos' && <Pedidos loja={loja} versao={versao} impAuto={imprimir} alternarImp={alternarImp} />}
        {aba === 'cardapio' && <AbaCardapio loja={loja} />}
        {aba === 'adicionais' && <AbaAdicionais loja={loja} />}
        {aba === 'bairros' && <AbaBairros loja={loja} />}
        {aba === 'relatorios' && <AbaRelatorios loja={loja} />}
        {aba === 'loja' && (<>
          <AbaLoja loja={loja} salvo={setLoja} />
          <div className="mt-4"><Horarios loja={loja} /></div>
          <div className="mt-4"><ExportarLog loja={loja} /></div>
        </>)}
      </main>
    </div>
  )
}

function Pedidos({ loja, versao, impAuto, alternarImp }: { loja: Loja; versao: number; impAuto: boolean; alternarImp: () => void }) {
  const [lista, setLista] = useState<Pedido[]>([])
  const [ver, setVer] = useState<'andamento' | 'finalizados'>('andamento')
  const [erro, setErro] = useState('')
  const [produtos, setProdutos] = useState<{ id: string; nome: string; preco: number }[]>([])
  const carregar = useCallback(async () => {
    const { data, error } = await supabase.from('pedidos').select('*, itens_pedido(id,nome,qtd,preco_unit,itens_pedido_adicionais(nome,qtd,preco_unit))').eq('loja_id', loja.id).order('criado_em', { ascending: false }).limit(60)
    if (error) setErro(error.message); else { setErro(''); setLista(data as Pedido[]) }
  }, [loja.id])
  useEffect(() => { carregar(); const t = setInterval(carregar, 15000); return () => clearInterval(t) }, [carregar, versao])
  useEffect(() => {
    supabase.from('produtos').select('id,nome,preco').eq('loja_id', loja.id).eq('ativo', true).order('nome').then(({ data }) => setProdutos(data ?? []))
  }, [loja.id])
  async function adicionarItem(p: Pedido, produtoId: string, qtd: number) {
    const { error } = await supabase.rpc('pedido_adicionar_item', { p_pedido_id: p.id, p_produto_id: produtoId, p_qtd: qtd })
    if (error) { setErro(error.message); return false }
    setErro('')
    const nomeProd = produtos.find(x => x.id === produtoId)?.nome ?? ''
    registrarLog(loja.id, `Item acrescentado ao pedido #${p.numero}: ${qtd}x ${nomeProd}`)
    carregar()
    return true
  }
  async function removerItem(p: Pedido, item: Item) {
    if (!confirm(`Remover "${item.qtd}x ${item.nome}" do pedido #${p.numero}?`)) return
    const { error } = await supabase.rpc('pedido_remover_item', { p_item_id: item.id })
    if (error) { setErro(error.message); return }
    setErro('')
    registrarLog(loja.id, `Item removido do pedido #${p.numero}: ${item.qtd}x ${item.nome}`)
    carregar()
  }
  async function mover(p: Pedido, status: string) {
    const { error } = await supabase.from('pedidos').update({ status }).eq('id', p.id)
    if (error) setErro(error.message); else { carregar(); registrarLog(loja.id, `Pedido #${p.numero} alterado para "${STATUS[status] ?? status}"`) }
  }
  async function excluirPedido(p: Pedido) {
    if (!confirm(`Excluir definitivamente o pedido #${p.numero}? Ele some da lista e também dos relatórios, e essa ação não pode ser desfeita.`)) return
    const { error } = await supabase.from('pedidos').delete().eq('id', p.id)
    if (error) setErro(error.message); else { carregar(); registrarLog(loja.id, `Pedido #${p.numero} excluído`) }
  }
  const mostrados = lista.filter(p => ABERTOS.includes(p.status) === (ver === 'andamento'))
  return (
    <section>
      <div className="mb-3 flex gap-2">
        <button className={ver === 'andamento' ? botao : claro} onClick={() => setVer('andamento')}>Em andamento</button>
        <button className={ver === 'finalizados' ? botao : claro} onClick={() => setVer('finalizados')}>Finalizados</button>
      </div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <button aria-pressed={impAuto} onClick={alternarImp} className={impAuto ? botao : claro}>Impressão automática: {impAuto ? 'ligada' : 'desligada'}</button>
        <button className={claro} onClick={() => imprimirConformeConfig(pedidoTeste, loja)}>Imprimir teste</button>
      </div>
      {impAuto && <p className="mb-2 text-sm text-neutral-600">Cada pedido novo é impresso assim que chega. Para não abrir a janela de impressão a cada pedido, configure o navegador do computador da loja para imprimir direto.</p>}
      <p className="mb-3 text-sm text-neutral-600">A lista atualiza sozinha a cada 15 segundos.</p>
      <Erro m={erro} />
      {mostrados.length === 0 && <p className="rounded-xl bg-white p-6 text-center text-neutral-600">Nenhum pedido por aqui.</p>}
      <div className="space-y-3">
        {mostrados.map(p => {
          const prox = p.status === 'em_preparo' && p.tipo === 'retirada' ? 'entregue' : PROXIMO[p.status]
          return (
            <article key={p.id} className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
              <div className="flex justify-between gap-2">
                <h3 className="font-bold">#{p.numero} - {p.cliente_nome}</h3>
                <span className="text-sm text-neutral-600">{new Date(p.criado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <p className="text-sm font-semibold">{STATUS[p.status]}</p>
              <p className="text-sm text-neutral-600">{p.tipo === 'entrega' ? `Entrega: ${p.endereco}, ${p.bairro}` : 'Retirada na loja'}</p>
              {(() => { const editavel = !['entregue', 'cancelado'].includes(p.status); return (<>
              <ul className="my-2">{p.itens_pedido.map((i, k) => (
                <li key={k} className="flex items-start justify-between gap-2">
                  <span>
                    {i.qtd}x {i.nome}
                    {i.itens_pedido_adicionais?.length > 0 && (
                      <ul className="pl-4 text-sm text-neutral-600">
                        {i.itens_pedido_adicionais.map((a, j) => <li key={j}>+ {a.qtd}x {a.nome}</li>)}
                      </ul>
                    )}
                  </span>
                  {editavel && <button type="button" aria-label={`Remover ${i.nome}`} className="shrink-0 text-sm text-red-700 underline" onClick={() => removerItem(p, i)}>remover</button>}
                </li>
              ))}</ul>
              <p>Pagamento: {PAG[p.pagamento] ?? p.pagamento}{p.troco_para ? ` (troco para ${p.troco_para})` : ''}</p>
              {p.observacao && <p>Obs: {p.observacao}</p>}
              {p.desconto > 0 && <p className="text-sm text-neutral-600">Cupom{p.cupom_codigo ? ` ${p.cupom_codigo}` : ''}: -{R(p.desconto)}</p>}
              <p className="font-bold">Total {R(p.total)}</p>
              {editavel && <div className="mt-2"><AcrescentarItem produtos={produtos} adicionar={(produtoId, qtd) => adicionarItem(p, produtoId, qtd)} /></div>}
              <div className="mt-3 flex flex-wrap gap-2">
                {prox && <button className={botao} onClick={() => mover(p, prox)}>{ROTULO[prox]}</button>}
                <a className={claro} href={`https://wa.me/55${p.cliente_telefone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer">WhatsApp do cliente</a>
                {ABERTOS.includes(p.status) && <button className={claro} onClick={() => confirm('Cancelar este pedido?') && mover(p, 'cancelado')}>Cancelar</button>}
                <button className={claro} onClick={() => imprimirConformeConfig(p, loja)}>Imprimir</button>
                <button className={claro} onClick={() => excluirPedido(p)}>Excluir</button>
              </div>
              </>) })()}
            </article>
          )
        })}
      </div>
    </section>
  )
}

function AcrescentarItem({ produtos, adicionar }: { produtos: { id: string; nome: string; preco: number }[]; adicionar: (produtoId: string, qtd: number) => Promise<boolean> }) {
  const [aberto, setAberto] = useState(false)
  const [produtoId, setProdutoId] = useState('')
  const [qtd, setQtd] = useState('1')
  const [ocupado, setOcupado] = useState(false)
  if (produtos.length === 0) return null
  if (!aberto) return <button type="button" className={claro} onClick={() => { setAberto(true); setProdutoId(produtos[0].id) }}>+ Acrescentar item</button>
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 p-2">
      <select className={campo + ' flex-1'} value={produtoId} onChange={e => setProdutoId(e.target.value)}>
        {produtos.map(pr => <option key={pr.id} value={pr.id}>{pr.nome} - {R(pr.preco)}</option>)}
      </select>
      <input type="number" min={1} className={campo + ' w-20'} value={qtd} onChange={e => setQtd(e.target.value.replace(/\D/g, ''))} />
      <button type="button" className={botao} disabled={ocupado} onClick={async () => {
        setOcupado(true)
        const ok = await adicionar(produtoId, Math.max(1, parseInt(qtd, 10) || 1))
        setOcupado(false)
        if (ok) { setAberto(false); setQtd('1') }
      }}>{ocupado ? 'Adicionando...' : 'Adicionar'}</button>
      <button type="button" className={claro} onClick={() => setAberto(false)}>Cancelar</button>
    </div>
  )
}

const TAM_MAX_FOTO = 5 * 1024 * 1024

function FormProduto({ loja, cats, grupos, gruposIniciais, sugestoesIniciais, diasHabilitados, p, feito, erro }: { loja: Loja; cats: Cat[]; grupos: Grupo[]; gruposIniciais?: string[]; sugestoesIniciais?: string[]; diasHabilitados: number[]; p?: Prod; feito: () => void; erro: (m: string) => void }) {
  const vazio = { nome: '', descricao: '', preco: '', categoria_id: cats[0]?.id ?? '', ativo: true, foto_url: null as string | null }
  const [f, setF] = useState(p ? { nome: p.nome, descricao: p.descricao ?? '', preco: String(p.preco).replace('.', ','), categoria_id: p.categoria_id, ativo: p.ativo, foto_url: p.foto_url } : vazio)
  const [fotoArquivo, setFotoArquivo] = useState<File | null>(null)
  const [fotoPreview, setFotoPreview] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [ok, setOk] = useState(false)
  const [gruposSel, setGruposSel] = useState<string[]>(gruposIniciais ?? [])
  const [sugSel, setSugSel] = useState<string[]>(sugestoesIniciais ?? [])
  const [diasSel, setDiasSel] = useState<number[]>(p?.dias_semana ?? [])
  const set = (k: string, v: string | boolean) => setF(x => ({ ...x, [k]: v }))
  const alternarGrupo = (id: string) => setGruposSel(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
  const alternarSug = (id: string) => setSugSel(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
  const alternarDia = (dia: number) => setDiasSel(s => s.includes(dia) ? s.filter(x => x !== dia) : [...s, dia])
  function escolherFoto(arquivo: File | undefined) {
    if (!arquivo) return
    if (!arquivo.type.startsWith('image/')) return erro('Escolha um arquivo de imagem (JPG, PNG ou WEBP).')
    if (arquivo.size > TAM_MAX_FOTO) return erro('A imagem precisa ter até 5 MB.')
    erro('')
    setFotoArquivo(arquivo)
    setFotoPreview(URL.createObjectURL(arquivo))
  }
  function removerFoto() {
    setFotoArquivo(null)
    setFotoPreview(null)
    set('foto_url', '')
    setF(x => ({ ...x, foto_url: null }))
  }
  async function salvar(e: FormEvent) {
    e.preventDefault(); setOk(false)
    const preco = NUM(f.preco)
    if (!f.nome.trim() || f.preco.trim() === '' || !(preco >= 0) || !f.categoria_id) return erro('Informe nome, preço e categoria do produto.')
    let foto_url = f.foto_url
    if (fotoArquivo) {
      setEnviando(true)
      const ext = fotoArquivo.name.split('.').pop() || 'jpg'
      const caminho = `${loja.id}/${crypto.randomUUID()}.${ext}`
      const { error: erroEnvio } = await supabase.storage.from('produtos').upload(caminho, fotoArquivo, { upsert: false })
      setEnviando(false)
      if (erroEnvio) return erro('Não foi possível enviar a foto: ' + erroEnvio.message)
      foto_url = supabase.storage.from('produtos').getPublicUrl(caminho).data.publicUrl
    }
    const dados = { nome: f.nome.trim(), descricao: f.descricao.trim() || null, preco, categoria_id: f.categoria_id, ativo: f.ativo, foto_url, dias_semana: diasSel.length ? diasSel : null }
    let produtoId = p?.id
    if (p) {
      const { error } = await supabase.from('produtos').update(dados).eq('id', p.id)
      if (error) return erro(error.message)
      registrarLog(loja.id, `Produto editado: "${dados.nome}"`)
    } else {
      const { data: criado, error } = await supabase.from('produtos').insert({ ...dados, loja_id: loja.id }).select('id').single()
      if (error) return erro(error.message)
      produtoId = criado.id
      registrarLog(loja.id, `Produto criado: "${dados.nome}"`)
    }
    const antes = gruposIniciais ?? []
    const remover = antes.filter(id => !gruposSel.includes(id))
    const adicionar = gruposSel.filter(id => !antes.includes(id))
    if (produtoId && remover.length) {
      const { error } = await supabase.from('produto_grupos_adicionais').delete().eq('produto_id', produtoId).in('grupo_id', remover)
      if (error) return erro(error.message)
    }
    if (produtoId && adicionar.length) {
      const { error } = await supabase.from('produto_grupos_adicionais').insert(adicionar.map(grupo_id => ({ produto_id: produtoId, grupo_id })))
      if (error) return erro(error.message)
    }
    const antesSug = sugestoesIniciais ?? []
    const removerSug = antesSug.filter(id => !sugSel.includes(id))
    const adicionarSug = sugSel.filter(id => !antesSug.includes(id))
    if (produtoId && removerSug.length) {
      const { error } = await supabase.from('produto_sugestoes').delete().eq('produto_id', produtoId).in('categoria_id', removerSug)
      if (error) return erro(error.message)
    }
    if (produtoId && adicionarSug.length) {
      const { error } = await supabase.from('produto_sugestoes').insert(adicionarSug.map(categoria_id => ({ produto_id: produtoId, categoria_id })))
      if (error) return erro(error.message)
    }
    erro(''); setOk(true)
    if (!p) { setF(vazio); setFotoArquivo(null); setFotoPreview(null); setGruposSel([]); setSugSel([]); setDiasSel([]) }
    feito()
  }
  async function excluir() {
    if (!p) return
    const aviso = p.ativo
      ? `Tem certeza que quer excluir "${p.nome}"? Para apenas tirá-lo do cardápio sem apagar, desmarque a opção "Disponível no cardápio" logo abaixo da foto do produto, em vez de excluir.`
      : `Excluir "${p.nome}"?`
    if (!confirm(aviso)) return
    const { error } = await supabase.from('produtos').delete().eq('id', p.id)
    if (error) erro(error.message); else { registrarLog(loja.id, `Produto excluído: "${p.nome}"`); feito() }
  }
  const [duplicando, setDuplicando] = useState(false)
  async function duplicar() {
    if (!p) return
    setDuplicando(true)
    const dados = { nome: `${p.nome} (cópia)`, descricao: p.descricao, preco: p.preco, categoria_id: p.categoria_id, ativo: p.ativo, foto_url: p.foto_url, dias_semana: diasSel.length ? diasSel : null }
    const { data: criado, error } = await supabase.from('produtos').insert({ ...dados, loja_id: loja.id }).select('id').single()
    if (error) { setDuplicando(false); return erro(error.message) }
    if (gruposSel.length) {
      const { error: e2 } = await supabase.from('produto_grupos_adicionais').insert(gruposSel.map(grupo_id => ({ produto_id: criado.id, grupo_id })))
      if (e2) { setDuplicando(false); return erro(e2.message) }
    }
    if (sugSel.length) {
      const { error: e3 } = await supabase.from('produto_sugestoes').insert(sugSel.map(categoria_id => ({ produto_id: criado.id, categoria_id })))
      if (e3) { setDuplicando(false); return erro(e3.message) }
    }
    setDuplicando(false)
    erro('')
    registrarLog(loja.id, `Produto duplicado: "${p.nome}" → "${dados.nome}"`)
    feito()
  }
  const mostrarFoto = fotoPreview || f.foto_url
  return (
    <form onSubmit={salvar} className="grid gap-2 rounded-xl border border-neutral-200 bg-white p-3">
      <input className={campo} placeholder="Nome do produto" value={f.nome} onChange={e => set('nome', e.target.value)} />
      <input className={campo} placeholder="Descrição (opcional)" value={f.descricao} onChange={e => set('descricao', e.target.value)} />
      <div className="grid grid-cols-2 gap-2">
        <input className={campo} placeholder="Preço, ex.: 9,50" inputMode="decimal" value={f.preco} onChange={e => set('preco', e.target.value)} />
        <select className={campo} value={f.categoria_id} onChange={e => set('categoria_id', e.target.value)}>{cats.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>
      </div>
      <p className="text-sm text-neutral-600">Se o preço muda conforme o tamanho (ex.: marmita P/M/G), coloque <b>0</b> aqui e marque um grupo de "seleção única, obrigatório" abaixo com o preço de cada tamanho. O cardápio mostra "A partir de" automaticamente.</p>
      <div>
        <span className="mb-1 block text-sm font-semibold">Foto do produto</span>
        <div className="flex items-center gap-3">
          {mostrarFoto ? (
            <img src={mostrarFoto} alt="" className="h-16 w-16 rounded-lg border border-neutral-300 object-cover" />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-neutral-300 text-xs text-neutral-400">sem foto</div>
          )}
          <div className="flex flex-col gap-1">
            <label className={`${claro} cursor-pointer text-center text-sm`}>
              {mostrarFoto ? 'Trocar foto' : 'Enviar foto'}
              <input type="file" accept="image/*" className="hidden" onChange={e => escolherFoto(e.target.files?.[0])} />
            </label>
            {mostrarFoto && <button type="button" className="text-sm text-neutral-600 underline" onClick={removerFoto}>Remover foto</button>}
          </div>
        </div>
      </div>
      <label className="flex items-center gap-2"><input type="checkbox" checked={f.ativo} onChange={e => set('ativo', e.target.checked)} /> Disponível no cardápio</label>
      <div>
        <span className="mb-1 block text-sm font-semibold">Dias da semana em que este produto é vendido</span>
        <p className="mb-1 text-sm text-neutral-600">Deixe tudo desmarcado para vender todos os dias. Marque só os dias em que esse prato específico fica disponível (ex.: feijoada só no sábado).</p>
        <div className="flex flex-wrap gap-2 rounded-lg border border-neutral-200 p-2">
          {diasHabilitados.map(dia => (
            <label key={dia} className="flex items-center gap-1 text-sm">
              <input type="checkbox" checked={diasSel.includes(dia)} onChange={() => alternarDia(dia)} />
              {DIAS[dia]}
            </label>
          ))}
        </div>
      </div>
      {grupos.length > 0 && (
        <div>
          <span className="mb-1 block text-sm font-semibold">Adicionais deste produto</span>
          <div className="space-y-1 rounded-lg border border-neutral-200 p-2">
            {grupos.map(g => (
              <label key={g.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={gruposSel.includes(g.id)} onChange={() => alternarGrupo(g.id)} />
                {g.nome} <span className="text-neutral-500">({g.tipo === 'unica' ? 'seleção única' : `até ${g.maximo ?? 'sem limite'}`}{g.obrigatorio ? ', obrigatório' : ''})</span>
              </label>
            ))}
          </div>
        </div>
      )}
      {cats.length > 0 && (
        <div>
          <span className="mb-1 block text-sm font-semibold">Sugerir categorias após adicionar este produto</span>
          <p className="mb-1 text-sm text-neutral-600">Assim que o cliente adiciona este produto ao carrinho, o cardápio sugere produtos dessas categorias (ex.: sugerir "Bebidas" ao adicionar uma pizza).</p>
          <div className="space-y-1 rounded-lg border border-neutral-200 p-2">
            {cats.map(c => (
              <label key={c.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={sugSel.includes(c.id)} onChange={() => alternarSug(c.id)} />
                {c.nome}
              </label>
            ))}
          </div>
        </div>
      )}
      {ok && <p role="status" className="rounded-lg bg-green-100 p-3 text-green-800">Dados salvos.</p>}
      <div className="flex gap-2">
        <button className={botao} disabled={enviando}>{enviando ? 'Enviando foto...' : p ? 'Salvar' : 'Adicionar produto'}</button>
        {p && <button type="button" className="rounded-lg px-3 py-2 font-semibold text-white disabled:opacity-50" style={{ background: '#59A5CD' }} disabled={duplicando} onClick={duplicar}>{duplicando ? 'Duplicando…' : 'Duplicar'}</button>}
        {p && <button type="button" className="rounded-lg bg-red-700 px-3 py-2 font-semibold text-white" onClick={excluir}>Excluir</button>}
      </div>
    </form>
  )
}

function AbaCardapio({ loja }: { loja: Loja }) {
  const [cats, setCats] = useState<Cat[]>([])
  const [prods, setProds] = useState<Prod[]>([])
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [ligacoes, setLigacoes] = useState<Record<string, string[]>>({})
  const [sugestoes, setSugestoes] = useState<Record<string, string[]>>({})
  const [diasHabilitados, setDiasHabilitados] = useState<number[]>([0, 1, 2, 3, 4, 5, 6])
  const [erro, setErro] = useState('')
  const [nova, setNova] = useState('')
  const [busca, setBusca] = useState('')
  const carregar = useCallback(async () => {
    const [c, p, g, h] = await Promise.all([
      supabase.from('categorias').select('id,nome,ordem').eq('loja_id', loja.id).order('ordem'),
      supabase.from('produtos').select('id,categoria_id,nome,descricao,preco,ativo,foto_url,dias_semana').eq('loja_id', loja.id).order('ordem').order('nome'),
      supabase.from('grupos_adicionais').select('id,nome,tipo,obrigatorio,maximo').eq('loja_id', loja.id).order('ordem'),
      supabase.from('horarios_funcionamento').select('dia_semana,fechado').eq('loja_id', loja.id),
    ])
    const e = c.error || p.error || g.error || h.error
    if (e) setErro(e.message)
    setCats(c.data ?? []); setProds((p.data as Prod[]) ?? []); setGrupos((g.data as Grupo[]) ?? [])
    const fechados = new Set((h.data ?? []).filter((d: any) => d.fechado).map((d: any) => d.dia_semana))
    setDiasHabilitados([0, 1, 2, 3, 4, 5, 6].filter(d => !fechados.has(d)))
    const l = await supabase.from('produto_grupos_adicionais').select('produto_id,grupo_id,produtos!inner(loja_id)').eq('produtos.loja_id', loja.id)
    if (l.error) setErro(l.error.message)
    else {
      const mapa: Record<string, string[]> = {}
      for (const row of (l.data as any[]) ?? []) (mapa[row.produto_id] ??= []).push(row.grupo_id)
      setLigacoes(mapa)
    }
    const s = await supabase.from('produto_sugestoes').select('produto_id,categoria_id,produtos!inner(loja_id)').eq('produtos.loja_id', loja.id)
    if (s.error) setErro(s.error.message)
    else {
      const mapa: Record<string, string[]> = {}
      for (const row of (s.data as any[]) ?? []) (mapa[row.produto_id] ??= []).push(row.categoria_id)
      setSugestoes(mapa)
    }
  }, [loja.id])
  useEffect(() => { carregar() }, [carregar])
  async function addCat(e: FormEvent) {
    e.preventDefault()
    if (!nova.trim()) return
    const { error } = await supabase.from('categorias').insert({ loja_id: loja.id, nome: nova.trim(), ordem: cats.length + 1 })
    if (error) setErro(error.message); else { registrarLog(loja.id, `Categoria criada: "${nova.trim()}"`); setNova(''); setErro(''); carregar() }
  }
  async function moverCat(indice: number, direcao: -1 | 1) {
    const alvo = indice + direcao
    if (alvo < 0 || alvo >= cats.length) return
    const a = cats[indice], b = cats[alvo]
    const [r1, r2] = await Promise.all([
      supabase.from('categorias').update({ ordem: b.ordem }).eq('id', a.id),
      supabase.from('categorias').update({ ordem: a.ordem }).eq('id', b.id),
    ])
    const e = r1.error || r2.error
    if (e) setErro(e.message); else { setErro(''); carregar() }
  }
  return (
    <section className="space-y-4">
      <Erro m={erro} />
      <input className={campo} placeholder="Buscar produto pelo nome..." value={busca} onChange={e => setBusca(e.target.value)} />
      <form onSubmit={addCat} className="flex gap-2">
        <input className={campo} placeholder="Nova categoria (ex.: Bebidas)" value={nova} onChange={e => setNova(e.target.value)} />
        <button className={botao}>Criar</button>
      </form>
      {cats.length === 0 ? <p className="rounded-xl bg-white p-4">Crie uma categoria para começar a cadastrar produtos.</p> : (
        <details className="rounded-xl bg-neutral-100 p-3">
          <summary className="cursor-pointer font-bold">Novo produto</summary>
          <div className="mt-3"><FormProduto loja={loja} cats={cats} grupos={grupos} diasHabilitados={diasHabilitados} feito={carregar} erro={setErro} /></div>
        </details>
      )}
      {cats.map((c, i) => {
        const buscaLimpa = busca.trim().toLowerCase()
        const produtosCategoria = prods.filter(p => p.categoria_id === c.id && (!buscaLimpa || p.nome.toLowerCase().includes(buscaLimpa)))
        if (buscaLimpa && produtosCategoria.length === 0) return null
        return (
          <div key={c.id}>
            <CategoriaLinha cat={c} loja={loja} qtdProdutos={prods.filter(p => p.categoria_id === c.id).length}
              qtdAtivos={prods.filter(p => p.categoria_id === c.id && p.ativo).length}
              podeSubir={i > 0} podeDescer={i < cats.length - 1} mover={d => moverCat(i, d)} feito={carregar} erro={setErro} />
            <div className="mt-2 space-y-2">
              {produtosCategoria.map(p => <FormProduto key={p.id + p.preco + p.nome + (ligacoes[p.id]?.join(',') ?? '') + (sugestoes[p.id]?.join(',') ?? '') + (p.dias_semana?.join(',') ?? '')} loja={loja} cats={cats} grupos={grupos} gruposIniciais={ligacoes[p.id] ?? []} sugestoesIniciais={sugestoes[p.id] ?? []} diasHabilitados={diasHabilitados} p={p} feito={carregar} erro={setErro} />)}
            </div>
          </div>
        )
      })}
      {busca.trim() && cats.every(c => prods.filter(p => p.categoria_id === c.id && p.nome.toLowerCase().includes(busca.trim().toLowerCase())).length === 0) && (
        <p className="rounded-xl bg-white p-4 text-neutral-600">Nenhum produto encontrado para "{busca.trim()}".</p>
      )}
    </section>
  )
}

function CategoriaLinha({ cat, loja, qtdProdutos, qtdAtivos, podeSubir, podeDescer, mover, feito, erro }: { cat: Cat; loja: Loja; qtdProdutos: number; qtdAtivos: number; podeSubir: boolean; podeDescer: boolean; mover: (d: -1 | 1) => void; feito: () => void; erro: (m: string) => void }) {
  const [editando, setEditando] = useState(false)
  const [nome, setNome] = useState(cat.nome)
  async function salvar(e: FormEvent) {
    e.preventDefault()
    if (!nome.trim()) return erro('Digite o nome da categoria.')
    const { error } = await supabase.from('categorias').update({ nome: nome.trim() }).eq('id', cat.id)
    if (error) return erro(error.message)
    erro(''); registrarLog(loja.id, `Categoria renomeada: "${cat.nome}" → "${nome.trim()}"`); setEditando(false); feito()
  }
  async function excluir() {
    const lembrete = qtdAtivos > 0
      ? ' Para apenas tirar os produtos dela do cardápio sem apagar nada, desmarque "Disponível no cardápio" em cada produto, em vez de excluir a categoria inteira.'
      : ''
    const aviso = (qtdProdutos > 0
      ? `Excluir a categoria "${cat.nome}"? Os ${qtdProdutos} produto(s) dela também serão excluídos.`
      : `Excluir a categoria "${cat.nome}"?`) + lembrete
    if (!confirm(aviso)) return
    const { error } = await supabase.from('categorias').delete().eq('id', cat.id)
    if (error) erro(error.message); else { erro(''); registrarLog(loja.id, `Categoria excluída: "${cat.nome}"${qtdProdutos > 0 ? ` (${qtdProdutos} produto(s) junto)` : ''}`); feito() }
  }
  if (editando) {
    return (
      <form onSubmit={salvar} className="flex gap-2">
        <input className={campo} value={nome} onChange={e => setNome(e.target.value)} autoFocus />
        <button className={botao}>Salvar</button>
        <button type="button" className={claro} onClick={() => { setNome(cat.nome); setEditando(false) }}>Cancelar</button>
      </form>
    )
  }
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-1">
        <div className="flex flex-col">
          <button type="button" aria-label={`Mover "${cat.nome}" para cima`} disabled={!podeSubir} onClick={() => mover(-1)} className="leading-none text-neutral-500 disabled:opacity-20">▲</button>
          <button type="button" aria-label={`Mover "${cat.nome}" para baixo`} disabled={!podeDescer} onClick={() => mover(1)} className="leading-none text-neutral-500 disabled:opacity-20">▼</button>
        </div>
        <h2 className="text-lg font-bold">{cat.nome}</h2>
      </div>
      <div className="flex gap-2 text-sm">
        <button type="button" className={claro} onClick={() => setEditando(true)}>Editar</button>
        <button type="button" className={claro} onClick={excluir}>Excluir</button>
      </div>
    </div>
  )
}

function FormZona({ loja, z, feito, erro }: { loja: Loja; z?: Zona; feito: () => void; erro: (m: string) => void }) {
  const [bairro, setBairro] = useState(z?.bairro ?? '')
  const [taxa, setTaxa] = useState(z ? String(z.taxa).replace('.', ',') : '')
  async function salvar(e: FormEvent) {
    e.preventDefault()
    const v = NUM(taxa)
    if (!bairro.trim() || taxa.trim() === '' || !(v >= 0)) return erro('Informe o bairro e a taxa de entrega.')
    const dados = { bairro: bairro.trim(), taxa: v }
    const { error } = z ? await supabase.from('zonas_entrega').update(dados).eq('id', z.id) : await supabase.from('zonas_entrega').insert({ ...dados, loja_id: loja.id })
    if (error) return erro(error.message)
    erro('')
    registrarLog(loja.id, z ? `Bairro editado: "${dados.bairro}"` : `Bairro criado: "${dados.bairro}"`)
    if (!z) { setBairro(''); setTaxa('') }
    feito()
  }
  async function excluir() {
    if (!z || !confirm(`Excluir o bairro "${z.bairro}"?`)) return
    const { error } = await supabase.from('zonas_entrega').delete().eq('id', z.id)
    if (error) erro(error.message); else { registrarLog(loja.id, `Bairro excluído: "${z.bairro}"`); feito() }
  }
  return (
    <form onSubmit={salvar} className="grid grid-cols-[1fr_7rem] gap-2 rounded-xl border border-neutral-200 bg-white p-3">
      <input className={campo} placeholder="Bairro" value={bairro} onChange={e => setBairro(e.target.value)} />
      <input className={campo} placeholder="Taxa, ex.: 5" inputMode="decimal" value={taxa} onChange={e => setTaxa(e.target.value)} />
      <div className="col-span-2 flex gap-2">
        <button className={botao}>{z ? 'Salvar' : 'Adicionar bairro'}</button>
        {z && <button type="button" className={claro} onClick={excluir}>Excluir</button>}
      </div>
    </form>
  )
}

function AbaBairros({ loja }: { loja: Loja }) {
  const [zonas, setZonas] = useState<Zona[]>([])
  const [erro, setErro] = useState('')
  const carregar = useCallback(async () => {
    const { data, error } = await supabase.from('zonas_entrega').select('id,bairro,taxa').eq('loja_id', loja.id).order('bairro')
    if (error) setErro(error.message); else setZonas(data as Zona[])
  }, [loja.id])
  useEffect(() => { carregar() }, [carregar])
  return (
    <section className="space-y-3">
      <p>Bairros atendidos e a taxa de entrega de cada um.</p>
      <Erro m={erro} />
      <FormZona loja={loja} feito={carregar} erro={setErro} />
      {zonas.map(z => <FormZona key={z.id + z.taxa + z.bairro} loja={loja} z={z} feito={carregar} erro={setErro} />)}
    </section>
  )
}

function AbaAdicionais({ loja }: { loja: Loja }) {
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [itens, setItens] = useState<ItemAd[]>([])
  const [erro, setErro] = useState('')
  const [nome, setNome] = useState('')
  const [tipo, setTipo] = useState<'unica' | 'multipla'>('unica')
  const [obrigatorio, setObrigatorio] = useState(false)
  const [maximo, setMaximo] = useState('')
  const carregar = useCallback(async () => {
    const [g, i] = await Promise.all([
      supabase.from('grupos_adicionais').select('id,nome,tipo,obrigatorio,maximo').eq('loja_id', loja.id).order('ordem'),
      supabase.from('itens_adicionais').select('id,grupo_id,nome,preco,permite_quantidade,quantidade_maxima,ativo,grupos_adicionais!inner(loja_id)').eq('grupos_adicionais.loja_id', loja.id).order('ordem'),
    ])
    const e = g.error || i.error
    if (e) setErro(e.message)
    setGrupos((g.data as Grupo[]) ?? []); setItens((i.data as any) ?? [])
  }, [loja.id])
  useEffect(() => { carregar() }, [carregar])
  async function criarGrupo(e: FormEvent) {
    e.preventDefault()
    if (!nome.trim()) return setErro('Digite o nome do grupo.')
    const max = tipo === 'multipla' && maximo.trim() ? parseInt(maximo, 10) : null
    const { error } = await supabase.from('grupos_adicionais').insert({ loja_id: loja.id, nome: nome.trim(), tipo, obrigatorio, maximo: max, ordem: grupos.length + 1 })
    if (error) return setErro(error.message)
    registrarLog(loja.id, `Grupo de adicionais criado: "${nome.trim()}"`)
    setErro(''); setNome(''); setTipo('unica'); setObrigatorio(false); setMaximo(''); carregar()
  }
  return (
    <section className="space-y-4">
      <p className="text-sm text-neutral-600">Cadastre aqui os adicionais (ex.: "Escolha o sabor", "Adicionais extras"). Depois, na aba Cardápio, marque em cada produto quais adicionais ele usa.</p>
      <Erro m={erro} />
      <form onSubmit={criarGrupo} className="grid gap-2 rounded-xl border border-neutral-200 bg-white p-3">
        <span className="font-semibold">Novo grupo de adicionais</span>
        <input className={campo} placeholder='Nome do grupo, ex.: "Molhos"' value={nome} onChange={e => setNome(e.target.value)} />
        <div className="grid grid-cols-2 gap-2">
          <select className={campo} value={tipo} onChange={e => setTipo(e.target.value as 'unica' | 'multipla')}>
            <option value="unica">Seleção única (o cliente escolhe 1)</option>
            <option value="multipla">Seleção múltipla (o cliente escolhe vários)</option>
          </select>
          {tipo === 'multipla' && <input className={campo} placeholder="Limite de itens (opcional)" inputMode="numeric" value={maximo} onChange={e => setMaximo(e.target.value.replace(/\D/g, ''))} />}
        </div>
        <label className="flex items-center gap-2"><input type="checkbox" checked={obrigatorio} onChange={e => setObrigatorio(e.target.checked)} /> Obrigatório (o cliente precisa escolher para finalizar)</label>
        <button className={botao}>Criar grupo</button>
      </form>
      {grupos.map(g => (
        <div key={g.id} className="rounded-xl border border-neutral-200 bg-white p-3">
          <GrupoLinha grupo={g} loja={loja} feito={carregar} erro={setErro} />
          <div className="mt-2 space-y-2 pl-2">
            {itens.filter(i => i.grupo_id === g.id).map(i => <FormItemAdicional key={i.id + i.nome + i.preco} grupoId={g.id} loja={loja} item={i} feito={carregar} erro={setErro} />)}
            <details className="rounded-lg bg-neutral-100 p-2">
              <summary className="cursor-pointer text-sm font-semibold">Novo item neste grupo</summary>
              <div className="mt-2"><FormItemAdicional grupoId={g.id} loja={loja} feito={carregar} erro={setErro} /></div>
            </details>
          </div>
        </div>
      ))}
    </section>
  )
}

function GrupoLinha({ grupo, loja, feito, erro }: { grupo: Grupo; loja: Loja; feito: () => void; erro: (m: string) => void }) {
  const [editando, setEditando] = useState(false)
  const [nome, setNome] = useState(grupo.nome)
  const [tipo, setTipo] = useState(grupo.tipo)
  const [obrigatorio, setObrigatorio] = useState(grupo.obrigatorio)
  const [maximo, setMaximo] = useState(grupo.maximo ? String(grupo.maximo) : '')
  async function salvar(e: FormEvent) {
    e.preventDefault()
    if (!nome.trim()) return erro('Digite o nome do grupo.')
    const max = tipo === 'multipla' && maximo.trim() ? parseInt(maximo, 10) : null
    const { error } = await supabase.from('grupos_adicionais').update({ nome: nome.trim(), tipo, obrigatorio, maximo: max }).eq('id', grupo.id)
    if (error) return erro(error.message)
    erro(''); registrarLog(loja.id, `Grupo de adicionais editado: "${grupo.nome}"${grupo.nome !== nome.trim() ? ` → "${nome.trim()}"` : ''}`); setEditando(false); feito()
  }
  async function excluir() {
    if (!confirm(`Excluir o grupo "${grupo.nome}"? Os itens dele também serão excluídos.`)) return
    const { error } = await supabase.from('grupos_adicionais').delete().eq('id', grupo.id)
    if (error) erro(error.message); else { erro(''); registrarLog(loja.id, `Grupo de adicionais excluído: "${grupo.nome}"`); feito() }
  }
  if (editando) {
    return (
      <form onSubmit={salvar} className="grid gap-2">
        <input className={campo} value={nome} onChange={e => setNome(e.target.value)} autoFocus />
        <div className="grid grid-cols-2 gap-2">
          <select className={campo} value={tipo} onChange={e => setTipo(e.target.value as 'unica' | 'multipla')}>
            <option value="unica">Seleção única</option>
            <option value="multipla">Seleção múltipla</option>
          </select>
          {tipo === 'multipla' && <input className={campo} placeholder="Limite (opcional)" inputMode="numeric" value={maximo} onChange={e => setMaximo(e.target.value.replace(/\D/g, ''))} />}
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={obrigatorio} onChange={e => setObrigatorio(e.target.checked)} /> Obrigatório</label>
        <div className="flex gap-2">
          <button className={botao}>Salvar</button>
          <button type="button" className={claro} onClick={() => setEditando(false)}>Cancelar</button>
        </div>
      </form>
    )
  }
  return (
    <div className="flex items-center justify-between gap-2">
      <div>
        <h3 className="font-bold">{grupo.nome}</h3>
        <p className="text-sm text-neutral-500">{grupo.tipo === 'unica' ? 'Seleção única' : `Seleção múltipla${grupo.maximo ? `, até ${grupo.maximo}` : ', sem limite'}`}{grupo.obrigatorio ? ' · Obrigatório' : ''}</p>
      </div>
      <div className="flex gap-2 text-sm">
        <button type="button" className={claro} onClick={() => setEditando(true)}>Editar</button>
        <button type="button" className={claro} onClick={excluir}>Excluir</button>
      </div>
    </div>
  )
}

function FormItemAdicional({ grupoId, loja, item, feito, erro }: { grupoId: string; loja: Loja; item?: ItemAd; feito: () => void; erro: (m: string) => void }) {
  const [nome, setNome] = useState(item?.nome ?? '')
  const [preco, setPreco] = useState(item ? String(item.preco).replace('.', ',') : '')
  const [permiteQtd, setPermiteQtd] = useState(item?.permite_quantidade ?? false)
  const [qtdMax, setQtdMax] = useState(item ? String(item.quantidade_maxima) : '3')
  const [ativo, setAtivo] = useState(item?.ativo ?? true)
  async function salvar(e: FormEvent) {
    e.preventDefault()
    const p = NUM(preco || '0')
    if (!nome.trim() || !(p >= 0)) return erro('Informe o nome e o preço do item (pode ser 0).')
    const max = permiteQtd ? Math.max(1, parseInt(qtdMax, 10) || 1) : 1
    const dados = { nome: nome.trim(), preco: p, permite_quantidade: permiteQtd, quantidade_maxima: max, ativo }
    const { error } = item ? await supabase.from('itens_adicionais').update(dados).eq('id', item.id) : await supabase.from('itens_adicionais').insert({ ...dados, grupo_id: grupoId })
    if (error) return erro(error.message)
    erro('')
    registrarLog(loja.id, item ? `Item de adicional editado: "${dados.nome}"` : `Item de adicional criado: "${dados.nome}"`)
    if (!item) { setNome(''); setPreco(''); setPermiteQtd(false); setQtdMax('3'); setAtivo(true) }
    feito()
  }
  async function excluir() {
    if (!item || !confirm(`Excluir "${item.nome}"?`)) return
    const { error } = await supabase.from('itens_adicionais').delete().eq('id', item.id)
    if (error) erro(error.message); else { registrarLog(loja.id, `Item de adicional excluído: "${item.nome}"`); feito() }
  }
  return (
    <form onSubmit={salvar} className="grid gap-2 rounded-lg border border-neutral-200 bg-white p-2">
      <div className="grid grid-cols-2 gap-2">
        <input className={campo} placeholder="Nome, ex.: Bacon extra" value={nome} onChange={e => setNome(e.target.value)} />
        <input className={campo} placeholder="Preço extra, ex.: 4,00 (ou 0)" inputMode="decimal" value={preco} onChange={e => setPreco(e.target.value)} />
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={permiteQtd} onChange={e => setPermiteQtd(e.target.checked)} /> Permitir escolher quantidade (ex.: 2x bacon)</label>
      {permiteQtd && (
        <label className="flex items-center gap-2 text-sm">Quantidade máxima:
          <input className={campo + ' w-20'} inputMode="numeric" value={qtdMax} onChange={e => setQtdMax(e.target.value.replace(/\D/g, ''))} />
        </label>
      )}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={ativo} onChange={e => setAtivo(e.target.checked)} /> Disponível</label>
      <div className="flex gap-2">
        <button className={botao}>{item ? 'Salvar' : 'Adicionar item'}</button>
        {item && <button type="button" className={claro} onClick={excluir}>Excluir</button>}
      </div>
    </form>
  )
}

function AbaLoja({ loja, salvo }: { loja: Loja; salvo: (l: Loja) => void }) {
  const [whatsapp, setWhatsapp] = useState(loja.whatsapp)
  const [endereco, setEndereco] = useState(loja.endereco ?? '')
  const [retirada, setRetirada] = useState(loja.aceita_retirada)
  const [impressora, setImpressora] = useState(loja.impressora ?? '')
  const [imprimeViaCozinha, setImprimeViaCozinha] = useState(loja.imprime_via_cozinha)
  const [viasImpressao, setViasImpressao] = useState(String(loja.vias_impressao ?? 1))
  const [email, setEmail] = useState(loja.email ?? '')
  const [cpfCnpj, setCpfCnpj] = useState(loja.cpf_cnpj ?? '')
  const [logoUrl, setLogoUrl] = useState(loja.logo_url)
  const [cor, setCor] = useState(loja.cor)
  const [logoArquivo, setLogoArquivo] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [enviandoLogo, setEnviandoLogo] = useState(false)
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState(false)
  const [formasPag, setFormasPag] = useState<FormaPagamento[]>([])
  const [erroPag, setErroPag] = useState('')
  const carregarFormasPag = useCallback(async () => {
    const { data, error } = await supabase.from('formas_pagamento').select('id,nome,aceita_troco,ordem').eq('loja_id', loja.id).order('ordem')
    if (error) setErroPag(error.message); else setFormasPag(data as FormaPagamento[])
  }, [loja.id])
  useEffect(() => { carregarFormasPag() }, [carregarFormasPag])
  const [redes, setRedes] = useState<RedeSocial[]>([])
  const [erroRedes, setErroRedes] = useState('')
  const carregarRedes = useCallback(async () => {
    const { data, error } = await supabase.from('redes_sociais').select('id,rede,url,ordem').eq('loja_id', loja.id).order('ordem')
    if (error) setErroRedes(error.message); else setRedes(data as RedeSocial[])
  }, [loja.id])
  useEffect(() => { carregarRedes() }, [carregarRedes])
  const [cats, setCats] = useState<Cat[]>([])
  const [prods, setProds] = useState<Prod[]>([])
  useEffect(() => {
    supabase.from('categorias').select('id,nome,ordem').eq('loja_id', loja.id).order('ordem').then(({ data }) => setCats((data as Cat[]) ?? []))
    supabase.from('produtos').select('id,categoria_id,nome,descricao,preco,ativo,foto_url,dias_semana').eq('loja_id', loja.id).order('ordem').then(({ data }) => setProds((data as Prod[]) ?? []))
  }, [loja.id])
  const [cupons, setCupons] = useState<Cupom[]>([])
  const [erroCupons, setErroCupons] = useState('')
  const carregarCupons = useCallback(async () => {
    const { data, error } = await supabase.from('cupons').select('id,codigo,tipo,valor,aplica_em,valido_de,valido_ate,limite_uso_total,limite_uso_por_cliente,ativo,ordem,cupom_produtos(produto_id),cupom_categorias(categoria_id)').eq('loja_id', loja.id).order('ordem')
    if (error) setErroCupons(error.message); else setCupons(data as unknown as Cupom[])
  }, [loja.id])
  useEffect(() => { carregarCupons() }, [carregarCupons])
  function escolherLogo(arquivo: File | undefined) {
    if (!arquivo) return
    if (!arquivo.type.startsWith('image/')) return setErro('Escolha um arquivo de imagem (JPG, PNG ou WEBP).')
    if (arquivo.size > TAM_MAX_FOTO) return setErro('A imagem precisa ter até 5 MB.')
    setErro('')
    setLogoArquivo(arquivo)
    setLogoPreview(URL.createObjectURL(arquivo))
  }
  function removerLogo() {
    setLogoArquivo(null)
    setLogoPreview(null)
    setLogoUrl(null)
  }
  async function salvar(e: FormEvent) {
    e.preventDefault(); setOk(false)
    if (!/^[0-9]{12,13}$/.test(whatsapp)) return setErro('WhatsApp: use só números, com 55 e o DDD. Exemplo: 5511940104824.')
    if (!/^#[0-9a-fA-F]{6}$/.test(cor)) return setErro('Cor do tema: use um código no formato #RRGGBB, por exemplo #7C4CAF.')
    let logo_url = logoUrl
    if (logoArquivo) {
      setEnviandoLogo(true)
      const ext = logoArquivo.name.split('.').pop() || 'jpg'
      const caminho = `${loja.id}/logo-${crypto.randomUUID()}.${ext}`
      const { error: erroEnvio } = await supabase.storage.from('produtos').upload(caminho, logoArquivo, { upsert: false })
      setEnviandoLogo(false)
      if (erroEnvio) return setErro('Não foi possível enviar o logo: ' + erroEnvio.message)
      logo_url = supabase.storage.from('produtos').getPublicUrl(caminho).data.publicUrl
    }
    const vias = Math.min(5, Math.max(1, Number(viasImpressao) || 1))
    const dados = { whatsapp, endereco: endereco.trim() || null, aceita_retirada: retirada, impressora: impressora.trim() || null, logo_url, email: email.trim() || null, cpf_cnpj: cpfCnpj.trim() || null, imprime_via_cozinha: imprimeViaCozinha, vias_impressao: vias, cor }
    const { error } = await supabase.from('lojas').update(dados).eq('id', loja.id)
    if (error) return setErro(error.message)
    setErro(''); setOk(true); setLogoArquivo(null); setLogoPreview(null); setLogoUrl(logo_url); setViasImpressao(String(vias)); salvo({ ...loja, ...dados })
    registrarLog(loja.id, 'Dados da loja atualizados')
  }
  const mostrarLogo = logoPreview || logoUrl
  return (
    <div className="space-y-6">
    <form onSubmit={salvar} className="space-y-3">
      <div>
        <span className="mb-1 block font-semibold">Logo da loja</span>
        <p className="mb-2 text-sm text-neutral-600">Aparece ao lado do nome da loja, no topo da tela onde o cliente faz o pedido.</p>
        <div className="flex items-center gap-3">
          {mostrarLogo ? (
            <img src={mostrarLogo} alt="" className="h-16 w-16 rounded-lg border border-neutral-300 bg-black object-contain" />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-neutral-300 text-xs text-neutral-400">sem logo</div>
          )}
          <div className="flex flex-col gap-1">
            <label className={`${claro} cursor-pointer text-center text-sm`}>
              {mostrarLogo ? 'Trocar logo' : 'Enviar logo'}
              <input type="file" accept="image/*" className="hidden" onChange={e => escolherLogo(e.target.files?.[0])} />
            </label>
            {mostrarLogo && <button type="button" className="text-sm text-neutral-600 underline" onClick={removerLogo}>Remover logo</button>}
            {enviandoLogo && <span className="text-sm text-neutral-500">Enviando...</span>}
          </div>
        </div>
      </div>
      <div>
        <span className="mb-1 block font-semibold">Cor do tema da loja</span>
        <p className="mb-2 text-sm text-neutral-600">Usada nos botões e destaques do cardápio que o cliente vê.</p>
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={/^#[0-9a-fA-F]{6}$/.test(cor) ? cor : '#C9A24B'}
            onChange={e => setCor(e.target.value)}
            className="h-10 w-14 cursor-pointer rounded border border-neutral-300 p-0"
            aria-label="Selecionar cor do tema"
          />
          <input
            className={`${campo} w-32`}
            value={cor}
            onChange={e => setCor(e.target.value)}
            placeholder="#7C4CAF"
            maxLength={7}
          />
        </div>
      </div>
      <label className="block"><span className="font-semibold">WhatsApp que recebe os pedidos</span>
        <input className={campo} inputMode="numeric" value={whatsapp} onChange={e => setWhatsapp(e.target.value.replace(/\D/g, ''))} /></label>
      <label className="block"><span className="font-semibold">Endereço da loja</span>
        <input className={campo} value={endereco} onChange={e => setEndereco(e.target.value)} /></label>
      <label className="block"><span className="font-semibold">E-mail</span>
        <input type="email" className={campo} placeholder="contato@sualoja.com.br" value={email} onChange={e => setEmail(e.target.value)} /></label>
      <label className="block"><span className="font-semibold">CPF ou CNPJ</span>
        <input className={campo} placeholder="Só números ou com pontuação" value={cpfCnpj} onChange={e => setCpfCnpj(e.target.value)} /></label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={retirada} onChange={e => setRetirada(e.target.checked)} /> Aceitar retirada na loja</label>
      <label className="block"><span className="font-semibold">Impressora dos pedidos</span>
        <input className={campo} placeholder="Ex.: Impressora térmica do balcão" value={impressora} onChange={e => setImpressora(e.target.value)} />
        <span className="mt-1 block text-sm text-neutral-600">
          Digite aqui o nome da impressora tal como ela aparece no computador da loja (é só uma anotação, para lembrar qual escolher). Depois, no computador, deixe essa impressora marcada como <b>impressora padrão</b> do Windows ou Mac: é ela que vai receber os pedidos quando a impressão automática estiver ligada.
        </span></label>
      <div className="flex flex-wrap items-end gap-4">
        <label className="block"><span className="font-semibold">Quantidade de vias do pedido</span>
          <input type="number" min={1} max={5} className={campo + ' w-24'} value={viasImpressao} onChange={e => setViasImpressao(e.target.value.replace(/\D/g, ''))} /></label>
        <button type="button" aria-pressed={imprimeViaCozinha} onClick={() => setImprimeViaCozinha(v => !v)} className={imprimeViaCozinha ? botao : claro}>
          Via extra para a cozinha: {imprimeViaCozinha ? 'ligada' : 'desligada'}
        </button>
      </div>
      <p className="text-sm text-neutral-600">
        "Quantidade de vias" é quantas cópias com preço saem por pedido (a maioria usa 1, mas dá pra colocar 2 ou 3). A "via extra para a cozinha" é uma cópia a mais, sem preço nem telefone do cliente, que sai depois das anteriores — desligue se você não separa a via da cozinha.
      </p>
      <Erro m={erro} />
      {ok && <p role="status" className="rounded-lg bg-green-100 p-3 text-green-800">Dados salvos.</p>}
      <button className={botao}>Salvar</button>
      <details className="rounded-xl border border-neutral-200 bg-white p-3">
        <summary className="cursor-pointer font-bold">Imprimir sem a janela de impressão aparecer a cada pedido</summary>
        <div className="mt-2 space-y-2 text-sm text-neutral-700">
          <p>Isso é feito uma vez só, no computador da loja, com Google Chrome ou Microsoft Edge. Depois disso, o pedido sai direto na impressora, sem precisar clicar em nada.</p>
          <ol className="list-decimal space-y-2 pl-5">
            <li>No Windows ou Mac, instale a impressora e deixe-a marcada como <b>impressora padrão</b>.</li>
            <li>Feche todas as janelas do Chrome (ou Edge).</li>
            <li>Crie um atalho para o navegador na Área de Trabalho (clique com o botão direito nele na barra de tarefas ou no menu iniciar &gt; "Abrir local do arquivo", copie o atalho para a Área de Trabalho).</li>
            <li>Clique com o botão direito nesse atalho novo &gt; <b>Propriedades</b>. No campo <b>Destino</b>, depois das aspas finais, cole um espaço e:{' '}
              <code className="rounded bg-neutral-100 px-1">--kiosk-printing https://app.getzapdelivery.com.br/painel</code>
            </li>
            <li>Clique em OK e sempre abra o painel por esse atalho, nunca pelo ícone comum do navegador.</li>
            <li>Na aba <b>Pedidos</b>, ligue a <b>impressão automática</b> e clique em <b>Imprimir teste</b> para conferir.</li>
          </ol>
          <p>Se um dia isso parar de funcionar (por exemplo, depois de uma atualização do navegador), volte aqui e me avise.</p>
        </div>
      </details>
    </form>
    <section className="space-y-3 rounded-xl border border-neutral-200 bg-white p-3">
      <h3 className="font-bold">Formas de pagamento</h3>
      <p className="text-sm text-neutral-600">As opções que o cliente vê na hora de fechar o pedido. Marque "Permite troco" só nas formas em dinheiro, para o campo "Troco para quanto?" aparecer na tela do cliente.</p>
      <Erro m={erroPag} />
      <FormFormaPagamento loja={loja} proximaOrdem={formasPag.length + 1} feito={carregarFormasPag} erro={setErroPag} />
      {formasPag.map(fp => <FormFormaPagamento key={fp.id + fp.nome + fp.aceita_troco} loja={loja} fp={fp} feito={carregarFormasPag} erro={setErroPag} />)}
    </section>
    <section className="space-y-3 rounded-xl border border-neutral-200 bg-white p-3">
      <h3 className="font-bold">Redes sociais</h3>
      <p className="text-sm text-neutral-600">Aparecem como ícones no rodapé da tela do cliente, linkados para as páginas cadastradas aqui.</p>
      <Erro m={erroRedes} />
      <FormRedeSocial loja={loja} usadas={redes.map(r => r.rede)} proximaOrdem={redes.length + 1} feito={carregarRedes} erro={setErroRedes} />
      {redes.map(r => <FormRedeSocial key={r.id + r.rede + r.url} loja={loja} r={r} usadas={redes.map(x => x.rede)} feito={carregarRedes} erro={setErroRedes} />)}
    </section>
    <section className="space-y-3 rounded-xl border border-neutral-200 bg-white p-3">
      <h3 className="font-bold">Cupons de desconto</h3>
      <p className="text-sm text-neutral-600">O cliente digita o código na tela do pedido. Pode ser desconto percentual, em reais, ou frete grátis; com validade, limite de uso e podendo valer só para produtos ou categorias específicos.</p>
      <Erro m={erroCupons} />
      <FormCupom loja={loja} cats={cats} prods={prods} proximaOrdem={cupons.length + 1} feito={carregarCupons} erro={setErroCupons} />
      {cupons.map(c => <FormCupom key={c.id} loja={loja} cupom={c} cats={cats} prods={prods} feito={carregarCupons} erro={setErroCupons} />)}
    </section>
    </div>
  )
}

function FormFormaPagamento({ loja, fp, proximaOrdem, feito, erro }: { loja: Loja; fp?: FormaPagamento; proximaOrdem?: number; feito: () => void; erro: (m: string) => void }) {
  const [nome, setNome] = useState(fp?.nome ?? '')
  const [aceitaTroco, setAceitaTroco] = useState(fp?.aceita_troco ?? false)
  async function salvar(e: FormEvent) {
    e.preventDefault()
    if (!nome.trim()) return erro('Informe o nome da forma de pagamento.')
    const dados = { nome: nome.trim(), aceita_troco: aceitaTroco }
    const { error } = fp
      ? await supabase.from('formas_pagamento').update(dados).eq('id', fp.id)
      : await supabase.from('formas_pagamento').insert({ ...dados, loja_id: loja.id, ordem: proximaOrdem ?? 1 })
    if (error) return erro(error.message)
    erro('')
    registrarLog(loja.id, fp ? `Forma de pagamento editada: "${dados.nome}"` : `Forma de pagamento criada: "${dados.nome}"`)
    if (!fp) { setNome(''); setAceitaTroco(false) }
    feito()
  }
  async function excluir() {
    if (!fp || !confirm(`Excluir "${fp.nome}"?`)) return
    const { error } = await supabase.from('formas_pagamento').delete().eq('id', fp.id)
    if (error) erro(error.message); else { registrarLog(loja.id, `Forma de pagamento excluída: "${fp.nome}"`); feito() }
  }
  return (
    <form onSubmit={salvar} className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-lg border border-neutral-200 p-2">
      <input className={campo} placeholder='Nome, ex.: "Pix na entrega"' value={nome} onChange={e => setNome(e.target.value)} />
      <label className="flex items-center gap-1 whitespace-nowrap text-sm"><input type="checkbox" checked={aceitaTroco} onChange={e => setAceitaTroco(e.target.checked)} /> Permite troco</label>
      <div className="col-span-2 flex gap-2">
        <button className={botao}>{fp ? 'Salvar' : 'Adicionar forma de pagamento'}</button>
        {fp && <button type="button" className={claro} onClick={excluir}>Excluir</button>}
      </div>
    </form>
  )
}

function FormRedeSocial({ loja, r, usadas, proximaOrdem, feito, erro }: { loja: Loja; r?: RedeSocial; usadas: Rede[]; proximaOrdem?: number; feito: () => void; erro: (m: string) => void }) {
  const [rede, setRede] = useState<Rede>(r?.rede ?? (REDES.find(([id]) => !usadas.includes(id))?.[0] ?? 'instagram'))
  const [url, setUrl] = useState(r?.url ?? '')
  const disponiveis = REDES.filter(([id]) => id === r?.rede || !usadas.includes(id))
  async function salvar(e: FormEvent) {
    e.preventDefault()
    if (!url.trim()) return erro('Informe o link.')
    const dados = { rede, url: url.trim() }
    const { error } = r
      ? await supabase.from('redes_sociais').update(dados).eq('id', r.id)
      : await supabase.from('redes_sociais').insert({ ...dados, loja_id: loja.id, ordem: proximaOrdem ?? 1 })
    if (error) return erro(error.message)
    erro('')
    registrarLog(loja.id, r ? `Rede social editada: ${REDES.find(([id]) => id === rede)?.[1]}` : `Rede social adicionada: ${REDES.find(([id]) => id === rede)?.[1]}`)
    if (!r) setUrl('')
    feito()
  }
  async function excluir() {
    if (!r || !confirm(`Excluir o link do ${REDES.find(([id]) => id === r.rede)?.[1]}?`)) return
    const { error } = await supabase.from('redes_sociais').delete().eq('id', r.id)
    if (error) erro(error.message); else { registrarLog(loja.id, `Rede social excluída: ${REDES.find(([id]) => id === r.rede)?.[1]}`); feito() }
  }
  if (!r && disponiveis.length === 0) return null
  return (
    <form onSubmit={salvar} className="grid grid-cols-[8rem_1fr] gap-2 rounded-lg border border-neutral-200 p-2">
      <select className={campo} value={rede} onChange={e => setRede(e.target.value as Rede)}>
        {disponiveis.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
      </select>
      <input className={campo} placeholder="https://..." value={url} onChange={e => setUrl(e.target.value)} />
      <div className="col-span-2 flex gap-2">
        <button className={botao}>{r ? 'Salvar' : 'Adicionar rede social'}</button>
        {r && <button type="button" className={claro} onClick={excluir}>Excluir</button>}
      </div>
    </form>
  )
}

function FormCupom({ loja, cupom, cats, prods, proximaOrdem, feito, erro }: { loja: Loja; cupom?: Cupom; cats: Cat[]; prods: Prod[]; proximaOrdem?: number; feito: () => void; erro: (m: string) => void }) {
  const [aberto, setAberto] = useState(!cupom)
  const [codigo, setCodigo] = useState(cupom?.codigo ?? '')
  const [tipo, setTipo] = useState<TipoCupom>(cupom?.tipo ?? 'percentual')
  const [valor, setValor] = useState(cupom ? String(cupom.valor) : '')
  const [aplicaEm, setAplicaEm] = useState<AplicaEm>(cupom?.aplica_em ?? 'pedido')
  const [validoDe, setValidoDe] = useState(cupom?.valido_de ?? '')
  const [validoAte, setValidoAte] = useState(cupom?.valido_ate ?? '')
  const [limiteTotal, setLimiteTotal] = useState(cupom?.limite_uso_total != null ? String(cupom.limite_uso_total) : '')
  const [limitePorCliente, setLimitePorCliente] = useState(cupom?.limite_uso_por_cliente != null ? String(cupom.limite_uso_por_cliente) : '1')
  const [ativo, setAtivo] = useState(cupom?.ativo ?? true)
  const [produtosSel, setProdutosSel] = useState<string[]>(cupom?.cupom_produtos.map(x => x.produto_id) ?? [])
  const [categoriasSel, setCategoriasSel] = useState<string[]>(cupom?.cupom_categorias.map(x => x.categoria_id) ?? [])
  const [salvando, setSalvando] = useState(false)
  function alternar(lista: string[], set: (v: string[]) => void, id: string) {
    set(lista.includes(id) ? lista.filter(x => x !== id) : [...lista, id])
  }
  async function salvar(e: FormEvent) {
    e.preventDefault()
    if (!codigo.trim()) return erro('Informe o código do cupom.')
    if (tipo !== 'frete_gratis') {
      const n = NUM(valor)
      if (!(n > 0)) return erro('Informe o valor do desconto.')
      if (tipo === 'percentual' && n > 100) return erro('Desconto percentual não pode passar de 100.')
    }
    if (aplicaEm === 'produtos' && produtosSel.length === 0 && categoriasSel.length === 0) {
      return erro('Marque ao menos um produto ou categoria, ou escolha "Pedido inteiro".')
    }
    setSalvando(true)
    const dados = {
      codigo: codigo.trim().toUpperCase(),
      tipo, valor: tipo === 'frete_gratis' ? 0 : NUM(valor),
      aplica_em: tipo === 'frete_gratis' ? 'pedido' : aplicaEm,
      valido_de: validoDe || null, valido_ate: validoAte || null,
      limite_uso_total: limiteTotal.trim() ? Number(limiteTotal) : null,
      limite_uso_por_cliente: limitePorCliente.trim() ? Number(limitePorCliente) : null,
      ativo,
    }
    let cupomId = cupom?.id
    if (cupom) {
      const { error } = await supabase.from('cupons').update(dados).eq('id', cupom.id)
      if (error) { setSalvando(false); return erro(error.message) }
      await supabase.from('cupom_produtos').delete().eq('cupom_id', cupom.id)
      await supabase.from('cupom_categorias').delete().eq('cupom_id', cupom.id)
    } else {
      const { data, error } = await supabase.from('cupons').insert({ ...dados, loja_id: loja.id, ordem: proximaOrdem ?? 1 }).select('id').single()
      if (error) { setSalvando(false); return erro(error.message) }
      cupomId = data.id
    }
    if (dados.aplica_em === 'produtos' && cupomId) {
      if (produtosSel.length) await supabase.from('cupom_produtos').insert(produtosSel.map(produto_id => ({ cupom_id: cupomId, produto_id })))
      if (categoriasSel.length) await supabase.from('cupom_categorias').insert(categoriasSel.map(categoria_id => ({ cupom_id: cupomId, categoria_id })))
    }
    setSalvando(false)
    erro('')
    registrarLog(loja.id, cupom ? `Cupom editado: "${dados.codigo}"` : `Cupom criado: "${dados.codigo}"`)
    if (!cupom) { setCodigo(''); setValor(''); setProdutosSel([]); setCategoriasSel([]); setAberto(false) }
    feito()
  }
  async function excluir() {
    if (!cupom || !confirm(`Excluir o cupom "${cupom.codigo}"?`)) return
    const { error } = await supabase.from('cupons').delete().eq('id', cupom.id)
    if (error) erro(error.message); else { registrarLog(loja.id, `Cupom excluído: "${cupom.codigo}"`); feito() }
  }
  if (cupom && !aberto) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-neutral-200 p-2">
        <div>
          <p className="font-semibold">{cupom.codigo} {!cupom.ativo && <span className="font-normal text-neutral-500">(inativo)</span>}</p>
          <p className="text-sm text-neutral-600">
            {cupom.tipo === 'percentual' && `${cupom.valor}% de desconto`}
            {cupom.tipo === 'fixo' && `${R(cupom.valor)} de desconto`}
            {cupom.tipo === 'frete_gratis' && 'Frete grátis'}
            {' · '}{cupom.aplica_em === 'produtos' ? 'Produtos/categorias selecionados' : 'Pedido inteiro'}
            {(cupom.valido_de || cupom.valido_ate) && ` · válido ${cupom.valido_de ? `de ${cupom.valido_de.split('-').reverse().join('/')} ` : ''}${cupom.valido_ate ? `até ${cupom.valido_ate.split('-').reverse().join('/')}` : ''}`}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button type="button" className={claro} onClick={() => setAberto(true)}>Editar</button>
          <button type="button" className={claro} onClick={excluir}>Excluir</button>
        </div>
      </div>
    )
  }
  return (
    <form onSubmit={salvar} className="space-y-2 rounded-lg border border-neutral-200 p-2">
      <div className="grid grid-cols-2 gap-2">
        <input className={campo} placeholder="Código, ex.: BEMVINDO10" value={codigo} onChange={e => setCodigo(e.target.value.toUpperCase())} />
        <select className={campo} value={tipo} onChange={e => setTipo(e.target.value as TipoCupom)}>
          <option value="percentual">Percentual (%)</option>
          <option value="fixo">Valor fixo (R$)</option>
          <option value="frete_gratis">Frete grátis</option>
        </select>
      </div>
      {tipo !== 'frete_gratis' && (
        <input className={campo} inputMode="decimal" placeholder={tipo === 'percentual' ? 'Ex.: 10 (= 10%)' : 'Ex.: 10,00'} value={valor} onChange={e => setValor(e.target.value)} />
      )}
      {tipo !== 'frete_gratis' && (
        <label className="block text-sm">
          <span className="font-semibold">Vale para</span>
          <select className={campo} value={aplicaEm} onChange={e => setAplicaEm(e.target.value as AplicaEm)}>
            <option value="pedido">Pedido inteiro</option>
            <option value="produtos">Produtos/categorias específicos</option>
          </select>
        </label>
      )}
      {tipo !== 'frete_gratis' && aplicaEm === 'produtos' && (
        <div className="space-y-2 rounded-lg bg-neutral-50 p-2">
          {cats.map(c => (
            <div key={c.id}>
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input type="checkbox" checked={categoriasSel.includes(c.id)} onChange={() => alternar(categoriasSel, setCategoriasSel, c.id)} /> {c.nome} (categoria inteira)
              </label>
              <div className="ml-6 flex flex-col gap-1">
                {prods.filter(p => p.categoria_id === c.id).map(p => (
                  <label key={p.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={produtosSel.includes(p.id)} disabled={categoriasSel.includes(c.id)} onChange={() => alternar(produtosSel, setProdutosSel, p.id)} /> {p.nome}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-sm"><span className="font-semibold">Válido de</span>
          <input type="date" className={campo} value={validoDe} onChange={e => setValidoDe(e.target.value)} /></label>
        <label className="block text-sm"><span className="font-semibold">Válido até</span>
          <input type="date" className={campo} value={validoAte} onChange={e => setValidoAte(e.target.value)} /></label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-sm"><span className="font-semibold">Limite de uso total</span>
          <input className={campo} inputMode="numeric" placeholder="Sem limite" value={limiteTotal} onChange={e => setLimiteTotal(e.target.value.replace(/\D/g, ''))} /></label>
        <label className="block text-sm"><span className="font-semibold">Limite por cliente</span>
          <input className={campo} inputMode="numeric" placeholder="Sem limite" value={limitePorCliente} onChange={e => setLimitePorCliente(e.target.value.replace(/\D/g, ''))} /></label>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={ativo} onChange={e => setAtivo(e.target.checked)} /> Cupom ativo</label>
      <div className="flex gap-2">
        <button disabled={salvando} className={botao}>{salvando ? 'Salvando…' : cupom ? 'Salvar' : 'Adicionar cupom'}</button>
        {cupom && <button type="button" className={claro} onClick={() => setAberto(false)}>Cancelar</button>}
      </div>
    </form>
  )
}

function Horarios({ loja }: { loja: Loja }) {
  const vazio = (): Horario[] => DIAS.map((_, dia_semana) => ({ dia_semana, abre: '18:00', fecha: '23:00', fechado: false }))
  const [dias, setDias] = useState<Horario[]>(vazio())
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  useEffect(() => {
    ;(async () => {
      const { data, error } = await supabase.from('horarios_funcionamento').select('dia_semana,abre,fecha,fechado').eq('loja_id', loja.id)
      if (error) return setErro(error.message)
      if (data && data.length) {
        setDias(vazio().map(d => { const h = data.find((x: any) => x.dia_semana === d.dia_semana); return h ? { dia_semana: d.dia_semana, abre: HM(h.abre), fecha: HM(h.fecha), fechado: h.fechado } : d }))
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loja.id])
  const set = (i: number, campoNome: keyof Horario, v: string | boolean) => setDias(ds => ds.map((d, k) => k === i ? { ...d, [campoNome]: v } : d))
  async function salvar(e: FormEvent) {
    e.preventDefault(); setOk(false)
    for (const d of dias) {
      if (!d.fechado && (!d.abre || !d.fecha)) return setErro(`Informe o horário de abertura e fechamento em ${DIAS[d.dia_semana]}, ou marque "Fechado".`)
      if (!d.fechado && d.abre! >= d.fecha!) return setErro(`Em ${DIAS[d.dia_semana]}, o horário de abertura precisa ser antes do de fechamento.`)
    }
    setOcupado(true)
    const linhas = dias.map(d => ({ loja_id: loja.id, dia_semana: d.dia_semana, abre: d.fechado ? null : d.abre, fecha: d.fechado ? null : d.fecha, fechado: d.fechado }))
    const { error } = await supabase.from('horarios_funcionamento').upsert(linhas, { onConflict: 'loja_id,dia_semana' })
    setOcupado(false)
    if (error) return setErro(error.message)
    setErro(''); setOk(true)
    registrarLog(loja.id, 'Horário de funcionamento atualizado')
  }
  return (
    <form onSubmit={salvar} className="space-y-3 rounded-xl border border-neutral-200 bg-white p-3">
      <h3 className="font-bold">Horário de funcionamento</h3>
      <p className="text-sm text-neutral-600">Isso aparece para o cliente no topo da tela do pedido e passa a valer de verdade: fora do horário de um dia (ou em um dia marcado como "Fechado"), o pedido não é aceito, mesmo com o botão "Loja aberta" ligado. Se um dia não tiver horário cadastrado, ele fica liberado o dia todo — quem fecha nesse caso continua sendo só o botão "Loja aberta / Loja fechada".</p>
      <div className="space-y-2">
        {dias.map((d, i) => (
          <div key={d.dia_semana} className="grid grid-cols-[1fr_auto] items-center gap-2 border-b border-neutral-100 pb-2 last:border-0">
            <span>{DIAS[d.dia_semana]}</span>
            <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={d.fechado} onChange={e => set(i, 'fechado', e.target.checked)} /> Fechado</label>
            {!d.fechado && (
              <div className="col-span-2 flex items-center gap-2">
                <input type="time" className={campo} value={d.abre ?? ''} onChange={e => set(i, 'abre', e.target.value)} />
                <span>até</span>
                <input type="time" className={campo} value={d.fecha ?? ''} onChange={e => set(i, 'fecha', e.target.value)} />
              </div>
            )}
          </div>
        ))}
      </div>
      <Erro m={erro} />
      {ok && <p role="status" className="rounded-lg bg-green-100 p-3 text-green-800">Horários salvos.</p>}
      <button disabled={ocupado} className={botao}>{ocupado ? 'Salvando…' : 'Salvar horários'}</button>
    </form>
  )
}

function ExportarLog({ loja }: { loja: Loja }) {
  const [gerando, setGerando] = useState(false)
  const [erro, setErro] = useState('')
  async function exportar() {
    setGerando(true); setErro('')
    const { data, error } = await supabase.from('logs_atividade').select('criado_em,usuario_email,acao').eq('loja_id', loja.id).order('criado_em', { ascending: false }).limit(5000)
    setGerando(false)
    if (error) return setErro(error.message)
    if (!data || !data.length) return setErro('Ainda não há nenhum registro de atividade para exportar.')
    const linhas = data.map((l: any) => `${new Date(l.criado_em).toLocaleString('pt-BR')} - ${l.usuario_email ?? 'usuário desconhecido'} - ${l.acao}`)
    const blob = new Blob([linhas.join('\n')], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `log-${loja.slug}-${new Date().toISOString().slice(0, 10)}.txt`
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }
  return (
    <section className="space-y-2 rounded-xl border border-neutral-200 bg-white p-3">
      <h3 className="font-bold">Log de atividades</h3>
      <p className="text-sm text-neutral-600">Baixa um arquivo de texto (.txt) com tudo que foi criado, editado ou excluído no painel: produtos, categorias, adicionais, bairros, cupons, formas de pagamento, redes sociais, horários, dados da loja e pedidos. Mostra a data, a hora, quem fez e o que foi feito.</p>
      <Erro m={erro} />
      <button className={botao} disabled={gerando} onClick={exportar}>{gerando ? 'Gerando...' : 'Exportar log'}</button>
    </section>
  )
}

function AbaRelatorios({ loja }: { loja: Loja }) {
  type Periodo = 'hoje' | '7dias' | 'mes' | 'personalizado'
  const hojeStr = () => new Date().toISOString().slice(0, 10)
  const [periodo, setPeriodo] = useState<Periodo>('7dias')
  const [ini, setIni] = useState(hojeStr())
  const [fim, setFim] = useState(hojeStr())
  const [carga, setCarga] = useState(true)
  const [erro, setErro] = useState('')
  const [pedidos, setPedidos] = useState<Pedido[]>([])

  const intervalo = useCallback((): [Date, Date] => {
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
    if (periodo === 'hoje') { const f = new Date(hoje); f.setDate(f.getDate() + 1); return [hoje, f] }
    if (periodo === '7dias') { const i = new Date(hoje); i.setDate(i.getDate() - 6); const f = new Date(hoje); f.setDate(f.getDate() + 1); return [i, f] }
    if (periodo === 'mes') { const i = new Date(hoje.getFullYear(), hoje.getMonth(), 1); const f = new Date(hoje); f.setDate(f.getDate() + 1); return [i, f] }
    const i = new Date(ini + 'T00:00:00'); const f = new Date(fim + 'T00:00:00'); f.setDate(f.getDate() + 1); return [i, f]
  }, [periodo, ini, fim])

  useEffect(() => {
    ;(async () => {
      setCarga(true); setErro('')
      const [i, f] = intervalo()
      const { data, error } = await supabase.from('pedidos').select('*, itens_pedido(nome,qtd,preco_unit,itens_pedido_adicionais(nome,qtd,preco_unit))').eq('loja_id', loja.id).gte('criado_em', i.toISOString()).lt('criado_em', f.toISOString()).order('criado_em')
      if (error) setErro(error.message); else setPedidos((data as Pedido[]) ?? [])
      setCarga(false)
    })()
  }, [loja.id, intervalo])

  // Gera um .csv com ponto e vírgula (separador padrão do Excel em português) e acentos
  // corretos, que abre direto como planilha ao clicar em "Exportar Excel".
  function exportarExcel() {
    const csvEscape = (v: string) => /[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
    const linha = (cols: (string | number)[]) => cols.map(c => csvEscape(String(c))).join(';')
    const cabecalho = ['Data/Hora', 'Nome do Cliente', 'Valor Subtotal', 'Valor Frete', 'Forma de Pagto', 'Valor Total', 'Valor Pago']
    const linhas = entregues.map(p => linha([
      new Date(p.criado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }),
      p.cliente_nome,
      R(p.subtotal),
      R(p.taxa_entrega),
      PAG[p.pagamento] ?? p.pagamento,
      R(p.total),
      R(p.total),
    ]))
    const totalLinha = linha(['Total', '', R(entregues.reduce((s, p) => s + Number(p.subtotal), 0)), R(entregues.reduce((s, p) => s + Number(p.taxa_entrega), 0)), '', R(faturamento), R(faturamento)])
    const csv = '﻿' + [linha(cabecalho), ...linhas, totalLinha].join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `pedidos-entregues-${hojeStr()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }
  const entregues = pedidos.filter(p => p.status === 'entregue')
  const cancelados = pedidos.filter(p => p.status === 'cancelado').length
  const emAndamento = pedidos.filter(p => ABERTOS.includes(p.status)).length
  const faturamento = entregues.reduce((s, p) => s + Number(p.total), 0)
  const ticket = entregues.length ? faturamento / entregues.length : 0

  const porProduto = new Map<string, { qtd: number; total: number }>()
  entregues.forEach(p => p.itens_pedido.forEach(i => {
    const atual = porProduto.get(i.nome) ?? { qtd: 0, total: 0 }
    porProduto.set(i.nome, { qtd: atual.qtd + i.qtd, total: atual.total + i.qtd * i.preco_unit })
  }))
  const ranking = [...porProduto.entries()].sort((a, b) => b[1].qtd - a[1].qtd).slice(0, 5)

  const porDia = new Map<string, { pedidos: number; total: number }>()
  entregues.forEach(p => {
    const dia = p.criado_em.slice(0, 10)
    const atual = porDia.get(dia) ?? { pedidos: 0, total: 0 }
    porDia.set(dia, { pedidos: atual.pedidos + 1, total: atual.total + Number(p.total) })
  })
  const dias = [...porDia.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  const maiorDia = Math.max(1, ...dias.map(([, v]) => v.total))
  const fmtDia = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(['hoje', '7dias', 'mes', 'personalizado'] as Periodo[]).map(p => (
          <button key={p} className={periodo === p ? botao : claro} onClick={() => setPeriodo(p)}>
            {{ hoje: 'Hoje', '7dias': 'Últimos 7 dias', mes: 'Este mês', personalizado: 'Personalizado' }[p]}
          </button>
        ))}
      </div>
      {periodo === 'personalizado' && (
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" className={campo} value={ini} onChange={e => setIni(e.target.value)} />
          <span>até</span>
          <input type="date" className={campo} value={fim} onChange={e => setFim(e.target.value)} />
        </div>
      )}
      <Erro m={erro} />
      {carga ? <p>Carregando…</p> : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-neutral-200 bg-white p-3"><p className="text-sm text-neutral-600">Faturamento</p><p className="text-xl font-bold text-[#1B2A4A]">{R(faturamento)}</p></div>
            <div className="rounded-xl border border-neutral-200 bg-white p-3"><p className="text-sm text-neutral-600">Pedidos entregues</p><p className="text-xl font-bold text-[#1B2A4A]">{entregues.length}</p></div>
            <div className="rounded-xl border border-neutral-200 bg-white p-3"><p className="text-sm text-neutral-600">Ticket médio</p><p className="text-xl font-bold text-[#1B2A4A]">{R(ticket)}</p></div>
            <div className="rounded-xl border border-neutral-200 bg-white p-3"><p className="text-sm text-neutral-600">Em andamento / cancelados</p><p className="text-xl font-bold text-[#1B2A4A]">{emAndamento} / {cancelados}</p></div>
          </div>

          <div className="rounded-xl border border-neutral-200 bg-white p-3">
            <h3 className="mb-2 font-bold">Mais vendidos</h3>
            {ranking.length === 0 ? <p className="text-neutral-600">Nenhuma venda entregue neste período.</p> : (
              <ol className="space-y-1">
                {ranking.map(([nome, v], i) => (
                  <li key={nome} className="flex justify-between"><span>{i + 1}. {nome} — {v.qtd}x</span><span className="font-semibold">{R(v.total)}</span></li>
                ))}
              </ol>
            )}
          </div>

          {periodo !== 'hoje' && (
            <div className="rounded-xl border border-neutral-200 bg-white p-3">
              <h3 className="mb-2 font-bold">Faturamento por dia</h3>
              {dias.length === 0 ? <p className="text-neutral-600">Sem pedidos entregues neste período.</p> : (
                <div className="space-y-2">
                  {dias.map(([dia, v]) => (
                    <div key={dia}>
                      <div className="flex justify-between text-sm"><span>{fmtDia(dia)}</span><span>{R(v.total)} ({v.pedidos} pedido{v.pedidos > 1 ? 's' : ''})</span></div>
                      <div className="h-2 rounded-full bg-neutral-100"><div className="h-2 rounded-full bg-[#1A7F37]" style={{ width: `${(v.total / maiorDia) * 100}%` }} /></div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <p className="text-sm text-neutral-600">O faturamento conta só os pedidos marcados como "Entregue".</p>

          <div className="rounded-xl border border-neutral-200 bg-white p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-bold">Planilha de pedidos entregues</h3>
              {entregues.length > 0 && <button type="button" className={claro} onClick={exportarExcel}>Exportar Excel</button>}
            </div>
            {entregues.length === 0 ? <p className="text-neutral-600">Nenhum pedido entregue neste período.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-neutral-300 text-left">
                      <th className="py-2 pr-3">Data/Hora</th>
                      <th className="py-2 pr-3">Nome do Cliente</th>
                      <th className="py-2 pr-3 text-right">Valor Subtotal</th>
                      <th className="py-2 pr-3 text-right">Valor Frete</th>
                      <th className="w-36 py-2 pr-3">Forma de Pagto</th>
                      <th className="py-2 pr-3 text-right">Valor Total</th>
                      <th className="py-2 text-right">Valor Pago</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entregues.map(p => (
                      <tr key={p.id} className="border-b border-neutral-100">
                        <td className="py-2 pr-3 whitespace-nowrap">{new Date(p.criado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                        <td className="py-2 pr-3">{p.cliente_nome}</td>
                        <td className="py-2 pr-3 text-right">{R(p.subtotal)}</td>
                        <td className="py-2 pr-3 text-right">{R(p.taxa_entrega)}</td>
                        <td className="w-36 py-2 pr-3 break-words">{PAG[p.pagamento] ?? p.pagamento}</td>
                        <td className="py-2 pr-3 text-right">{R(p.total)}</td>
                        <td className="py-2 text-right">{R(p.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-neutral-300 font-bold">
                      <td className="py-2 pr-3" colSpan={2}>Total</td>
                      <td className="py-2 pr-3 text-right">{R(entregues.reduce((s, p) => s + Number(p.subtotal), 0))}</td>
                      <td className="py-2 pr-3 text-right">{R(entregues.reduce((s, p) => s + Number(p.taxa_entrega), 0))}</td>
                      <td className="py-2 pr-3"></td>
                      <td className="py-2 pr-3 text-right">{R(faturamento)}</td>
                      <td className="py-2 text-right">{R(faturamento)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  )
}
