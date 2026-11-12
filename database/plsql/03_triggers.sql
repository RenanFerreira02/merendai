-- =============================================================================
-- MERENDAI - Triggers
--   * Auditoria append-only de status em HISTORICO_STATUS
--   * Maquina de estados: bloqueia transicoes invalidas
--   * Regra de negocio: embaixador precisa ter venda contratada
-- =============================================================================

-- Procedure utilitaria compartilhada pelas triggers de auditoria
CREATE OR REPLACE PROCEDURE sp_registrar_historico(
  p_entidade   IN VARCHAR2,
  p_id         IN NUMBER,
  p_de         IN VARCHAR2,
  p_para       IN VARCHAR2
) IS
  PRAGMA AUTONOMOUS_TRANSACTION;   -- o historico persiste mesmo se a transacao principal fizer rollback parcial
BEGIN
  INSERT INTO historico_status (entidade, id_registro, status_de, status_para)
  VALUES (p_entidade, p_id, p_de, p_para);
  COMMIT;
END sp_registrar_historico;
/

-- Valida transicoes permitidas. Lista explicita > "qualquer coisa".
CREATE OR REPLACE FUNCTION fn_transicao_valida(
  p_entidade IN VARCHAR2, p_de IN VARCHAR2, p_para IN VARCHAR2
) RETURN BOOLEAN IS
BEGIN
  IF p_de IS NULL OR p_de = p_para THEN RETURN TRUE; END IF;
  RETURN CASE p_entidade
    WHEN 'PROPOSTA' THEN
      (p_de = 'RASCUNHO' AND p_para IN ('ENVIADA','CANCELADA')) OR
      (p_de = 'ENVIADA'  AND p_para IN ('CONTRATADA','RECUSADA','CANCELADA'))
    WHEN 'ENTREGA' THEN
      (p_de = 'AGENDADA' AND p_para IN ('LEMBRADA','ENTREGUE','PARCIAL','FALTOU','CANCELADA')) OR
      (p_de = 'LEMBRADA' AND p_para IN ('ENTREGUE','PARCIAL','FALTOU','CANCELADA'))
    WHEN 'PAGAMENTO' THEN
      (p_de = 'PREVISTO' AND p_para IN ('PAGO','ATRASADO','CANCELADO')) OR
      (p_de = 'ATRASADO' AND p_para IN ('PAGO','CANCELADO'))
    WHEN 'PROSPECT' THEN
      (p_de = 'NOVO'       AND p_para IN ('NOTIFICADO','ACEITO','RECUSADO','EXPIRADO')) OR
      (p_de = 'NOTIFICADO' AND p_para IN ('ACEITO','RECUSADO','EXPIRADO'))
    WHEN 'INDICACAO' THEN
      (p_de = 'PENDENTE'   AND p_para IN ('CADASTRADO','CONVERTIDO')) OR
      (p_de = 'CADASTRADO' AND p_para = 'CONVERTIDO')
    WHEN 'CHAMADA' THEN
      (p_de = 'ABERTA'    AND p_para IN ('ENCERRADA','CANCELADA')) OR
      (p_de = 'ENCERRADA' AND p_para IN ('HOMOLOGADA','CANCELADA'))
    ELSE FALSE END;
END fn_transicao_valida;
/

-- ---------------- PROPOSTA ----------------
CREATE OR REPLACE TRIGGER trg_proposta_status
BEFORE INSERT OR UPDATE OF status ON proposta
FOR EACH ROW
BEGIN
  IF UPDATING AND NOT fn_transicao_valida('PROPOSTA', :OLD.status, :NEW.status) THEN
    RAISE_APPLICATION_ERROR(-20010, 'Transicao invalida de proposta: ' || :OLD.status || ' -> ' || :NEW.status);
  END IF;
  IF INSERTING OR :OLD.status <> :NEW.status THEN
    sp_registrar_historico('PROPOSTA', :NEW.id_proposta, CASE WHEN UPDATING THEN :OLD.status END, :NEW.status);
  END IF;
END;
/

-- ---------------- ENTREGA ----------------
CREATE OR REPLACE TRIGGER trg_entrega_status
BEFORE INSERT OR UPDATE OF status ON entrega
FOR EACH ROW
BEGIN
  IF UPDATING AND NOT fn_transicao_valida('ENTREGA', :OLD.status, :NEW.status) THEN
    RAISE_APPLICATION_ERROR(-20011, 'Transicao invalida de entrega: ' || :OLD.status || ' -> ' || :NEW.status);
  END IF;
  IF INSERTING OR :OLD.status <> :NEW.status THEN
    sp_registrar_historico('ENTREGA', :NEW.id_entrega, CASE WHEN UPDATING THEN :OLD.status END, :NEW.status);
  END IF;
