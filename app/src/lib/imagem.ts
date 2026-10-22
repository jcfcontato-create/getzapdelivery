// Utilidades de imagem usadas no painel (cadastro de produto e Divulgação).
// Fotos de produto: o dono costuma enviar fotos enormes do celular (vários MB).
// Antes de enviar, reduzimos no próprio navegador para no máximo 800 px no lado maior
// e convertemos para WEBP (ou JPEG, se o navegador não gerar WEBP). Fica com ~50–150 KB.
export const TAM_MAX_ORIGINAL = 40 * 1024 * 1024
export const LADO_MAX_FOTO = 800
export const tamanhoLegivel = (b: number) => b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(b / 1024))} KB`
export async function otimizarFoto(arquivo: File, ladoMax = LADO_MAX_FOTO): Promise<File> {
  let img: ImageBitmap
  try { img = await createImageBitmap(arquivo, { imageOrientation: 'from-image' }) }
  catch { throw new Error('Não foi possível ler essa imagem. Envie em JPG, PNG ou WEBP.') }
  const escala = Math.min(1, ladoMax / Math.max(img.width, img.height))
  const w = Math.round(img.width * escala), h = Math.round(img.height * escala)
  const c = document.createElement('canvas'); c.width = w; c.height = h
  const ctx = c.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  const gerar = (tipo: string, q: number) => new Promise<Blob | null>(res => c.toBlob(res, tipo, q))
  ctx.drawImage(img, 0, 0, w, h)
  let blob = await gerar('image/webp', 0.8)
  if (!blob || blob.type !== 'image/webp') {
    // JPEG não tem transparência: fundo branco para PNG recortado não ficar preto
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h)
    blob = await gerar('image/jpeg', 0.82)
  }
  img.close?.()
  if (!blob) throw new Error('Não foi possível otimizar a imagem.')
  // Se a original já era menor que a otimizada (raro), mantém a original
  if (blob.size >= arquivo.size && escala === 1 && /image\/(jpeg|webp)/.test(arquivo.type)) return arquivo
  const ext = blob.type === 'image/webp' ? 'webp' : 'jpg'
  return new File([blob], `foto.${ext}`, { type: blob.type })
}
