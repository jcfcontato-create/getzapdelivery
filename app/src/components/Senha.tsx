// Recuperação de senha (painel da loja e painel admin).
// 1) "Esqueci minha senha" envia o link do Supabase para o e-mail.
// 2) Ao abrir o link, o Supabase entra no modo de recuperação e mostramos o formulário de nova senha.
import { type FormEvent, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const campo = 'w-full rounded-lg border border-neutral-300 bg-white px-3 py-2'
const botao = 'rounded-lg bg-[#1A7F37] px-4 py-2 font-bold text-white disabled:opacity-50'

// Link + formulário de "Esqueci minha senha", para colocar embaixo do login
export function EsqueciSenha({ emailInicial = '' }: { emailInicial?: string }) {
  const [aberto, setAberto] = useState(false)
  const [email, setEmail] = useState(emailInicial)
  const [ocupado, setOcupado] = useState(false)
  const [msg, setMsg] = useState('')
  const [erro, setErro] = useState('')
  async function enviar(e: FormEvent) {
    e.preventDefault(); setOcupado(true); setErro(''); setMsg('')
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin + window.location.pathname })
    setOcupado(false)
    if (error) setErro(error.message.includes('rate') ? 'Muitas tentativas. Aguarde alguns minutos e tente de novo.' : 'Não foi possível enviar agora. Tente novamente em instantes.')
    else setMsg('Se esse e-mail tiver acesso, você vai receber um link para criar uma nova senha. Confira também a caixa de spam.')
  }
  if (!aberto) return <button type="button" className="mt-3 block w-full text-center text-sm text-neutral-600 underline" onClick={() => { setAberto(true); setEmail(emailInicial) }}>Esqueci minha senha</button>
  return (
    <form onSubmit={enviar} className="mt-4 space-y-2 rounded-xl border border-neutral-200 bg-white p-4">
      <p className="font-semibold">Recuperar senha</p>
      <input required type="email" className={campo} placeholder="Seu e-mail de acesso" value={email} onChange={e => setEmail(e.target.value)} />
      {erro && <p role="alert" className="rounded-lg bg-red-100 p-2 text-sm text-red-800">{erro}</p>}
      {msg && <p role="status" className="rounded-lg bg-green-100 p-2 text-sm text-green-800">{msg}</p>}
      <div className="flex gap-2">
        <button disabled={ocupado} className={botao}>{ocupado ? 'Enviando…' : 'Enviar link'}</button>
        <button type="button" className="text-sm text-neutral-600 underline" onClick={() => setAberto(false)}>Voltar</button>
      </div>
    </form>
  )
}

// O link do e-mail chega com "type=recovery" no endereço; guardamos isso logo ao carregar o app,
// antes que o Supabase limpe o endereço.
const veioDoLink = typeof window !== 'undefined' && /type=recovery/.test(window.location.hash + window.location.search)

// Fica no topo do app: quando a pessoa abre o link de recuperação, pede a nova senha
export function NovaSenha() {
  const [ativo, setAtivo] = useState(veioDoLink)
  const [senha, setSenha] = useState('')
  const [senha2, setSenha2] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState(false)
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange(ev => { if (ev === 'PASSWORD_RECOVERY') setAtivo(true) })
    return () => data.subscription.unsubscribe()
  }, [])
  async function salvar(e: FormEvent) {
    e.preventDefault(); setErro('')
    if (senha.length < 8) return setErro('A senha precisa ter pelo menos 8 caracteres.')
    if (senha !== senha2) return setErro('As duas senhas não são iguais.')
    setOcupado(true)
    const { error } = await supabase.auth.updateUser({ password: senha })
    setOcupado(false)
    if (error) return setErro(error.message.includes('session') || error.message.includes('Auth') ? 'O link expirou ou já foi usado. Peça um novo em "Esqueci minha senha".' : error.message)
    setOk(true); setSenha(''); setSenha2('')
  }
  if (!ativo) return null
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
        {ok ? (<>
          <p className="mb-2 text-lg font-bold text-[#1B2A4A]">Senha alterada!</p>
          <p className="mb-4 text-sm">Pronto, a nova senha já vale. Você já está conectado.</p>
          <button className={`${botao} w-full`} onClick={() => setAtivo(false)}>Continuar</button>
        </>) : (
          <form onSubmit={salvar} className="space-y-3">
            <p className="text-lg font-bold text-[#1B2A4A]">Criar nova senha</p>
            <input required type="password" autoComplete="new-password" className={campo} placeholder="Nova senha (mínimo 8 caracteres)" value={senha} onChange={e => setSenha(e.target.value)} />
            <input required type="password" autoComplete="new-password" className={campo} placeholder="Repita a nova senha" value={senha2} onChange={e => setSenha2(e.target.value)} />
            {erro && <p role="alert" className="rounded-lg bg-red-100 p-2 text-sm text-red-800">{erro}</p>}
            <button disabled={ocupado} className={`${botao} w-full`}>{ocupado ? 'Salvando…' : 'Salvar nova senha'}</button>
          </form>
        )}
      </div>
    </div>
  )
}
