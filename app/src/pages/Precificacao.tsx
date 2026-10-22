// Módulo de Precificação (aba Loja → Precificação). Liberado por loja no painel admin.
// Lógica: preço sugerido = custo do produto ÷ (1 − % custo fixo − % taxas − % lucro desejado),
// em que % custo fixo = custos fixos do mês ÷ faturamento médio mensal.
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

type Config = { faturamento_medio: number; imposto_pct: number; cartao_pct: number; delivery_pct: number; outros_pct: number; lucro_padrao_pct: number }
type CustoFixo = { id: string; descricao: string; valor: number }
type Insumo = { id: string; nome: string; unidade: string; qtd_compra: number; valor_compra: number }
type FichaItem = { id?: string; insumo_id: string; qtd: number }
type Ficha = { id: string; produto_id: string; rendimento: number; lucro_pct: number | null; ficha_itens: FichaItem[] }
type Produto = { id: string; nome: string; preco: number; ativo: boolean; categoria_id: string | null }
type Categoria = { id: string; nome: string }

const R = (n: number) => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
// Aceita "6,50", "1.000,50" e "6.5"
const NUM = (s: string) => { const t = String(s).trim(); return Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t) }
const PCT = (n: number) => `${(n * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
const UNIDADES: Record<string, string> = { g: 'g', kg: 'kg', ml: 'ml', l: 'litro', und: 'unidade' }
const campo = 'w-full rounded-lg border border-neutral-300 bg-white px-3 py-2'
const botao = 'rounded-lg bg-[#1A7F37] px-4 py-2 font-bold text-white disabled:opacity-50'
const claro = 'rounded-lg border border-neutral-400 bg-white px-3 py-2'
const vermelho = 'rounded-lg bg-red-600 px-3 py-2 font-bold text-white hover:bg-red-700'
const azul = 'rounded-lg bg-blue-600 px-3 py-2 font-bold text-white hover:bg-blue-700'
const cartao = 'rounded-xl border border-neutral-200 bg-white p-4'
const CONFIG_VAZIA: Config = { faturamento_medio: 0, imposto_pct: 0, cartao_pct: 0, delivery_pct: 0, outros_pct: 0, lucro_padrao_pct: 15 }

function registrarLog(lojaId: string, acao: string) {
  supabase.auth.getUser().then(({ data }) => {
    supabase.from('logs_atividade').insert({ loja_id: lojaId, usuario_email: data.user?.email ?? null, acao }).then()
  })
}

export type Calculo = { custo: number; lucroPct: number; sugerido: number | null; preco: number; lucroAplicado: number | null; lucroR: number; margem: number; status: 'sem_ficha' | 'ajustar' | 'ok' | 'sem_preco' }

// Cálculo de um produto a partir da ficha técnica e do preço atual do cardápio
function calcular(ficha: Ficha | undefined, preco: number, insumos: Map<string, Insumo>, cf: number, tx: number, cfg: Config): Calculo {
  const lucroPct = ((ficha?.lucro_pct ?? cfg.lucro_padrao_pct) || 0) / 100
  if (!ficha) return { custo: 0, lucroPct, sugerido: null, preco, lucroAplicado: null, lucroR: 0, margem: 0, status: 'sem_ficha' }
  const total = ficha.ficha_itens.reduce((s, i) => { const ins = insumos.get(i.insumo_id); return s + (ins ? i.qtd * (ins.valor_compra / ins.qtd_compra) : 0) }, 0)
  const custo = total / (ficha.rendimento || 1)
  const den = 1 - cf - tx - lucroPct
  const sugerido = den > 0 ? custo / den : null
  if (!(preco > 0)) return { custo, lucroPct, sugerido, preco, lucroAplicado: null, lucroR: 0, margem: 0, status: 'sem_preco' }
  const lucroAplicado = (preco - preco * tx - preco * cf - custo) / preco
  return { custo, lucroPct, sugerido, preco, lucroAplicado, lucroR: preco * lucroAplicado, margem: preco * (1 - tx) - custo, status: lucroAplicado < lucroPct ? 'ajustar' : 'ok' }
}

function Aviso({ ok }: { ok: boolean }) {
  return ok ? <p role="status" className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-[#1A7F37] px-5 py-3 font-bold text-white shadow-lg">✓ Dados salvos com sucesso</p> : null
}
function useAviso() {
  const [ok, setOk] = useState(false)
  const t = useRef<number | undefined>(undefined)
  const avisar = useCallback(() => { setOk(true); window.clearTimeout(t.current); t.current = window.setTimeout(() => setOk(false), 2500) }, [])
  return [ok, avisar] as const
}
const Selo = ({ s }: { s: Calculo['status'] }) => {
  const m = { sem_ficha: ['Sem ficha', 'bg-neutral-100 text-neutral-600'], sem_preco: ['Preço 0 no cardápio', 'bg-neutral-100 text-neutral-600'], ajustar: ['Ajustar preço', 'bg-red-100 text-red-800'], ok: ['Dentro da margem', 'bg-green-100 text-green-800'] }[s]
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-bold ${m[1]}`}>{m[0]}</span>
}

