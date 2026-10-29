// PDV (ponto de venda) — /pdv. Tela cheia para o computador do caixa e adaptada ao celular.
// Lança vendas de balcão (já entregues, contam no caixa na hora), retirada, entrega
// (pedido por telefone) e mesa. Usa a função criar_pedido_pdv do banco.
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Login, imprimirConformeConfig, type Loja, type Pedido } from './Painel'

type Cat = { id: string; nome: string }
type Prod = { id: string; categoria_id: string; nome: string; preco: number; ativo: boolean; foto_url: string | null }
type Grupo = { id: string; nome: string; tipo: 'unica' | 'multipla'; obrigatorio: boolean; maximo: number | null }
type ItemAd = { id: string; grupo_id: string; nome: string; preco: number; permite_quantidade: boolean; quantidade_maxima: number; ativo: boolean }
type Forma = { nome: string; aceita_troco: boolean }
type Zona = { cidade: string | null; bairro: string; taxa: number }
type Escolha = { item_id: string; nome: string; preco: number; qtd: number }
type Linha = { chave: string; produto: Prod; qtd: number; adicionais: Escolha[] }
type Tipo = 'balcao' | 'retirada' | 'entrega' | 'mesa'

const R = (n: number) => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const NUM = (s: string) => { const t = s.trim(); return Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t) || 0 }
const campo = 'w-full rounded-lg border border-neutral-300 bg-white px-3 py-2'
const TIPOS: { id: Tipo; nome: string }[] = [{ id: 'balcao', nome: 'Balcão' }, { id: 'retirada', nome: 'Retirada' }, { id: 'entrega', nome: 'Entrega' }, { id: 'mesa', nome: 'Mesa' }]
function mascaraTelefone(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2) return d.length ? `(${d}` : ''
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}
const precoLinha = (l: Linha) => (Number(l.produto.preco) + l.adicionais.reduce((s, a) => s + a.preco * a.qtd, 0)) * l.qtd
const ler = (k: string, padrao: string) => { try { return localStorage.getItem(k) ?? padrao } catch { return padrao } }
const gravar = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* sem armazenamento */ } }

export default function Pdv() {
  const [pronto, setPronto] = useState(false)
  const [logado, setLogado] = useState(false)
  useEffect(() => {
    document.title = 'PDV | GetZap Delivery'
    supabase.auth.getSession().then(({ data }) => { setLogado(!!data.session); setPronto(true) })
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setLogado(!!s))
    return () => data.subscription.unsubscribe()
  }, [])
  if (!pronto) return <p className="p-8">Carregando…</p>
  return logado ? <Caixa /> : <Login />
}

