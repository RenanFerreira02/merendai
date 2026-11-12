-- =============================================================================
-- MERENDAI - Schema Oracle (DDL)
-- Global Solution 2 - 2026 - FIAP - Sistemas de Informacao
--
-- Convencoes:
--   * Nomes em portugues, singular, sem acento.
--   * PK = ID_<tabela> NUMBER gerado por IDENTITY.
--   * Toda tabela de negocio tem DT_CRIACAO.
--   * Status sao CHECK constraints (closed set), nao tabelas de dominio,
--     para manter o DER legivel. A maquina de estados e protegida por trigger.
--   * Geolocalizacao em latitude/longitude NUMBER(9,6). Distancia e calculada
--     em PL/SQL (Haversine) para nao depender do Oracle Spatial no XE.
-- =============================================================================

-- Ordem de drop (filhos antes dos pais) para reexecucao em dev
BEGIN
  FOR t IN (
    SELECT table_name FROM user_tables
     WHERE table_name IN (
       'HISTORICO_STATUS','INDICACAO','PAGAMENTO','ENTREGA','ITEM_PROPOSTA',
       'PARTICIPANTE_MUTIRAO','PROPOSTA','PROSPECT','ITEM_CHAMADA','CHAMADA',
       'ESCOLA','PRODUCAO','PRODUTOR','PRODUTO','TECNICO','MUNICIPIO','USUARIO')
  ) LOOP
    EXECUTE IMMEDIATE 'DROP TABLE ' || t.table_name || ' CASCADE CONSTRAINTS PURGE';
  END LOOP;
END;
/

-- -----------------------------------------------------------------------------
-- MUNICIPIO: entidade executora do PNAE (quem publica a chamada)
-- -----------------------------------------------------------------------------
CREATE TABLE municipio (
  id_municipio       NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome               VARCHAR2(120) NOT NULL,
  uf                 CHAR(2)       NOT NULL,
  codigo_ibge        VARCHAR2(7)   UNIQUE,
  latitude           NUMBER(9,6)   NOT NULL,
  longitude          NUMBER(9,6)   NOT NULL,
  -- recurso FNDE repassado no ano e quanto ja foi comprado da agricultura familiar
  vl_repasse_fnde    NUMBER(14,2)  DEFAULT 0 NOT NULL,
  vl_compra_af       NUMBER(14,2)  DEFAULT 0 NOT NULL,
  dt_criacao         TIMESTAMP     DEFAULT SYSTIMESTAMP NOT NULL
);
COMMENT ON TABLE municipio IS 'Entidade executora do PNAE. Guarda repasse FNDE e compras da agricultura familiar para calcular a meta de 45%.';

-- -----------------------------------------------------------------------------
-- USUARIO: autenticacao e perfil (produtor, tecnico, gestor)
-- -----------------------------------------------------------------------------
CREATE TABLE usuario (
  id_usuario   NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome         VARCHAR2(120) NOT NULL,
  telefone     VARCHAR2(20)  NOT NULL UNIQUE,
  email        VARCHAR2(150),
  senha_hash   VARCHAR2(255) NOT NULL,
  perfil       VARCHAR2(10)  NOT NULL
               CHECK (perfil IN ('PRODUTOR','TECNICO','GESTOR')),
  ativo        CHAR(1)       DEFAULT 'S' NOT NULL CHECK (ativo IN ('S','N')),
  dt_criacao   TIMESTAMP     DEFAULT SYSTIMESTAMP NOT NULL
);

-- -----------------------------------------------------------------------------
-- TECNICO: camada humana 1 (extensao rural, cooperativa, sindicato)
-- -----------------------------------------------------------------------------
CREATE TABLE tecnico (
  id_tecnico     NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_usuario     NUMBER NOT NULL UNIQUE REFERENCES usuario(id_usuario),
  id_municipio   NUMBER NOT NULL REFERENCES municipio(id_municipio),
  organizacao    VARCHAR2(120) NOT NULL,   -- ex.: Casa de Agricultura de Itapeva
  tipo_org       VARCHAR2(15)  NOT NULL
                 CHECK (tipo_org IN ('EXTENSAO','COOPERATIVA','SINDICATO','ONG','OUTRO')),
  dt_criacao     TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL
);