export default function Precificacao({ lojaId }: { lojaId: string }) {
  const [sub, setSub] = useState<'custos' | 'insumos' | 'fichas' | 'resumo'>('custos')
  const [carga, setCarga] = useState(true)
  const [erro, setErro] = useState('')
  const [cfg, setCfg] = useState<Config>(CONFIG_VAZIA)
  const [custos, setCustos] = useState<CustoFixo[]>([])
  const [insumos, setInsumos] = useState<Insumo[]>([])
  const [fichas, setFichas] = useState<Ficha[]>([])
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [salvoOk, avisar] = useAviso()

  const carregar = useCallback(async () => {
    const [c, cf, ins, fi, pr, ca] = await Promise.all([
      supabase.from('precificacao_config').select('*').eq('loja_id', lojaId).maybeSingle(),
      supabase.from('custos_fixos').select('id,descricao,valor').eq('loja_id', lojaId).order('criado_em'),
      supabase.from('insumos').select('id,nome,unidade,qtd_compra,valor_compra').eq('loja_id', lojaId).order('nome'),
      supabase.from('fichas_tecnicas').select('id,produto_id,rendimento,lucro_pct,ficha_itens(id,insumo_id,qtd)').eq('loja_id', lojaId),
      supabase.from('produtos').select('id,nome,preco,ativo,categoria_id').eq('loja_id', lojaId).order('nome'),
      supabase.from('categorias').select('id,nome').eq('loja_id', lojaId).order('ordem'),
    ])
    const e = c.error || cf.error || ins.error || fi.error || pr.error || ca.error
    if (e) setErro(e.message)
    else {
      setErro('')
      setCfg(c.data ? Object.fromEntries((Object.keys(CONFIG_VAZIA) as (keyof Config)[]).map(k => [k, Number(c.data[k] ?? 0)])) as Config : CONFIG_VAZIA)
      setCustos((cf.data ?? []).map(x => ({ ...x, valor: Number(x.valor) })))
      setInsumos((ins.data ?? []).map(x => ({ ...x, qtd_compra: Number(x.qtd_compra), valor_compra: Number(x.valor_compra) })))
      setFichas(((fi.data ?? []) as Ficha[]).map(f => ({ ...f, rendimento: Number(f.rendimento), lucro_pct: f.lucro_pct == null ? null : Number(f.lucro_pct), ficha_itens: f.ficha_itens.map(i => ({ ...i, qtd: Number(i.qtd) })) })))
      setProdutos((pr.data ?? []).map(x => ({ ...x, preco: Number(x.preco) })))
      setCategorias(ca.data ?? [])
    }
    setCarga(false)
  }, [lojaId])
  useEffect(() => { carregar() }, [carregar])

  const totalFixos = custos.reduce((s, c) => s + c.valor, 0)
  const cf = cfg.faturamento_medio > 0 ? totalFixos / cfg.faturamento_medio : 0
  const tx = (cfg.imposto_pct + cfg.cartao_pct + cfg.delivery_pct + cfg.outros_pct) / 100
  const mapaIns = useMemo(() => new Map(insumos.map(i => [i.id, i])), [insumos])
  const mapaFicha = useMemo(() => new Map(fichas.map(f => [f.produto_id, f])), [fichas])
  const calc = (p: Produto) => calcular(mapaFicha.get(p.id), p.preco, mapaIns, cf, tx, cfg)
  const ctx = { lojaId, cfg, custos, insumos, fichas, produtos, categorias, totalFixos, cf, tx, mapaIns, mapaFicha, calc, carregar, setErro, avisar }

  return (
    <section className="space-y-4">
      <Aviso ok={salvoOk} />
      <div className="flex flex-wrap gap-2">
        {([['custos', 'Custos e taxas'], ['insumos', 'Insumos'], ['fichas', 'Fichas técnicas'], ['resumo', 'Resumo']] as const).map(([id, nome]) => (
          <button key={id} onClick={() => setSub(id)} className={sub === id ? botao : claro}>{nome}</button>
        ))}
      </div>
      {erro && <p role="alert" className="rounded-lg bg-red-100 p-3 text-red-800">{erro}</p>}
      {carga ? <p>Carregando…</p> : (<>
        {sub === 'custos' && <Custos {...ctx} />}
        {sub === 'insumos' && <Insumos {...ctx} />}
        {sub === 'fichas' && <Fichas {...ctx} />}
        {sub === 'resumo' && <Resumo {...ctx} />}
      </>)}
    </section>
  )
}

