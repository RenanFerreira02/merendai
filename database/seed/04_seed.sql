-- =============================================================================
-- MERENDAI - Seed de demonstracao
-- Regiao: sudoeste paulista (Itapeva, Itabera, Taquarivai, Ribeirao Branco),
-- uma das regioes com maior presenca de agricultura familiar do estado.
-- Valores de repasse sao ilustrativos; precos de referencia seguem a faixa
-- comum em chamadas publicas do PNAE no interior de SP.
-- Senha de todos os usuarios de demo: "merendai123" (hash bcrypt fixo abaixo).
-- =============================================================================
SET DEFINE OFF;

-- ---------------- MUNICIPIOS ----------------
INSERT INTO municipio (nome, uf, codigo_ibge, latitude, longitude, vl_repasse_fnde, vl_compra_af)
VALUES ('Itapeva',        'SP', '3522307', -23.9822, -48.8756, 1850000, 410000);   -- 22% AF
INSERT INTO municipio (nome, uf, codigo_ibge, latitude, longitude, vl_repasse_fnde, vl_compra_af)
VALUES ('Itabera',        'SP', '3521804', -23.8617, -49.1372,  420000, 150000);   -- 36% AF
INSERT INTO municipio (nome, uf, codigo_ibge, latitude, longitude, vl_repasse_fnde, vl_compra_af)
VALUES ('Taquarivai',     'SP', '3553658', -23.9203, -48.6947,  160000,  80000);   -- 50% AF (ja cumpre)

-- ---------------- PRODUTOS (safra: jan..dez) ----------------
INSERT INTO produto (nome, unidade, categoria, safra_meses) VALUES ('Mandioca',        'KG',   'RAIZ',      'SSSSSSSSSSSS');
INSERT INTO produto (nome, unidade, categoria, safra_meses) VALUES ('Alface',          'UN',   'HORTALICA', 'SSSSSSSSSSSS');
INSERT INTO produto (nome, unidade, categoria, safra_meses) VALUES ('Banana nanica',   'KG',   'FRUTA',     'SSSSSSSSSSSS');
INSERT INTO produto (nome, unidade, categoria, safra_meses) VALUES ('Feijao carioca',  'KG',   'GRAO',      'NNNSSSSNNNNN');
INSERT INTO produto (nome, unidade, categoria, safra_meses) VALUES ('Couve',           'MACO', 'HORTALICA', 'SSSSSSSSSSSS');
INSERT INTO produto (nome, unidade, categoria, safra_meses) VALUES ('Tomate',          'KG',   'HORTALICA', 'SSSNNNNNSSSS');
INSERT INTO produto (nome, unidade, categoria, safra_meses) VALUES ('Ovos caipira',    'DZ',   'ANIMAL',    'SSSSSSSSSSSS');
INSERT INTO produto (nome, unidade, categoria, safra_meses) VALUES ('Abobora cabotia', 'KG',   'HORTALICA', 'SSSSNNNNNSSS');
INSERT INTO produto (nome, unidade, categoria, safra_meses) VALUES ('Laranja',         'KG',   'FRUTA',     'NNNNSSSSSSNN');
INSERT INTO produto (nome, unidade, categoria, safra_meses) VALUES ('Batata doce',     'KG',   'RAIZ',      'SSSSSSSSSSSS');

-- ---------------- USUARIOS ----------------
-- hash bcrypt de "merendai123"
DECLARE
  h CONSTANT VARCHAR2(60) := '$2a$10$7EqJtq98hPqEX7fNZaFWoOhi5P1Yl9hW0d3GZhZ9Wn8bq1JcZ6xCe';
