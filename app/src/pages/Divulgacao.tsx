// Módulo de Divulgação (aba Loja → Divulgação). Liberado por loja no painel admin.
// O dono envia a foto real do produto e descreve a oferta; a IA escreve os textos e o
// sistema monta a arte com a foto original. Dá para baixar, compartilhar, salvar e agendar
// (o agendamento é um lembrete no painel na hora marcada).
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { otimizarFoto, TAM_MAX_ORIGINAL } from '../lib/imagem'
import { carregarImagem, desenharArte, exportarArte, MODELOS, type Formato, type Modelo } from './arteDivulgacao'

export type LojaDiv = { id: string; slug: string; nome: string; cor: string; logo_url: string | null }
type Postagem = { id: string; oferta: string; titulo: string | null; subtitulo: string | null; chamada: string | null; preco: string | null; legenda: string; hashtags: string; modelo: Modelo; formato: Formato; foto_url: string | null; imagem_url: string | null; status: 'rascunho' | 'agendada' | 'publicada'; agendado_para: string | null; publicado_em: string | null; criado_em: string }
type ProdutoFoto = { id: string; nome: string; preco: number; foto_url: string }
type Textos = { titulo: string; subtitulo: string; chamada: string; preco: string; legenda: string; hashtags: string }

const LIMITE = 60
const campo = 'w-full rounded-lg border border-neutral-300 bg-white px-3 py-2'
const botao = 'rounded-lg bg-[#1A7F37] px-4 py-2 font-bold text-white disabled:opacity-50'
const claro = 'rounded-lg border border-neutral-400 bg-white px-3 py-2 disabled:opacity-50'
const azul = 'rounded-lg bg-blue-600 px-4 py-2 font-bold text-white hover:bg-blue-700 disabled:opacity-50'
const vermelho = 'rounded-lg bg-red-600 px-3 py-2 font-bold text-white hover:bg-red-700'
const cartao = 'rounded-xl border border-neutral-200 bg-white p-4'
const R = (n: number) => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const quando = (iso: string) => new Date(iso).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
const inicioDoMes = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString() }
const textoCompleto = (t: { legenda: string; hashtags: string }) => [t.legenda.trim(), t.hashtags.trim()].filter(Boolean).join('\n\n')

function registrarLog(lojaId: string, acao: string) {
  supabase.auth.getUser().then(({ data }) => {
    supabase.from('logs_atividade').insert({ loja_id: lojaId, usuario_email: data.user?.email ?? null, acao }).then()
  })
}
async function copiar(texto: string) {
  try { await navigator.clipboard.writeText(texto); return true } catch { return false }
}
function baixar(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob); const a = document.createElement('a')
  a.href = url; a.download = nome; a.click(); setTimeout(() => URL.revokeObjectURL(url), 5000)
}
// Compartilhar no celular abre direto Instagram, Facebook, TikTok, WhatsApp…
// O texto vai junto quando o app aceita; por garantia ele também é copiado antes.
async function compartilhar(blob: Blob, texto: string): Promise<'ok' | 'baixado'> {
  await copiar(texto)
  const arquivo = new File([blob], 'postagem.jpg', { type: 'image/jpeg' })
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
  if (nav.share && nav.canShare?.({ files: [arquivo] })) {
    try { await nav.share({ files: [arquivo], text: texto }); return 'ok' } catch (e) { if ((e as Error).name === 'AbortError') return 'ok' }
  }
  baixar(blob, 'postagem.jpg'); return 'baixado'
}
async function chamarIA(corpo: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('divulgacao-gerar', { body: corpo })
  if (error) {
    let msg = error.message
    try { const ctx = (error as any).context; if (ctx?.json) msg = (await ctx.json()).erro ?? msg } catch { /* mantém a mensagem */ }
    throw new Error(msg)
  }
  if (data?.erro) throw new Error(data.erro)
  return data as Textos & { usados: number; limite: number }
}