-- -----------------------------------------------------------------------------
-- PRODUTOR: agricultor familiar (precisa de CAF para vender ao PNAE)
-- -----------------------------------------------------------------------------
CREATE TABLE produtor (
  id_produtor       NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_usuario        NUMBER NOT NULL UNIQUE REFERENCES usuario(id_usuario),
  id_municipio      NUMBER NOT NULL REFERENCES municipio(id_municipio),
  id_tecnico        NUMBER REFERENCES tecnico(id_tecnico),       -- quem cadastrou/acompanha
  numero_caf        VARCHAR2(20) UNIQUE,                         -- Cadastro Nacional da Agricultura Familiar
  caf_valido_ate    DATE,
  latitude          NUMBER(9,6) NOT NULL,
  longitude         NUMBER(9,6) NOT NULL,
  raio_entrega_km   NUMBER(5,1) DEFAULT 30 NOT NULL,
  embaixador        CHAR(1) DEFAULT 'N' NOT NULL CHECK (embaixador IN ('S','N')),
  -- limite legal de venda por DAP/CAF por ano por entidade executora (R$ 40 mil na Res. FNDE)
  vl_limite_anual   NUMBER(12,2) DEFAULT 40000 NOT NULL,
  prefere_audio     CHAR(1) DEFAULT 'S' NOT NULL CHECK (prefere_audio IN ('S','N')),
  dt_criacao        TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL
);
CREATE INDEX ix_produtor_municipio ON produtor(id_municipio);
CREATE INDEX ix_produtor_tecnico   ON produtor(id_tecnico);

-- -----------------------------------------------------------------------------
-- PRODUTO: catalogo de generos alimenticios (mandioca, alface, banana...)
-- -----------------------------------------------------------------------------
CREATE TABLE produto (
  id_produto   NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome         VARCHAR2(80) NOT NULL UNIQUE,
  unidade      VARCHAR2(5)  NOT NULL CHECK (unidade IN ('KG','UN','MACO','DZ','L')),
  categoria    VARCHAR2(20) NOT NULL
               CHECK (categoria IN ('HORTALICA','FRUTA','RAIZ','GRAO','PROCESSADO','ANIMAL','OUTRO')),
  -- meses de safra como string de 12 posicoes 'S'/'N' (jan..dez). Ex.: 'SSSNNNNNNSSS'
  safra_meses  CHAR(12) DEFAULT 'SSSSSSSSSSSS' NOT NULL
);

-- -----------------------------------------------------------------------------
-- PRODUCAO: o que cada produtor planta e quanto consegue entregar por semana
-- -----------------------------------------------------------------------------
CREATE TABLE producao (
  id_producao        NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_produtor        NUMBER NOT NULL REFERENCES produtor(id_produtor),
  id_produto         NUMBER NOT NULL REFERENCES produto(id_produto),
  qtd_semanal        NUMBER(10,2) NOT NULL CHECK (qtd_semanal > 0),
  organico           CHAR(1) DEFAULT 'N' NOT NULL CHECK (organico IN ('S','N')),
  dt_criacao         TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
  CONSTRAINT uk_producao UNIQUE (id_produtor, id_produto)
);

-- -----------------------------------------------------------------------------
-- ESCOLA: unidade que recebe os alimentos
-- -----------------------------------------------------------------------------
CREATE TABLE escola (
  id_escola      NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_municipio   NUMBER NOT NULL REFERENCES municipio(id_municipio),
  nome           VARCHAR2(150) NOT NULL,
  codigo_inep    VARCHAR2(8) UNIQUE,
  qtd_alunos     NUMBER(6) NOT NULL,
  latitude       NUMBER(9,6) NOT NULL,
  longitude      NUMBER(9,6) NOT NULL,
  dt_criacao     TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL
);

-- -----------------------------------------------------------------------------
-- CHAMADA: chamada publica do PNAE (edital de compra da agricultura familiar)
-- -----------------------------------------------------------------------------
CREATE TABLE chamada (
  id_chamada        NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_municipio      NUMBER NOT NULL REFERENCES municipio(id_municipio),
  numero_edital     VARCHAR2(30) NOT NULL,
  titulo            VARCHAR2(200) NOT NULL,
  -- resumo em linguagem simples gerado para o agente ler em audio
  resumo_simples    VARCHAR2(1000),
  dt_publicacao     DATE NOT NULL,
  dt_limite         DATE NOT NULL,
  dt_inicio_entrega DATE NOT NULL,
  dt_fim_entrega    DATE NOT NULL,
  status            VARCHAR2(12) DEFAULT 'ABERTA' NOT NULL
                    CHECK (status IN ('ABERTA','ENCERRADA','HOMOLOGADA','CANCELADA')),
  origem            VARCHAR2(20) DEFAULT 'CONTRATA_BRASIL' NOT NULL,
  dt_criacao        TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
  CONSTRAINT ck_chamada_datas CHECK (dt_limite >= dt_publicacao AND dt_fim_entrega >= dt_inicio_entrega),
  CONSTRAINT uk_chamada UNIQUE (id_municipio, numero_edital)
);
CREATE INDEX ix_chamada_status ON chamada(status, dt_limite);

