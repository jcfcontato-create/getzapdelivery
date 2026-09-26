# GetZap Delivery

Sistema de delivery para restaurantes e adegas: **cardápio online, pedido pelo WhatsApp e painel de gestão**.

Começa atendendo a Adega e Restaurante S.O.S e foi pensado para evoluir para um SaaS com várias lojas.

**Status:** fase 1 em andamento (cardápio público com pedido pelo WhatsApp; painel de gestão em seguida).

## Por onde começar

Leia o [`CLAUDE.md`](CLAUDE.md). Ele reúne as decisões já tomadas, a proposta de arquitetura, as fases do projeto e as regras de trabalho do agente (Claude Code).

## Estrutura

- `workflows/`: passo a passo em Markdown para tarefas repetidas
- `docs/`: decisões, planejamento e aprendizados
- `.env.example`: modelo das variáveis de ambiente (o `.env` real nunca é versionado)

O aplicativo fica em `app/` e o banco de dados (Supabase) em `supabase/`.