export default function Divulgacao({ loja }: { loja: LojaDiv }) {
  const [aba, setAba] = useState<'criar' | 'postagens'>('criar')
  const [usados, setUsados] = useState(0)
  const [postagens, setPostagens] = useState<Postagem[]>([])
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const timer = useRef<number | undefined>(undefined)
  const avisar = useCallback((m: string) => { setAviso(m); window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setAviso(''), 3000) }, [])

  const carregar = useCallback(async () => {
    const [u, p] = await Promise.all([
      supabase.from('divulgacao_usos').select('id', { count: 'exact', head: true }).eq('loja_id', loja.id).gte('criado_em', inicioDoMes()),
      supabase.from('postagens').select('*').eq('loja_id', loja.id).order('criado_em', { ascending: false }).limit(60),
    ])
    if (u.error || p.error) setErro((u.error || p.error)!.message)
    setUsados(u.count ?? 0); setPostagens((p.data as Postagem[]) ?? [])
  }, [loja.id])
  useEffect(() => { carregar() }, [carregar])
  const pendentes = postagens.filter(p => p.status === 'agendada' && p.agendado_para && new Date(p.agendado_para) <= new Date()).length

  return (
    <section className="space-y-4">
      {aviso && <p role="status" className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-[#1A7F37] px-5 py-3 font-bold text-white shadow-lg">✓ {aviso}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <button className={aba === 'criar' ? botao : claro} onClick={() => setAba('criar')}>Criar postagem</button>
          <button className={aba === 'postagens' ? botao : claro} onClick={() => setAba('postagens')}>
            Salvas e agendadas{pendentes > 0 && <span className="ml-2 rounded-full bg-red-600 px-2 py-0.5 text-xs text-white">{pendentes}</span>}
          </button>
        </div>
        <p className="text-sm text-neutral-600">IA: <b>{usados}</b> de {LIMITE} gerações neste mês</p>
      </div>
      {erro && <p role="alert" className="rounded-lg bg-red-100 p-3 text-red-800">{erro}</p>}
      {aba === 'criar'
        ? <Criar loja={loja} usados={usados} setUsados={setUsados} setErro={setErro} avisar={avisar} salvo={() => { carregar(); setAba('postagens') }} />
        : <Lista loja={loja} postagens={postagens} carregar={carregar} setErro={setErro} avisar={avisar} />}
    </section>
  )
}

function Criar({ loja, usados, setUsados, setErro, avisar, salvo }: { loja: LojaDiv; usados: number; setUsados: (n: number) => void; setErro: (m: string) => void; avisar: (m: string) => void; salvo: () => void }) {
  const [produtos, setProdutos] = useState<ProdutoFoto[]>([])
  const [fotoUrl, setFotoUrl] = useState('')
  const [enviandoFoto, setEnviandoFoto] = useState(false)
  const [oferta, setOferta] = useState('')
  const [tom, setTom] = useState('divertido')
  const [gerando, setGerando] = useState(false)
  const [t, setT] = useState<Textos | null>(null)
  const [formato, setFormato] = useState<Formato>('feed')
  const [modelo, setModelo] = useState<Modelo>('destaque')
  const [agendar, setAgendar] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [imgs, setImgs] = useState<{ foto: HTMLImageElement; logo: HTMLImageElement | null } | null>(null)
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    supabase.from('produtos').select('id,nome,preco,foto_url').eq('loja_id', loja.id).not('foto_url', 'is', null).order('nome')
      .then(({ data }) => setProdutos(((data ?? []) as ProdutoFoto[]).filter(p => p.foto_url)))
  }, [loja.id])
  // Carrega a foto e a logo para desenhar
  useEffect(() => {
    if (!fotoUrl) { setImgs(null); return }
    let vivo = true
    Promise.all([carregarImagem(fotoUrl), loja.logo_url ? carregarImagem(loja.logo_url).catch(() => null) : Promise.resolve(null)])
      .then(([foto, logo]) => { if (vivo) setImgs({ foto, logo }) })
      .catch(() => vivo && setErro('Não foi possível abrir a foto. Envie outra imagem.'))
    return () => { vivo = false }
  }, [fotoUrl, loja.logo_url, setErro])
  // Redesenha a arte a cada mudança
  useEffect(() => {
    if (!imgs || !t || !canvas.current) return
    desenharArte(canvas.current, { ...imgs, titulo: t.titulo, subtitulo: t.subtitulo, chamada: t.chamada, preco: t.preco, nomeLoja: loja.nome, cor: loja.cor }, formato, modelo)
  }, [imgs, t, formato, modelo, loja.nome, loja.cor])

  async function enviarFoto(arquivo: File | undefined) {
    if (!arquivo) return
    if (!arquivo.type.startsWith('image/')) return setErro('Escolha um arquivo de imagem (JPG, PNG ou WEBP).')
    if (arquivo.size > TAM_MAX_ORIGINAL) return setErro('A imagem é grande demais (máximo 40 MB).')
    setErro(''); setEnviandoFoto(true)
    try {
      const leve = await otimizarFoto(arquivo, 1600) // maior que a do cardápio, para a arte sair nítida
      const caminho = `${loja.id}/divulgacao/${crypto.randomUUID()}.${leve.type === 'image/webp' ? 'webp' : 'jpg'}`
      const { error } = await supabase.storage.from('produtos').upload(caminho, leve, { contentType: leve.type, cacheControl: '31536000' })
      if (error) throw new Error('Não foi possível enviar a foto: ' + error.message)
      setFotoUrl(supabase.storage.from('produtos').getPublicUrl(caminho).data.publicUrl)
    } catch (e) { setErro((e as Error).message) } finally { setEnviandoFoto(false) }
  }
  function usarProduto(id: string) {
    const p = produtos.find(x => x.id === id); if (!p) return
    setFotoUrl(p.foto_url)
    if (!oferta.trim()) setOferta(`${p.nome} por ${R(p.preco)}`)
  }
  async function gerar() {
    if (!fotoUrl) return setErro('Envie a foto do produto ou escolha um produto do cardápio.')
    if (oferta.trim().length < 5) return setErro('Descreva a oferta do dia (ex.: "X-Burger + batata + refri por R$ 29,90 só hoje no almoço").')
    if (usados >= LIMITE) return setErro(`Você já usou as ${LIMITE} gerações deste mês.`)
    setErro(''); setGerando(true)
    try {
      const r = await chamarIA({ loja_id: loja.id, oferta, foto_url: fotoUrl, tom })
      setT({ titulo: r.titulo, subtitulo: r.subtitulo, chamada: r.chamada || 'Peça agora!', preco: r.preco, legenda: r.legenda, hashtags: r.hashtags })
      setUsados(r.usados)
      registrarLog(loja.id, 'Divulgação: postagem gerada pela IA')
    } catch (e) { setErro((e as Error).message) } finally { setGerando(false) }
  }
  const blob = async () => { if (!canvas.current) throw new Error('Gere a postagem primeiro.'); return exportarArte(canvas.current) }
  async function acaoCompartilhar() {
    try { const r = await compartilhar(await blob(), textoCompleto(t!)); avisar(r === 'ok' ? 'Texto copiado. É só colar na legenda.' : 'Imagem baixada e texto copiado') } catch (e) { setErro((e as Error).message) }
  }
  async function acaoBaixar() { try { baixar(await blob(), `postagem-${formato}.jpg`); avisar('Imagem baixada') } catch (e) { setErro((e as Error).message) } }
  async function acaoCopiar() { avisar((await copiar(textoCompleto(t!))) ? 'Texto copiado' : 'Não foi possível copiar') }
  async function salvar() {
    if (!t) return
    if (agendar && new Date(agendar) <= new Date()) return setErro('Escolha uma data e hora no futuro para agendar.')
    setSalvando(true); setErro('')
    try {
      const arte = await blob()
      const caminho = `${loja.id}/divulgacao/arte-${crypto.randomUUID()}.jpg`
      const up = await supabase.storage.from('produtos').upload(caminho, arte, { contentType: 'image/jpeg', cacheControl: '31536000' })
      if (up.error) throw new Error('Não foi possível salvar a imagem: ' + up.error.message)
      const imagem_url = supabase.storage.from('produtos').getPublicUrl(caminho).data.publicUrl
      const { error } = await supabase.from('postagens').insert({
        loja_id: loja.id, oferta: oferta.trim(), ...t, modelo, formato, foto_url: fotoUrl, imagem_url,
        status: agendar ? 'agendada' : 'rascunho', agendado_para: agendar ? new Date(agendar).toISOString() : null,
      })
      if (error) throw new Error(error.message)
      registrarLog(loja.id, agendar ? `Divulgação: postagem agendada para ${quando(new Date(agendar).toISOString())}` : 'Divulgação: postagem salva')
      avisar(agendar ? 'Postagem agendada' : 'Postagem salva')
      setT(null); setOferta(''); setFotoUrl(''); setAgendar('')
      salvo()
    } catch (e) { setErro((e as Error).message) } finally { setSalvando(false) }
  }
  const set = (k: keyof Textos, v: string) => setT(x => (x ? { ...x, [k]: v } : x))

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <div className={`${cartao} space-y-3`}>
          <h3 className="font-bold">1. Foto real do produto</h3>
          <div className="flex items-center gap-3">
            {fotoUrl ? <img src={fotoUrl} alt="" className="h-20 w-20 rounded-lg object-cover" /> : <div className="flex h-20 w-20 items-center justify-center rounded-lg border border-dashed border-neutral-300 text-xs text-neutral-400">sem foto</div>}
            <label className={`${claro} cursor-pointer text-center`}>
              {enviandoFoto ? 'Enviando…' : fotoUrl ? 'Trocar foto' : 'Enviar foto'}
              <input type="file" accept="image/*" className="hidden" disabled={enviandoFoto} onChange={e => { enviarFoto(e.target.files?.[0]); e.target.value = '' }} />
            </label>
          </div>
          {produtos.length > 0 && (
            <label className="block"><span className="text-sm font-semibold">ou use a foto de um produto do cardápio</span>
              <select className={campo} value="" onChange={e => usarProduto(e.target.value)}>
                <option value="">Escolher produto…</option>
                {produtos.map(p => <option key={p.id} value={p.id}>{p.nome} ({R(p.preco)})</option>)}
              </select></label>
          )}
        </div>
        <div className={`${cartao} space-y-3`}>
          <h3 className="font-bold">2. Oferta do dia</h3>
          <textarea className={`${campo} min-h-24`} maxLength={600} placeholder='Ex.: "X-Burger + batata + refri por R$ 29,90 só hoje no almoço. Entrega grátis no Centro."' value={oferta} onChange={e => setOferta(e.target.value)} />
          <label className="block"><span className="text-sm font-semibold">Tom do texto</span>
            <select className={campo} value={tom} onChange={e => setTom(e.target.value)}>
              <option value="divertido">Divertido</option><option value="direto">Direto ao ponto</option><option value="sofisticado">Sofisticado</option>
            </select></label>
          <button className={`${botao} w-full`} disabled={gerando || enviandoFoto} onClick={gerar}>{gerando ? 'Criando com IA…' : t ? '✨ Gerar de novo com IA' : '✨ Gerar postagem com IA'}</button>
          <p className="text-xs text-neutral-500">Cada geração conta 1 das {LIMITE} do mês. A foto do produto é usada como está, sem alterar o lanche.</p>
        </div>
        {t && (
          <div className={`${cartao} space-y-2`}>
            <h3 className="font-bold">3. Ajuste o que quiser</h3>
            <div className="grid grid-cols-2 gap-2">
              <label className="col-span-2 block"><span className="text-xs font-semibold">Título da arte</span><input className={campo} maxLength={40} value={t.titulo} onChange={e => set('titulo', e.target.value)} /></label>
              <label className="col-span-2 block"><span className="text-xs font-semibold">Subtítulo</span><input className={campo} maxLength={80} value={t.subtitulo} onChange={e => set('subtitulo', e.target.value)} /></label>
              <label className="block"><span className="text-xs font-semibold">Preço na arte</span><input className={campo} maxLength={20} placeholder="vazio = sem preço" value={t.preco} onChange={e => set('preco', e.target.value)} /></label>
              <label className="block"><span className="text-xs font-semibold">Botão</span><input className={campo} maxLength={30} value={t.chamada} onChange={e => set('chamada', e.target.value)} /></label>
            </div>
            <label className="block"><span className="text-xs font-semibold">Legenda do post</span><textarea className={`${campo} min-h-32`} value={t.legenda} onChange={e => set('legenda', e.target.value)} /></label>
            <label className="block"><span className="text-xs font-semibold">Hashtags</span><input className={campo} value={t.hashtags} onChange={e => set('hashtags', e.target.value)} /></label>
          </div>
        )}
      </div>

      <div className="space-y-3">
        {!t ? (
          <div className={`${cartao} flex min-h-64 items-center justify-center text-center text-neutral-500`}>A prévia da arte aparece aqui depois de gerar com a IA.</div>
        ) : (<>
          <div className="flex flex-wrap gap-2">
            {([['feed', 'Feed (quadrado)'], ['story', 'Stories / Reels / TikTok']] as const).map(([id, nome]) => <button key={id} className={formato === id ? botao : claro} onClick={() => setFormato(id)}>{nome}</button>)}
          </div>
          <div className="flex flex-wrap gap-2">
            {MODELOS.map(m => <button key={m.id} className={`${modelo === m.id ? 'border-[#1B2A4A] bg-[#1B2A4A] text-white' : 'border-neutral-300 bg-white'} rounded-full border px-3 py-1 text-sm`} onClick={() => setModelo(m.id)}>{m.nome}</button>)}
          </div>
          <canvas ref={canvas} className={`mx-auto block w-full rounded-xl border border-neutral-200 shadow ${formato === 'story' ? 'max-w-[320px]' : 'max-w-[480px]'}`} />
          <div className="grid grid-cols-3 gap-2">
            <button className={azul} onClick={acaoCompartilhar}>Compartilhar</button>
            <button className={claro} onClick={acaoBaixar}>Baixar imagem</button>
            <button className={claro} onClick={acaoCopiar}>Copiar texto</button>
          </div>
          <div className={`${cartao} space-y-2`}>
            <label className="block"><span className="text-sm font-semibold">Agendar para (opcional)</span>
              <input type="datetime-local" className={campo} value={agendar} onChange={e => setAgendar(e.target.value)} /></label>
            <p className="text-xs text-neutral-500">Na hora marcada, o painel avisa "Hora de postar" com a imagem e o texto prontos.</p>
            <button className={`${botao} w-full`} disabled={salvando} onClick={salvar}>{salvando ? 'Salvando…' : agendar ? 'Agendar postagem' : 'Salvar postagem'}</button>
          </div>
        </>)}
      </div>
    </div>
  )
}

