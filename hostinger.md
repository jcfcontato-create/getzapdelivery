# Publicar na Hostinger (deploy automático)

## Objetivo

Toda vez que um código novo é enviado (`git push`) para a branch `main` no
GitHub, o cardápio, o painel e o admin são automaticamente buildados e
publicados no VPS da Hostinger, as migrações de banco pendentes são
aplicadas no Supabase, e a Edge Function `admin-criar-loja` é republicada.

## Como funciona (visão geral)

O deploy roda através de um **runner próprio do GitHub Actions instalado
dentro do próprio VPS** (não um runner da nuvem do GitHub). Isso foi uma
decisão tomada depois de tentar o caminho padrão (Action na nuvem do
GitHub conectando por SSH no servidor) e esbarrar num bloqueio de rede: as
máquinas que rodam as Actions do GitHub ficam em datacenters de nuvem
(Azure), e o servidor recebe tantos ataques de força bruta vindos desses
mesmos datacenters que alguma proteção de rede (não configurável pelo
hPanel) acaba rejeitando essas conexões, mesmo com usuário/chave corretos.

Rodando o runner *dentro* do próprio servidor, o deploy nunca precisa
"entrar" via SSH de fora — ele já está lá.

- Arquivo do workflow: `.github/workflows/deploy.yml`
- Runner: instalado em `~/actions-runner` no VPS, rodando como serviço
  systemd (`actions.runner.jcfcontato-create-getzapdelivery.<host>.service`)
- Gatilho: qualquer `git push` na branch `main`, ou manualmente pela aba
  Actions → "Run workflow"

## Entradas necessárias (GitHub Secrets)

Configurados em **Settings → Secrets and variables → Actions** do
repositório:

| Secret | Para que serve |
|---|---|
| `VITE_SUPABASE_URL` | URL do projeto Supabase, embutida no `config.js` do build |
| `VITE_SUPABASE_ANON_KEY` | Chave anônima do Supabase, embutida no `config.js` |
| `VPS_PATH` | Pasta no servidor onde os arquivos do build são publicados |
| `SUPABASE_PROJECT_REF` | Referência do projeto Supabase (para `supabase link`) |
| `SUPABASE_ACCESS_TOKEN` | Token de acesso pessoal do Supabase (CLI) |
| `SUPABASE_DB_PASSWORD` | Senha do banco Postgres do Supabase (Project Settings → Database → pode ser resetada lá se for perdida) |

**Não são mais usados** (removidos depois de trocar para o runner próprio):
`VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`.

## Passos que a Action executa

1. Baixa o código (`actions/checkout`)
2. Prepara o Node.js 20
3. `npm ci` na pasta `app/`
4. Gera `app/public/config.js` com as credenciais de produção do Supabase
5. `npm run build` (gera `app/dist/`)
6. Copia `app/dist/` para a pasta definida em `VPS_PATH` (rsync local,
   sem rede — o runner já roda no próprio servidor)
7. Instala a CLI do Supabase
8. `supabase link` no projeto
9. `supabase db push` (aplica migrações pendentes em `supabase/migrations/`)
10. `supabase functions deploy admin-criar-loja`

## Saída esperada

- Job "publicar" verde ✅ na aba Actions
- Arquivos atualizados na pasta `VPS_PATH` do servidor
- Migrações novas aplicadas no banco (confira em Supabase → Database →
  Migrations, ou rodando `supabase migration list` no servidor)
- Edge Function `admin-criar-loja` com a versão mais recente

## Como tratar problemas comuns

- **Job fica preso "Waiting for a runner..."**: o runner não está rodando
  no servidor. No Web Console: `sudo systemctl status actions.runner.*`
  e, se preciso, `sudo systemctl start actions.runner.*` (o nome exato do
  serviço aparece no `status` de qualquer um deles).
- **Erro de senha do banco (`password authentication failed`)**: a
  `SUPABASE_DB_PASSWORD` está desatualizada. Reseta a senha em Project
  Settings → Database no painel do Supabase e atualiza o secret.
- **Erro do `supabase link` (projeto não encontrado)**: conferir se
  `SUPABASE_PROJECT_REF` e `SUPABASE_ACCESS_TOKEN` ainda são válidos.
- **Quer reinstalar o runner do zero** (trocou de servidor, por exemplo):
  gerar um novo token em Settings → Actions → Runners → New self-hosted
  runner e repetir a instalação (`./config.sh` com
  `RUNNER_ALLOW_RUNASROOT=1`, depois `sudo ./svc.sh install && sudo
  ./svc.sh start`).