# Merendai — Documentação técnica

Global Solution 2 / 2026 · CitizenTech · FIAP · Sistemas de Informação · Renan Ferreira

## 1. Arquitetura

```
┌─────────────────────────┐    HTTPS/JSON    ┌──────────────────────┐   oracledb   ┌────────────────────┐
│  App Expo (React Native)│ ───────────────► │  API Node (Express)  │ ───────────► │  Oracle XE 21c     │
│  • STT/TTS no aparelho  │ ◄─────────────── │  • auth JWT, zod     │ ◄─────────── │  • pkg_merendai    │
│  • cache offline (TTL)  │                  │  • agente (LLM/regras)│             │  • triggers/views  │
│  • 3 perfis (router)    │                  │  • chama procedures  │              │  • histórico       │
└─────────────────────────┘                  └──────────┬───────────┘              └────────────────────┘
                                                        │ tool use (opcional)
                                                        ▼
                                                 Claude API (Anthropic)
```

Princípio: **a regra de negócio mora no banco**. Matching, mutirão, limite anual, máquina de estados e auditoria são PL/SQL. A API só autentica, valida e chama. O app só conversa e mostra. Isso significa que uma futura integração com o Contrata+Brasil ou um canal WhatsApp reaproveitam 100% das regras.

## 2. Modelo de dados

### 2.1 MER (descrição)

| Entidade | O que representa | Relacionamentos principais |
| --- | --- | --- |
| MUNICIPIO | Entidade executora do PNAE; guarda repasse FNDE e compras da agricultura familiar | 1:N com TECNICO, PRODUTOR, ESCOLA, CHAMADA |
| USUARIO | Autenticação e perfil (PRODUTOR, TECNICO, GESTOR) | 1:0..1 com PRODUTOR e TECNICO |
| TECNICO | Camada humana 1: extensão rural, cooperativa, sindicato | 1:N com PRODUTOR (cadastra), PROPOSTA (revisa) |
| PRODUTOR | Agricultor familiar, com CAF, geolocalização, raio de entrega, flag embaixador, limite anual | 1:N com PRODUCAO, PROSPECT, ITEM_PROPOSTA; lidera PROPOSTA |
| PRODUTO | Catálogo de gêneros com unidade, categoria e meses de safra | N:M com PRODUTOR via PRODUCAO; 1:N com ITEM_CHAMADA |
| PRODUCAO | O que cada produtor planta e quanto entrega por semana | associativa PRODUTOR × PRODUTO |
| ESCOLA | Unidade que recebe os alimentos | 1:N com ENTREGA |
| CHAMADA | Chamada pública do PNAE (edital), com resumo em linguagem simples para áudio | 1:N com ITEM_CHAMADA, PROPOSTA |
| ITEM_CHAMADA | Produto pedido na chamada, quantidade, periodicidade, preço de referência, quantidade já atendida | 1:N com PROSPECT, ITEM_PROPOSTA |
| PROSPECT | Resultado do matching: "este item serve para este produtor", com distância, cobertura e score | associativa ITEM_CHAMADA × PRODUTOR |
| PROPOSTA | Projeto de venda, INDIVIDUAL ou MUTIRAO, com transcrição da conversa | 1:N com PARTICIPANTE_MUTIRAO, ITEM_PROPOSTA |
| PARTICIPANTE_MUTIRAO | Produtores que compõem a proposta e se confirmaram | associativa PROPOSTA × PRODUTOR |
| ITEM_PROPOSTA | O que cada produtor da proposta entrega de cada item | 1:N com ENTREGA |
| ENTREGA | Entrega agendada numa escola, com quantidade prevista e entregue | 1:0..1 com PAGAMENTO |
| PAGAMENTO | Pagamento previsto/pago por entrega | — |
| INDICACAO | Camada humana 3: embaixador indica vizinho; CONVERTIDO na primeira venda | PRODUTOR (embaixador) × PRODUTOR (indicado) |
| HISTORICO_STATUS | Auditoria append-only de toda mudança de status (via trigger, transação autônoma) | referencia lógica a qualquer entidade com status |

### 2.2 DER

Arquivo `docs/diagramas/DER.mmd` (fonte Mermaid) e `DER.png` / `DER.svg` (renderizados). Convenções: PK `ID_<tabela>` por IDENTITY; status em CHECK constraints; geolocalização em `NUMBER(9,6)` com distância calculada em PL/SQL (Haversine), sem depender de Oracle Spatial.

