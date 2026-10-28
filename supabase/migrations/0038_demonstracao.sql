-- Período de demonstração (15 dias) pedido pelo site getzapdelivery.com.br.
-- demo_ate = null: loja normal (não é demonstração). Ao vencer, nada é bloqueado:
-- o Painel Admin só mostra "Demonstração vencida" para o administrador decidir.
-- Escrita de forma idempotente (pode ser aplicada mais de uma vez sem erro).
alter table lojas add column if not exists demo_ate timestamptz;

-- Só o administrador altera módulos, status e a data da demonstração
create or replace function proteger_campos_admin_loja() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not eh_admin_plataforma() then
    if new.plataforma_ativa is distinct from old.plataforma_ativa
       or new.modulo_precificacao is distinct from old.modulo_precificacao
       or new.modulo_divulgacao is distinct from old.modulo_divulgacao
       or new.demo_ate is distinct from old.demo_ate then
      raise exception 'Somente o administrador da plataforma pode alterar este campo.';
    end if;
  end if;
  return new;
end $$;

-- Pedidos de demonstração (para limitar abusos por IP e acompanhar no admin)
create table if not exists demonstracoes (
  id bigint generated always as identity primary key,
  ip text,
  email text not null,
  loja_id uuid references lojas(id) on delete set null,
  criado_em timestamptz not null default now()
);
create index if not exists demonstracoes_ip_idx on demonstracoes (ip, criado_em);
alter table demonstracoes enable row level security;
drop policy if exists "demonstracoes: admin vê" on demonstracoes;
create policy "demonstracoes: admin vê" on demonstracoes for select using (eh_admin_plataforma());
grant select on demonstracoes to authenticated;
grant all on demonstracoes to service_role;
