import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

type Loja = { id: string; nome: string; whatsapp: string; aberta: boolean; aceita_retirada: boolean; cor: string; endereco: string | null; logo_url: string | null; banner_celular_url: string | null; banner_pc_url: string | null; cpf_cnpj: string | null; plataforma_ativa: boolean }
type Rede = 'instagram' | 'facebook' | 'tiktok' | 'youtube' | 'twitter' | 'whatsapp' | 'site'
type RedeSocial = { rede: Rede; url: string }
type Categoria = { id: string; nome: string }
type Produto = { id: string; categoria_id: string; nome: string; descricao: string | null; preco: number; foto_url: string | null }
type Zona = { bairro: string; taxa: number }
type Horario = { dia_semana: number; abre: string | null; fecha: string | null; fechado: boolean }
type Grupo = { id: string; nome: string; tipo: 'unica' | 'multipla'; obrigatorio: boolean; maximo: number | null }
type ItemAd = { id: string; grupo_id: string; nome: string; preco: number; permite_quantidade: boolean; quantidade_maxima: number }
type FormaPagamento = { id: string; nome: string; aceita_troco: boolean }
type Selecao = { item_id: string; nome: string; preco: number; qtd: number }
type LinhaCarrinho = { id: string; produto: Produto; qtd: number; selecoes: Selecao[] }
type Form = { nome: string; telefone: string; tipo: string; bairro: string; rua: string; numero: string; complemento: string; pagamento: string; troco: string; obs: string }

const R = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const vazio: Form = { nome: '', telefone: '', tipo: 'entrega', bairro: '', rua: '', numero: '', complemento: '', pagamento: '', troco: '', obs: '' }
const enderecoCompleto = (f: Form) => `${f.rua.trim()}, ${f.numero.trim()}${f.complemento.trim() ? ` - ${f.complemento.trim()}` : ''}`
const campo = 'w-full rounded-lg border border-neutral-300 px-3 py-2'
const rotulo = 'mb-1 block text-sm font-semibold text-neutral-800'

