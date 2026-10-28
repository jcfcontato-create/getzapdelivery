// Página /demonstracao: o dono do restaurante pede 15 dias de demonstração e recebe
// por e-mail o link do painel, o login e uma senha temporária.
import { type FormEvent, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const campo = 'w-full rounded-lg border border-neutral-300 bg-white px-3 py-2'
const rotulo = 'mb-1 block text-sm font-semibold'
const SITE = 'app.getzapdelivery.com.br'

function slugify(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+/, '').slice(0, 40)
}
function mascaraTelefone(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2) return d.length ? `(${d}` : ''
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

export default function Demonstracao() {
  const [f, setF] = useState({ nome: '', slug: '', whatsapp: '', email: '', site: '' })
  const [slugEditado, setSlugEditado] = useState(false)
  const [aceito, setAceito] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [feito, setFeito] = useState<{ email: string; slug: string; ate: string; email_enviado: boolean } | null>(null)
  useEffect(() => { document.title = 'Demonstração grátis | GetZap Delivery' }, [])

  async function enviar(e: FormEvent) {
    e.preventDefault(); setErro('')
    if (!aceito) return setErro('Para continuar, aceite os Termos de Uso e a Política de Privacidade.')
    setEnviando(true)
    const { data, error } = await supabase.functions.invoke('demonstracao', { body: { ...f, slug: f.slug.replace(/-+$/, '') } })
    setEnviando(false)
    if (error || data?.erro) {
      let msg = data?.erro as string | undefined
      if (!msg && error) { try { msg = (await (error as any).context?.json())?.erro } catch { /* sem JSON */ } }
      return setErro(msg ?? 'Não foi possível concluir agora. Tente novamente.')
    }
    setFeito(data)
  }

  return (
    <div className="min-h-screen bg-neutral-100 text-neutral-900">
      <header className="bg-[#1B2A4A] px-4 py-4 text-center">
        <a href="https://getzapdelivery.com.br" className="inline-flex items-center gap-2">
          <img src="/logo-getzapdelivery.jpg" alt="" className="h-10 w-10 rounded-full bg-white object-contain" />
          <span className="text-xl font-extrabold text-white">Get<span className="text-[#2EA043]">Zap</span> <span className="text-[#F28C28]">Delivery</span></span>
        </a>
      </header>
      <main className="mx-auto max-w-lg px-4 py-6">
        {feito ? (
          <div className="space-y-3 rounded-2xl bg-white p-5 shadow">
            <h1 className="text-2xl font-extrabold text-[#1B2A4A]">Pronto! Sua demonstração foi criada 🎉</h1>
            {feito.email_enviado
              ? <p>Enviamos para <b>{feito.email}</b> o link do painel, o seu login e uma senha temporária. Confira também a caixa de spam.</p>
              : <p>Sua loja foi criada, mas não conseguimos enviar o e-mail agora. Entre no painel com <b>{feito.email}</b> usando <b>"Esqueci minha senha"</b> para criar sua senha.</p>}
            <p>Você pode usar o sistema à vontade até <b>{feito.ate}</b>.</p>
            <p className="text-sm text-neutral-600">Endereço do seu cardápio: <b>{SITE}/{feito.slug}</b></p>
            <a href="/painel" className="block rounded-lg bg-[#2EA043] px-4 py-3 text-center font-bold text-white">Ir para o painel</a>
          </div>
        ) : (
          <form onSubmit={enviar} className="space-y-4 rounded-2xl bg-white p-5 shadow">
            <div>
              <h1 className="text-2xl font-extrabold text-[#1B2A4A]">Teste grátis por 15 dias</h1>
              <p className="mt-1 text-neutral-600">Cardápio online, pedidos pelo WhatsApp e painel de gestão. Sem cartão de crédito.</p>
            </div>
            <label className="block"><span className={rotulo}>Nome do restaurante</span>
              <input required className={campo} placeholder="Ex.: Lanchonete do João" value={f.nome}
                onChange={e => setF(x => ({ ...x, nome: e.target.value, slug: slugEditado ? x.slug : slugify(e.target.value) }))} /></label>
            <label className="block"><span className={rotulo}>Endereço do seu cardápio</span>
              <div className="flex items-center overflow-hidden rounded-lg border border-neutral-300 bg-white">
                <span className="shrink-0 bg-neutral-100 px-2 py-2 text-sm text-neutral-600">{SITE}/</span>
                <input required minLength={3} className="w-full min-w-0 px-2 py-2 outline-none" placeholder="lanchonete-do-joao" value={f.slug}
                  onChange={e => { setSlugEditado(true); setF(x => ({ ...x, slug: slugify(e.target.value) })) }} />
              </div></label>
            <label className="block"><span className={rotulo}>WhatsApp do restaurante</span>
              <input required className={campo} inputMode="tel" placeholder="(11) 99999-9999" pattern="\(\d{2}\) \d{4,5}-\d{4}" title="Digite o WhatsApp com DDD"
                value={f.whatsapp} onChange={e => setF(x => ({ ...x, whatsapp: mascaraTelefone(e.target.value) }))} />
              <span className="text-xs text-neutral-500">É nele que os pedidos vão chegar.</span></label>
            <label className="block"><span className={rotulo}>Seu e-mail (será o login do painel)</span>
              <input required type="email" autoComplete="email" className={campo} placeholder="voce@email.com" value={f.email} onChange={e => setF(x => ({ ...x, email: e.target.value }))} /></label>
            {/* Campo-isca contra robôs: escondido das pessoas */}
            <input tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 opacity-0" name="site" value={f.site} onChange={e => setF(x => ({ ...x, site: e.target.value }))} />
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={aceito} onChange={e => setAceito(e.target.checked)} />
              <span>Li e aceito os <a href="https://getzapdelivery.com.br/termos-de-uso.html" target="_blank" rel="noopener" className="underline">Termos de Uso</a> e a <a href="https://getzapdelivery.com.br/politica-de-privacidade.html" target="_blank" rel="noopener" className="underline">Política de Privacidade</a>.</span>
            </label>
            {erro && <p role="alert" className="rounded-lg bg-red-100 p-3 text-red-800">{erro}</p>}
            <button disabled={enviando} className="w-full rounded-lg bg-[#2EA043] px-4 py-3 text-lg font-bold text-white disabled:opacity-50">{enviando ? 'Criando sua loja…' : 'Começar meu teste grátis'}</button>
            <p className="text-center text-xs text-neutral-500">Você recebe no e-mail o link, o login e a senha para começar.</p>
          </form>
        )}
      </main>
    </div>
  )
}