END;
/

-- ---------------- PAGAMENTO ----------------
CREATE OR REPLACE TRIGGER trg_pagamento_status
BEFORE INSERT OR UPDATE OF status ON pagamento
FOR EACH ROW
BEGIN
  IF UPDATING AND NOT fn_transicao_valida('PAGAMENTO', :OLD.status, :NEW.status) THEN
    RAISE_APPLICATION_ERROR(-20012, 'Transicao invalida de pagamento: ' || :OLD.status || ' -> ' || :NEW.status);
  END IF;
  IF UPDATING AND :NEW.status = 'PAGO' AND :NEW.dt_pagamento IS NULL THEN
    :NEW.dt_pagamento := SYSDATE;
  END IF;
  IF INSERTING OR :OLD.status <> :NEW.status THEN
    sp_registrar_historico('PAGAMENTO', :NEW.id_pagamento, CASE WHEN UPDATING THEN :OLD.status END, :NEW.status);
  END IF;
END;
/

-- ---------------- PROSPECT ----------------
CREATE OR REPLACE TRIGGER trg_prospect_status
BEFORE UPDATE OF status ON prospect
FOR EACH ROW
BEGIN
  IF NOT fn_transicao_valida('PROSPECT', :OLD.status, :NEW.status) THEN
    RAISE_APPLICATION_ERROR(-20013, 'Transicao invalida de prospect: ' || :OLD.status || ' -> ' || :NEW.status);
  END IF;
  IF :OLD.status <> :NEW.status THEN
    sp_registrar_historico('PROSPECT', :NEW.id_prospect, :OLD.status, :NEW.status);
  END IF;
END;
/

-- ---------------- INDICACAO ----------------
CREATE OR REPLACE TRIGGER trg_indicacao_status
BEFORE INSERT OR UPDATE OF status ON indicacao
FOR EACH ROW
DECLARE
  l_emb produtor.embaixador%TYPE;
BEGIN
  IF INSERTING THEN
    SELECT embaixador INTO l_emb FROM produtor WHERE id_produtor = :NEW.id_produtor_embaixador;
    IF l_emb <> 'S' THEN
      RAISE_APPLICATION_ERROR(-20014, 'Somente produtor embaixador pode indicar.');
    END IF;
    IF :NEW.id_produtor_embaixador = :NEW.id_produtor_indicado THEN
      RAISE_APPLICATION_ERROR(-20014, 'Produtor nao pode indicar a si mesmo.');
    END IF;
  END IF;
  IF UPDATING AND NOT fn_transicao_valida('INDICACAO', :OLD.status, :NEW.status) THEN
    RAISE_APPLICATION_ERROR(-20015, 'Transicao invalida de indicacao: ' || :OLD.status || ' -> ' || :NEW.status);
  END IF;
  IF INSERTING OR :OLD.status <> :NEW.status THEN
    sp_registrar_historico('INDICACAO', :NEW.id_indicacao, CASE WHEN UPDATING THEN :OLD.status END, :NEW.status);
  END IF;
END;
/

-- ---------------- CHAMADA ----------------
CREATE OR REPLACE TRIGGER trg_chamada_status
BEFORE UPDATE OF status ON chamada
FOR EACH ROW
BEGIN
  IF NOT fn_transicao_valida('CHAMADA', :OLD.status, :NEW.status) THEN
    RAISE_APPLICATION_ERROR(-20016, 'Transicao invalida de chamada: ' || :OLD.status || ' -> ' || :NEW.status);
  END IF;
  IF :OLD.status <> :NEW.status THEN
    sp_registrar_historico('CHAMADA', :NEW.id_chamada, :OLD.status, :NEW.status);
  END IF;
END;
/

-- ---------------- Regra: so vira embaixador quem ja vendeu ----------------
CREATE OR REPLACE TRIGGER trg_produtor_embaixador
BEFORE UPDATE OF embaixador ON produtor
FOR EACH ROW
WHEN (NEW.embaixador = 'S' AND OLD.embaixador = 'N')
DECLARE
  l_qtd NUMBER;
