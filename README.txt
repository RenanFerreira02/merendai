=====================================================================
MERENDAI - Da roca pra merenda
Global Solution 2 / 2026 - CitizenTech - FIAP - Sistemas de Informacao
Autor: Renan Ferreira (turma 3SIOA)
=====================================================================

1. O QUE E
---------------------------------------------------------------------
Desde 2026, a Lei 15.226/2025 exige que ao menos 45% do dinheiro federal da
merenda escolar (PNAE) seja gasto com compras diretas da agricultura familiar.
O governo criou o Contrata+Brasil para conectar escolas e produtores, mas em
maio/2026 so 1.518 agricultores estavam cadastrados, de 3,9 milhoes aptos.

O Merendai e um app voice-first que leva o pequeno agricultor da chamada
publica ate o pagamento, com tres camadas:
  1. Tecnico de campo (extensao rural, cooperativa) cadastra e acompanha;
  2. Agente de IA por audio le a chamada em linguagem simples, monta a proposta
     conversando e, se faltar volume, junta vizinhos (mutirao);
  3. Produtor embaixador indica vizinhos e ganha bonus por indicacao convertida.

ODS: 2 (central), 4, 10, 8 e 12. Detalhes em docs/DOCUMENTACAO_TECNICA.md.

2. ESTRUTURA DO REPOSITORIO
---------------------------------------------------------------------
  README.txt                      este arquivo
  database/
    docker-compose.yml            Oracle XE 21c com os scripts abaixo auto-executados
    ddl/01_schema.sql             17 tabelas, constraints, indices (DDL)
    plsql/02_pkg_merendai.sql     package: matching, mutirao, envio, contratacao,
                                  lembretes, confirmacao de entrega, indicadores
    plsql/03_triggers.sql         maquina de estados + auditoria append-only + views
    seed/04_seed.sql              dados de demonstracao (sudoeste paulista)
    tests/05_teste_cenario.sql    teste ponta a ponta com asserts
  services/api/                   API Node.js (Express + oracledb) + agente de voz
  apps/mobile/                    app React Native (Expo + expo-router + TypeScript)
  docs/
    DOCUMENTACAO_TECNICA.md       arquitetura, funcoes/classes, memoria e eficiencia
    diagramas/DER.mmd|png|svg     DER (Mermaid) e MER descrito na documentacao
    evidencias/                   saidas de testes

3. COMO EXECUTAR
---------------------------------------------------------------------
Pre-requisitos: Docker, Node 20+, npm, Expo Go no celular (ou emulador Android).

3.1 Banco de dados (Oracle XE em Docker)
  cd database
  docker compose up -d
  # aguarde ~2 min na primeira subida; os scripts 01..04 rodam sozinhos
  # usuario: merendai / senha: merendai / servico: localhost:1521/XEPDB1

  Para rodar o teste de cenario (SQL*Plus ou SQLcl dentro do container):
  docker exec -i merendai-oracle sqlplus merendai/merendai@XEPDB1 < tests/05_teste_cenario.sql
  Esperado: linhas "[OK] ..." e "=== Todos os testes passaram ===".

  Alternativa sem Docker: execute os 4 scripts em ordem num Oracle 19c/21c
  (inclusive o Oracle da FIAP) com um usuario que tenha CREATE TABLE/PROCEDURE/VIEW/TRIGGER.

3.2 API
  cd services/api
  cp .env.example .env            # ajuste ORACLE_CONNECT se necessario
  npm install
  npm run dev                     # http://localhost:3333/health
  npm test                        # testes do agente (sem banco)

  ANTHROPIC_API_KEY e opcional. Sem ela, o agente roda em "modo regras",
  que cobre todo o fluxo da demo. Com ela, usa Claude com tool use.