### 2.3 Máquinas de estado (protegidas por trigger)

| Entidade | Transições permitidas |
| --- | --- |
| PROPOSTA | RASCUNHO → ENVIADA, CANCELADA · ENVIADA → CONTRATADA, RECUSADA, CANCELADA |
| ENTREGA | AGENDADA → LEMBRADA, ENTREGUE, PARCIAL, FALTOU, CANCELADA · LEMBRADA → ENTREGUE, PARCIAL, FALTOU, CANCELADA |
| PAGAMENTO | PREVISTO → PAGO, ATRASADO, CANCELADO · ATRASADO → PAGO, CANCELADO |
| PROSPECT | NOVO → NOTIFICADO, ACEITO, RECUSADO, EXPIRADO · NOTIFICADO → ACEITO, RECUSADO, EXPIRADO |
| INDICACAO | PENDENTE → CADASTRADO, CONVERTIDO · CADASTRADO → CONVERTIDO |
| CHAMADA | ABERTA → ENCERRADA, CANCELADA · ENCERRADA → HOMOLOGADA, CANCELADA |

Qualquer outra transição levanta `ORA-2001x` e nada é gravado.

## 3. Rotinas PL/SQL (`pkg_merendai`)

| Rotina | Tipo | O que automatiza | Usada em |
| --- | --- | --- | --- |
| `fn_distancia_km(lat1, lon1, lat2, lon2)` | function, deterministic | Haversine em km | matching, mutirão |
| `fn_percentual_af(id_municipio)` | function | % do repasse FNDE gasto com agricultura familiar | painel (meta de 45%) |
| `fn_saldo_limite_anual(id_produtor, id_municipio, ano)` | function | Quanto o produtor ainda pode vender no ano para aquela entidade (limite por CAF) | mutirão, envio |
| `fn_resumo_chamada_audio(id_chamada)` | function | Texto em linguagem simples para TTS ("A prefeitura de Itapeva quer comprar 2.400 quilos de mandioca por semana, pagando 4,20 reais o quilo...") | F1 |
| `fn_meta_af()` | function | Expõe a constante de 45% para views | views |
| `sp_gerar_prospects(id_chamada, OUT qtd)` | procedure | Matching chamada × produtores: planta o produto, CAF válido, dentro do raio, cobre ≥ 10%. Gera PROSPECT com score. Idempotente (MERGE) | seed, cadastro de produtor |
| `sp_montar_mutirao(id_item, id_lider, OUT id_proposta, OUT cobertura)` | procedure | Cria a proposta, entra o líder, soma vizinhos por score e proximidade até cobrir o volume, respeitando o limite anual de cada um. Vira INDIVIDUAL se só o líder entrou | F2 |
| `sp_enviar_proposta(id_proposta, id_tecnico)` | procedure | Valida chamada aberta e prazo, itens > 0, limite anual por participante; calcula total; RASCUNHO → ENVIADA; marca prospects como ACEITO | F2, painel |
| `sp_contratar_proposta(id_proposta, id_escola)` | procedure | ENVIADA → CONTRATADA; gera o calendário de entregas pela periodicidade; um PAGAMENTO previsto (30 dias) por entrega; converte indicações do embaixador | painel |
| `sp_gerar_lembretes(data, OUT cursor)` | procedure | Marca entregas do dia como LEMBRADA e devolve a fila com a mensagem pronta para áudio | F3, job diário |
| `sp_confirmar_entrega(id_entrega, qtd, obs)` | procedure | ENTREGUE/PARCIAL/FALTOU; atualiza `qtd_atendida` do item e `vl_compra_af` do município; ajusta ou cancela o pagamento | F3 |

Fora do package: `sp_registrar_historico` (transação autônoma), `fn_transicao_valida`, 7 triggers e 3 views (`vw_indicadores_municipio`, `vw_painel_tecnico`, `vw_oportunidades_produtor`).

Teste ponta a ponta em `database/tests/05_teste_cenario.sql`: 11 asserts cobrindo matching, exclusão por CAF vencido, mutirão com cobertura 100%, envio, bloqueio de transição inválida, contratação (63 entregas e 63 pagamentos), conversão de indicação, lembretes, confirmação com aumento do % AF e histórico.