// Máscara de celular: (xx) xxxxx-xxxx — e (xx) xxxx-xxxx enquanto tiver só 10 dígitos
function mascaraTelefone(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2) return d.length ? `(${d}` : ''
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}
// Texto preto ou branco, conforme a cor da loja, para manter a leitura nos botões
const texto = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) > 150 ? '#000' : '#fff'
}
const linhaTotal = (l: LinhaCarrinho) => (l.produto.preco + l.selecoes.reduce((s, x) => s + x.preco * x.qtd, 0)) * l.qtd
// Sem horário cadastrado para o dia (dono ainda não configurou): não bloqueia sozinho,
// só o botão manual "Loja aberta/fechada" continua valendo, como sempre foi.
function statusHorario(horarios: Horario[]) {
  const h = horarios.find(x => x.dia_semana === new Date().getDay())
  if (!h) return { aberto: true, texto: '' }
  if (h.fechado) return { aberto: false, texto: 'Fechado hoje' }
  if (!h.abre || !h.fecha) return { aberto: true, texto: '' }
  const agora = new Date().toTimeString().slice(0, 8)
  const aberto = agora >= h.abre && agora <= h.fecha
  return { aberto, texto: `Hoje: ${h.abre.slice(0, 5)} às ${h.fecha.slice(0, 5)}` }
}
const novoId = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2))
const NOME_REDE: Record<Rede, string> = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', youtube: 'YouTube', twitter: 'X (Twitter)', whatsapp: 'WhatsApp', site: 'Site' }
function IconeCompartilhar() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
      <path d="M8.6 10.5l6.8-3.9M8.6 13.5l6.8 3.9" />
    </svg>
  )
}
function IconeBusca() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
    </svg>
  )
}
function IconeRede({ rede }: { rede: Rede }) {
  const props = { viewBox: '0 0 24 24', className: 'h-5 w-5', fill: 'currentColor', 'aria-hidden': true }
  switch (rede) {
    case 'instagram': return <svg {...props}><path d="M12 2c2.7 0 3 0 4.1.06 1.1.05 1.8.22 2.5.47.7.27 1.2.6 1.8 1.2.6.6.9 1.1 1.2 1.8.25.7.42 1.4.47 2.5.06 1.1.06 1.4.06 4.1s0 3-.06 4.1c-.05 1.1-.22 1.8-.47 2.5-.27.7-.6 1.2-1.2 1.8-.6.6-1.1.9-1.8 1.2-.7.25-1.4.42-2.5.47-1.1.06-1.4.06-4.1.06s-3 0-4.1-.06c-1.1-.05-1.8-.22-2.5-.47-.7-.27-1.2-.6-1.8-1.2-.6-.6-.9-1.1-1.2-1.8-.25-.7-.42-1.4-.47-2.5C2 15 2 14.7 2 12s0-3 .06-4.1c.05-1.1.22-1.8.47-2.5.27-.7.6-1.2 1.2-1.8.6-.6 1.1-.9 1.8-1.2.7-.25 1.4-.42 2.5-.47C9 2 9.3 2 12 2Zm0 1.8c-2.66 0-2.97 0-4.02.06-.9.04-1.4.19-1.72.32-.43.17-.74.37-1.07.7-.33.33-.53.64-.7 1.07-.13.32-.28.82-.32 1.72C4.11 9 4.1 9.31 4.1 12s0 2.97.06 4.02c.04.9.19 1.4.32 1.72.17.43.37.74.7 1.07.33.33.64.53 1.07.7.32.13.82.28 1.72.32 1.05.06 1.36.06 4.02.06s2.97 0 4.02-.06c.9-.04 1.4-.19 1.72-.32.43-.17.74-.37 1.07-.7.33-.33.53-.64.7-1.07.13-.32.28-.82.32-1.72.06-1.05.06-1.36.06-4.02s0-2.97-.06-4.02c-.04-.9-.19-1.4-.32-1.72a2.9 2.9 0 0 0-.7-1.07 2.9 2.9 0 0 0-1.07-.7c-.32-.13-.82-.28-1.72-.32C14.97 3.8 14.66 3.8 12 3.8Zm0 3.05a5.15 5.15 0 1 1 0 10.3 5.15 5.15 0 0 1 0-10.3Zm0 1.8a3.35 3.35 0 1 0 0 6.7 3.35 3.35 0 0 0 0-6.7Zm5.35-1.98a1.2 1.2 0 1 1 0 2.41 1.2 1.2 0 0 1 0-2.4Z" /></svg>
    case 'facebook': return <svg {...props}><path d="M13.5 22v-8.4h2.85l.43-3.3h-3.28V8.2c0-.96.27-1.6 1.65-1.6h1.76V3.66C16.6 3.6 15.6 3.5 14.4 3.5c-2.4 0-4.05 1.47-4.05 4.15v2.35H7.5v3.3h2.85V22h3.15Z" /></svg>
    case 'tiktok': return <svg {...props}><path d="M14.5 2h2.9c.16 1.62 1.03 3 2.44 3.86.9.56 1.9.85 3.06.87v3.02c-1.5-.03-2.9-.44-4.15-1.22v6.47c0 3.4-2.77 6-6.2 6a6.14 6.14 0 0 1-6.2-6.02c0-3.3 2.65-5.98 5.9-6.02.35 0 .68.03 1 .1v3.14a3.1 3.1 0 0 0-1-.16 2.98 2.98 0 0 0-2.97 2.96 2.98 2.98 0 0 0 2.97 2.97c1.68 0 3.1-1.4 3.1-3.1V2Z" /></svg>
    case 'youtube': return <svg {...props}><path d="M21.6 7.2s-.2-1.5-.85-2.14c-.8-.85-1.7-.85-2.12-.9C15.7 4 12 4 12 4s-3.7 0-6.63.16c-.4.05-1.3.05-2.12.9C2.6 5.7 2.4 7.2 2.4 7.2S2.2 9 2.2 10.7v1.6c0 1.7.2 3.5.2 3.5s.2 1.5.85 2.14c.8.85 1.87.83 2.35.92C7.3 19 12 19 12 19s3.7 0 6.63-.16c.4-.05 1.3-.05 2.12-.9.65-.65.85-2.14.85-2.14s.2-1.8.2-3.5v-1.6c0-1.7-.2-3.5-.2-3.5ZM9.95 14.5v-6l5.2 3-5.2 3Z" /></svg>
    case 'twitter': return <svg {...props}><path d="M18.9 3h3.1l-6.8 7.75L23 21h-6.3l-4.9-6.4L6.2 21H3.1l7.3-8.3L2 3h6.45l4.44 5.85L18.9 3Zm-1.1 16.2h1.72L7.3 4.7H5.46l12.34 14.5Z" /></svg>
    case 'whatsapp': return <svg {...props}><path d="M12.04 2C6.6 2 2.2 6.4 2.2 11.85c0 1.85.5 3.55 1.4 5.02L2 22l5.25-1.55a9.8 9.8 0 0 0 4.8 1.24h.01c5.44 0 9.85-4.4 9.85-9.85C21.9 6.4 17.5 2 12.04 2Zm0 18a8 8 0 0 1-4.1-1.13l-.3-.17-3.1.92.93-3.02-.2-.31a8.05 8.05 0 0 1-1.24-4.34c0-4.45 3.62-8.06 8.02-8.06a8.02 8.02 0 0 1 8.02 8.05c0 4.45-3.62 8.06-8.03 8.06Zm4.4-6.02c-.24-.12-1.42-.7-1.64-.78-.22-.08-.38-.12-.54.12-.16.24-.62.78-.76.94-.14.16-.28.18-.52.06-.24-.12-1-.37-1.9-1.17-.7-.63-1.18-1.4-1.32-1.64-.14-.24-.02-.37.1-.49.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.54-1.3-.74-1.78-.2-.47-.4-.4-.54-.41h-.46c-.16 0-.42.06-.64.3-.22.24-.84.82-.84 2s.86 2.32.98 2.48c.12.16 1.7 2.6 4.13 3.64.58.25 1.03.4 1.38.51.58.19 1.11.16 1.53.1.47-.07 1.42-.58 1.62-1.14.2-.56.2-1.04.14-1.14-.06-.1-.22-.16-.46-.28Z" /></svg>
    default: return <svg {...props} fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" /></svg>
  }
}