BEGIN
  -- tecnicos
  INSERT INTO usuario (nome, telefone, email, senha_hash, perfil) VALUES ('Carlos Mendes',      '15991000001', 'carlos@casadaagricultura.sp.gov.br', h, 'TECNICO');
  INSERT INTO usuario (nome, telefone, email, senha_hash, perfil) VALUES ('Ana Paula Ribeiro',  '15991000002', 'ana@coopsudoeste.coop.br',           h, 'TECNICO');
  -- gestor (nutricionista)
  INSERT INTO usuario (nome, telefone, email, senha_hash, perfil) VALUES ('Fernanda Souza',     '15991000003', 'nutricao@itapeva.sp.gov.br',         h, 'GESTOR');
  -- produtores
  INSERT INTO usuario (nome, telefone, senha_hash, perfil) VALUES ('Marta de Oliveira',     '15992000001', h, 'PRODUTOR');
  INSERT INTO usuario (nome, telefone, senha_hash, perfil) VALUES ('Joao Batista da Silva', '15992000002', h, 'PRODUTOR');
  INSERT INTO usuario (nome, telefone, senha_hash, perfil) VALUES ('Rita Aparecida Lima',   '15992000003', h, 'PRODUTOR');
  INSERT INTO usuario (nome, telefone, senha_hash, perfil) VALUES ('Antonio Carlos Pereira','15992000004', h, 'PRODUTOR');
  INSERT INTO usuario (nome, telefone, senha_hash, perfil) VALUES ('Sebastiana Rocha',      '15992000005', h, 'PRODUTOR');
  INSERT INTO usuario (nome, telefone, senha_hash, perfil) VALUES ('Jose Ferreira Neto',    '15992000006', h, 'PRODUTOR');
  INSERT INTO usuario (nome, telefone, senha_hash, perfil) VALUES ('Luzia Martins',         '15992000007', h, 'PRODUTOR');
  INSERT INTO usuario (nome, telefone, senha_hash, perfil) VALUES ('Benedito Alves',        '15992000008', h, 'PRODUTOR');
  INSERT INTO usuario (nome, telefone, senha_hash, perfil) VALUES ('Claudia Nascimento',    '15992000009', h, 'PRODUTOR');
  INSERT INTO usuario (nome, telefone, senha_hash, perfil) VALUES ('Pedro Henrique Costa',  '15992000010', h, 'PRODUTOR');
END;
/

-- ---------------- TECNICOS ----------------
INSERT INTO tecnico (id_usuario, id_municipio, organizacao, tipo_org)
SELECT id_usuario, 1, 'Casa de Agricultura de Itapeva', 'EXTENSAO' FROM usuario WHERE telefone = '15991000001';
INSERT INTO tecnico (id_usuario, id_municipio, organizacao, tipo_org)
SELECT id_usuario, 2, 'Cooperativa Sudoeste Paulista', 'COOPERATIVA' FROM usuario WHERE telefone = '15991000002';

-- ---------------- PRODUTORES (coordenadas em torno de Itapeva) ----------------
-- Marta: lider da demo, ja vendeu antes -> embaixadora
INSERT INTO produtor (id_usuario, id_municipio, id_tecnico, numero_caf, caf_valido_ate, latitude, longitude, raio_entrega_km, embaixador)
SELECT id_usuario, 1, 1, 'SP2301001', DATE '2027-06-30', -24.0210, -48.9120, 40, 'N' FROM usuario WHERE telefone = '15992000001';
INSERT INTO produtor (id_usuario, id_municipio, id_tecnico, numero_caf, caf_valido_ate, latitude, longitude, raio_entrega_km)
SELECT id_usuario, 1, 1, 'SP2301002', DATE '2027-03-15', -24.0350, -48.9050, 35 FROM usuario WHERE telefone = '15992000002';
INSERT INTO produtor (id_usuario, id_municipio, id_tecnico, numero_caf, caf_valido_ate, latitude, longitude, raio_entrega_km)
SELECT id_usuario, 1, 1, 'SP2301003', DATE '2026-12-31', -24.0120, -48.9300, 30 FROM usuario WHERE telefone = '15992000003';
INSERT INTO produtor (id_usuario, id_municipio, id_tecnico, numero_caf, caf_valido_ate, latitude, longitude, raio_entrega_km)
SELECT id_usuario, 1, 1, 'SP2301004', DATE '2027-09-01', -23.9500, -48.8200, 50 FROM usuario WHERE telefone = '15992000004';
INSERT INTO produtor (id_usuario, id_municipio, id_tecnico, numero_caf, caf_valido_ate, latitude, longitude, raio_entrega_km)
SELECT id_usuario, 1, 1, 'SP2301005', DATE '2027-01-20', -24.0600, -48.8600, 30 FROM usuario WHERE telefone = '15992000005';
-- Jose: CAF vencido (aparece no painel como pendencia)
INSERT INTO produtor (id_usuario, id_municipio, id_tecnico, numero_caf, caf_valido_ate, latitude, longitude, raio_entrega_km)
SELECT id_usuario, 1, 1, 'SP2301006', DATE '2026-08-01', -23.9900, -48.9500, 40 FROM usuario WHERE telefone = '15992000006';
-- Luzia: sem CAF (cadastro pendente, nao entra no matching)
INSERT INTO produtor (id_usuario, id_municipio, id_tecnico, latitude, longitude, raio_entrega_km)
SELECT id_usuario, 1, 1, -24.0000, -48.8900, 30 FROM usuario WHERE telefone = '15992000007';
-- Itabera (tecnica Ana)
INSERT INTO produtor (id_usuario, id_municipio, id_tecnico, numero_caf, caf_valido_ate, latitude, longitude, raio_entrega_km)
SELECT id_usuario, 2, 2, 'SP2302001', DATE '2027-05-10', -23.8700, -49.1500, 40 FROM usuario WHERE telefone = '15992000008';
INSERT INTO produtor (id_usuario, id_municipio, id_tecnico, numero_caf, caf_valido_ate, latitude, longitude, raio_entrega_km)
SELECT id_usuario, 2, 2, 'SP2302002', DATE '2027-02-28', -23.8400, -49.1200, 60 FROM usuario WHERE telefone = '15992000009';
-- Pedro: longe (fora do raio para Itapeva), entra so em Itabera
INSERT INTO produtor (id_usuario, id_municipio, id_tecnico, numero_caf, caf_valido_ate, latitude, longitude, raio_entrega_km)
SELECT id_usuario, 2, 2, 'SP2302003', DATE '2027-11-30', -23.7800, -49.2000, 25 FROM usuario WHERE telefone = '15992000010';

