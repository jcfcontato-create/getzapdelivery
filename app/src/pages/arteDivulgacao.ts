// Monta a arte da postagem num <canvas>, usando a FOTO REAL do produto (sem alterar o lanche).
// Formatos: feed (1080x1080, Facebook/Instagram) e story (1080x1920, Stories/Reels/TikTok).

export type Formato = 'feed' | 'story'
export type Modelo = 'destaque' | 'moldura' | 'oferta'
export type DadosArte = {
  foto: HTMLImageElement
  logo?: HTMLImageElement | null
  titulo: string
  subtitulo: string
  chamada: string
  preco: string
  nomeLoja: string
  cor: string
}

export const MODELOS: { id: Modelo; nome: string }[] = [
  { id: 'destaque', nome: 'Foto em destaque' },
  { id: 'moldura', nome: 'Moldura da loja' },
  { id: 'oferta', nome: 'Oferta do dia' },
]

export function carregarImagem(url: string): Promise<HTMLImageElement> {
  return new Promise((ok, falha) => {
    const img = new Image()
    img.crossOrigin = 'anonymous' // necessário para poder exportar o canvas
    img.onload = () => ok(img)
    img.onerror = () => falha(new Error('Não foi possível carregar a imagem.'))
    img.src = url
  })
}

const FONTE = "'Helvetica Neue', Helvetica, Arial, sans-serif"

function corValida(c: string) { return /^#[0-9a-f]{6}$/i.test(c) ? c : '#1A7F37' }
// Texto branco ou preto, o que tiver mais contraste com a cor de fundo
function contraste(hex: string) {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? '#111111' : '#FFFFFF'
}

function cobrir(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const esc = Math.max(w / img.width, h / img.height)
  const sw = w / esc, sh = h / esc
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h)
}
function retangulo(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath()
}
// Quebra o texto em linhas e diminui a fonte até caber em maxLinhas
function caber(ctx: CanvasRenderingContext2D, texto: string, larg: number, tam: number, maxLinhas: number, peso = '900') {
  let t = tam, linhas: string[] = []
  for (; t > 20; t -= 4) {
    ctx.font = `${peso} ${t}px ${FONTE}`
    linhas = []; let atual = ''
    for (const p of texto.split(/\s+/).filter(Boolean)) {
      const teste = atual ? atual + ' ' + p : p
      if (ctx.measureText(teste).width > larg && atual) { linhas.push(atual); atual = p } else atual = teste
    }
    if (atual) linhas.push(atual)
    if (linhas.length <= maxLinhas && linhas.every(l => ctx.measureText(l).width <= larg)) break
  }
  return { linhas, tam: t }
}
function escrever(ctx: CanvasRenderingContext2D, texto: string, x: number, y: number, larg: number, tam: number, maxLinhas: number, cor: string, alinhar: CanvasTextAlign = 'left', peso = '900') {
  if (!texto.trim()) return y
  const { linhas, tam: t } = caber(ctx, texto, larg, tam, maxLinhas, peso)
  ctx.fillStyle = cor; ctx.textAlign = alinhar; ctx.textBaseline = 'top'
  const ax = alinhar === 'center' ? x + larg / 2 : x
  linhas.forEach((l, i) => ctx.fillText(l, ax, y + i * t * 1.1))
  return y + linhas.length * t * 1.1
}
function botao(ctx: CanvasRenderingContext2D, texto: string, cx: number, y: number, tam: number, fundo: string, cor: string) {
  if (!texto.trim()) return
  ctx.font = `900 ${tam}px ${FONTE}`
  const w = ctx.measureText(texto).width + tam * 1.6, h = tam * 1.9
  retangulo(ctx, cx - w / 2, y, w, h, h / 2); ctx.fillStyle = fundo; ctx.fill()
  ctx.fillStyle = cor; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(texto, cx, y + h / 2 + 2)
}
function selo(ctx: CanvasRenderingContext2D, d: DadosArte, x: number, y: number, raio: number) {
  ctx.font = `900 ${raio * 0.8}px ${FONTE}`
  ctx.beginPath(); ctx.arc(x, y, raio, 0, Math.PI * 2); ctx.fillStyle = '#FFFFFF'; ctx.fill()
  if (d.logo) { ctx.save(); ctx.beginPath(); ctx.arc(x, y, raio - 6, 0, Math.PI * 2); ctx.clip(); cobrir(ctx, d.logo, x - raio, y - raio, raio * 2, raio * 2); ctx.restore() }
  else { ctx.fillStyle = corValida(d.cor); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(d.nomeLoja.trim().charAt(0).toUpperCase(), x, y + 2) }
}
function etiquetaPreco(ctx: CanvasRenderingContext2D, preco: string, cx: number, cy: number, raio: number, fundo: string, cor: string) {
  if (!preco.trim()) return
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(-0.12)
  ctx.beginPath(); ctx.arc(0, 0, raio, 0, Math.PI * 2); ctx.fillStyle = fundo; ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 24; ctx.fill(); ctx.shadowBlur = 0
  ctx.fillStyle = cor; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.font = `700 ${raio * 0.26}px ${FONTE}`; ctx.fillText('POR APENAS', 0, -raio * 0.38)
  const { tam } = caber(ctx, preco, raio * 1.6, raio * 0.62, 1)
  ctx.font = `900 ${tam}px ${FONTE}`; ctx.fillText(preco, 0, raio * 0.12)
  ctx.restore()
}