export default function Cardapio() {
  const { slug } = useParams()
  const [loja, setLoja] = useState<Loja | null>(null)
  const [cats, setCats] = useState<Categoria[]>([])
  const [prods, setProds] = useState<Produto[]>([])
  const [zonas, setZonas] = useState<Zona[]>([])
  const [horarios, setHorarios] = useState<Horario[]>([])
  const [, tickRelogio] = useState(0)
  const [formasPag, setFormasPag] = useState<FormaPagamento[]>([])
  const [redes, setRedes] = useState<RedeSocial[]>([])
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [itensAd, setItensAd] = useState<ItemAd[]>([])
  const [ligacoes, setLigacoes] = useState<Record<string, string[]>>({})
  const [sugestoes, setSugestoes] = useState<Record<string, string[]>>({})
  const [sugestaoAberta, setSugestaoAberta] = useState<{ categoria: Categoria; produtos: Produto[] }[] | null>(null)
  const [carga, setCarga] = useState(true)
  const [erro, setErro] = useState('')
  const [carrinho, setCarrinho] = useState<LinhaCarrinho[]>([])
  const [etapa, setEtapa] = useState<'menu' | 'checkout' | 'ok'>('menu')
  const [f, setF] = useState<Form>(vazio)
  const [enviando, setEnviando] = useState(false)
  const [zap, setZap] = useState('')
  const [produtoModal, setProdutoModal] = useState<Produto | null>(null)
  const [cupomCodigo, setCupomCodigo] = useState('')
  const [cupom, setCupom] = useState<{ codigo: string; tipo: 'percentual' | 'fixo' | 'frete_gratis'; desconto: number } | null>(null)
  const [cupomErro, setCupomErro] = useState('')
  const [aplicandoCupom, setAplicandoCupom] = useState(false)
  const [autoPreenchido, setAutoPreenchido] = useState(false)
  const [busca, setBusca] = useState('')
  const [buscaAberta, setBuscaAberta] = useState(false)

  useEffect(() => {
    ;(async () => {
      const { data: l, error: e } = await supabase.from('lojas').select('id,nome,whatsapp,aberta,aceita_retirada,cor,endereco,logo_url,banner_celular_url,banner_pc_url,cpf_cnpj,plataforma_ativa').eq('slug', slug).maybeSingle()
      if (e) { setErro(`Não foi possível carregar a loja: ${e.message}`); setCarga(false); return }
      if (!l) { setErro('Loja não encontrada.'); setCarga(false); return }
      if (!l.plataforma_ativa) { setErro('Este cardápio está temporariamente indisponível.'); setCarga(false); return }
      document.title = `${l.nome} | Cardápio`
      setLoja(l)
      const [c, p, z, fp, rs, g, i, h] = await Promise.all([
        supabase.from('categorias').select('id,nome').eq('loja_id', l.id).order('ordem'),
        supabase.from('produtos').select('id,categoria_id,nome,descricao,preco,foto_url').eq('loja_id', l.id).eq('ativo', true).order('ordem'),
        supabase.from('zonas_entrega').select('bairro,taxa').eq('loja_id', l.id).order('bairro'),
        supabase.from('formas_pagamento').select('id,nome,aceita_troco').eq('loja_id', l.id).order('ordem'),
        supabase.from('redes_sociais').select('rede,url').eq('loja_id', l.id).order('ordem'),
        supabase.from('grupos_adicionais').select('id,nome,tipo,obrigatorio,maximo').eq('loja_id', l.id).order('ordem'),
        supabase.from('itens_adicionais').select('id,grupo_id,nome,preco,permite_quantidade,quantidade_maxima,ativo,grupos_adicionais!inner(loja_id)').eq('grupos_adicionais.loja_id', l.id).eq('ativo', true).order('ordem'),
        supabase.from('horarios_funcionamento').select('dia_semana,abre,fecha,fechado').eq('loja_id', l.id),
      ])
      // Produtos e adicionais aparecem em ordem alfabética para o cliente (a ordem
      // definida no painel continua valendo só para categorias e para a organização interna).
      const porNome = <T extends { nome: string }>(a: T, b: T) => a.nome.localeCompare(b.nome, 'pt-BR')
      setCats(c.data ?? []); setProds([...(p.data ?? [])].sort(porNome)); setZonas(z.data ?? [])
      setGrupos((g.data as Grupo[]) ?? []); setItensAd([...((i.data as any) ?? [])].sort(porNome))
      setHorarios((h.data as Horario[]) ?? [])
      setRedes((rs.data as RedeSocial[]) ?? [])
      const formas = (fp.data as FormaPagamento[]) ?? []
      setFormasPag(formas)
      if (formas.length) setF(x => ({ ...x, pagamento: formas[0].nome }))
      const prodIds = (p.data ?? []).map(x => x.id)
      if (prodIds.length) {
        const lg = await supabase.from('produto_grupos_adicionais').select('produto_id,grupo_id').in('produto_id', prodIds)
        const mapa: Record<string, string[]> = {}
        for (const row of (lg.data as any[]) ?? []) (mapa[row.produto_id] ??= []).push(row.grupo_id)
        setLigacoes(mapa)
        const sg = await supabase.from('produto_sugestoes').select('produto_id,categoria_id').in('produto_id', prodIds)
        const mapaSug: Record<string, string[]> = {}
        for (const row of (sg.data as any[]) ?? []) (mapaSug[row.produto_id] ??= []).push(row.categoria_id)
        setSugestoes(mapaSug)
      }
      setCarga(false)
    })()
  }, [slug])

  // Reavalia o horário periodicamente, para o botão de pedir travar sozinho assim que
  // fechar, sem precisar recarregar a página.
  useEffect(() => {
    const id = setInterval(() => tickRelogio(t => t + 1), 30000)
    return () => clearInterval(id)
  }, [])
  const horario = statusHorario(horarios)
  const podeReceberPedido = loja?.aberta === true && horario.aberto

  const qtd = carrinho.reduce((s, l) => s + l.qtd, 0)
  const subtotal = carrinho.reduce((s, l) => s + linhaTotal(l), 0)
  const taxa = f.tipo === 'entrega' ? (zonas.find(z => z.bairro === f.bairro)?.taxa ?? 0) : 0
  const set = (k: keyof Form, v: string) => setF(x => ({ ...x, [k]: v }))
  const formaSelecionada = formasPag.find(x => x.nome === f.pagamento)
  const descontoValor = cupom ? (cupom.tipo === 'frete_gratis' ? taxa : cupom.desconto) : 0
  const totalFinal = Math.max(subtotal + taxa - descontoValor, 0)

  async function aplicarCupom() {
    if (!cupomCodigo.trim()) return
    if (!f.telefone.trim()) { setCupomErro('Informe seu telefone antes de aplicar o cupom.'); return }
    setAplicandoCupom(true); setCupomErro('')
    const { data, error } = await supabase.rpc('validar_cupom', {
      p_slug: slug,
      p_codigo: cupomCodigo.trim(),
      p_telefone: f.telefone,
      p_itens: carrinho.map(l => ({ produto_id: l.produto.id, qtd: l.qtd })),
    })
    setAplicandoCupom(false)
    if (error) { setCupomErro(error.message); setCupom(null); return }
    setCupom({ codigo: cupomCodigo.trim().toUpperCase(), tipo: data.tipo, desconto: data.desconto })
  }
  function removerCupom() { setCupom(null); setCupomCodigo(''); setCupomErro('') }

  // Ao sair do campo telefone, busca se esse número já pediu antes nesta loja e
  // preenche nome/endereço/pagamento automaticamente — só nos campos ainda vazios,
  // pra não sobrescrever o que o cliente já tiver digitado.
  async function buscarCliente() {
    const digitos = f.telefone.replace(/\D/g, '')
    if (digitos.length < 10) return
    const { data } = await supabase.rpc('buscar_cliente', { p_slug: slug, p_telefone: f.telefone })
    if (!data) return
    setF(x => ({
      ...x,
      nome: x.nome.trim() ? x.nome : (data.nome ?? x.nome),
      tipo: x.tipo === 'entrega' && data.tipo === 'retirada' && loja?.aceita_retirada ? 'retirada' : x.tipo,
      bairro: x.bairro ? x.bairro : (data.bairro ?? x.bairro),
      rua: x.rua ? x.rua : (data.rua ?? x.rua),
      numero: x.numero ? x.numero : (data.numero ?? x.numero),
      complemento: x.complemento ? x.complemento : (data.complemento ?? x.complemento),
      pagamento: x.pagamento ? x.pagamento : (data.pagamento ?? x.pagamento),
    }))
    setAutoPreenchido(true)
  }

  function gruposDoProduto(produtoId: string): Grupo[] {
    const ids = ligacoes[produtoId] ?? []
    return grupos.filter(g => ids.includes(g.id))
  }
  // Quando o produto tem um grupo de escolha única obrigatório (ex.: "Tamanho"), o preço
  // do produto pode ficar 0 e a diferença de preço fica em cada opção do grupo.
  // Nesse caso mostramos "A partir de R$ X" em vez do preço fixo do produto.
  // Se houver mais de um grupo obrigatório de seleção única (ex.: "Tamanho" e
  // "Acompanhamento"), somamos o menor valor de CADA um, pois o cliente é obrigado
  // a escolher em todos eles antes de fechar o pedido.
  function precoAPartir(p: Produto): number | null {
    const obrigs = gruposDoProduto(p.id).filter(g => g.obrigatorio && g.tipo === 'unica')
    if (obrigs.length === 0) return null
    let soma = 0
    for (const g of obrigs) {
      const its = itensAd.filter(i => i.grupo_id === g.id)
      if (its.length === 0) return null
      soma += Math.min(...its.map(i => i.preco))
    }
    return p.preco + soma
  }
  function abrirProduto(p: Produto) {
    const gs = gruposDoProduto(p.id)
    if (gs.length === 0) {
      // Sem adicionais: soma direto numa linha já existente daquele produto puro
      setCarrinho(c => {
        const existente = c.find(l => l.produto.id === p.id && l.selecoes.length === 0)
        if (existente) return c.map(l => l === existente ? { ...l, qtd: l.qtd + 1 } : l)
        return [...c, { id: novoId(), produto: p, qtd: 1, selecoes: [] }]
      })
      sugerirApos(p.id)
      return
    }
    setProdutoModal(p)
  }
  // Depois que o cliente adiciona um produto ao carrinho, mostra produtos de outras
  // categorias que o dono marcou como sugestão para esse produto (ex.: bebidas junto
  // com uma pizza), se houver algum cadastrado. Cada categoria sugerida aparece em
  // sua própria seção, nunca misturada com as outras.
  function sugerirApos(produtoId: string) {
    const catsSugeridas = sugestoes[produtoId] ?? []
    if (catsSugeridas.length === 0) return
    const secoes = cats
      .filter(c => catsSugeridas.includes(c.id))
      .map(c => ({ categoria: c, produtos: prods.filter(x => x.id !== produtoId && x.categoria_id === c.id) }))
      .filter(s => s.produtos.length > 0)
    if (secoes.length > 0) setSugestaoAberta(secoes)
  }
  async function compartilhar() {
    const url = window.location.href
    const dados = { title: loja?.nome, url }
    if (navigator.share) { try { await navigator.share(dados) } catch { /* usuário cancelou */ } ; return }
    try { await navigator.clipboard.writeText(url); alert('Link do cardápio copiado! É só colar para compartilhar.') }
    catch { prompt('Copie o link do cardápio:', url) }
  }
  function removerLinha(id: string) { setCarrinho(c => c.filter(l => l.id !== id)) }
  function mudarQtdLinha(id: string, d: number) {
    setCarrinho(c => c.map(l => l.id === id ? { ...l, qtd: Math.max(1, l.qtd + d) } : l).filter(l => l.qtd > 0))
  }
  function mudarQtdSimples(produtoId: string, d: number) {
    setCarrinho(c => {
      const existente = c.find(l => l.produto.id === produtoId && l.selecoes.length === 0)
      if (!existente) return c
      const n = existente.qtd + d
      if (n <= 0) return c.filter(l => l !== existente)
      return c.map(l => l === existente ? { ...l, qtd: n } : l)
    })
  }

  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (!loja) return
    setEnviando(true); setErro('')
    // O servidor recalcula preços, adicionais e taxa: o navegador não define valores.
    const { data, error } = await supabase.rpc('criar_pedido', {
      p_slug: slug,
      p_cliente: { nome: f.nome, telefone: f.telefone, tipo: f.tipo, bairro: f.bairro, rua: f.rua, numero: f.numero, complemento: f.complemento, endereco: enderecoCompleto(f), pagamento: f.pagamento, troco: f.troco, obs: f.obs },
      p_itens: carrinho.map(l => ({ produto_id: l.produto.id, qtd: l.qtd, adicionais: l.selecoes.map(s => ({ item_id: s.item_id, qtd: s.qtd })) })),
      p_cupom_codigo: cupom?.codigo ?? null,
    })
    setEnviando(false)
    if (error) { setErro(error.message); return }
    const linhas = [
      `*Novo pedido #${data.numero}* - ${loja.nome}`, '',
      ...carrinho.flatMap(l => [
        `${l.qtd}x ${l.produto.nome} - ${R(linhaTotal(l))}`,
        ...l.selecoes.map(s => `   + ${s.qtd}x ${s.nome}`),
      ]), '',
      `Subtotal: ${R(data.subtotal)}`,
      ...(f.tipo === 'entrega' ? [`Entrega (${f.bairro}): ${R(data.taxa)}`] : []),
      ...(data.desconto > 0 ? [`Cupom ${cupom?.codigo ?? ''}: -${R(data.desconto)}`] : []),
      `*Total: ${R(data.total)}*`, '',
      `Cliente: ${f.nome} (${f.telefone})`,
      f.tipo === 'entrega' ? `Endereço: ${enderecoCompleto(f)}, ${f.bairro}` : 'Retirada na loja',
      `Pagamento: ${f.pagamento}${formaSelecionada?.aceita_troco && f.troco ? ` (troco para ${f.troco})` : ''}`,
      ...(f.obs ? [`Obs: ${f.obs}`] : []),
    ]
    const url = `https://wa.me/${loja.whatsapp}?text=${encodeURIComponent(linhas.join('\n'))}`
    setZap(url); setEtapa('ok'); setCarrinho([])
    window.location.href = url
  }

  if (carga) return <p className="p-8">Carregando…</p>
  if (!loja) return <p className="p-8">{erro}</p>
  const cor = loja.cor

  return (
    <div className="mx-auto min-h-screen max-w-2xl bg-white pb-28 text-neutral-900">
      <div className="flex items-center justify-between gap-3 px-4 py-3" style={{ background: cor, color: texto(cor) }}>
        <div className="flex min-w-0 items-center gap-3">
          {loja.logo_url && <img src={loja.logo_url} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />}
          <span className="truncate text-lg font-bold">{loja.nome}</span>
        </div>
        <div className="flex shrink-0 items-center gap-4">
          <button type="button" aria-label="Compartilhar cardápio" onClick={compartilhar}><IconeCompartilhar /></button>
          {etapa === 'menu' && (
            <button type="button" aria-label="Buscar produto" onClick={() => setBuscaAberta(v => !v)}><IconeBusca /></button>
          )}
        </div>
      </div>
      {buscaAberta && etapa === 'menu' && (
        <div className="px-4 pb-3" style={{ background: cor }}>
          <input autoFocus className={campo} placeholder="Buscar produto pelo nome..." value={busca} onChange={e => setBusca(e.target.value)} />
        </div>
      )}
      <header>
        <h1 className="sr-only">{loja.nome}</h1>
        {(loja.banner_celular_url || loja.banner_pc_url) && (
          <picture>
            {loja.banner_pc_url && <source media="(min-width: 640px)" srcSet={loja.banner_pc_url} />}
            <img src={loja.banner_celular_url || loja.banner_pc_url || ''} alt="" className="block h-auto w-full" />
          </picture>
        )}
        {(horario.texto || loja.endereco) && (
        <div className="flex flex-col items-center gap-1 px-4 py-3 text-center text-sm sm:flex-row sm:justify-center sm:gap-4" style={{ background: cor, color: texto(cor) }}>
          {horario.texto && (
            <p className="flex items-center gap-1.5">
              <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
              {horario.texto}
            </p>
          )}
          {loja.endereco && (
            <p className="flex items-center gap-1.5">
              <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z" /><circle cx="12" cy="9.5" r="2.5" /></svg>
              {loja.endereco}
            </p>
          )}
        </div>
      )}
      </header>

      {etapa === 'menu' && (
        <main className="px-4">
          {!podeReceberPedido && (
            <p role="status" className="my-4 rounded-lg bg-red-100 p-3 text-red-800">
              A loja está fechada{horario.texto ? ` (${horario.texto.toLowerCase()})` : ''}. Você pode ver o cardápio, mas ainda não dá para pedir.
            </p>
          )}
          {cats.map(c => {
            const buscaLimpa = busca.trim().toLowerCase()
            const produtosCategoria = prods.filter(p => p.categoria_id === c.id && (!buscaLimpa || p.nome.toLowerCase().includes(buscaLimpa)))
            if (buscaLimpa && produtosCategoria.length === 0) return null
            return (
            <section key={c.id} className="mt-6">
              <h2 className="text-xl font-bold">{c.nome}</h2>
              {produtosCategoria.map(p => {
                const temAdicionais = gruposDoProduto(p.id).length > 0
                const linhaSimples = carrinho.find(l => l.produto.id === p.id && l.selecoes.length === 0)
                const qtdOutrasLinhas = carrinho.filter(l => l.produto.id === p.id && l.selecoes.length > 0).reduce((s, l) => s + l.qtd, 0)
                return (
                  <div key={p.id} className="flex items-center gap-3 border-b border-neutral-200 py-3">
                    {p.foto_url && <img src={p.foto_url} alt="" className="h-16 w-16 rounded-lg object-cover" />}
                    <div className="flex-1">
                      <p className="font-semibold">{p.nome}</p>
                      {p.descricao && <p className="text-sm text-neutral-600">{p.descricao}</p>}
                      <p className="font-bold">{precoAPartir(p) != null ? `A partir de ${R(precoAPartir(p)!)}` : R(p.preco)}</p>
                      {qtdOutrasLinhas > 0 && <p className="text-xs text-neutral-500">{qtdOutrasLinhas} no carrinho com adicionais</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      {!temAdicionais && linhaSimples && linhaSimples.qtd > 0 && (<>
                        <button aria-label={`Remover ${p.nome}`} onClick={() => mudarQtdSimples(p.id, -1)} className="h-9 w-9 rounded-full border border-neutral-400">-</button>
                        <span>{linhaSimples.qtd}</span>
                      </>)}
                      <button aria-label={`Adicionar ${p.nome}`} onClick={() => abrirProduto(p)} disabled={!podeReceberPedido} className="h-9 w-9 rounded-full disabled:opacity-40" style={{ background: cor, color: texto(cor) }}>+</button>
                    </div>
                  </div>
                )
              })}
            </section>
            )
          })}
          {busca.trim() && cats.every(c => prods.filter(p => p.categoria_id === c.id && p.nome.toLowerCase().includes(busca.trim().toLowerCase())).length === 0) && (
            <p className="mt-6 text-center text-neutral-600">Nenhum produto encontrado para "{busca.trim()}".</p>
          )}
          {qtd > 0 && (
            <div className="fixed inset-x-0 bottom-0 mx-auto max-w-2xl bg-white p-4 shadow-[0_-4px_12px_rgba(0,0,0,.15)]">
              <button onClick={() => setEtapa('checkout')} className="w-full rounded-lg bg-black py-3 font-bold" style={{ color: cor }}>Ver pedido ({qtd}) - {R(subtotal)}</button>
            </div>
          )}
        </main>
      )}

      {etapa === 'checkout' && (
        <form onSubmit={enviar} className="space-y-3 px-4 py-4">
          <h2 className="text-xl font-bold">Seu pedido</h2>
          {carrinho.map(l => (
            <div key={l.id} className="border-b border-neutral-100 pb-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button type="button" aria-label="Diminuir" onClick={() => mudarQtdLinha(l.id, -1)} className="h-7 w-7 rounded-full border border-neutral-400 text-sm">-</button>
                  <span className="text-sm">{l.qtd}x</span>
                  <button type="button" aria-label="Aumentar" onClick={() => mudarQtdLinha(l.id, 1)} className="h-7 w-7 rounded-full border border-neutral-400 text-sm">+</button>
                  <span>{l.produto.nome}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span>{R(linhaTotal(l))}</span>
                  <button type="button" onClick={() => removerLinha(l.id)} className="text-sm text-red-700 underline">remover</button>
                </div>
              </div>
              {l.selecoes.map((s, k) => <p key={k} className="pl-9 text-sm text-neutral-600">+ {s.qtd}x {s.nome}{s.preco > 0 && ` (${R(s.preco)})`}</p>)}
            </div>
          ))}
          <label className="block">
            <span className={rotulo}>WhatsApp / Telefone</span>
            <input required className={campo} placeholder="(11) 99999-9999" inputMode="tel" autoComplete="tel" pattern="\(\d{2}\) \d{4,5}-\d{4}" title="Digite o telefone com DDD: (xx) xxxxx-xxxx" value={f.telefone} onChange={e => { set('telefone', mascaraTelefone(e.target.value)); setAutoPreenchido(false) }} onBlur={buscarCliente} />
          </label>
          {autoPreenchido && <p className="text-sm text-green-700">Encontramos seu cadastro! Preenchemos os dados do seu último pedido — pode ajustar o que precisar.</p>}
          <label className="block">
            <span className={rotulo}>Nome</span>
            <input required className={campo} placeholder="Seu nome" autoComplete="name" value={f.nome} onChange={e => set('nome', e.target.value)} />
          </label>
          <label className="block">
            <span className={rotulo}>Entrega ou retirada</span>
            <select className={campo} value={f.tipo} onChange={e => set('tipo', e.target.value)}>
              <option value="entrega">Entrega</option>
              {loja.aceita_retirada && <option value="retirada">Retirar na loja</option>}
            </select>
          </label>
          {f.tipo === 'retirada' && loja.endereco && <p className="text-sm">Retirada em: {loja.endereco}</p>}
          {f.tipo === 'entrega' && (<>
            <label className="block">
              <span className={rotulo}>Bairro</span>
              <select required className={campo} value={f.bairro} onChange={e => set('bairro', e.target.value)}>
                <option value="">Escolha o bairro</option>
                {zonas.map(z => <option key={z.bairro} value={z.bairro}>{z.bairro} ({R(z.taxa)})</option>)}
              </select>
            </label>
            <label className="block">
              <span className={rotulo}>Rua</span>
              <input required className={campo} placeholder="Nome da rua" value={f.rua} onChange={e => set('rua', e.target.value)} />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className={rotulo}>Número</span>
                <input required className={campo} placeholder="Ex.: 123" value={f.numero} onChange={e => set('numero', e.target.value)} />
              </label>
              <label className="block">
                <span className={rotulo}>Complemento</span>
                <input className={campo} placeholder="Opcional" value={f.complemento} onChange={e => set('complemento', e.target.value)} />
              </label>
            </div>
          </>)}
          <label className="block">
            <span className={rotulo}>Forma de pagamento</span>
            <select required className={campo} value={f.pagamento} onChange={e => set('pagamento', e.target.value)}>
              {formasPag.length === 0 && <option value="">Nenhuma forma de pagamento cadastrada</option>}
              {formasPag.map(fp => <option key={fp.id} value={fp.nome}>{fp.nome}</option>)}
            </select>
          </label>
          {formaSelecionada?.aceita_troco && (
            <label className="block">
              <span className={rotulo}>Troco para quanto?</span>
              <input className={campo} placeholder="Opcional" value={f.troco} onChange={e => set('troco', e.target.value)} />
            </label>
          )}
          <label className="block">
            <span className={rotulo}>Observações</span>
            <textarea className={campo} placeholder="Opcional" value={f.obs} onChange={e => set('obs', e.target.value)} />
          </label>
          <div>
            <span className={rotulo}>Cupom de desconto</span>
            <div className="flex gap-2">
              <input className={campo} placeholder="Digite o código" aria-label="Cupom de desconto" value={cupomCodigo} onChange={e => setCupomCodigo(e.target.value.toUpperCase())} disabled={!!cupom} />
              {cupom ? (
                <button type="button" onClick={removerCupom} className="shrink-0 rounded-lg border border-neutral-400 px-4 py-2 font-bold">Remover</button>
              ) : (
                <button type="button" disabled={aplicandoCupom || !cupomCodigo.trim()} onClick={aplicarCupom} className="shrink-0 rounded-lg border border-neutral-400 px-4 py-2 font-bold disabled:opacity-50">{aplicandoCupom ? 'Aplicando…' : 'Aplicar'}</button>
              )}
            </div>
            {cupomErro && <p className="mt-1 text-sm text-red-700">{cupomErro}</p>}
            {cupom && <p className="mt-1 text-sm text-green-700">Cupom {cupom.codigo} aplicado{cupom.tipo === 'frete_gratis' ? ': frete grátis' : `: -${R(descontoValor)}`}</p>}
          </div>
          <p className="text-right">Subtotal {R(subtotal)}{f.tipo === 'entrega' && <> | Entrega {R(taxa)}</>}</p>
          {descontoValor > 0 && <p className="text-right text-green-700">Desconto -{R(descontoValor)}</p>}
          <p className="text-right text-xl font-bold">Total {R(totalFinal)}</p>
          {!podeReceberPedido && (
            <p role="alert" className="rounded-lg bg-red-100 p-3 text-red-800">A loja fechou enquanto você montava o pedido{horario.texto ? ` (${horario.texto.toLowerCase()})` : ''}. Não dá mais para enviar agora.</p>
          )}
          {erro && <p role="alert" className="text-red-700">{erro}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => setEtapa('menu')} className="rounded-lg border border-neutral-400 px-4 py-3 font-bold">Voltar ao cardápio</button>
            <button disabled={enviando || !podeReceberPedido} className="flex-1 rounded-lg py-3 font-bold disabled:opacity-50" style={{ background: cor, color: texto(cor) }}>{enviando ? 'Enviando…' : 'Enviar pedido no WhatsApp'}</button>
          </div>
        </form>
      )}

      {etapa === 'ok' && (
        <main className="space-y-3 px-4 py-8">
          <h2 className="text-2xl font-bold">Pedido enviado!</h2>
          <p>Se o WhatsApp não abriu, toque no botão e envie a mensagem para a loja.</p>
          <a href={zap} className="inline-block rounded-lg px-4 py-3 font-bold" style={{ background: cor, color: texto(cor) }}>Abrir WhatsApp</a>
        </main>
      )}

      {produtoModal && (
        <ModalAdicionais
          produto={produtoModal}
          grupos={gruposDoProduto(produtoModal.id)}
          itensPorGrupo={g => itensAd.filter(i => i.grupo_id === g)}
          cor={cor}
          fechar={() => setProdutoModal(null)}
          adicionar={(qtdProduto, selecoes) => {
            setCarrinho(c => [...c, { id: novoId(), produto: produtoModal, qtd: qtdProduto, selecoes }])
            setProdutoModal(null)
            sugerirApos(produtoModal.id)
          }}
        />
      )}

      {sugestaoAberta && (
        <ModalSugestao
          secoes={sugestaoAberta}
          cor={cor}
          fechar={() => setSugestaoAberta(null)}
          adicionar={p => { setSugestaoAberta(null); abrirProduto(p) }}
        />
      )}

      <footer className="mt-10 space-y-3 border-t border-neutral-200 bg-neutral-50 px-4 py-6 text-center text-sm text-neutral-600">
        {loja.logo_url && <img src={loja.logo_url} alt={loja.nome} className="mx-auto h-24 w-24 rounded-full object-cover" />}
        <p className="font-semibold text-neutral-800">{loja.nome}</p>
        {loja.cpf_cnpj && <p>CNPJ/CPF: {loja.cpf_cnpj}</p>}
        {loja.endereco && <p>{loja.endereco}</p>}
        {redes.length > 0 && (
          <div className="flex justify-center gap-4 pt-1">
            {redes.map(r => (
              <a key={r.rede} href={r.url} target="_blank" rel="noopener noreferrer" aria-label={NOME_REDE[r.rede]} className="text-neutral-600 hover:text-neutral-900">
                <IconeRede rede={r.rede} />
              </a>
            ))}
          </div>
        )}
        <p className="border-t border-neutral-200 pt-3 text-xs text-neutral-500">
          Sistema desenvolvido por <a href="https://gestaoexpress.com.br/" target="_blank" rel="noopener noreferrer" className="font-semibold underline hover:text-neutral-800">Gestão Express</a>, quer um catálogo igual este clique <a href="https://getzapdelivery.com.br" target="_blank" rel="noopener noreferrer" className="font-semibold underline hover:text-neutral-800">aqui.</a>
        </p>
      </footer>
    </div>
  )
}

