-- Módulo de Divulgação: a IA cria texto e arte (com a foto real do produto) para postar
-- no Facebook, Instagram e TikTok. Liberado por loja no painel admin.

alter table lojas add column modulo_divulgacao boolean not null default false;

-- Só o administrador da plataforma liga/desliga módulos e a loja (ver 0033)
create or replace function proteger_campos_admin_loja() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not eh_admin_plataforma() then
    if new.plataforma_ativa is distinct from old.plataforma_ativa
       or new.modulo_precificacao is distinct from old.modulo_precificacao
       or new.modulo_divulgacao is distinct from old.modulo_divulgacao then
      raise exception 'Somente o administrador da plataforma pode alterar este campo.';
    end if;
  end if;
  return new;
end $$;

-- Postagens salvas ou agendadas (o agendamento é um lembrete no painel na hora marcada)
create table postagens (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references lojas(id) on delete cascade,
  oferta text not null,
  titulo text,
  subtitulo text,
  chamada text,
  preco text,
  legenda text not null default '',
  hashtags text not null default '',
  modelo text not null default 'destaque',
  formato text not null default 'feed' check (formato in ('feed', 'story')),
  foto_url text,
  imagem_url text,
  status text not null default 'rascunho' check (status in ('rascunho', 'agendada', 'publicada')),
  agendado_para timestamptz,
  publicado_em timestamptz,
  criado_em timestamptz not null default now()
);
create index on postagens (loja_id, status, agendado_para);

-- Cada geração pela IA conta 1 uso (limite mensal por loja conferido na Edge Function)
create table divulgacao_usos (
  id bigint generated always as identity primary key,
  loja_id uuid not null references lojas(id) on delete cascade,
  criado_em timestamptz not null default now()
);
create index on divulgacao_usos (loja_id, criado_em);

alter table postagens enable row level security;
alter table divulgacao_usos enable row level security;
create policy "postagens: equipe" on postagens for all using (eh_membro(loja_id)) with check (eh_membro(loja_id));
create policy "divulgacao_usos: equipe vê" on divulgacao_usos for select using (eh_membro(loja_id));

-- Neste projeto as tabelas novas precisam de grant explícito (docs/aprendizados.md)
grant select, insert, update, delete on postagens to authenticated;
grant select on divulgacao_usos to authenticated;
grant all on postagens, divulgacao_usos to service_role;
