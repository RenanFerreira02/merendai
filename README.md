# Merendai — Da roça pra merenda

App voice-first que leva o pequeno agricultor da chamada pública do PNAE até o pagamento, combinando **técnico de campo + agente de IA por áudio + produtor embaixador**.

Global Solution 2 / 2026 · CitizenTech · FIAP · Sistemas de Informação · 3SIOA

> Desde 2026, 45% do dinheiro federal da merenda deve ir para a agricultura familiar (Lei 15.226/2025). O governo criou a plataforma; faltou gente. O Merendai é quem leva o agricultor até ela.

## Documentação

- **[README.txt](README.txt)** — instruções de execução, roteiro da demo e justificativas técnicas (entregável da GS)
- **[docs/DOCUMENTACAO_TECNICA.md](docs/DOCUMENTACAO_TECNICA.md)** — arquitetura, MER, rotinas PL/SQL, funções e classes, memória e eficiência, ODS
- **[docs/diagramas/DER.png](docs/diagramas/DER.png)** — diagrama entidade-relacionamento

## Estrutura

| Pasta | Conteúdo |
| --- | --- |
| `database/` | DDL Oracle, package PL/SQL, triggers, views, seed, teste de cenário, docker-compose |
| `services/api/` | API Node.js (Express + oracledb) e agente de voz (Claude com tool use ou modo regras) |
| `apps/mobile/` | App React Native (Expo + expo-router + TypeScript), 3 perfis, voz nativa, offline-first |
| `docs/` | Documentação, diagramas e evidências de testes |

## Executar em 3 comandos

```bash
cd database && docker compose up -d            # Oracle XE com schema + seed
cd ../services/api && cp .env.example .env && npm install && npm run dev
cd ../../apps/mobile && npm install && npx expo start
```

Logins de demo (senha `merendai123`): produtora `15992000001`, técnico `15991000001`.

## Funcionalidades

1. **Oportunidades em voz** — chamadas públicas compatíveis com o que o produtor planta, lidas em linguagem simples
2. **Proposta por conversa e mutirão** — o agente monta o projeto de venda por áudio e junta vizinhos quando falta volume
3. **Entregas e pagamento** — agenda, lembrete por voz, confirmação e situação do pagamento
4. **Painel do técnico** — cadastro em campo, mapa, indicador da meta de 45%

ODS 2 · 4 · 10 · 8 · 12