-- -----------------------------------------------------------------------------
-- ITEM_CHAMADA: cada produto pedido na chamada, com quantidade e preco de referencia
-- -----------------------------------------------------------------------------
CREATE TABLE item_chamada (
  id_item_chamada    NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_chamada         NUMBER NOT NULL REFERENCES chamada(id_chamada),
  id_produto         NUMBER NOT NULL REFERENCES produto(id_produto),
  qtd_total          NUMBER(12,2) NOT NULL CHECK (qtd_total > 0),
  -- periodicidade de entrega esperada
  periodicidade      VARCHAR2(10) DEFAULT 'SEMANAL' NOT NULL
                     CHECK (periodicidade IN ('SEMANAL','QUINZENAL','MENSAL')),
  vl_unitario_ref    NUMBER(10,2) NOT NULL CHECK (vl_unitario_ref > 0),
  qtd_atendida       NUMBER(12,2) DEFAULT 0 NOT NULL,
  CONSTRAINT uk_item_chamada UNIQUE (id_chamada, id_produto)
);

-- -----------------------------------------------------------------------------
-- PROSPECT: resultado do matching (gerado por PL/SQL). "Esta chamada serve
-- para este produtor". E o que o tecnico ve no painel e o que o agente le em audio.
-- -----------------------------------------------------------------------------
CREATE TABLE prospect (
  id_prospect        NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_item_chamada    NUMBER NOT NULL REFERENCES item_chamada(id_item_chamada),
  id_produtor        NUMBER NOT NULL REFERENCES produtor(id_produtor),
  distancia_km       NUMBER(7,2) NOT NULL,
  -- quanto do item o produtor cobre sozinho (0..1)
  cobertura          NUMBER(5,4) NOT NULL,
  score              NUMBER(6,2) NOT NULL,       -- ordenacao: cobertura, distancia, organico
  status             VARCHAR2(12) DEFAULT 'NOVO' NOT NULL
                     CHECK (status IN ('NOVO','NOTIFICADO','ACEITO','RECUSADO','EXPIRADO')),
  dt_criacao         TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
  CONSTRAINT uk_prospect UNIQUE (id_item_chamada, id_produtor)
);
CREATE INDEX ix_prospect_produtor ON prospect(id_produtor, status);

-- -----------------------------------------------------------------------------
-- PROPOSTA: projeto de venda. Pode ser individual ou mutirao (grupo informal).
-- -----------------------------------------------------------------------------
CREATE TABLE proposta (
  id_proposta        NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_chamada         NUMBER NOT NULL REFERENCES chamada(id_chamada),
  id_produtor_lider  NUMBER NOT NULL REFERENCES produtor(id_produtor),
  id_tecnico_revisor NUMBER REFERENCES tecnico(id_tecnico),
  tipo               VARCHAR2(10) DEFAULT 'INDIVIDUAL' NOT NULL
                     CHECK (tipo IN ('INDIVIDUAL','MUTIRAO')),
  status             VARCHAR2(12) DEFAULT 'RASCUNHO' NOT NULL
                     CHECK (status IN ('RASCUNHO','ENVIADA','CONTRATADA','RECUSADA','CANCELADA')),
  vl_total           NUMBER(14,2) DEFAULT 0 NOT NULL,
  -- transcricao da conversa com o agente que gerou a proposta (auditoria)
  transcricao        CLOB,
  dt_envio           TIMESTAMP,
  dt_criacao         TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL
);
CREATE INDEX ix_proposta_chamada ON proposta(id_chamada, status);
CREATE INDEX ix_proposta_lider   ON proposta(id_produtor_lider);

