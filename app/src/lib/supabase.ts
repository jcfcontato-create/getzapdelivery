import { createClient } from '@supabase/supabase-js'

declare global {
  interface Window { __GZ_CONFIG__?: { supabaseUrl?: string; supabaseKey?: string } }
}

// A configuração vem do arquivo config.js (editável na hospedagem) ou do .env, na hora de compilar.
const cfg = window.__GZ_CONFIG__ ?? {}
const url = (cfg.supabaseUrl || import.meta.env.VITE_SUPABASE_URL || '').trim().replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '')
const key = (cfg.supabaseKey || import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim()
if (!url || !key) throw new Error('Configure o config.js (ou o .env) com a URL e a chave pública do Supabase.')

export const supabase = createClient(url, key)
