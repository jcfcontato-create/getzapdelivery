-- SEO/GEO local: dados de localização e descrição de cada loja,
-- usados nas páginas geradas para o Google e as IAs (título, descrição, Schema.org).
alter table lojas add column if not exists cidade text;
alter table lojas add column if not exists uf text check (uf is null or uf ~ '^[A-Z]{2}$');
alter table lojas add column if not exists cep text check (cep is null or cep ~ '^[0-9]{5}-?[0-9]{3}$');
alter table lojas add column if not exists tipo_cozinha text;
alter table lojas add column if not exists descricao_seo text check (descricao_seo is null or char_length(descricao_seo) <= 300);

-- Dados conhecidos da Adega S.O.S
update lojas set cidade = 'Bom Jesus dos Perdões', uf = 'SP' where slug = 'adega-sos' and cidade is null;

notify pgrst, 'reload schema';