-- -----------------------------------------------------------------------------
-- PARTICIPANTE_MUTIRAO: produtores que compoem uma proposta tipo MUTIRAO
-- -----------------------------------------------------------------------------
CREATE TABLE participante_mutirao (
  id_proposta   NUMBER NOT NULL REFERENCES proposta(id_proposta),
  id_produtor   NUMBER NOT NULL REFERENCES produtor(id_produtor),
  confirmado    CHAR(1) DEFAULT 'N' NOT NULL CHECK (confirmado IN ('S','N')),
  dt_criacao    TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
  CONSTRAINT pk_participante PRIMARY KEY (id_proposta, id_produtor)
);

-- -----------------------------------------------------------------------------
-- ITEM_PROPOSTA: o que cada produtor da proposta vai entregar de cada item
-- -----------------------------------------------------------------------------
CREATE TABLE item_proposta (
  id_item_proposta   NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_proposta        NUMBER NOT NULL REFERENCES proposta(id_proposta),
  id_item_chamada    NUMBER NOT NULL REFERENCES item_chamada(id_item_chamada),
  id_produtor        NUMBER NOT NULL REFERENCES produtor(id_produtor),
  qtd_ofertada       NUMBER(12,2) NOT NULL CHECK (qtd_ofertada > 0),
  vl_unitario        NUMBER(10,2) NOT NULL CHECK (vl_unitario > 0),
  CONSTRAINT uk_item_proposta UNIQUE (id_proposta, id_item_chamada, id_produtor)
);

-- -----------------------------------------------------------------------------
-- ENTREGA: cada entrega agendada de um item da proposta numa escola
-- -----------------------------------------------------------------------------
CREATE TABLE entrega (
  id_entrega         NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_item_proposta   NUMBER NOT NULL REFERENCES item_proposta(id_item_proposta),
  id_escola          NUMBER NOT NULL REFERENCES escola(id_escola),
  dt_prevista        DATE NOT NULL,
  dt_realizada       DATE,
  qtd_prevista       NUMBER(12,2) NOT NULL CHECK (qtd_prevista > 0),
  qtd_entregue       NUMBER(12,2),
  status             VARCHAR2(12) DEFAULT 'AGENDADA' NOT NULL
                     CHECK (status IN ('AGENDADA','LEMBRADA','ENTREGUE','PARCIAL','FALTOU','CANCELADA')),
  observacao         VARCHAR2(500),
  dt_criacao         TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL
);
CREATE INDEX ix_entrega_prevista ON entrega(status, dt_prevista);

-- -----------------------------------------------------------------------------
-- PAGAMENTO: pagamento de uma entrega ao produtor
-- -----------------------------------------------------------------------------
CREATE TABLE pagamento (
  id_pagamento   NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_entrega     NUMBER NOT NULL UNIQUE REFERENCES entrega(id_entrega),
  vl_bruto       NUMBER(12,2) NOT NULL,
  status         VARCHAR2(10) DEFAULT 'PREVISTO' NOT NULL
                 CHECK (status IN ('PREVISTO','PAGO','ATRASADO','CANCELADO')),
  dt_prevista    DATE NOT NULL,
  dt_pagamento   DATE,
  dt_criacao     TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL
);

-- -----------------------------------------------------------------------------
-- INDICACAO: camada humana 3 (embaixador indica vizinho)
-- -----------------------------------------------------------------------------
CREATE TABLE indicacao (
  id_indicacao          NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_produtor_embaixador NUMBER NOT NULL REFERENCES produtor(id_produtor),
  id_produtor_indicado   NUMBER NOT NULL UNIQUE REFERENCES produtor(id_produtor),
  status                 VARCHAR2(12) DEFAULT 'PENDENTE' NOT NULL
                         CHECK (status IN ('PENDENTE','CADASTRADO','CONVERTIDO')),
  -- CONVERTIDO = indicado fechou a primeira venda (dispara bonus)
  dt_conversao           DATE,
  dt_criacao             TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL
);

-- -----------------------------------------------------------------------------
-- HISTORICO_STATUS: auditoria append-only de mudancas de status (via trigger)
-- -----------------------------------------------------------------------------
CREATE TABLE historico_status (
  id_historico   NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entidade       VARCHAR2(20) NOT NULL,    -- PROPOSTA, ENTREGA, PROSPECT, PAGAMENTO, INDICACAO
  id_registro    NUMBER NOT NULL,
  status_de      VARCHAR2(12),
  status_para    VARCHAR2(12) NOT NULL,
  usuario_bd     VARCHAR2(60) DEFAULT USER NOT NULL,
  dt_evento      TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL
);
CREATE INDEX ix_historico ON historico_status(entidade, id_registro, dt_evento);

COMMIT;