function Caixa() {
  const [loja, setLoja] = useState<Loja | null>(null)
  const [erroCarga, setErroCarga] = useState('')
  const [cats, setCats] = useState<Cat[]>([])
  const [prods, setProds] = useState<Prod[]>([])
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [itensAd, setItensAd] = useState<ItemAd[]>([])
  const [ligacoes, setLigacoes] = useState<Record<string, string[]>>({})
  const [formas, setFormas] = useState<Forma[]>([])
  const [zonas, setZonas] = useState<Zona[]>([])
  const [mesas, setMesas] = useState<number[]>([])
  const [cat, setCat] = useState<string>('')
  const [busca, setBusca] = useState('')
  const [carrinho, setCarrinho] = useState<Linha[]>([])
  const [escolhendo, setEscolhendo] = useState<Prod | null>(null)
  const [verVenda, setVerVenda] = useState(false) // celular: painel da venda aberto
  const [aviso, setAviso] = useState('')
  const buscaRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    (async () => {
      const { data: s } = await supabase.auth.getSession()
      const { data, error } = await supabase.from('membros').select('lojas(*)').eq('user_id', s.session?.user.id).limit(1)
      const l = (data?.[0] as any)?.lojas as Loja | undefined
      if (error || !l) return setErroCarga(error?.message ?? 'Esta conta não está ligada a nenhuma loja.')
      setLoja(l)
      const [c, p, g, i, lg, f, z, m] = await Promise.all([
        supabase.from('categorias').select('id,nome').eq('loja_id', l.id).order('ordem'),
        supabase.from('produtos').select('id,categoria_id,nome,preco,ativo,foto_url').eq('loja_id', l.id).order('ordem').order('nome'),
        supabase.from('grupos_adicionais').select('id,nome,tipo,obrigatorio,maximo').eq('loja_id', l.id).order('ordem'),
        supabase.from('itens_adicionais').select('id,grupo_id,nome,preco,permite_quantidade,quantidade_maxima,ativo,grupos_adicionais!inner(loja_id)').eq('grupos_adicionais.loja_id', l.id).eq('ativo', true).order('preco').order('ordem'),
        supabase.from('produto_grupos_adicionais').select('produto_id,grupo_id,produtos!inner(loja_id)').eq('produtos.loja_id', l.id),
        supabase.from('formas_pagamento').select('nome,aceita_troco').eq('loja_id', l.id).order('ordem'),
        supabase.from('zonas_entrega').select('cidade,bairro,taxa').eq('loja_id', l.id).order('cidade').order('bairro'),
        supabase.from('mesas').select('numero').eq('loja_id', l.id).order('numero'),
      ])
      const e = c.error || p.error || g.error || i.error || lg.error || f.error || z.error
      if (e) setErroCarga(e.message)
      setCats(c.data ?? []); setProds(((p.data ?? []) as Prod[]).map(x => ({ ...x, preco: Number(x.preco) })))
      setGrupos((g.data as Grupo[]) ?? []); setItensAd(((i.data ?? []) as any[]).map(x => ({ ...x, preco: Number(x.preco) })))
      const mapa: Record<string, string[]> = {}
      for (const row of (lg.data as any[]) ?? []) (mapa[row.produto_id] ??= []).push(row.grupo_id)
      setLigacoes(mapa); setFormas(f.data ?? []); setZonas(((z.data ?? []) as Zona[]).map(x => ({ ...x, taxa: Number(x.taxa) })))
      setMesas(((m.data ?? []) as any[]).map(x => x.numero))
    })()
  }, [])

  const termo = busca.trim().toLowerCase()
  const lista = prods.filter(p => (termo ? p.nome.toLowerCase().includes(termo) : !cat || p.categoria_id === cat))
  const total = carrinho.reduce((s, l) => s + precoLinha(l), 0)
  const qtdItens = carrinho.reduce((s, l) => s + l.qtd, 0)

  function adicionar(p: Prod) {
    if ((ligacoes[p.id] ?? []).some(g => itensAd.some(i => i.grupo_id === g))) { setEscolhendo(p); return }
    colocar(p, [], 1)
  }
  function colocar(p: Prod, adicionais: Escolha[], qtd: number) {
    const chave = p.id + '|' + adicionais.map(a => `${a.item_id}x${a.qtd}`).sort().join(',')
    setCarrinho(c => {
      const existe = c.find(l => l.chave === chave)
      return existe ? c.map(l => (l.chave === chave ? { ...l, qtd: l.qtd + qtd } : l)) : [...c, { chave, produto: p, qtd, adicionais }]
    })
  }
  const mudarQtd = (chave: string, d: number) => setCarrinho(c => c.flatMap(l => (l.chave !== chave ? [l] : l.qtd + d <= 0 ? [] : [{ ...l, qtd: l.qtd + d }])))
  const mostrarAviso = useCallback((m: string) => { setAviso(m); window.setTimeout(() => setAviso(''), 3500) }, [])

  if (erroCarga && !loja) return <p className="p-8 text-red-700">{erroCarga}</p>
  if (!loja) return <p className="p-8">Carregando…</p>

  return (
    <div className="flex h-[100dvh] flex-col bg-neutral-100 text-neutral-900">
      <header className="flex items-center justify-between gap-2 bg-[#1B2A4A] px-4 py-2 text-white">
        <div className="min-w-0"><p className="truncate font-extrabold">PDV · {loja.nome}</p></div>
        <a href="/painel" className="shrink-0 rounded-lg bg-white/15 px-3 py-1 text-sm font-semibold">Voltar ao painel</a>
      </header>
      {aviso && <p role="status" className="fixed left-1/2 top-16 z-50 -translate-x-1/2 rounded-full bg-[#1A7F37] px-5 py-3 font-bold text-white shadow-lg">✓ {aviso}</p>}
      <div className="flex min-h-0 flex-1">
        {/* Produtos */}
        <section className="flex min-w-0 flex-1 flex-col">
          <div className="space-y-2 p-3">
            <input ref={buscaRef} className={campo} placeholder="Buscar produto (Enter adiciona o primeiro)" value={busca} autoFocus
              onChange={e => setBusca(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && termo && lista[0]) { adicionar(lista[0]); setBusca('') } }} />
            {!termo && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                <button onClick={() => setCat('')} className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${!cat ? 'bg-[#1B2A4A] text-white' : 'border border-neutral-300 bg-white'}`}>Todos</button>
                {cats.map(c => <button key={c.id} onClick={() => setCat(c.id)} className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${cat === c.id ? 'bg-[#1B2A4A] text-white' : 'border border-neutral-300 bg-white'}`}>{c.nome}</button>)}
              </div>
            )}
          </div>
          <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-2 gap-2 overflow-y-auto p-3 pt-0 pb-24 sm:grid-cols-3 lg:pb-3 xl:grid-cols-4 2xl:grid-cols-5">
            {lista.map(p => (
              <button key={p.id} onClick={() => adicionar(p)} className="flex flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white text-left shadow-sm active:scale-[.98]">
                {p.foto_url ? <img src={p.foto_url} alt="" loading="lazy" className="h-24 w-full object-cover" /> : <div className="flex h-24 items-center justify-center bg-neutral-100 text-3xl">🍽️</div>}
                <span className="line-clamp-2 px-2 pt-1 text-sm font-semibold">{p.nome}</span>
                <span className="px-2 pb-2 font-bold text-[#1A7F37]">{R(p.preco)}{!p.ativo && <span className="ml-1 text-xs font-normal text-neutral-500">(oculto)</span>}</span>
              </button>
            ))}
            {lista.length === 0 && <p className="col-span-full p-6 text-center text-neutral-600">Nenhum produto encontrado.</p>}
          </div>
        </section>
        {/* Venda: coluna fixa no PC, painel sobreposto no celular */}
        <aside className={`${verVenda ? 'fixed inset-0 z-40 flex' : 'hidden'} w-full flex-col bg-white lg:static lg:flex lg:w-[420px] lg:border-l lg:border-neutral-200`}>
          <Venda loja={loja} carrinho={carrinho} total={total} formas={formas} zonas={zonas} mesas={mesas} mudarQtd={mudarQtd}
            limpar={() => setCarrinho([])} fechar={() => setVerVenda(false)}
            concluida={(n) => { setCarrinho([]); setVerVenda(false); mostrarAviso(`Venda #${n} registrada`); buscaRef.current?.focus() }} />
        </aside>
      </div>
      {/* Barra do celular */}
      {!verVenda && (
        <button onClick={() => setVerVenda(true)} className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+12px)] z-30 flex items-center justify-between rounded-xl bg-[#1A7F37] px-4 py-3 font-bold text-white shadow-lg lg:hidden">
          <span>Ver venda ({qtdItens})</span><span>{R(total)}</span>
        </button>
      )}
      {escolhendo && <EscolherAdicionais produto={escolhendo} grupos={grupos.filter(g => (ligacoes[escolhendo.id] ?? []).includes(g.id))} itens={itensAd}
        fechar={() => setEscolhendo(null)} confirmar={(ads, q) => { colocar(escolhendo, ads, q); setEscolhendo(null); buscaRef.current?.focus() }} />}
    </div>
  )
}

