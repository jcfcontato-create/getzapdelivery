-- Banners do topo do cardápio, um para celular e outro para computador.
-- Se só um for enviado, o cardápio usa o mesmo nos dois tamanhos.
alter table lojas add column if not exists banner_celular_url text;
alter table lojas add column if not exists banner_pc_url text;

-- A Big Açaí já testava o banner (arquivo publicado junto com o app).
update lojas set banner_celular_url = '/banners/big-acai.webp', banner_pc_url = '/banners/big-acai.webp'
where slug = 'big-acai' and banner_celular_url is null and banner_pc_url is null;

notify pgrst, 'reload schema';