function ModalAdicionais({ produto, grupos, itensPorGrupo, cor, fechar, adicionar }: {
  produto: Produto; grupos: Grupo[]; itensPorGrupo: (grupoId: string) => ItemAd[]; cor: string
  fechar: () => void; adicionar: (qtd: number, selecoes: Selecao[]) => void
}) {
  const [qtdProduto, setQtdProduto] = useState(1)
  // escolhas[grupoId][itemId] = quantidade escolhida
  const [escolhas, setEscolhas] = useState<Record<string, Record<string, number>>>({})

  function somaGrupo(grupoId: string) {
    return Object.values(escolhas[grupoId] ?? {}).reduce((s, n) => s + n, 0)
  }
  function escolherUnica(grupoId: string, itemId: string) {
    setEscolhas(e => ({ ...e, [grupoId]: { [itemId]: 1 } }))
  }
  function mudarQtdItem(grupoId: string, item: ItemAd, d: number) {
    setEscolhas(e => {
      const atual = e[grupoId]?.[item.id] ?? 0
      const grupo = grupos.find(g => g.id === grupoId)
      const somaAtual = Object.values(e[grupoId] ?? {}).reduce((s, n) => s + n, 0)
      let novo = atual + d
      if (novo < 0) novo = 0
      if (novo > item.quantidade_maxima) novo = item.quantidade_maxima
      if (d > 0 && grupo?.maximo != null && somaAtual + d > grupo.maximo) return e
      const grupoAtual = { ...(e[grupoId] ?? {}) }
      if (novo === 0) delete grupoAtual[item.id]; else grupoAtual[item.id] = novo
      return { ...e, [grupoId]: grupoAtual }
    })
  }
  function alternarCheckbox(grupoId: string, item: ItemAd) {
    setEscolhas(e => {
      const grupo = grupos.find(g => g.id === grupoId)
      const grupoAtual = { ...(e[grupoId] ?? {}) }
      if (grupoAtual[item.id]) { delete grupoAtual[item.id]; return { ...e, [grupoId]: grupoAtual } }
      const somaAtual = Object.values(grupoAtual).reduce((s, n) => s + n, 0)
      if (grupo?.maximo != null && somaAtual + 1 > grupo.maximo) return e
      grupoAtual[item.id] = 1
      return { ...e, [grupoId]: grupoAtual }
    })
  }
  const faltamObrigatorios = grupos.filter(g => g.obrigatorio && somaGrupo(g.id) < 1)
  const podeAdicionar = faltamObrigatorios.length === 0

  function confirmar() {
    if (!podeAdicionar) return
    const selecoes: Selecao[] = []
    for (const g of grupos) {
      const its = itensPorGrupo(g.id)
      for (const [itemId, qtd] of Object.entries(escolhas[g.id] ?? {})) {
        if (qtd <= 0) continue
        const item = its.find(i => i.id === itemId)
        if (item) selecoes.push({ item_id: item.id, nome: item.nome, preco: item.preco, qtd })
      }
    }
    adicionar(qtdProduto, selecoes)
  }

  const totalAdicionais = Object.entries(escolhas).flatMap(([gId, itens]) => Object.entries(itens).map(([itemId, qtd]) => {
    const item = itensPorGrupo(gId).find(i => i.id === itemId)
    return (item?.preco ?? 0) * qtd
  })).reduce((s, n) => s + n, 0)
  const totalLinha = (produto.preco + totalAdicionais) * qtdProduto

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" role="dialog" aria-modal="true">
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-4 sm:rounded-2xl">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold">{produto.nome}</h2>
            {produto.preco > 0 && <p className="text-neutral-600">{R(produto.preco)}</p>}
          </div>
          <button aria-label="Fechar" onClick={fechar} className="text-2xl leading-none text-neutral-500">&times;</button>
        </div>

        {grupos.map(g => {
          const its = itensPorGrupo(g.id)
          const soma = somaGrupo(g.id)
          return (
            <div key={g.id} className="mb-4 border-t border-neutral-200 pt-3">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-bold">{g.nome}</h3>
                <span className="text-xs text-neutral-500">
                  {g.tipo === 'unica' ? 'Escolha 1' : g.maximo ? `Escolha até ${g.maximo}` : 'Escolha quantos quiser'}
                  {g.obrigatorio ? ' · obrigatório' : ' · opcional'}
                </span>
              </div>
              <div className="space-y-2">
                {its.map(item => {
                  const q = escolhas[g.id]?.[item.id] ?? 0
                  if (g.tipo === 'unica') {
                    return (
                      <label key={item.id} className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2">
                          <input type="radio" name={`grupo-${g.id}`} checked={q > 0} onChange={() => escolherUnica(g.id, item.id)} />
                          {item.nome}
                        </span>
                        {item.preco > 0 && <span className="text-sm text-neutral-600">+{R(item.preco)}</span>}
                      </label>
                    )
                  }
                  if (item.permite_quantidade) {
                    return (
                      <div key={item.id} className="flex items-center justify-between gap-2">
                        <span>{item.nome} {item.preco > 0 && <span className="text-sm text-neutral-600">(+{R(item.preco)} cada)</span>}</span>
                        <span className="flex items-center gap-2">
                          <button type="button" aria-label={`Diminuir ${item.nome}`} onClick={() => mudarQtdItem(g.id, item, -1)} className="h-7 w-7 rounded-full border border-neutral-400 text-sm">-</button>
                          <span>{q}</span>
                          <button type="button" aria-label={`Aumentar ${item.nome}`} onClick={() => mudarQtdItem(g.id, item, 1)} disabled={q >= item.quantidade_maxima || (g.maximo != null && soma >= g.maximo)} className="h-7 w-7 rounded-full border border-neutral-400 text-sm disabled:opacity-30">+</button>
                        </span>
                      </div>
                    )
                  }
                  return (
                    <label key={item.id} className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2">
                        <input type="checkbox" checked={q > 0} onChange={() => alternarCheckbox(g.id, item)} disabled={q === 0 && g.maximo != null && soma >= g.maximo} />
                        {item.nome}
                      </span>
                      {item.preco > 0 && <span className="text-sm text-neutral-600">+{R(item.preco)}</span>}
                    </label>
                  )
                })}
              </div>
            </div>
          )
        })}

        <div className="mt-2 flex items-center justify-between border-t border-neutral-200 pt-3">
          <span className="font-semibold">Quantidade</span>
          <span className="flex items-center gap-3">
            <button type="button" aria-label="Diminuir quantidade" onClick={() => setQtdProduto(q => Math.max(1, q - 1))} className="h-8 w-8 rounded-full border border-neutral-400">-</button>
            <span>{qtdProduto}</span>
            <button type="button" aria-label="Aumentar quantidade" onClick={() => setQtdProduto(q => q + 1)} className="h-8 w-8 rounded-full border border-neutral-400">+</button>
          </span>
        </div>

        {!podeAdicionar && <p className="mt-3 text-sm text-red-700">Escolha uma opção em: {faltamObrigatorios.map(g => g.nome).join(', ')}.</p>}

        <button onClick={confirmar} disabled={!podeAdicionar} className="mt-4 w-full rounded-lg py-3 font-bold disabled:opacity-40" style={{ background: cor, color: texto(cor) }}>
          Adicionar ao pedido - {R(totalLinha)}
        </button>
      </div>
    </div>
  )
}