function EscolherAdicionais({ produto, grupos, itens, fechar, confirmar }: { produto: Prod; grupos: Grupo[]; itens: ItemAd[]; fechar: () => void; confirmar: (a: Escolha[], qtd: number) => void }) {
  const [sel, setSel] = useState<Record<string, number>>({})
  const [qtd, setQtd] = useState(1)
  const [erro, setErro] = useState('')
  const somaGrupo = (g: string) => itens.filter(i => i.grupo_id === g).reduce((s, i) => s + (sel[i.id] ?? 0), 0)
  function alternar(g: Grupo, i: ItemAd, d: number) {
    setErro('')
    setSel(s => {
      const atual = s[i.id] ?? 0
      if (g.tipo === 'unica') { const n = { ...s }; itens.filter(x => x.grupo_id === g.id).forEach(x => delete n[x.id]); if (!atual) n[i.id] = 1; return n }
      const novo = Math.max(0, Math.min(i.permite_quantidade ? i.quantidade_maxima : 1, atual + d))
      if (d > 0 && g.maximo && somaGrupo(g.id) >= g.maximo) return s
      return { ...s, [i.id]: novo }
    })
  }
  const extra = itens.reduce((s, i) => s + (sel[i.id] ?? 0) * i.preco, 0)
  function ok() {
    const faltando = grupos.find(g => g.obrigatorio && somaGrupo(g.id) < 1 && itens.some(i => i.grupo_id === g.id))
    if (faltando) return setErro(`Escolha uma opção em "${faltando.nome}".`)
    confirmar(itens.filter(i => sel[i.id]).map(i => ({ item_id: i.id, nome: i.nome, preco: i.preco, qtd: sel[i.id] })), qtd)
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3" onClick={fechar}>
      <div className="flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b p-4"><p className="font-bold">{produto.nome} · {R(produto.preco)}</p><button className="text-2xl" aria-label="Fechar" onClick={fechar}>×</button></div>
        <div className="space-y-4 overflow-y-auto p-4">
          {grupos.map(g => (
            <div key={g.id}>
              <p className="font-semibold">{g.nome} <span className="text-sm font-normal text-neutral-500">{g.tipo === 'unica' ? 'escolha 1' : g.maximo ? `até ${g.maximo}` : 'vários'}{g.obrigatorio ? ' · obrigatório' : ''}</span></p>
              <div className="mt-1 grid gap-1 sm:grid-cols-2">
                {itens.filter(i => i.grupo_id === g.id).map(i => {
                  const n = sel[i.id] ?? 0
                  return (
                    <div key={i.id} className={`flex items-center justify-between gap-2 rounded-lg border p-2 ${n ? 'border-[#1A7F37] bg-green-50' : 'border-neutral-200'}`}>
                      <button type="button" className="flex-1 text-left text-sm" onClick={() => alternar(g, i, n ? -n : 1)}>{i.nome}{i.preco > 0 && <span className="text-neutral-600"> +{R(i.preco)}</span>}</button>
                      {i.permite_quantidade && g.tipo === 'multipla' && n > 0 && (
                        <span className="flex items-center gap-1"><button type="button" className="h-7 w-7 rounded border" onClick={() => alternar(g, i, -1)}>−</button><b className="w-5 text-center">{n}</b><button type="button" className="h-7 w-7 rounded border" onClick={() => alternar(g, i, 1)}>+</button></span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
        {erro && <p role="alert" className="mx-4 rounded-lg bg-red-100 p-2 text-sm text-red-800">{erro}</p>}
        <div className="flex items-center gap-2 border-t p-4">
          <span className="flex items-center gap-1"><button className="h-10 w-10 rounded-lg border text-xl" onClick={() => setQtd(q => Math.max(1, q - 1))}>−</button><b className="w-8 text-center text-lg">{qtd}</b><button className="h-10 w-10 rounded-lg border text-xl" onClick={() => setQtd(q => q + 1)}>+</button></span>
          <button className="flex-1 rounded-lg bg-[#1A7F37] px-4 py-3 font-bold text-white" onClick={ok}>Adicionar {R((produto.preco + extra) * qtd)}</button>
        </div>
      </div>
    </div>
  )
}

function Venda({ loja, carrinho, total, formas, zonas, mesas, mudarQtd, limpar, fechar, concluida }: {
  loja: Loja; carrinho: Linha[]; total: number; formas: Forma[]; zonas: Zona[]; mesas: number[]
  mudarQtd: (chave: string, d: number) => void; limpar: () => void; fechar: () => void; concluida: (numero: number) => void
}) {
  const [tipo, setTipo] = useState<Tipo>('balcao')
  const [nome, setNome] = useState('')
  const [tel, setTel] = useState('')
  const [mesa, setMesa] = useState('')
  const [cidade, setCidade] = useState('')
  const [bairro, setBairro] = useState('')
  const [rua, setRua] = useState('')
  const [numero, setNumero] = useState('')
  const [compl, setCompl] = useState('')
  const [pagamento, setPagamento] = useState('')
  const [recebido, setRecebido] = useState('')
  const [desconto, setDesconto] = useState('')
  const [obs, setObs] = useState('')
  const [imprimir, setImprimir] = useState(() => ler('gz_pdv_imp', '1') === '1')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const cidades = useMemo(() => [...new Set(zonas.map(z => z.cidade ?? ''))].filter(Boolean), [zonas])
  const cidadeSel = cidade || (cidades.length === 1 ? cidades[0] : '')
  const bairros = zonas.filter(z => !cidades.length || (z.cidade ?? '') === cidadeSel)
  const taxa = tipo === 'entrega' ? (bairros.find(z => z.bairro === bairro)?.taxa ?? 0) : 0
  const desc = Math.min(NUM(desconto), total + taxa)
  const aPagar = Math.max(0, total + taxa - desc)
  const forma = formas.find(f => f.nome === pagamento)
  const troco = forma?.aceita_troco && NUM(recebido) > 0 ? NUM(recebido) - aPagar : null

  async function buscarCliente() {
    if (tel.replace(/\D/g, '').length < 10) return
    const { data } = await supabase.rpc('buscar_cliente', { p_slug: loja.slug, p_telefone: tel })
    if (!data) return
    if (!nome) setNome(data.nome ?? '')
    if (tipo === 'entrega') {
      if (!cidade && data.cidade) setCidade(data.cidade)
      if (!bairro && data.bairro) setBairro(data.bairro)
      if (!rua && data.rua) setRua(data.rua)
      if (!numero && data.numero) setNumero(data.numero)
      if (!compl && data.complemento) setCompl(data.complemento)
    }
  }
  async function finalizar(e?: FormEvent) {
    e?.preventDefault(); setErro('')
    if (!carrinho.length) return setErro('Adicione produtos à venda.')
    if (!pagamento) return setErro('Escolha a forma de pagamento.')
    if (troco !== null && troco < 0) return setErro('O valor recebido é menor que o total.')
    setEnviando(true)
    const endereco = [rua.trim() && `${rua.trim()}${numero.trim() ? ', ' + numero.trim() : ''}`, compl.trim()].filter(Boolean).join(' - ')
    const { data, error } = await supabase.rpc('criar_pedido_pdv', {
      p_loja: loja.id,
      p_dados: { tipo, nome, telefone: tel, mesa, cidade: tipo === 'entrega' ? cidadeSel : null, bairro, endereco, pagamento, troco: troco !== null ? recebido : '', desconto: desc, obs },
      p_itens: carrinho.map(l => ({ produto_id: l.produto.id, qtd: l.qtd, adicionais: l.adicionais.map(a => ({ item_id: a.item_id, qtd: a.qtd })) })),
    })
    if (error) { setEnviando(false); return setErro(error.message) }
    if (imprimir) {
      const { data: p } = await supabase.from('pedidos').select('*, itens_pedido(id,nome,qtd,preco_unit,itens_pedido_adicionais(nome,qtd,preco_unit))').eq('id', data.id).single()
      if (p) imprimirConformeConfig(p as Pedido, loja)
    }
    setEnviando(false)
    setNome(''); setTel(''); setMesa(''); setBairro(''); setRua(''); setNumero(''); setCompl(''); setRecebido(''); setDesconto(''); setObs(''); setPagamento('')
    concluida(data.numero)
  }

  return (
    <form onSubmit={finalizar} className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <p className="font-bold">Venda atual</p>
        <div className="flex items-center gap-3">
          {carrinho.length > 0 && <button type="button" className="text-sm text-red-700 underline" onClick={() => confirm('Limpar a venda?') && limpar()}>Limpar</button>}
          <button type="button" className="text-sm font-semibold underline lg:hidden" onClick={fechar}>Voltar aos produtos</button>
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {carrinho.length === 0 ? <p className="py-6 text-center text-neutral-500">Toque nos produtos para adicionar.</p> : (
          <ul className="divide-y">
            {carrinho.map(l => (
              <li key={l.chave} className="flex items-start justify-between gap-2 py-2">
                <div className="min-w-0">
                  <p className="font-semibold">{l.produto.nome}</p>
                  {l.adicionais.map(a => <p key={a.item_id} className="text-xs text-neutral-600">+ {a.qtd}x {a.nome}</p>)}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button type="button" className="h-8 w-8 rounded-lg border text-lg" aria-label="Menos" onClick={() => mudarQtd(l.chave, -1)}>−</button>
                  <b className="w-6 text-center">{l.qtd}</b>
                  <button type="button" className="h-8 w-8 rounded-lg border text-lg" aria-label="Mais" onClick={() => mudarQtd(l.chave, 1)}>+</button>
                  <span className="w-20 text-right text-sm font-semibold">{R(precoLinha(l))}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="grid grid-cols-4 gap-1 rounded-xl bg-neutral-100 p-1">
          {TIPOS.map(t => <button type="button" key={t.id} onClick={() => setTipo(t.id)} className={`rounded-lg py-2 text-sm font-semibold ${tipo === t.id ? 'bg-white shadow' : 'text-neutral-600'}`}>{t.nome}</button>)}
        </div>
        {tipo === 'mesa' && (mesas.length
          ? <select className={campo} value={mesa} onChange={e => setMesa(e.target.value)}><option value="">Número da mesa</option>{mesas.map(m => <option key={m} value={m}>Mesa {m}</option>)}</select>
          : <input className={campo} inputMode="numeric" placeholder="Número da mesa" value={mesa} onChange={e => setMesa(e.target.value.replace(/\D/g, ''))} />)}
        {tipo !== 'mesa' && (
          <div className="grid grid-cols-2 gap-2">
            <input className={campo} inputMode="tel" placeholder={tipo === 'entrega' ? 'Telefone' : 'Telefone (opcional)'} value={tel} onChange={e => setTel(mascaraTelefone(e.target.value))} onBlur={buscarCliente} />
            <input className={campo} placeholder={tipo === 'entrega' ? 'Nome do cliente' : 'Nome (opcional)'} value={nome} onChange={e => setNome(e.target.value)} />
          </div>
        )}
        {tipo === 'entrega' && (
          <div className="grid grid-cols-2 gap-2">
            {cidades.length > 1 && <select className={`${campo} col-span-2`} value={cidade} onChange={e => { setCidade(e.target.value); setBairro('') }}><option value="">Cidade</option>{cidades.map(c => <option key={c}>{c}</option>)}</select>}
            <select className={`${campo} col-span-2`} value={bairro} onChange={e => setBairro(e.target.value)}>
              <option value="">Bairro</option>{bairros.map(z => <option key={(z.cidade ?? '') + z.bairro} value={z.bairro}>{z.bairro} · {R(z.taxa)}</option>)}
            </select>
            <input className={`${campo} col-span-2`} placeholder="Rua" value={rua} onChange={e => setRua(e.target.value)} />
            <input className={campo} placeholder="Número" value={numero} onChange={e => setNumero(e.target.value)} />
            <input className={campo} placeholder="Complemento" value={compl} onChange={e => setCompl(e.target.value)} />
          </div>
        )}
        <div>
          <p className="mb-1 text-sm font-semibold">Pagamento</p>
          <div className="grid grid-cols-2 gap-2">
            {formas.map(f => <button type="button" key={f.nome} onClick={() => setPagamento(f.nome)} className={`rounded-lg border-2 px-2 py-2 text-sm font-semibold ${pagamento === f.nome ? 'border-[#1A7F37] bg-green-50' : 'border-neutral-200'}`}>{f.nome}</button>)}
          </div>
          {formas.length === 0 && <p className="text-sm text-red-700">Cadastre as formas de pagamento na aba Loja.</p>}
        </div>
        {forma?.aceita_troco && (
          <div className="grid grid-cols-2 items-center gap-2">
            <input className={campo} inputMode="decimal" placeholder="Valor recebido" value={recebido} onChange={e => setRecebido(e.target.value)} />
            <p className={`text-sm font-bold ${troco !== null && troco < 0 ? 'text-red-700' : ''}`}>{troco === null ? 'Troco: —' : troco < 0 ? `Faltam ${R(-troco)}` : `Troco: ${R(troco)}`}</p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <input className={campo} inputMode="decimal" placeholder="Desconto R$" value={desconto} onChange={e => setDesconto(e.target.value)} />
          <input className={campo} placeholder="Observação" value={obs} onChange={e => setObs(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={imprimir} onChange={e => { setImprimir(e.target.checked); gravar('gz_pdv_imp', e.target.checked ? '1' : '0') }} /> Imprimir cupom ao finalizar</label>
      </div>
      <div className="space-y-1 border-t p-4">
        {(taxa > 0 || desc > 0) && <p className="flex justify-between text-sm"><span>Subtotal</span><span>{R(total)}</span></p>}
        {taxa > 0 && <p className="flex justify-between text-sm"><span>Entrega</span><span>{R(taxa)}</span></p>}
        {desc > 0 && <p className="flex justify-between text-sm text-green-700"><span>Desconto</span><span>-{R(desc)}</span></p>}
        <p className="flex justify-between text-2xl font-extrabold"><span>Total</span><span>{R(aPagar)}</span></p>
        {erro && <p role="alert" className="rounded-lg bg-red-100 p-2 text-sm text-red-800">{erro}</p>}
        <button disabled={enviando || !carrinho.length} className="w-full rounded-xl bg-[#1A7F37] py-4 text-lg font-extrabold text-white disabled:opacity-50">
          {enviando ? 'Registrando…' : tipo === 'balcao' ? 'Finalizar venda' : 'Lançar pedido'}
        </button>
      </div>
    </form>
  )
}
