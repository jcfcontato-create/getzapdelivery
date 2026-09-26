-- Bucket público para as fotos dos produtos do cardápio.
insert into storage.buckets (id, name, public)
values ('produtos', 'produtos', true)
on conflict (id) do nothing;

-- Qualquer pessoa pode ver as fotos (o cardápio é público).
create policy "produtos-fotos: leitura pública"
on storage.objects for select
using (bucket_id = 'produtos');

-- Só a equipe da própria loja pode enviar, trocar ou apagar fotos,
-- e só dentro da pasta com o id da loja (ex.: <loja_id>/arquivo.jpg).
create policy "produtos-fotos: equipe envia"
on storage.objects for insert
with check (
  bucket_id = 'produtos'
  and eh_membro((storage.foldername(name))[1]::uuid)
);

create policy "produtos-fotos: equipe atualiza"
on storage.objects for update
using (
  bucket_id = 'produtos'
  and eh_membro((storage.foldername(name))[1]::uuid)
);

create policy "produtos-fotos: equipe exclui"
on storage.objects for delete
using (
  bucket_id = 'produtos'
  and eh_membro((storage.foldername(name))[1]::uuid)
);