type Ctx = { lojaId: string; cfg: Config; custos: CustoFixo[]; insumos: Insumo[]; fichas: Ficha[]; produtos: Produto[]; categorias: Categoria[]; totalFixos: number; cf: number; tx: number; mapaIns: Map<string, Insumo>; mapaFicha: Map<string, Ficha>; calc: (p: Produto) => Calculo; carregar: () => Promise<void>; setErro: (m: string) => void; avisar: () => void }

// ───────────── Custos e taxas ─────────────
function Custos({ lojaId, cfg, custos, totalFixos, cf, tx, carregar, setErro, avisar }: Ctx) {
  const txt = (n: number) => (n ? String(n).replace('.', ',') : '')
  const [f, setF] = useState({ faturamento_medio: txt(cfg.faturamento_medio), imposto_pct: txt(cfg.imposto_pct), cartao_pct: txt(cfg.cartao_pct), delivery_pct: txt(cfg.delivery_pct), outros_pct: txt(cfg.outros_pct), lucro_padrao_pct: txt(cfg.lucro_padrao_pct) })
  const [novoDesc, setNovoDesc] = useState('')
  const [novoValor, setNovoValor] = useState('')
  async function salvarConfig(e: FormEvent) {
    e.preventDefault()
    const dados = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.trim() === '' ? 0 : NUM(v)])) as Config
    if (Object.values(dados).some(v => !(v >= 0))) return setErro('Confira os valores: use apenas números.')
    if (['imposto_pct', 'cartao_pct', 'delivery_pct', 'outros_pct', 'lucro_padrao_pct'].some(k => dados[k as keyof Config] > 100)) return setErro('Os percentuais vão de 0 a 100.')
    const { error } = await supabase.from('precificacao_config').upsert({ loja_id: lojaId, ...dados, atualizado_em: new Date().toISOString() })
    if (error) return setErro(error.message)
    setErro(''); registrarLog(lojaId, 'Precificação: faturamento e taxas atualizados'); avisar(); carregar()
  }
  async function addCusto(e: FormEvent) {
    e.preventDefault()
    const valor = NUM(novoValor)
    if (!novoDesc.trim() || !(valor >= 0) || novoValor.trim() === '') return setErro('Informe a descrição e o valor do custo fixo.')
    const { error } = await supabase.from('custos_fixos').insert({ loja_id: lojaId, descricao: novoDesc.trim(), valor })
    if (error) return setErro(error.message)
    setErro(''); setNovoDesc(''); setNovoValor(''); registrarLog(lojaId, `Precificação: custo fixo "${novoDesc.trim()}" incluído`); carregar()
  }
  const totalPct = cf + tx
  return (
    <div className="space-y-4">
      <form onSubmit={salvarConfig} className={`${cartao} space-y-3`}>
        <h3 className="font-bold">Faturamento e taxas</h3>
        <label className="block"><span className="text-sm font-semibold">Faturamento médio mensal (R$)</span>
          <input className={campo} inputMode="decimal" placeholder="Ex.: 10000" value={f.faturamento_medio} onChange={e => setF({ ...f, faturamento_medio: e.target.value })} /></label>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {([['imposto_pct', '% Imposto'], ['cartao_pct', '% Maquininha / cartão'], ['delivery_pct', '% iFood e outros apps'], ['outros_pct', '% Outras taxas']] as const).map(([k, l]) => (
            <label key={k} className="block"><span className="text-sm font-semibold">{l}</span>
              <input className={campo} inputMode="decimal" placeholder="0" value={f[k]} onChange={e => setF({ ...f, [k]: e.target.value })} /></label>
          ))}
        </div>
        <label className="block sm:w-1/2"><span className="text-sm font-semibold">Lucro desejado padrão (%)</span>
          <input className={campo} inputMode="decimal" placeholder="15" value={f.lucro_padrao_pct} onChange={e => setF({ ...f, lucro_padrao_pct: e.target.value })} />
          <span className="text-xs text-neutral-600">Usado nas fichas técnicas que não tiverem um lucro próprio.</span></label>
        <button className={botao}>Salvar</button>
      </form>

      <div className={`${cartao} space-y-3`}>
        <h3 className="font-bold">Custos fixos do mês</h3>
        <p className="text-sm text-neutral-600">Água, luz, internet, aluguel, salários, contador… tudo que você paga todo mês, vendendo ou não.</p>
        <div className="space-y-2">
          {custos.map(c => <LinhaCusto key={c.id + c.descricao + c.valor} c={c} lojaId={lojaId} carregar={carregar} setErro={setErro} avisar={avisar} />)}
        </div>
        <form onSubmit={addCusto} className="flex flex-wrap gap-2">
          <input className={`${campo} min-w-0 flex-1`} placeholder="Descrição (ex.: Aluguel)" value={novoDesc} onChange={e => setNovoDesc(e.target.value)} />
          <input className={`${campo} w-32`} inputMode="decimal" placeholder="Valor R$" value={novoValor} onChange={e => setNovoValor(e.target.value)} />
          <button className={botao}>Adicionar</button>
        </form>
        <div className="flex justify-between border-t border-neutral-200 pt-2 font-bold"><span>Total de custos fixos</span><span>{R(totalFixos)}</span></div>
      </div>

      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
        {cfg.faturamento_medio > 0 ? (<>
          <p>Custo fixo: <b>{PCT(cf)}</b> do faturamento · Taxas e impostos: <b>{PCT(tx)}</b> · Lucro padrão: <b>{PCT(cfg.lucro_padrao_pct / 100)}</b></p>
          <p className="mt-1">Ou seja, de cada R$ 100,00 vendidos, {R(totalPct * 100)} vão para custos fixos e taxas{totalPct + cfg.lucro_padrao_pct / 100 >= 1 ? '. Atenção: custos + taxas + lucro passam de 100%, não dá para calcular um preço. Revise os valores.' : '.'}</p>
        </>) : <p>Informe o faturamento médio mensal para calcular quanto o custo fixo pesa em cada venda.</p>}
      </div>
    </div>
  )
}