3.3 App mobile
  cd apps/mobile
  npm install
  npx expo start
  # Android emulador: a API ja aponta para http://10.0.2.2:3333/api
  # Celular fisico: edite "extra.apiUrl" em app.json para o IP da sua maquina

  Logins de demonstracao (senha: merendai123)
    Produtora (embaixadora)  telefone 15992000001  (Marta)
    Produtor                 telefone 15992000002  (Joao)
    Tecnico                  telefone 15991000001  (Carlos, Casa de Agricultura)

3.4 Roteiro da demo (5 minutos)
  1. Entrar como Marta. Aba "Oportunidades": tocar "Ouvir" na mandioca.
  2. Tocar "Quero vender": o agente oferece, diga "sim".
     -> sp_montar_mutirao junta Joao e Rita (cobertura 100%).
  3. Diga "sim" de novo -> sp_enviar_proposta. Tocar "Ver a proposta".
  4. Entrar como Carlos. Aba "Propostas": "Contratar" e escolher a escola.
     -> sp_contratar_proposta agenda 63 entregas + 63 pagamentos.
  5. Voltar como Marta. Aba "Entregas": "Ouvir resumo", confirmar uma entrega.
  6. Como Carlos, aba "Painel": o % da meta de 45% de Itapeva subiu.

4. FUNCIONALIDADES PRINCIPAIS (3 + 1 de apoio)
---------------------------------------------------------------------
  F1 Oportunidades em voz      chamadas compativeis com o que o produtor planta,
                               lidas em audio (fn_resumo_chamada_audio)
  F2 Proposta por conversa     agente monta o projeto de venda por voz; mutirao
     e mutirao                 automatico quando falta volume (sp_montar_mutirao)
  F3 Entregas e pagamento      agenda, lembrete por voz, confirmacao, situacao do
                               pagamento (sp_contratar_proposta, sp_gerar_lembretes,
                               sp_confirmar_entrega)
  F4 Painel do tecnico (apoio) cadastro, mapa, indicador da meta de 45%
                               (vw_indicadores_municipio, vw_painel_tecnico)
  Login e cadastro existem, mas nao sao contados como funcionalidades.

5. JUSTIFICATIVAS TECNICAS (resumo)
---------------------------------------------------------------------
  React Native + Expo   exigencia da GS; uma base Android/iOS; Expo Go dispensa
                        build nativo para a demo; expo-router da navegacao por perfil.
  Voz no dispositivo    expo-speech (TTS) e expo-speech-recognition (STT) rodam no
                        celular: zero custo, baixa latencia e funcionam com pouca banda.
  Oracle + PL/SQL       exigencia da GS. A regra de negocio (matching, mutirao, limite
                        anual, maquina de estados, auditoria) mora no banco, entao vale
                        para qualquer cliente (app, API, futura integracao governamental).
  API fina em Node      so autentica, valida (zod) e chama as procedures; facil de
                        trocar sem tocar nas regras.
  Agente com 2 modos    LLM com tool use quando ha chave; regras quando nao ha.
                        A demo nunca depende de servico externo.
  Offline-first         cache com TTL por tela (AsyncStorage); fila de audio sincroniza
                        ao reconectar. Conectividade rural nao e garantida.

6. LIMITES DECLARADOS
---------------------------------------------------------------------
  - Integracao com o Contrata+Brasil e simulada (chamadas no seed baseadas em
    editais reais). Nao ha API publica conhecida; o modelo ja esta preparado.
  - Pagamento, nota fiscal e canal WhatsApp estao no roadmap.
  - Validacao com usuarios: amostra pequena (ver docs/DOCUMENTACAO_TECNICA.md).
  - O teste de cenario faz ROLLBACK ao final, mas as linhas de HISTORICO_STATUS
    permanecem por serem gravadas em transacao autonoma (auditoria append-only).

7. LINKS DOS ENTREGAVEIS
---------------------------------------------------------------------
  Video pitch de venda (3 min):  ver LINK_VIDEO_PITCH.txt
  Video pitch tecnico (5 min):   ver LINK_VIDEO_TECNICO.txt
  Repositorio GitHub:            ver LINK_GITHUB.txt