BEGIN
  SELECT COUNT(*) INTO l_qtd
    FROM item_proposta ip JOIN proposta p ON p.id_proposta = ip.id_proposta
   WHERE ip.id_produtor = :NEW.id_produtor AND p.status = 'CONTRATADA';
  IF l_qtd = 0 THEN
    RAISE_APPLICATION_ERROR(-20017, 'Produtor precisa de ao menos uma venda contratada para ser embaixador.');
  END IF;
END;
/

-- =============================================================================
-- Views de indicadores (consumidas pelo painel do tecnico e pelo gestor)
-- =============================================================================
CREATE OR REPLACE VIEW vw_indicadores_municipio AS
SELECT m.id_municipio,
       m.nome,
       m.uf,
       m.vl_repasse_fnde,
       m.vl_compra_af,
       pkg_merendai.fn_percentual_af(m.id_municipio)                           AS pct_af,
       pkg_merendai.fn_meta_af()                                               AS meta_pct,
       GREATEST(m.vl_repasse_fnde * pkg_merendai.fn_meta_af() / 100 - m.vl_compra_af, 0) AS vl_faltante_meta,
       (SELECT COUNT(*) FROM produtor p WHERE p.id_municipio = m.id_municipio) AS produtores_cadastrados,
       (SELECT COUNT(DISTINCT ip.id_produtor)
          FROM item_proposta ip JOIN proposta pr ON pr.id_proposta = ip.id_proposta
          JOIN chamada c ON c.id_chamada = pr.id_chamada
         WHERE c.id_municipio = m.id_municipio AND pr.status = 'CONTRATADA') AS produtores_vendendo,
       (SELECT COUNT(*) FROM chamada c WHERE c.id_municipio = m.id_municipio AND c.status = 'ABERTA') AS chamadas_abertas,
       (SELECT COUNT(*) FROM proposta pr JOIN chamada c ON c.id_chamada = pr.id_chamada
         WHERE c.id_municipio = m.id_municipio AND pr.tipo = 'MUTIRAO' AND pr.status = 'CONTRATADA') AS mutiroes_contratados
  FROM municipio m;

CREATE OR REPLACE VIEW vw_painel_tecnico AS
SELECT t.id_tecnico,
       p.id_produtor,
       u.nome                                   AS produtor,
       u.telefone,
       p.embaixador,
       p.numero_caf,
       CASE WHEN p.caf_valido_ate < SYSDATE THEN 'VENCIDO' ELSE 'OK' END AS situacao_caf,
       (SELECT COUNT(*) FROM prospect ps WHERE ps.id_produtor = p.id_produtor AND ps.status IN ('NOVO','NOTIFICADO')) AS prospects_abertos,
       (SELECT COUNT(*) FROM item_proposta ip JOIN proposta pr ON pr.id_proposta = ip.id_proposta
         WHERE ip.id_produtor = p.id_produtor AND pr.status = 'CONTRATADA') AS contratos,
       (SELECT NVL(SUM(pg.vl_bruto), 0) FROM pagamento pg
           JOIN entrega e ON e.id_entrega = pg.id_entrega
           JOIN item_proposta ip ON ip.id_item_proposta = e.id_item_proposta
         WHERE ip.id_produtor = p.id_produtor AND pg.status = 'PAGO') AS vl_recebido,
       p.latitude, p.longitude
  FROM produtor p
  JOIN usuario u ON u.id_usuario = p.id_usuario
  JOIN tecnico t ON t.id_tecnico = p.id_tecnico;

CREATE OR REPLACE VIEW vw_oportunidades_produtor AS
SELECT ps.id_prospect,
       ps.id_produtor,
       c.id_chamada,
       ic.id_item_chamada,
       m.nome              AS municipio,
       pd.nome             AS produto,
       pd.unidade,
       ic.qtd_total,
       ic.qtd_atendida,
       ic.periodicidade,
       ic.vl_unitario_ref,
       ps.distancia_km,
       ps.cobertura,
       ps.score,
       ps.status           AS status_prospect,
       c.dt_limite,
       c.dt_inicio_entrega,
       c.dt_fim_entrega,
       c.resumo_simples
  FROM prospect ps
  JOIN item_chamada ic ON ic.id_item_chamada = ps.id_item_chamada
  JOIN chamada c       ON c.id_chamada = ic.id_chamada
  JOIN municipio m     ON m.id_municipio = c.id_municipio
  JOIN produto pd      ON pd.id_produto = ic.id_produto
 WHERE c.status = 'ABERTA' AND c.dt_limite >= TRUNC(SYSDATE);