function Lista({ loja, postagens, carregar, setErro, avisar }: { loja: LojaDiv; postagens: Postagem[]; carregar: () => void; setErro: (m: string) => void; avisar: (m: string) => void }) {
  const agora = new Date()
  const ordem = (p: Postagem) => (p.status === 'agendada' ? 0 : p.status === 'rascunho' ? 1 : 2)
  const lista = [...postagens].sort((a, b) => ordem(a) - ordem(b) || (a.status === 'agendada' ? +new Date(a.agendado_para!) - +new Date(b.agendado_para!) : +new Date(b.criado_em) - +new Date(a.criado_em)))
  async function imagem(p: Postagem) {
    if (!p.imagem_url) throw new Error('Esta postagem não tem imagem salva.')
    const r = await fetch(p.imagem_url); if (!r.ok) throw new Error('Não foi possível baixar a imagem.')
    return r.blob()
  }
  async function compartilharP(p: Postagem) {
    try { const r = await compartilhar(await imagem(p), textoCompleto(p)); avisar(r === 'ok' ? 'Texto copiado. É só colar na legenda.' : 'Imagem baixada e texto copiado') } catch (e) { setErro((e as Error).message) }
  }
  async function publicada(p: Postagem) {
    const { error } = await supabase.from('postagens').update({ status: 'publicada', publicado_em: new Date().toISOString() }).eq('id', p.id)
    if (error) return setErro(error.message)
    registrarLog(loja.id, 'Divulgação: postagem marcada como publicada'); avisar('Marcada como publicada'); carregar()
  }
  async function excluir(p: Postagem) {
    if (!confirm('Excluir esta postagem?')) return
    const { error } = await supabase.from('postagens').delete().eq('id', p.id)
    if (error) return setErro(error.message)
    carregar()
  }
  if (lista.length === 0) return <p className={`${cartao} text-neutral-600`}>Nenhuma postagem salva ainda. Crie a primeira em "Criar postagem".</p>
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {lista.map(p => {
        const hora = p.status === 'agendada' && p.agendado_para && new Date(p.agendado_para) <= agora
        return (
          <div key={p.id} className={`${cartao} space-y-2 ${hora ? 'border-2 border-red-500' : ''}`}>
            {p.imagem_url && <img src={p.imagem_url} alt="" className="w-full rounded-lg object-cover" />}
            <p className="text-sm font-semibold">
              {hora ? <span className="text-red-700">⏰ Hora de postar!</span>
                : p.status === 'agendada' ? <span className="text-blue-700">Agendada · {quando(p.agendado_para!)}</span>
                : p.status === 'publicada' ? <span className="text-green-700">Publicada{p.publicado_em ? ` · ${quando(p.publicado_em)}` : ''}</span>
                : <span className="text-neutral-600">Salva · {quando(p.criado_em)}</span>}
            </p>
            <p className="line-clamp-3 whitespace-pre-line text-sm text-neutral-700">{p.legenda}</p>
            <div className="flex flex-wrap gap-2">
              <button className={azul} onClick={() => compartilharP(p)}>Compartilhar</button>
              <button className={claro} onClick={async () => avisar((await copiar(textoCompleto(p))) ? 'Texto copiado' : 'Não foi possível copiar')}>Copiar texto</button>
              {p.status !== 'publicada' && <button className={botao} onClick={() => publicada(p)}>Já postei</button>}
              <button className={vermelho} onClick={() => excluir(p)}>Excluir</button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