export function desenharArte(canvas: HTMLCanvasElement, d: DadosArte, formato: Formato, modelo: Modelo) {
  const W = 1080, H = formato === 'story' ? 1920 : 1080, st = formato === 'story'
  canvas.width = W; canvas.height = H
  const ctx = canvas.getContext('2d')!
  const cor = corValida(d.cor), corTxt = contraste(cor)
  ctx.clearRect(0, 0, W, H)

  if (modelo === 'destaque') {
    cobrir(ctx, d.foto, 0, 0, W, H)
    const g = ctx.createLinearGradient(0, H * 0.38, 0, H)
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.45, 'rgba(0,0,0,.6)'); g.addColorStop(1, 'rgba(0,0,0,.92)')
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
    const topo = ctx.createLinearGradient(0, 0, 0, 220); topo.addColorStop(0, 'rgba(0,0,0,.55)'); topo.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = topo; ctx.fillRect(0, 0, W, 220)
    const yTopo = st ? 120 : 60
    selo(ctx, d, 60 + 52, yTopo + 52, 52)
    escrever(ctx, d.nomeLoja, 190, yTopo + 30, 560, 44, 1, '#FFFFFF', 'left', '800')
    etiquetaPreco(ctx, d.preco, W - 190, yTopo + (st ? 230 : 160), st ? 150 : 130, cor, corTxt)
    const baseY = H - (st ? 640 : 440)
    let y = escrever(ctx, d.titulo.toUpperCase(), 60, baseY, W - 120, st ? 130 : 104, 2, '#FFFFFF')
    y = escrever(ctx, d.subtitulo, 60, y + 16, W - 120, st ? 52 : 44, 2, 'rgba(255,255,255,.92)', 'left', '600')
    botao(ctx, d.chamada, W / 2, Math.min(Math.max(y + 34, H - (st ? 300 : 170)), H - (st ? 180 : 100)), st ? 52 : 44, cor, corTxt)
  } else if (modelo === 'moldura') {
    ctx.fillStyle = cor; ctx.fillRect(0, 0, W, H)
    const yTopo = st ? 110 : 44
    selo(ctx, d, W / 2 - 230, yTopo + 44, 44)
    escrever(ctx, d.nomeLoja, W / 2 - 170, yTopo + 22, 600, 40, 1, corTxt, 'left', '800')
    const fx = 60, fy = yTopo + 120, fw = W - 120, fh = st ? 960 : 470
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.3)'; ctx.shadowBlur = 30; retangulo(ctx, fx - 10, fy - 10, fw + 20, fh + 20, 46); ctx.fillStyle = '#FFFFFF'; ctx.fill(); ctx.restore()
    ctx.save(); retangulo(ctx, fx, fy, fw, fh, 38); ctx.clip(); cobrir(ctx, d.foto, fx, fy, fw, fh); ctx.restore()
    etiquetaPreco(ctx, d.preco, fx + fw - 120, fy + fh - 40, st ? 140 : 115, '#FFFFFF', '#111111')
    let y = escrever(ctx, d.titulo.toUpperCase(), 60, fy + fh + (st ? 90 : 50), W - 120, st ? 116 : 76, 2, corTxt, 'center')
    y = escrever(ctx, d.subtitulo, 60, y + 10, W - 120, st ? 50 : 34, st ? 2 : 1, corTxt, 'center', '600')
    botao(ctx, d.chamada, W / 2, y + (st ? 40 : 24), st ? 50 : 40, '#FFFFFF', '#111111')
  } else {
    ctx.fillStyle = '#111111'; ctx.fillRect(0, 0, W, H)
    // Faixa diagonal no topo
    ctx.save(); ctx.translate(W / 2, st ? 210 : 110); ctx.rotate(-0.05)
    ctx.fillStyle = '#FFC400'; ctx.fillRect(-W, -60, W * 2, 120)
    ctx.fillStyle = '#111111'; ctx.font = `900 ${st ? 78 : 66}px ${FONTE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('OFERTA DO DIA', 0, 4)
    ctx.restore()
    const raio = st ? 400 : 220, cx = W / 2, cy = st ? 760 : 400
    ctx.beginPath(); ctx.arc(cx, cy, raio + 14, 0, Math.PI * 2); ctx.fillStyle = cor; ctx.fill()
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, raio, 0, Math.PI * 2); ctx.clip(); cobrir(ctx, d.foto, cx - raio, cy - raio, raio * 2, raio * 2); ctx.restore()
    selo(ctx, d, cx - raio * 0.78, cy - raio * 0.78, st ? 64 : 52)
    let y = escrever(ctx, d.titulo.toUpperCase(), 60, cy + raio + (st ? 70 : 34), W - 120, st ? 110 : 66, 2, '#FFFFFF', 'center')
    if (d.preco.trim()) {
      const { tam } = caber(ctx, d.preco, W - 160, st ? 150 : 96, 1)
      ctx.font = `900 ${tam}px ${FONTE}`; ctx.fillStyle = '#FFC400'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(d.preco, W / 2, y + 10); y += tam * 1.15 + 10
    } else y = escrever(ctx, d.subtitulo, 60, y + 10, W - 120, st ? 50 : 38, 2, 'rgba(255,255,255,.9)', 'center', '600')
    botao(ctx, d.chamada, W / 2, y + (st ? 40 : 16), st ? 50 : 40, cor, corTxt)
    escrever(ctx, d.nomeLoja, 60, H - (st ? 120 : 46), W - 120, 30, 1, 'rgba(255,255,255,.75)', 'center', '700')
  }
}

export function exportarArte(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((ok, falha) => canvas.toBlob(b => (b ? ok(b) : falha(new Error('Não foi possível gerar a imagem.'))), 'image/jpeg', 0.9))
}