## 4. API (`services/api`)

| Arquivo | Responsabilidade | Principais funções |
| --- | --- | --- |
| `src/server.js` | Bootstrap do Express, pool, tratamento de erro padrão | — |
| `src/db.js` | Pool Oracle (1–8 conexões), `withConn` com commit/rollback/close garantidos, `query`, `toHttpError` (ORA-2000x → HTTP 422) | `initPool`, `closePool`, `withConn`, `query`, `toHttpError` |
| `src/routes.js` | Endpoints REST; validação com zod; mapeamento linha → JSON | `auth` (middleware JWT), `carregarProposta`, `mapOportunidade`, `mapIndicador` |
| `src/agente.js` | Agente de voz com dois modos | `conversar` (entrada única), `conversarLLM` (Claude + tool use), `conversarRegras` (máquina de estados), ferramentas `listarOportunidades`, `montarProposta`, `enviarProposta`, `proximasEntregas`, `falaOportunidade` |
| `tests/agente.test.js` | Testes do modo regras com banco substituído por dublê (`mock.module`) | 5 casos |

Endpoints: `POST /auth/login` · `GET /produtores/:id/oportunidades` · `GET /chamadas/:id/audio` · `POST /propostas/mutirao` · `GET /propostas/:id` · `POST /propostas/:id/enviar` · `POST /propostas/:id/contratar` · `POST /propostas/:id/participantes/:idProdutor/confirmar` · `POST /agente/conversar` · `GET /produtores/:id/entregas` · `POST /entregas/:id/confirmar` · `GET /lembretes` · `GET /tecnicos/:id/painel` · `GET /tecnicos/:id/propostas` · `POST /tecnicos/:id/produtores` · `GET /catalogo`.

## 5. App mobile (`apps/mobile`)

### 5.1 Estrutura

| Caminho | Responsabilidade |
| --- | --- |
| `app/_layout.tsx` | Restaura sessão e roteia por perfil (`/login`, `/(produtor)`, `/(tecnico)`) |
| `app/login.tsx` | Login por telefone e senha |
| `app/(produtor)/index.tsx` | **F1** Oportunidades em voz (FlatList + botão Ouvir + Quero vender) |
| `app/(produtor)/falar.tsx` | **F2** Conversa com o agente: botão único de microfone, balões, atalhos de toque |
| `app/(produtor)/proposta/[id].tsx` | Detalhe da proposta/mutirão, confirmação do participante, linha do tempo |
| `app/(produtor)/entregas.tsx` | **F3** Entregas e pagamento (SectionList, resumo em voz, confirmar entrega) |
| `app/(tecnico)/index.tsx` | **F4** Painel: medidor da meta de 45%, carteira, região |
| `app/(tecnico)/produtores.tsx` | Mapa (react-native-maps) + lista com pendências de CAF |
| `app/(tecnico)/propostas.tsx` | Revisar/enviar rascunhos; contratar (simula a prefeitura) |
| `app/(tecnico)/novo-produtor.tsx` | Cadastro em campo com produção por produto |
| `src/services/api.ts` | Cliente HTTP com timeout 12 s, token do store, tipos TypeScript |
| `src/store/auth.ts` | Estado de sessão (zustand) persistido em AsyncStorage |
| `src/hooks/useVoz.ts` | `falar(texto)`, `ouvir()`, `parar()`, estados `ouvindo/falando/transcricao` |
| `src/hooks/useOffline.ts` | Cache stale-while-revalidate por chave com TTL |
| `src/components/ui.tsx` | `Titulo`, `Subtitulo`, `Corpo`, `Cartao`, `Botao`, `Etiqueta`, `Vazio`, `AvisoOffline` + formatadores `reais`, `data`, `unidade` |
| `src/theme.ts` | Tokens: cores, fontes grandes, alvo de toque 56 px |

### 5.2 Interface e experiência (público: produtor rural, 50+, baixa familiaridade digital)

- Tipografia grande (corpo 18 pt, títulos 28 pt), contraste alto, alvos de toque ≥ 56 px.
- Uma ação principal por tela, sempre na mesma cor. Microfone como botão central de 112 px.
- Tudo o que importa pode ser **ouvido**: resumo da chamada, resposta do agente, resumo das entregas, lembrete.
- Atalhos de toque ("Sim", "Agora não", "Minhas entregas") para quem não quer falar em público.
- Linguagem sem siglas ("cadastro de agricultor familiar", não "CAF"); valores por extenso no áudio.
- Rótulos de acessibilidade (`accessibilityLabel`, `accessibilityRole`) em todos os controles.
- Faixa "Sem sinal. Mostrando o último que foi salvo." quando a rede falha.