-- ---------------- PRODUCAO (qtd por semana) ----------------
-- ids de produto: 1 Mandioca, 2 Alface, 3 Banana, 4 Feijao, 5 Couve, 6 Tomate, 7 Ovos, 8 Abobora, 9 Laranja, 10 Batata doce
INSERT INTO producao (id_produtor, id_produto, qtd_semanal, organico) VALUES (1, 1,  40, 'N');  -- Marta: mandioca 40 kg/sem
INSERT INTO producao (id_produtor, id_produto, qtd_semanal, organico) VALUES (1, 2, 120, 'S');  -- Marta: alface 120 un/sem organica
INSERT INTO producao (id_produtor, id_produto, qtd_semanal, organico) VALUES (1, 5,  60, 'S');  -- Marta: couve
INSERT INTO producao (id_produtor, id_produto, qtd_semanal, organico) VALUES (2, 1,  60, 'N');  -- Joao: mandioca
INSERT INTO producao (id_produtor, id_produto, qtd_semanal, organico) VALUES (2, 10, 50, 'N');  -- Joao: batata doce
INSERT INTO producao (id_produtor, id_produto, qtd_semanal, organico) VALUES (3, 1,  30, 'N');  -- Rita: mandioca
INSERT INTO producao (id_produtor, id_produto, qtd_semanal, organico) VALUES (3, 3,  80, 'N');  -- Rita: banana
INSERT INTO producao (id_produtor, id_produto, qtd_semanal, organico) VALUES (4, 4, 100, 'N');  -- Antonio: feijao
INSERT INTO producao (id_produtor, id_produto, qtd_semanal, organico) VALUES (4, 8,  70, 'N');  -- Antonio: abobora
INSERT INTO producao (id_produtor, id_produto, qtd_semanal, organico) VALUES (5, 7,  40, 'N');  -- Sebastiana: ovos
INSERT INTO producao (id_produtor, id_produto, qtd_semanal, organico) VALUES (5, 2,  90, 'N');  -- Sebastiana: alface
INSERT INTO producao (id_produtor, id_produto, qtd_semanal, organico) VALUES (6, 1,  50, 'N');  -- Jose (CAF vencido): mandioca
INSERT INTO producao (id_produtor, id_produto, qtd_semanal, organico) VALUES (7, 5,  40, 'N');  -- Luzia (sem CAF): couve
INSERT INTO producao (id_produtor, id_produto, qtd_semanal, organico) VALUES (8, 6,  90, 'N');  -- Benedito: tomate
INSERT INTO producao (id_produtor, id_produto, qtd_semanal, organico) VALUES (8, 9, 150, 'N');  -- Benedito: laranja
INSERT INTO producao (id_produtor, id_produto, qtd_semanal, organico) VALUES (9, 2, 200, 'N');  -- Claudia: alface
INSERT INTO producao (id_produtor, id_produto, qtd_semanal, organico) VALUES (10, 3, 100, 'N'); -- Pedro: banana