// Mostrada logo depois que o cliente adiciona um produto ao carrinho, sugerindo outros
// produtos (de categorias que o dono marcou no cadastro, ex.: bebidas junto com pizza).
// Cada categoria sugerida vem em sua própria seção, nunca misturada com as outras.
function ModalSugestao({ secoes, cor, fechar, adicionar }: { secoes: { categoria: Categoria; produtos: Produto[] }[]; cor: string; fechar: () => void; adicionar: (p: Produto) => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" role="dialog" aria-modal="true">
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-4 sm:rounded-2xl">
        <div className="mb-3 flex items-start justify-between gap-2">
          <h2 className="text-lg font-bold">Que tal adicionar também?</h2>
          <button aria-label="Fechar" onClick={fechar} className="text-2xl leading-none text-neutral-500">&times;</button>
        </div>
        <div className="space-y-4">
          {secoes.map(({ categoria, produtos }) => (
            <div key={categoria.id}>
              <h3 className="mb-2 font-bold">{categoria.nome}</h3>
              <div className="space-y-2">
                {produtos.map(p => (
                  <div key={p.id} className="flex items-center gap-3 rounded-lg border border-neutral-200 p-2">
                    {p.foto_url && <img src={p.foto_url} alt="" className="h-14 w-14 rounded-lg object-cover" />}
                    <div className="flex-1">
                      <p className="font-semibold">{p.nome}</p>
                      <p className="text-sm text-neutral-600">{R(p.preco)}</p>
                    </div>
                    <button type="button" onClick={() => adicionar(p)} className="rounded-lg px-3 py-2 text-sm font-bold" style={{ background: cor, color: texto(cor) }}>Adicionar</button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <button type="button" onClick={fechar} className="mt-4 w-full rounded-lg border border-neutral-400 py-3 font-bold">Não, obrigado</button>
      </div>
    </div>
  )
}