function LinhaCusto({ c, lojaId, carregar, setErro, avisar }: { c: CustoFixo; lojaId: string; carregar: () => Promise<void>; setErro: (m: string) => void; avisar: () => void }) {
  const [desc, setDesc] = useState(c.descricao)
  const [valor, setValor] = useState(String(c.valor).replace('.', ','))
  const mudou = desc !== c.descricao || NUM(valor) !== c.valor
  async function salvar() {
    const v = NUM(valor)
    if (!desc.trim() || !(v >= 0)) return setErro('Informe a descrição e o valor do custo fixo.')
    const { error } = await supabase.from('custos_fixos').update({ descricao: desc.trim(), valor: v }).eq('id', c.id)
    if (error) return setErro(error.message)
    setErro(''); avisar(); carregar()
  }
  async function excluir() {
    if (!confirm(`Excluir o custo "${c.descricao}"?`)) return
    const { error } = await supabase.from('custos_fixos').delete().eq('id', c.id)
    if (error) return setErro(error.message)
    registrarLog(lojaId, `Precificação: custo fixo "${c.descricao}" excluído`); carregar()
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input className={`${campo} min-w-0 flex-1`} value={desc} onChange={e => setDesc(e.target.value)} />
      <input className={`${campo} w-32`} inputMode="decimal" value={valor} onChange={e => setValor(e.target.value)} />
      {mudou && <button className={botao} onClick={salvar}>Salvar</button>}
      <button className={vermelho} onClick={excluir}>Excluir</button>
    </div>
  )
}