-- ---------------- ESCOLAS ----------------
INSERT INTO escola (id_municipio, nome, codigo_inep, qtd_alunos, latitude, longitude) VALUES (1, 'EMEF Prof. Jose Olavo Pires',    '35123401', 620, -23.9790, -48.8790);
INSERT INTO escola (id_municipio, nome, codigo_inep, qtd_alunos, latitude, longitude) VALUES (1, 'EMEI Vila Aparecida',            '35123402', 240, -23.9900, -48.8700);
INSERT INTO escola (id_municipio, nome, codigo_inep, qtd_alunos, latitude, longitude) VALUES (1, 'EE Dr. Pedro de Toledo',         '35123403', 880, -23.9850, -48.8820);
INSERT INTO escola (id_municipio, nome, codigo_inep, qtd_alunos, latitude, longitude) VALUES (2, 'EMEF Prefeito Nelson Lopes',     '35123404', 410, -23.8620, -49.1360);
INSERT INTO escola (id_municipio, nome, codigo_inep, qtd_alunos, latitude, longitude) VALUES (3, 'EMEF Taquarivai Centro',         '35123405', 310, -23.9210, -48.6940);

-- ---------------- CHAMADAS PUBLICAS ----------------
-- Itapeva 2026/2: aberta, grande, cobre a demo inteira
INSERT INTO chamada (id_municipio, numero_edital, titulo, dt_publicacao, dt_limite, dt_inicio_entrega, dt_fim_entrega, status)
VALUES (1, 'CP 03/2026', 'Aquisicao de generos alimenticios da agricultura familiar para a alimentacao escolar - 2o semestre',
        DATE '2026-11-03', DATE '2026-11-28', DATE '2027-02-08', DATE '2027-06-30', 'ABERTA');
-- 20 semanas de entrega (fev-jun)
INSERT INTO item_chamada (id_chamada, id_produto, qtd_total, periodicidade, vl_unitario_ref) VALUES (1, 1, 2400, 'SEMANAL',   4.20);  -- mandioca 2.400 kg (120/sem)
INSERT INTO item_chamada (id_chamada, id_produto, qtd_total, periodicidade, vl_unitario_ref) VALUES (1, 2, 6000, 'SEMANAL',   2.80);  -- alface 6.000 un (300/sem)
INSERT INTO item_chamada (id_chamada, id_produto, qtd_total, periodicidade, vl_unitario_ref) VALUES (1, 3, 1800, 'SEMANAL',   5.10);  -- banana 1.800 kg
INSERT INTO item_chamada (id_chamada, id_produto, qtd_total, periodicidade, vl_unitario_ref) VALUES (1, 5, 1200, 'SEMANAL',   3.50);  -- couve 1.200 macos
INSERT INTO item_chamada (id_chamada, id_produto, qtd_total, periodicidade, vl_unitario_ref) VALUES (1, 7,  600, 'QUINZENAL', 14.00); -- ovos 600 dz
INSERT INTO item_chamada (id_chamada, id_produto, qtd_total, periodicidade, vl_unitario_ref) VALUES (1, 4, 1500, 'MENSAL',    9.80);  -- feijao 1.500 kg

-- Itabera 2026/2: aberta
INSERT INTO chamada (id_municipio, numero_edital, titulo, dt_publicacao, dt_limite, dt_inicio_entrega, dt_fim_entrega, status)
VALUES (2, 'CP 02/2026', 'Chamada publica para aquisicao de hortifruti da agricultura familiar',
        DATE '2026-11-10', DATE '2026-12-05', DATE '2027-02-15', DATE '2027-07-15', 'ABERTA');
INSERT INTO item_chamada (id_chamada, id_produto, qtd_total, periodicidade, vl_unitario_ref) VALUES (2, 6, 1600, 'SEMANAL', 6.40);   -- tomate
INSERT INTO item_chamada (id_chamada, id_produto, qtd_total, periodicidade, vl_unitario_ref) VALUES (2, 9, 3000, 'SEMANAL', 2.90);   -- laranja
INSERT INTO item_chamada (id_chamada, id_produto, qtd_total, periodicidade, vl_unitario_ref) VALUES (2, 3, 2200, 'SEMANAL', 5.00);   -- banana
INSERT INTO item_chamada (id_chamada, id_produto, qtd_total, periodicidade, vl_unitario_ref) VALUES (2, 2, 4000, 'SEMANAL', 2.60);   -- alface

