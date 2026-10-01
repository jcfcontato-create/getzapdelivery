-- A Edge Function "admin-criar-loja" usa a chave de serviço (service_role) para criar
-- a loja e o vínculo do dono (membros). O service_role deveria ignorar toda regra de
-- RLS e de permissão automaticamente, mas o erro "permission denied for table lojas"
-- mostra que esse papel ficou sem a permissão de escrita nessas duas tabelas (os
-- "grants" de 0002_permissoes_api.sql só liberaram select/update para anon/authenticated,
-- nunca insert para o service_role). Esta migração concede explicitamente todas as
-- permissões ao service_role nessas tabelas, sem mexer em RLS nem nas permissões já
-- existentes de anon/authenticated.
grant select, insert, update, delete on lojas to service_role;
grant select, insert, update, delete on membros to service_role;

notify pgrst, 'reload schema';