// ───────────── Insumos ─────────────
function Insumos({ lojaId, insumos, carregar, setErro, avisar }: Ctx) {
  const [busca, setBusca] = useState('')
  const lista = insumos.filter(i => i.nome.toLowerCase().includes(busca.trim().toLowerCase()))
  return (
    <div className="space-y-4">
      <div className={`${cartao} space-y-2`}>
        <h3 className="font-bold">Novo insumo</h3>
        <p className="text-sm text-neutral-600">Cadastre como você compra. Ex.: Leite, ml, 1000, R$ 6,50. O sistema calcula o custo por ml. Embalagens também entram aqui (unidade).</p>
        <FormInsumo lojaId={lojaId} carregar={carregar} setErro={setErro} avisar={avisar} />
      </div>
      <div className={`${cartao} space-y-2`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-bold">Insumos cadastrados ({insumos.length})</h3>
          <input className={`${campo} sm:w-64`} placeholder="Buscar insumo" value={busca} onChange={e => setBusca(e.target.value)} />
        </div>
        {lista.length === 0 ? <p className="text-neutral-600">Nenhum insumo {busca ? 'encontrado' : 'cadastrado ainda'}.</p> :
          <div className="divide-y divide-neutral-100">{lista.map(i => <FormInsumo key={i.id + i.nome + i.unidade + i.qtd_compra + i.valor_compra} item={i} lojaId={lojaId} carregar={carregar} setErro={setErro} avisar={avisar} />)}</div>}
      </div>
    </div>
  )
}

function FormInsumo({ item, lojaId, carregar, setErro, avisar }: { item?: Insumo; lojaId: string; carregar: () => Promise<void>; setErro: (m: string) => void; avisar: () => void }) {
  const [nome, setNome] = useState(item?.nome ?? '')
  const [unidade, setUnidade] = useState(item?.unidade ?? 'g')
  const [qtd, setQtd] = useState(item ? String(item.qtd_compra).replace('.', ',') : '')
  const [valor, setValor] = useState(item ? String(item.valor_compra).replace('.', ',') : '')
  const q = NUM(qtd), v = NUM(valor)
  const unit = q > 0 && v >= 0 ? v / q : null
  async function salvar(e: FormEvent) {
    e.preventDefault()
    if (!nome.trim() || !(q > 0) || !(v >= 0) || valor.trim() === '') return setErro('Informe nome, quantidade comprada (maior que zero) e valor pago.')
    const dados = { nome: nome.trim(), unidade, qtd_compra: q, valor_compra: v, atualizado_em: new Date().toISOString() }
    const { error } = item ? await supabase.from('insumos').update(dados).eq('id', item.id) : await supabase.from('insumos').insert({ loja_id: lojaId, ...dados })
    if (error) return setErro(error.message)
    setErro('')
    if (item) avisar(); else { setNome(''); setQtd(''); setValor(''); registrarLog(lojaId, `Precificação: insumo "${dados.nome}" cadastrado`) }
    carregar()
  }
  async function excluir() {
    if (!item || !confirm(`Excluir o insumo "${item.nome}"?`)) return
    const { error } = await supabase.from('insumos').delete().eq('id', item.id)
    if (error) return setErro(error.code === '23503' ? `"${item.nome}" está em uma ficha técnica. Tire-o da ficha antes de excluir.` : error.message)
    setErro(''); registrarLog(lojaId, `Precificação: insumo "${item.nome}" excluído`); carregar()
  }
  const mudou = !item || nome !== item.nome || unidade !== item.unidade || q !== item.qtd_compra || v !== item.valor_compra
  return (
    <form onSubmit={salvar} className={`grid grid-cols-2 items-end gap-2 sm:grid-cols-[1fr_7rem_7rem_7rem_auto] ${item ? 'py-2' : ''}`}>
      <label className="col-span-2 block sm:col-span-1"><span className="text-xs font-semibold">Insumo</span><input className={campo} placeholder="Ex.: Leite" value={nome} onChange={e => setNome(e.target.value)} /></label>
      <label className="block"><span className="text-xs font-semibold">Unidade</span>
        <select className={campo} value={unidade} onChange={e => setUnidade(e.target.value)}>{Object.entries(UNIDADES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      <label className="block"><span className="text-xs font-semibold">Qtd comprada</span><input className={campo} inputMode="decimal" placeholder="1000" value={qtd} onChange={e => setQtd(e.target.value)} /></label>
      <label className="block"><span className="text-xs font-semibold">Valor pago R$</span><input className={campo} inputMode="decimal" placeholder="6,50" value={valor} onChange={e => setValor(e.target.value)} /></label>
      <div className="col-span-2 flex flex-wrap items-center gap-2 sm:col-span-1">
        {mudou && <button className={botao}>{item ? 'Salvar' : 'Adicionar'}</button>}
        {item && <button type="button" className={vermelho} onClick={excluir}>Excluir</button>}
      </div>
      {unit !== null && <p className="col-span-2 text-xs text-neutral-600 sm:col-span-5">Custo: {unit.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 4 })} por {UNIDADES[unidade]}</p>}
    </form>
  )
}

// ───────────── Fichas técnicas ─────────────
function Fichas(ctx: Ctx) {
  const { produtos, categorias, calc } = ctx
  const [busca, setBusca] = useState('')
  const [aberta, setAberta] = useState<string | null>(null)
  const [catAbertas, setCatAbertas] = useState<string[]>([])
  const termo = busca.trim().toLowerCase()
  const lista = produtos.filter(p => p.nome.toLowerCase().includes(termo))
  // Categorias na ordem do cardápio; produtos sem categoria vão para "Sem categoria"
  const ids = new Set(categorias.map(c => c.id))
  const secoes = [...categorias, { id: '', nome: 'Sem categoria' }]
    .map(c => ({ ...c, itens: lista.filter(p => (c.id ? p.categoria_id === c.id : !p.categoria_id || !ids.has(p.categoria_id))) }))
    .filter(c => c.itens.length > 0)
  const alternarCat = (id: string) => setCatAbertas(l => (l.includes(id) ? l.filter(x => x !== id) : [...l, id]))
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-neutral-600">Escolha a categoria e monte a ficha de cada produto com os insumos e as quantidades. O preço sugerido aparece na hora.</p>
        <input className={`${campo} sm:w-64`} placeholder="Buscar produto" value={busca} onChange={e => setBusca(e.target.value)} />
      </div>
      {ctx.insumos.length === 0 && <p className="rounded-lg bg-yellow-50 p-3 text-sm text-yellow-900">Cadastre primeiro os insumos (aba Insumos) para montar as fichas.</p>}
      {secoes.length === 0 && <p className="text-neutral-600">Nenhum produto encontrado.</p>}
      {secoes.map(cat => {
        // Na busca, as categorias com resultado já aparecem abertas
        const expandida = !!termo || catAbertas.includes(cat.id)
        const calcs = cat.itens.map(p => calc(p))
        const comFicha = calcs.filter(c => c.status !== 'sem_ficha').length
        const ajustar = calcs.filter(c => c.status === 'ajustar').length
        return (
          <div key={cat.id || 'sem'} className="rounded-xl border border-neutral-200 bg-white">
            <button type="button" aria-expanded={expandida} onClick={() => alternarCat(cat.id)} className="flex w-full flex-wrap items-center justify-between gap-2 p-4 text-left">
              <span className="flex items-center gap-2 font-bold"><span className="inline-block w-4 text-neutral-500">{expandida ? '▾' : '▸'}</span>{cat.nome}</span>
              <span className="flex flex-wrap items-center gap-2 text-sm text-neutral-600">
                <span>{cat.itens.length} produto{cat.itens.length > 1 ? 's' : ''} · {comFicha} com ficha</span>
                {ajustar > 0 && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-800">{ajustar} para ajustar</span>}
              </span>
            </button>
            {expandida && (
              <div className="space-y-2 border-t border-neutral-200 p-3">
                {cat.itens.map((p, k) => {
                  const c = calcs[k]
                  return (
                    <div key={p.id} className="rounded-lg border border-neutral-200 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-bold">{p.nome}{!p.ativo && <span className="ml-2 text-xs font-normal text-neutral-500">(oculto no cardápio)</span>}</p>
                          <p className="text-sm text-neutral-600">Cardápio: {R(p.preco)}{c.sugerido !== null && c.status !== 'sem_ficha' && <> · Sugerido: <b>{R(c.sugerido)}</b></>}{c.lucroAplicado !== null && <> · Lucro atual: {PCT(c.lucroAplicado)}</>}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Selo s={c.status} />
                          <button className={aberta === p.id ? claro : botao} onClick={() => setAberta(aberta === p.id ? null : p.id)}>{aberta === p.id ? 'Fechar' : c.status === 'sem_ficha' ? 'Criar ficha' : 'Abrir ficha'}</button>
                        </div>
                      </div>
                      {aberta === p.id && <EditorFicha key={p.id + (ctx.mapaFicha.get(p.id)?.id ?? '')} produto={p} {...ctx} fechar={() => setAberta(null)} />}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function EditorFicha({ produto, lojaId, cfg, insumos, mapaIns, mapaFicha, cf, tx, carregar, setErro, avisar, fechar }: Ctx & { produto: Produto; fechar: () => void }) {
  const ficha = mapaFicha.get(produto.id)
  const [rend, setRend] = useState(String(ficha?.rendimento ?? 1).replace('.', ','))
  const [lucro, setLucro] = useState(ficha?.lucro_pct != null ? String(ficha.lucro_pct).replace('.', ',') : '')
  const [itens, setItens] = useState<{ insumo_id: string; qtd: string }[]>(ficha?.ficha_itens.map(i => ({ insumo_id: i.insumo_id, qtd: String(i.qtd).replace('.', ',') })) ?? [])
  const [salvando, setSalvando] = useState(false)
  const rascunho: Ficha = { id: ficha?.id ?? '', produto_id: produto.id, rendimento: NUM(rend) > 0 ? NUM(rend) : 1, lucro_pct: lucro.trim() === '' ? null : NUM(lucro), ficha_itens: itens.filter(i => i.insumo_id && NUM(i.qtd) > 0).map(i => ({ insumo_id: i.insumo_id, qtd: NUM(i.qtd) })) }
  const c = calcular(rascunho, produto.preco, mapaIns, cf, tx, cfg)
  const custoTotal = c.custo * rascunho.rendimento
  const mudar = (k: number, campoItem: 'insumo_id' | 'qtd', v: string) => setItens(l => l.map((x, i) => (i === k ? { ...x, [campoItem]: v } : x)))

  async function salvar() {
    const r = NUM(rend), l = lucro.trim() === '' ? null : NUM(lucro)
    if (!(r > 0)) return setErro('O rendimento precisa ser maior que zero.')
    if (l !== null && !(l >= 0 && l <= 100)) return setErro('O lucro desejado vai de 0 a 100%.')
    if (itens.some(i => (i.insumo_id && !(NUM(i.qtd) > 0)) || (!i.insumo_id && i.qtd.trim() !== ''))) return setErro('Em cada ingrediente, escolha o insumo e a quantidade.')
    setSalvando(true)
    const { data: f, error } = await supabase.from('fichas_tecnicas').upsert({ loja_id: lojaId, produto_id: produto.id, rendimento: r, lucro_pct: l, atualizado_em: new Date().toISOString() }, { onConflict: 'produto_id' }).select('id').single()
    if (error || !f) { setSalvando(false); return setErro(error?.message ?? 'Não foi possível salvar a ficha.') }
    const del = await supabase.from('ficha_itens').delete().eq('ficha_id', f.id)
    if (del.error) { setSalvando(false); return setErro(del.error.message) }
    if (rascunho.ficha_itens.length) {
      const ins = await supabase.from('ficha_itens').insert(rascunho.ficha_itens.map(i => ({ loja_id: lojaId, ficha_id: f.id, insumo_id: i.insumo_id, qtd: i.qtd })))
      if (ins.error) { setSalvando(false); return setErro(ins.error.message) }
    }
    setSalvando(false); setErro(''); registrarLog(lojaId, `Precificação: ficha técnica de "${produto.nome}" salva`); avisar(); carregar()
  }
  async function aplicarPreco() {
    if (c.sugerido === null) return
    const novo = Math.round(c.sugerido * 100) / 100
    if (!confirm(`Mudar o preço de "${produto.nome}" no cardápio de ${R(produto.preco)} para ${R(novo)}?`)) return
    const { error } = await supabase.from('produtos').update({ preco: novo }).eq('id', produto.id)
    if (error) return setErro(error.message)
    setErro(''); registrarLog(lojaId, `Precificação: preço de "${produto.nome}" alterado de ${R(produto.preco)} para ${R(novo)}`); avisar(); carregar()
  }
  async function excluirFicha() {
    if (!ficha || !confirm(`Excluir a ficha técnica de "${produto.nome}"? O produto continua no cardápio.`)) return
    const { error } = await supabase.from('fichas_tecnicas').delete().eq('id', ficha.id)
    if (error) return setErro(error.message)
    registrarLog(lojaId, `Precificação: ficha técnica de "${produto.nome}" excluída`); fechar(); carregar()
  }
  const linha = (rotulo: string, valor: string, forte = false) => <div className={`flex justify-between gap-2 ${forte ? 'border-t border-neutral-200 pt-1 text-lg font-bold' : ''}`}><span>{rotulo}</span><span>{valor}</span></div>

  return (
    <div className="mt-3 grid gap-4 border-t border-neutral-200 pt-3 lg:grid-cols-[3fr_2fr]">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className="text-sm font-semibold">Rendimento da receita</span>
            <input className={campo} inputMode="decimal" value={rend} onChange={e => setRend(e.target.value)} />
            <span className="text-xs text-neutral-600">Quantas porções saem (ex.: bolo que rende 12 fatias = 12)</span></label>
          <label className="block"><span className="text-sm font-semibold">Lucro desejado (%)</span>
            <input className={campo} inputMode="decimal" placeholder={`${cfg.lucro_padrao_pct} (padrão)`} value={lucro} onChange={e => setLucro(e.target.value)} /></label>
        </div>
        <div>
          <p className="mb-1 text-sm font-semibold">Ingredientes e embalagens</p>
          <div className="space-y-2">
            {itens.map((it, k) => {
              const ins = mapaIns.get(it.insumo_id)
              const custoLinha = ins && NUM(it.qtd) > 0 ? NUM(it.qtd) * (ins.valor_compra / ins.qtd_compra) : 0
              return (
                <div key={k} className="grid grid-cols-[1fr_6rem_auto] items-center gap-2 sm:grid-cols-[1fr_6rem_6rem_auto]">
                  <select className={campo} value={it.insumo_id} onChange={e => mudar(k, 'insumo_id', e.target.value)}>
                    <option value="">Escolha o insumo</option>
                    {insumos.map(i => <option key={i.id} value={i.id}>{i.nome} ({i.unidade})</option>)}
                  </select>
                  <input className={campo} inputMode="decimal" placeholder={ins ? `Qtd (${ins.unidade})` : 'Qtd'} aria-label="Quantidade" value={it.qtd} onChange={e => mudar(k, 'qtd', e.target.value)} />
                  <span className="hidden text-right text-sm sm:block">{R(custoLinha)}</span>
                  <button type="button" className="px-2 text-xl text-red-600" aria-label="Remover ingrediente" onClick={() => setItens(l => l.filter((_, i) => i !== k))}>×</button>
                </div>
              )
            })}
          </div>
          <button type="button" className={`${claro} mt-2 text-sm`} onClick={() => setItens(l => [...l, { insumo_id: '', qtd: '' }])}>+ Adicionar ingrediente</button>
          <p className="mt-2 text-sm">Custo total da receita: <b>{R(custoTotal)}</b>{rascunho.rendimento !== 1 && <> · por porção: <b>{R(c.custo)}</b></>}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className={botao} disabled={salvando} onClick={salvar}>{salvando ? 'Salvando…' : 'Salvar ficha'}</button>
          {ficha && <button className={vermelho} onClick={excluirFicha}>Excluir ficha</button>}
        </div>
      </div>

      <div className="space-y-1 rounded-xl bg-neutral-50 p-3 text-sm">
        <p className="mb-1 font-bold">Precificação unitária</p>
        {c.sugerido === null ? (
          <p className="rounded bg-red-100 p-2 text-red-800">Custo fixo + taxas + lucro passam de 100% do preço. Reduza o lucro desejado ou revise os custos e taxas.</p>
        ) : (<>
          {linha('Custo de insumos', R(c.custo))}
          {linha(`Custo fixo (${PCT(cf)})`, R(c.sugerido * cf))}
          {linha(`Taxas e impostos (${PCT(tx)})`, R(c.sugerido * tx))}
          {linha(`Lucro desejado (${PCT(c.lucroPct)})`, R(c.sugerido * c.lucroPct))}
          {linha('Preço de venda sugerido', R(c.sugerido), true)}
        </>)}
        <div className="mt-3 space-y-1 border-t border-neutral-200 pt-2">
          {linha('Você está vendendo a', R(produto.preco))}
          {c.lucroAplicado !== null ? linha('Lucro atual com seu preço', `${R(c.lucroR)} (${PCT(c.lucroAplicado)})`) : <p className="text-neutral-600">O preço no cardápio está R$ 0,00 (preço pelos tamanhos nos adicionais). Use o sugerido como referência.</p>}
          <div className="pt-1"><Selo s={c.status} /></div>
        </div>
        {c.sugerido !== null && c.custo > 0 && Math.abs(c.sugerido - produto.preco) >= 0.01 && (
          <button className={`${azul} mt-3 w-full`} onClick={aplicarPreco}>Aplicar {R(c.sugerido)} no cardápio</button>
        )}
        {ficha && JSON.stringify(rascunho.ficha_itens) !== JSON.stringify(ficha.ficha_itens.map(i => ({ insumo_id: i.insumo_id, qtd: i.qtd }))) && <p className="mt-2 text-xs text-orange-700">Você tem alterações não salvas na ficha.</p>}
      </div>
    </div>
  )
}

// ───────────── Resumo ─────────────
function Resumo({ cfg, produtos, totalFixos, calc }: Ctx) {
  const comFicha = produtos.map(p => ({ p, c: calc(p) })).filter(x => x.c.status === 'ok' || x.c.status === 'ajustar')
  const margemMedia = comFicha.length ? comFicha.reduce((s, x) => s + x.c.margem, 0) / comFicha.length : 0
  const precoMedio = comFicha.length ? comFicha.reduce((s, x) => s + x.c.preco, 0) / comFicha.length : 0
  const pe = margemMedia > 0 ? Math.ceil(totalFixos / margemMedia) : null
  const fatMin = margemMedia > 0 && precoMedio > 0 ? totalFixos / (margemMedia / precoMedio) : null
  const top = [...comFicha].sort((a, b) => b.c.lucroR - a.c.lucroR).slice(0, 5)
  const ajustar = comFicha.filter(x => x.c.status === 'ajustar')
  const card = (t: string, v: string, d?: string) => <div className="rounded-xl border border-neutral-200 bg-white p-3"><p className="text-sm text-neutral-600">{t}</p><p className="text-xl font-bold text-[#1B2A4A]">{v}</p>{d && <p className="text-xs text-neutral-500">{d}</p>}</div>
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {card('Custos fixos do mês', R(totalFixos))}
        {card('Produtos com ficha', `${comFicha.length} de ${produtos.length}`)}
        {card('Faturamento para não ter prejuízo', fatMin !== null ? R(fatMin) : '—', cfg.faturamento_medio > 0 ? `Seu faturamento médio: ${R(cfg.faturamento_medio)}` : undefined)}
        {card('Ponto de equilíbrio', pe !== null ? `${pe.toLocaleString('pt-BR')} vendas/mês` : '—', pe !== null ? `Margem de contribuição média: ${R(margemMedia)}` : undefined)}
      </div>
      {comFicha.length === 0 && <p className="rounded-lg bg-yellow-50 p-3 text-sm text-yellow-900">Monte as fichas técnicas dos produtos (com preço no cardápio) para ver o resumo.</p>}
      {comFicha.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className={cartao}>
            <h3 className="mb-2 font-bold">Top 5 mais lucrativos (por venda)</h3>
            <ol className="space-y-1">{top.map((x, i) => <li key={x.p.id} className="flex justify-between gap-2"><span>{i + 1}. {x.p.nome}</span><span className={`font-semibold ${x.c.lucroR < 0 ? 'text-red-700' : ''}`}>{R(x.c.lucroR)}</span></li>)}</ol>
          </div>
          <div className={cartao}>
            <h3 className="mb-2 font-bold">Precisam de ajuste de preço ({ajustar.length})</h3>
            {ajustar.length === 0 ? <p className="text-green-700">Todos os produtos com ficha estão dentro da margem. 👏</p> :
              <ul className="space-y-1">{ajustar.map(x => <li key={x.p.id} className="flex justify-between gap-2"><span>{x.p.nome}</span><span className="text-sm">{R(x.c.preco)} → <b>{x.c.sugerido !== null ? R(x.c.sugerido) : '—'}</b></span></li>)}</ul>}
          </div>
        </div>
      )}
      <p className="text-sm text-neutral-600">Ponto de equilíbrio = custos fixos ÷ margem de contribuição média (preço − taxas − custo dos insumos), considerando os produtos com ficha técnica e preço no cardápio.</p>
    </div>
  )
}