-- Itapeva 2026/1: encerrada e homologada (historico: Marta ja vendeu -> vira embaixadora)
INSERT INTO chamada (id_municipio, numero_edital, titulo, dt_publicacao, dt_limite, dt_inicio_entrega, dt_fim_entrega, status)
VALUES (1, 'CP 01/2026', 'Aquisicao de generos alimenticios da agricultura familiar - 1o semestre',
        DATE '2026-02-02', DATE '2026-02-27', DATE '2026-03-09', DATE '2026-07-03', 'HOMOLOGADA');
INSERT INTO item_chamada (id_chamada, id_produto, qtd_total, periodicidade, vl_unitario_ref, qtd_atendida) VALUES (3, 2, 2000, 'SEMANAL', 2.70, 2000);

-- resumo em linguagem simples das chamadas abertas (gerado pela function).
-- Em loop PL/SQL, e nao em UPDATE direto, para evitar ORA-04091 (tabela mutante).
DECLARE
  l_txt chamada.resumo_simples%TYPE;
BEGIN
  FOR r IN (SELECT id_chamada FROM chamada WHERE status = 'ABERTA') LOOP
    l_txt := pkg_merendai.fn_resumo_chamada_audio(r.id_chamada);
    UPDATE chamada SET resumo_simples = l_txt WHERE id_chamada = r.id_chamada;
  END LOOP;
END;
/

-- ---------------- HISTORICO: venda passada da Marta (contratada e paga) ----------------
INSERT INTO proposta (id_chamada, id_produtor_lider, id_tecnico_revisor, tipo, status, vl_total, dt_envio)
VALUES (3, 1, 1, 'INDIVIDUAL', 'RASCUNHO', 0, NULL);
INSERT INTO item_proposta (id_proposta, id_item_chamada, id_produtor, qtd_ofertada, vl_unitario) VALUES (1, 11, 1, 2000, 2.70);  -- item 11 = alface da CP 01/2026
INSERT INTO participante_mutirao (id_proposta, id_produtor, confirmado) VALUES (1, 1, 'S');
UPDATE proposta SET status = 'ENVIADA', vl_total = 5400, dt_envio = TIMESTAMP '2026-02-20 10:00:00' WHERE id_proposta = 1;
UPDATE proposta SET status = 'CONTRATADA' WHERE id_proposta = 1;
-- duas entregas passadas e pagas, para o historico aparecer no app
INSERT INTO entrega (id_item_proposta, id_escola, dt_prevista, dt_realizada, qtd_prevista, qtd_entregue, status)
VALUES (1, 1, DATE '2026-03-09', DATE '2026-03-09', 1000, 1000, 'AGENDADA');
INSERT INTO entrega (id_item_proposta, id_escola, dt_prevista, dt_realizada, qtd_prevista, qtd_entregue, status)
VALUES (1, 1, DATE '2026-05-11', DATE '2026-05-11', 1000, 1000, 'AGENDADA');
UPDATE entrega SET status = 'ENTREGUE' WHERE id_item_proposta = 1;
INSERT INTO pagamento (id_entrega, vl_bruto, status, dt_prevista, dt_pagamento) VALUES (1, 2700, 'PREVISTO', DATE '2026-04-08', NULL);
INSERT INTO pagamento (id_entrega, vl_bruto, status, dt_prevista, dt_pagamento) VALUES (2, 2700, 'PREVISTO', DATE '2026-06-10', NULL);
UPDATE pagamento SET status = 'PAGO', dt_pagamento = DATE '2026-04-07' WHERE id_entrega = 1;
UPDATE pagamento SET status = 'PAGO', dt_pagamento = DATE '2026-06-09' WHERE id_entrega = 2;

-- Marta vira embaixadora (trigger valida que ja tem venda contratada) e indica Rita e Luzia
UPDATE produtor SET embaixador = 'S' WHERE id_produtor = 1;
INSERT INTO indicacao (id_produtor_embaixador, id_produtor_indicado, status) VALUES (1, 3, 'CADASTRADO');
INSERT INTO indicacao (id_produtor_embaixador, id_produtor_indicado, status) VALUES (1, 7, 'PENDENTE');

-- ---------------- MATCHING das chamadas abertas ----------------
DECLARE
  n NUMBER;
BEGIN
  pkg_merendai.sp_gerar_prospects(1, n);
  DBMS_OUTPUT.PUT_LINE('Prospects Itapeva: ' || n);
  pkg_merendai.sp_gerar_prospects(2, n);
  DBMS_OUTPUT.PUT_LINE('Prospects Itabera: ' || n);
END;
/

COMMIT;
