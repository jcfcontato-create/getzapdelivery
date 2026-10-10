-- Assinaturas do GetZap Delivery pagas pelo Asaas (plano mensal ou anual).
-- Fluxo: o futuro cliente informa os dados mínimos → paga no Asaas → cadastra a loja
-- → recebe o acesso por e-mail. Só as Edge Functions (chave de serviço) mexem aqui.
create table if not exists assinaturas (
  id uuid primary key default gen_random_uuid(),
  token text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  plano text not null check (plano in ('mensal', 'anual')),
  forma_pagamento text not null check (forma_pagamento in ('PIX', 'CREDIT_CARD')),
  nome text not null,
  email text not null,
  cpf_cnpj text not null,
  whatsapp text,
  asaas_customer_id text,
  asaas_subscription_id text unique,
  link_pagamento text,
  status text not null default 'aguardando_pagamento'
    check (status in ('aguardando_pagamento', 'paga', 'cadastrada', 'inadimplente', 'cancelada')),
  loja_id uuid references lojas(id) on delete set null,
  pago_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists assinaturas_email_idx on assinaturas (lower(email));
alter table assinaturas enable row level security;
-- Sem políticas: ninguém lê pelo navegador; só a chave de serviço (Edge Functions).
revoke all on assinaturas from anon, authenticated;
grant all on assinaturas to service_role;

notify pgrst, 'reload schema';
