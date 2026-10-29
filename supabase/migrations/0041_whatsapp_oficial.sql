-- WhatsApp oficial (API da Meta) com o número da plataforma GetZap: avisos automáticos ao
-- cliente quando o pedido entra em preparo e quando sai para entrega.
-- Ligado por loja no Painel Admin (o custo por mensagem é da plataforma).
alter table lojas add column if not exists modulo_whatsapp boolean not null default false;

create or replace function proteger_campos_admin_loja() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not eh_admin_plataforma() then
    if new.plataforma_ativa is distinct from old.plataforma_ativa
       or new.modulo_precificacao is distinct from old.modulo_precificacao
       or new.modulo_divulgacao is distinct from old.modulo_divulgacao
       or new.modulo_whatsapp is distinct from old.modulo_whatsapp
       or new.demo_ate is distinct from old.demo_ate then
      raise exception 'Somente o administrador da plataforma pode alterar este campo.';
    end if;
  end if;
  return new;
end $$;

-- Registro de cada aviso enviado (evita mandar o mesmo aviso duas vezes e ajuda a conferir)
create table if not exists whatsapp_envios (
  id bigint generated always as identity primary key,
  loja_id uuid not null references lojas(id) on delete cascade,
  pedido_id uuid not null references pedidos(id) on delete cascade,
  evento text not null check (evento in ('em_preparo', 'saiu_para_entrega')),
  telefone text not null,
  status text not null default 'enviado' check (status in ('enviado', 'erro')),
  mensagem_id text,
  erro text,
  criado_em timestamptz not null default now(),
  unique (pedido_id, evento)
);
create index if not exists whatsapp_envios_loja_idx on whatsapp_envios (loja_id, criado_em);
alter table whatsapp_envios enable row level security;
drop policy if exists "whatsapp_envios: equipe vê" on whatsapp_envios;
create policy "whatsapp_envios: equipe vê" on whatsapp_envios for select using (eh_membro(loja_id) or eh_admin_plataforma());
grant select on whatsapp_envios to authenticated;
grant all on whatsapp_envios to service_role;