### 5.3 Gerenciamento de memória e eficiência

| Prática | Onde | Por quê |
| --- | --- | --- |
| Listas virtualizadas (`FlatList`, `SectionList`) com `initialNumToRender`, `windowSize` e `removeClippedSubviews` | F1, F3, produtores, propostas | Renderiza só o visível; listas de entregas chegam a dezenas de itens |
| `renderItem` e componentes de UI memoizados (`useCallback`, `React.memo`) | todas as telas de lista, `ui.tsx` | Evita re-render de cartões quando o estado do pai muda |
| Histórico da conversa limitado a 12 balões no app e 10 mensagens no servidor | `falar.tsx`, `agente.js` | Memória e tokens não crescem indefinidamente numa sessão longa |
| `Speech.stop()` e `abort()` do reconhecimento no unmount; listener único por montagem | `useVoz.ts` | Não deixa áudio tocando nem microfone aberto em tela fechada |
| Cache com TTL de 24 h e descarte do item expirado; flag `montado` evita `setState` após unmount | `useOffline.ts` | Armazenamento não cresce; sem vazamento por promessa tardia |
| `AbortController` com timeout de 12 s em toda requisição | `api.ts` | Em rede rural, uma requisição pendurada não segura memória nem a UI |
| Pool Oracle de 1 a 8 conexões; `withConn` sempre devolve a conexão (`finally`) | `db.js` | Sem leak de conexões, que é a falha mais comum com oracledb |
| Ref cursor fechado após `getRows(500)` | `routes.js` (`/lembretes`) | Cursor aberto no Oracle consome sessão |
| Dados derivados calculados uma vez com `useMemo` (totais, seções, região do mapa) | `entregas.tsx`, `produtores.tsx` | Evita recomputar em cada render |
| Imagens e mapas carregados sob demanda (mapa pode ser escondido) | `produtores.tsx` | O mapa é o componente mais pesado da tela |
| Telas do técnico só montam para o perfil técnico (rotas por grupo) | `_layout.tsx` | O bundle do produtor não carrega mapa nem formulários |

## 6. ODS

| ODS | Meta | Contribuição |
| --- | --- | --- |
| 2 Fome zero e agricultura sustentável | 2.3 (renda e acesso a mercados dos pequenos produtores); 2.1 (acesso a alimentos nutritivos) | Mercado institucional garantido por lei chega ao produtor; alimento fresco na merenda |
| 4 Educação de qualidade | 4.1 | Alimentação escolar adequada é condição de permanência e aprendizado |
| 10 Redução das desigualdades | 10.2 | Interface por voz inclui quem tem baixa familiaridade digital |
| 8 Trabalho decente | 8.3 | Técnico e embaixador remunerados por resultado; produtor formalizado via CAF |
| 12 Consumo responsável | 12.3 | Colheita com comprador garantido reduz perda no campo |

## 7. Validação e limites

- Pesquisa secundária: Lei 15.226/2025; adesão ao Contrata+Brasil (1.518 de 3,9 milhões, maio/2026); estudos UFFS, UFMS e Revista Grifos sobre entraves do PNAE.
- Validação primária: registrar aqui as conversas realizadas (técnico/cooperativa, nutricionista) e os testes de usabilidade por voz com 3 pessoas, com data, perfil e o que mudou no app.
- Limites: integração com o Contrata+Brasil simulada; pagamento, NF-e e WhatsApp no roadmap; amostra de validação pequena, feita por uma pessoa em quatro dias.

## 8. Roadmap

1. Integração oficial com o Contrata+Brasil (importar chamadas, enviar proposta).
2. Canal WhatsApp (mesmo agente, mesma API).
3. Planejamento de safra: cruzar `safra_meses` com o cardápio da nutricionista.
4. Job diário de lembretes (DBMS_SCHEDULER chamando `sp_gerar_lembretes`) com disparo de áudio.
5. Painel do CAE (Conselho de Alimentação Escolar) para fiscalização.
