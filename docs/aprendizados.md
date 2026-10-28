# Aprendizados

## Tabelas novas no Supabase precisam de GRANT
Neste projeto, as tabelas criadas por migração **não** recebem permissão automática para os papéis da API (`anon`, `authenticated`).
Sem o grant, o painel mostra `permission denied for table ...` mesmo com as políticas RLS corretas.
Toda migração que cria tabela deve incluir, conforme o caso:

```sql
grant select on minha_tabela to anon, authenticated;              -- se o cardápio público lê
grant insert, update, delete on minha_tabela to authenticated;    -- se o painel altera
grant all on minha_tabela to service_role;                        -- Edge Functions
```
Ocorrido em 2026-10-18 no módulo de Precificação (corrigido na migração 0034).

## Publicação falhando em "Ligar ao projeto Supabase"
Em out/2026 o `SUPABASE_ACCESS_TOKEN` do GitHub deixou de valer e a etapa falhou (o site continuava publicando,
mas migrações e Edge Functions não). Correção: gerar um token novo em supabase.com/dashboard/account/tokens e
atualizar o segredo em GitHub → Settings → Secrets and variables → Actions.

## Migração aplicada fora do GitHub Actions
Se for preciso aplicar uma migração direto no Supabase (ex.: CI fora do ar), escreva o SQL de forma idempotente
e depois acerte o histórico para o número do arquivo (ex.: `0038`) em `supabase_migrations.schema_migrations`;
senão o `supabase db push` reclama de versões remotas que não existem na pasta `supabase/migrations`.
