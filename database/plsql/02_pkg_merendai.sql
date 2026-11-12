-- =============================================================================
-- MERENDAI - Package PKG_MERENDAI
-- Automacoes centrais do negocio. A API apenas chama estas rotinas.
--
--   fn_distancia_km        : Haversine entre dois pontos (sem Oracle Spatial)
--   fn_percentual_af       : % do repasse FNDE do municipio gasto com agric. familiar
--   fn_saldo_limite_anual  : quanto o produtor ainda pode vender no ano (limite CAF)
--   sp_gerar_prospects     : matching chamada x produtores -> tabela PROSPECT
--   sp_montar_mutirao      : compoe proposta MUTIRAO ate atingir o volume do item
--   sp_enviar_proposta     : valida e muda RASCUNHO -> ENVIADA (calcula vl_total)
--   sp_contratar_proposta  : ENVIADA -> CONTRATADA, agenda entregas e pagamentos
--   sp_gerar_lembretes     : marca entregas de amanha como LEMBRADA e retorna a fila
--   sp_confirmar_entrega   : registra entrega e atualiza qtd_atendida e compra AF
--   fn_resumo_chamada_audio: texto em linguagem simples para o agente ler
-- =============================================================================

CREATE OR REPLACE PACKAGE pkg_merendai AS

  -- Constantes de negocio
  c_meta_af_pct        CONSTANT NUMBER := 45;      -- Lei 15.226/2025
  c_prazo_pagto_dias   CONSTANT NUMBER := 30;
  c_cobertura_minima   CONSTANT NUMBER := 0.10;    -- produtor precisa cobrir ao menos 10% do item

  -- Excecoes de negocio
  e_proposta_invalida  EXCEPTION;
  PRAGMA EXCEPTION_INIT(e_proposta_invalida, -20001);
  e_chamada_fechada    EXCEPTION;
  PRAGMA EXCEPTION_INIT(e_chamada_fechada, -20002);
  e_limite_excedido    EXCEPTION;
  PRAGMA EXCEPTION_INIT(e_limite_excedido, -20003);

  FUNCTION fn_distancia_km(
    p_lat1 NUMBER, p_lon1 NUMBER, p_lat2 NUMBER, p_lon2 NUMBER
  ) RETURN NUMBER DETERMINISTIC;

  FUNCTION fn_percentual_af(p_id_municipio IN municipio.id_municipio%TYPE)
    RETURN NUMBER;

  FUNCTION fn_saldo_limite_anual(
    p_id_produtor  IN produtor.id_produtor%TYPE,
    p_id_municipio IN municipio.id_municipio%TYPE,
    p_ano          IN NUMBER DEFAULT EXTRACT(YEAR FROM SYSDATE)
  ) RETURN NUMBER;

  FUNCTION fn_resumo_chamada_audio(p_id_chamada IN chamada.id_chamada%TYPE)
    RETURN VARCHAR2;

  PROCEDURE sp_gerar_prospects(
    p_id_chamada   IN  chamada.id_chamada%TYPE,
    p_qtd_gerados  OUT NUMBER
  );

  PROCEDURE sp_montar_mutirao(
    p_id_item_chamada  IN  item_chamada.id_item_chamada%TYPE,
    p_id_produtor_lider IN produtor.id_produtor%TYPE,
    p_id_proposta      OUT proposta.id_proposta%TYPE,
    p_cobertura_final  OUT NUMBER
  );

  PROCEDURE sp_enviar_proposta(
    p_id_proposta IN proposta.id_proposta%TYPE,
    p_id_tecnico  IN tecnico.id_tecnico%TYPE DEFAULT NULL
  );

  PROCEDURE sp_contratar_proposta(
    p_id_proposta IN proposta.id_proposta%TYPE,
    p_id_escola   IN escola.id_escola%TYPE
  );

  FUNCTION fn_meta_af RETURN NUMBER;   -- expoe a constante para views/SQL

  PROCEDURE sp_gerar_lembretes(
    p_data      IN  DATE DEFAULT TRUNC(SYSDATE) + 1,
    p_lembretes OUT SYS_REFCURSOR
  );

  PROCEDURE sp_confirmar_entrega(
    p_id_entrega   IN entrega.id_entrega%TYPE,
    p_qtd_entregue IN NUMBER,
    p_observacao   IN VARCHAR2 DEFAULT NULL
  );

END pkg_merendai;
/

CREATE OR REPLACE PACKAGE BODY pkg_merendai AS

  -- ---------------------------------------------------------------------------
  -- Haversine. Raio medio da Terra 6371 km.
  -- ---------------------------------------------------------------------------
  FUNCTION fn_distancia_km(
    p_lat1 NUMBER, p_lon1 NUMBER, p_lat2 NUMBER, p_lon2 NUMBER
  ) RETURN NUMBER DETERMINISTIC IS
    c_raio  CONSTANT NUMBER := 6371;
    c_rad   CONSTANT NUMBER := ACOS(-1) / 180;
    l_dlat  NUMBER := (p_lat2 - p_lat1) * c_rad;
    l_dlon  NUMBER := (p_lon2 - p_lon1) * c_rad;
    l_a     NUMBER;
  BEGIN
    l_a := POWER(SIN(l_dlat / 2), 2)
         + COS(p_lat1 * c_rad) * COS(p_lat2 * c_rad) * POWER(SIN(l_dlon / 2), 2);
    RETURN ROUND(2 * c_raio * ASIN(SQRT(l_a)), 2);
  END fn_distancia_km;

  -- ---------------------------------------------------------------------------
  -- % do repasse gasto com agricultura familiar. Indicador da meta de 45%.
  -- ---------------------------------------------------------------------------
  FUNCTION fn_percentual_af(p_id_municipio IN municipio.id_municipio%TYPE)
    RETURN NUMBER IS
    l_repasse municipio.vl_repasse_fnde%TYPE;
    l_compra  municipio.vl_compra_af%TYPE;
  BEGIN
    SELECT vl_repasse_fnde, vl_compra_af INTO l_repasse, l_compra
      FROM municipio WHERE id_municipio = p_id_municipio;
    IF NVL(l_repasse, 0) = 0 THEN RETURN 0; END IF;
    RETURN ROUND(l_compra / l_repasse * 100, 2);
  END fn_percentual_af;

  -- ---------------------------------------------------------------------------
  -- Saldo do limite anual por produtor por entidade executora.
  -- Soma o vl das propostas CONTRATADAS do produtor naquele municipio no ano.
  -- ---------------------------------------------------------------------------
  FUNCTION fn_saldo_limite_anual(
    p_id_produtor  IN produtor.id_produtor%TYPE,
    p_id_municipio IN municipio.id_municipio%TYPE,
    p_ano          IN NUMBER DEFAULT EXTRACT(YEAR FROM SYSDATE)
  ) RETURN NUMBER IS
    l_limite produtor.vl_limite_anual%TYPE;
    l_usado  NUMBER := 0;
  BEGIN
    SELECT vl_limite_anual INTO l_limite FROM produtor WHERE id_produtor = p_id_produtor;

    SELECT NVL(SUM(ip.qtd_ofertada * ip.vl_unitario), 0) INTO l_usado
      FROM item_proposta ip
      JOIN proposta p ON p.id_proposta = ip.id_proposta
      JOIN chamada  c ON c.id_chamada  = p.id_chamada
     WHERE ip.id_produtor = p_id_produtor
       AND c.id_municipio = p_id_municipio
       AND p.status = 'CONTRATADA'
       AND EXTRACT(YEAR FROM c.dt_inicio_entrega) = p_ano;

    RETURN GREATEST(l_limite - l_usado, 0);
  END fn_saldo_limite_anual;

  -- ---------------------------------------------------------------------------
  -- Texto em linguagem simples para o agente ler em audio.
  -- Ex.: "A prefeitura de Itapeva quer comprar 300 quilos de mandioca por mes,
  --       pagando 4 reais e 20 centavos o quilo. Entregas de marco a dezembro.
  --       Da para responder ate 20 de novembro."
  -- ---------------------------------------------------------------------------
  FUNCTION fn_resumo_chamada_audio(p_id_chamada IN chamada.id_chamada%TYPE)
    RETURN VARCHAR2 IS
    l_txt    VARCHAR2(1000);
    l_mun    municipio.nome%TYPE;
    l_lim    chamada.dt_limite%TYPE;
    l_ini    chamada.dt_inicio_entrega%TYPE;
    l_fim    chamada.dt_fim_entrega%TYPE;
    l_itens  VARCHAR2(800) := '';
    FUNCTION unidade_fala(p_un VARCHAR2, p_qtd NUMBER) RETURN VARCHAR2 IS
    BEGIN
      RETURN CASE p_un
        WHEN 'KG'   THEN TO_CHAR(p_qtd, 'FM999G999') || ' quilos'
        WHEN 'UN'   THEN TO_CHAR(p_qtd, 'FM999G999') || ' unidades'
        WHEN 'MACO' THEN TO_CHAR(p_qtd, 'FM999G999') || ' macos'
        WHEN 'DZ'   THEN TO_CHAR(p_qtd, 'FM999G999') || ' duzias'
        WHEN 'L'    THEN TO_CHAR(p_qtd, 'FM999G999') || ' litros'
      END;
    END;
    FUNCTION periodo_fala(p_per VARCHAR2) RETURN VARCHAR2 IS
    BEGIN
      RETURN CASE p_per WHEN 'SEMANAL' THEN 'por semana'
                        WHEN 'QUINZENAL' THEN 'a cada quinze dias'
                        ELSE 'por mes' END;
    END;
  BEGIN
    SELECT m.nome, c.dt_limite, c.dt_inicio_entrega, c.dt_fim_entrega
      INTO l_mun, l_lim, l_ini, l_fim
      FROM chamada c JOIN municipio m ON m.id_municipio = c.id_municipio
     WHERE c.id_chamada = p_id_chamada;

    FOR r IN (
      SELECT pr.nome, pr.unidade, ic.qtd_total, ic.periodicidade, ic.vl_unitario_ref
        FROM item_chamada ic JOIN produto pr ON pr.id_produto = ic.id_produto
       WHERE ic.id_chamada = p_id_chamada
       ORDER BY ic.qtd_total * ic.vl_unitario_ref DESC
    ) LOOP
      l_itens := l_itens
        || unidade_fala(r.unidade, r.qtd_total) || ' de ' || LOWER(r.nome)
        || ' ' || periodo_fala(r.periodicidade)
        || ', pagando ' || TO_CHAR(r.vl_unitario_ref, 'FM999G990D00', 'NLS_NUMERIC_CHARACTERS='',.''')
        || ' reais ' || CASE r.unidade WHEN 'KG' THEN 'o quilo' WHEN 'UN' THEN 'a unidade'
                                       WHEN 'MACO' THEN 'o maco' WHEN 'DZ' THEN 'a duzia' ELSE 'o litro' END
        || '; ';
    END LOOP;

    l_txt := 'A prefeitura de ' || l_mun || ' quer comprar '
          || RTRIM(l_itens, '; ') || '. '
          || 'As entregas vao de ' || TO_CHAR(l_ini, 'DD "de" fmMonth', 'NLS_DATE_LANGUAGE=PORTUGUESE')
          || ' a ' || TO_CHAR(l_fim, 'DD "de" fmMonth', 'NLS_DATE_LANGUAGE=PORTUGUESE') || '. '
          || 'Da para responder ate ' || TO_CHAR(l_lim, 'DD "de" fmMonth', 'NLS_DATE_LANGUAGE=PORTUGUESE') || '.';
    RETURN l_txt;
  END fn_resumo_chamada_audio;

  -- ---------------------------------------------------------------------------
  -- MATCHING: para cada item da chamada, encontra produtores que
  --   (1) plantam o produto, (2) estao dentro do proprio raio de entrega
  --   ate a sede do municipio, (3) tem CAF valido, (4) cobrem >= 10% do item.
  -- Gera PROSPECT com score = cobertura*100 - distancia*0.5 + organico*5.
  -- Idempotente: MERGE, nao duplica.
  -- ---------------------------------------------------------------------------
  PROCEDURE sp_gerar_prospects(
    p_id_chamada   IN  chamada.id_chamada%TYPE,
    p_qtd_gerados  OUT NUMBER
  ) IS
    l_status  chamada.status%TYPE;
    l_lat     municipio.latitude%TYPE;
    l_lon     municipio.longitude%TYPE;
    l_semanas NUMBER;
  BEGIN
    SELECT c.status, m.latitude, m.longitude,
           GREATEST(CEIL((c.dt_fim_entrega - c.dt_inicio_entrega) / 7), 1)
      INTO l_status, l_lat, l_lon, l_semanas
      FROM chamada c JOIN municipio m ON m.id_municipio = c.id_municipio
     WHERE c.id_chamada = p_id_chamada;

    IF l_status <> 'ABERTA' THEN
      RAISE_APPLICATION_ERROR(-20002, 'Chamada ' || p_id_chamada || ' nao esta aberta.');
    END IF;

    p_qtd_gerados := 0;

    FOR it IN (SELECT id_item_chamada, id_produto, qtd_total, periodicidade
                 FROM item_chamada WHERE id_chamada = p_id_chamada) LOOP

      MERGE INTO prospect ps
      USING (
        SELECT it.id_item_chamada AS id_item_chamada,
               p.id_produtor,
               fn_distancia_km(p.latitude, p.longitude, l_lat, l_lon) AS distancia_km,
               -- capacidade no periodo da chamada / quantidade total pedida
               LEAST(pd.qtd_semanal * l_semanas / it.qtd_total, 1) AS cobertura,
               pd.organico
          FROM produtor p
          JOIN producao pd ON pd.id_produtor = p.id_produtor
         WHERE pd.id_produto = it.id_produto
           AND p.numero_caf IS NOT NULL
           AND NVL(p.caf_valido_ate, SYSDATE) >= SYSDATE
           AND fn_distancia_km(p.latitude, p.longitude, l_lat, l_lon) <= p.raio_entrega_km
           AND LEAST(pd.qtd_semanal * l_semanas / it.qtd_total, 1) >= c_cobertura_minima
      ) src
      ON (ps.id_item_chamada = src.id_item_chamada AND ps.id_produtor = src.id_produtor)
      WHEN NOT MATCHED THEN INSERT (id_item_chamada, id_produtor, distancia_km, cobertura, score)
        VALUES (src.id_item_chamada, src.id_produtor, src.distancia_km, src.cobertura,
                ROUND(src.cobertura * 100 - src.distancia_km * 0.5
                      + CASE src.organico WHEN 'S' THEN 5 ELSE 0 END, 2));

      p_qtd_gerados := p_qtd_gerados + SQL%ROWCOUNT;
    END LOOP;
  END sp_gerar_prospects;

  -- ---------------------------------------------------------------------------
  -- MUTIRAO: a partir de um produtor lider e um item, cria proposta MUTIRAO e
  -- vai somando vizinhos (prospects do mesmo item, ordenados por score e
  -- distancia ate o lider) ate cobrir 100% do item ou acabar os candidatos.
  -- Respeita o saldo do limite anual de cada participante.
  -- ---------------------------------------------------------------------------
  PROCEDURE sp_montar_mutirao(
    p_id_item_chamada   IN  item_chamada.id_item_chamada%TYPE,
    p_id_produtor_lider IN  produtor.id_produtor%TYPE,
    p_id_proposta       OUT proposta.id_proposta%TYPE,
    p_cobertura_final   OUT NUMBER
  ) IS
    l_id_chamada   chamada.id_chamada%TYPE;
    l_id_municipio municipio.id_municipio%TYPE;
    l_qtd_total    item_chamada.qtd_total%TYPE;
    l_vl_ref       item_chamada.vl_unitario_ref%TYPE;
    l_id_produto   produto.id_produto%TYPE;
    l_semanas      NUMBER;
    l_ano          NUMBER;
    l_falta        NUMBER;
    l_atendida     item_chamada.qtd_atendida%TYPE;
    l_lat_lider    produtor.latitude%TYPE;
    l_lon_lider    produtor.longitude%TYPE;

    PROCEDURE adicionar(p_id_produtor NUMBER, p_qtd_semanal NUMBER) IS
      l_capacidade NUMBER := p_qtd_semanal * l_semanas;
      l_saldo      NUMBER := fn_saldo_limite_anual(p_id_produtor, l_id_municipio, l_ano);
      l_max_por_rs NUMBER := FLOOR(l_saldo / l_vl_ref);
      l_oferta     NUMBER := LEAST(l_capacidade, l_falta, l_max_por_rs);
    BEGIN
      IF l_oferta <= 0 THEN RETURN; END IF;
      MERGE INTO participante_mutirao pm
      USING (SELECT p_id_proposta AS id_proposta, p_id_produtor AS id_produtor FROM dual) s
      ON (pm.id_proposta = s.id_proposta AND pm.id_produtor = s.id_produtor)
      WHEN NOT MATCHED THEN INSERT (id_proposta, id_produtor, confirmado)
        VALUES (s.id_proposta, s.id_produtor, CASE WHEN p_id_produtor = p_id_produtor_lider THEN 'S' ELSE 'N' END);
      INSERT INTO item_proposta (id_proposta, id_item_chamada, id_produtor, qtd_ofertada, vl_unitario)
      VALUES (p_id_proposta, p_id_item_chamada, p_id_produtor, l_oferta, l_vl_ref);
      l_falta := l_falta - l_oferta;
    END adicionar;
  BEGIN
    SELECT ic.id_chamada, c.id_municipio, ic.qtd_total, ic.vl_unitario_ref, ic.id_produto, ic.qtd_atendida,
           GREATEST(CEIL((c.dt_fim_entrega - c.dt_inicio_entrega) / 7), 1),
           EXTRACT(YEAR FROM c.dt_inicio_entrega)
      INTO l_id_chamada, l_id_municipio, l_qtd_total, l_vl_ref, l_id_produto, l_atendida, l_semanas, l_ano
      FROM item_chamada ic JOIN chamada c ON c.id_chamada = ic.id_chamada
     WHERE ic.id_item_chamada = p_id_item_chamada;

    SELECT latitude, longitude INTO l_lat_lider, l_lon_lider
      FROM produtor WHERE id_produtor = p_id_produtor_lider;

    l_falta := l_qtd_total - l_atendida;

    INSERT INTO proposta (id_chamada, id_produtor_lider, tipo, status)
    VALUES (l_id_chamada, p_id_produtor_lider, 'MUTIRAO', 'RASCUNHO')
    RETURNING id_proposta INTO p_id_proposta;

    -- 1) o lider entra primeiro
    FOR r IN (SELECT qtd_semanal FROM producao
               WHERE id_produtor = p_id_produtor_lider AND id_produto = l_id_produto) LOOP
      adicionar(p_id_produtor_lider, r.qtd_semanal);
    END LOOP;

    -- 2) vizinhos por score e proximidade ao lider, ate fechar o volume
    FOR r IN (
      SELECT ps.id_produtor, pd.qtd_semanal
        FROM prospect ps
        JOIN produtor p  ON p.id_produtor = ps.id_produtor
        JOIN producao pd ON pd.id_produtor = p.id_produtor AND pd.id_produto = l_id_produto
       WHERE ps.id_item_chamada = p_id_item_chamada
         AND ps.id_produtor <> p_id_produtor_lider
         AND ps.status NOT IN ('RECUSADO','EXPIRADO')
       ORDER BY ps.score DESC,
                fn_distancia_km(p.latitude, p.longitude, l_lat_lider, l_lon_lider) ASC
    ) LOOP
      EXIT WHEN l_falta <= 0;
      adicionar(r.id_produtor, r.qtd_semanal);
    END LOOP;

    -- se so o lider entrou, a proposta e INDIVIDUAL
    UPDATE proposta SET tipo = 'INDIVIDUAL'
     WHERE id_proposta = p_id_proposta
       AND (SELECT COUNT(*) FROM participante_mutirao WHERE id_proposta = p_id_proposta) = 1;

    p_cobertura_final := ROUND((l_qtd_total - l_falta) / l_qtd_total, 4);
  END sp_montar_mutirao;

  -- ---------------------------------------------------------------------------
  -- ENVIAR: valida chamada aberta, itens > 0, saldo de limite; calcula total.
  -- ---------------------------------------------------------------------------
  PROCEDURE sp_enviar_proposta(
    p_id_proposta IN proposta.id_proposta%TYPE,
    p_id_tecnico  IN tecnico.id_tecnico%TYPE DEFAULT NULL
  ) IS
    l_status      proposta.status%TYPE;
    l_ch_status   chamada.status%TYPE;
    l_dt_limite   chamada.dt_limite%TYPE;
    l_total       NUMBER;
    l_itens       NUMBER;
    l_id_mun      municipio.id_municipio%TYPE;
    l_ano         NUMBER;
  BEGIN
    SELECT p.status, c.status, c.dt_limite, c.id_municipio, EXTRACT(YEAR FROM c.dt_inicio_entrega)
      INTO l_status, l_ch_status, l_dt_limite, l_id_mun, l_ano
      FROM proposta p JOIN chamada c ON c.id_chamada = p.id_chamada
     WHERE p.id_proposta = p_id_proposta
       FOR UPDATE OF p.status;

    IF l_status <> 'RASCUNHO' THEN
      RAISE_APPLICATION_ERROR(-20001, 'Proposta ' || p_id_proposta || ' nao esta em rascunho.');
    END IF;
    IF l_ch_status <> 'ABERTA' OR TRUNC(SYSDATE) > l_dt_limite THEN
      RAISE_APPLICATION_ERROR(-20002, 'Chamada encerrada ou fora do prazo.');
    END IF;

    SELECT COUNT(*), NVL(SUM(qtd_ofertada * vl_unitario), 0)
      INTO l_itens, l_total FROM item_proposta WHERE id_proposta = p_id_proposta;
    IF l_itens = 0 THEN
      RAISE_APPLICATION_ERROR(-20001, 'Proposta sem itens.');
    END IF;

    -- cada participante dentro do limite anual
    FOR r IN (SELECT id_produtor, SUM(qtd_ofertada * vl_unitario) vl
                FROM item_proposta WHERE id_proposta = p_id_proposta GROUP BY id_produtor) LOOP
      IF r.vl > fn_saldo_limite_anual(r.id_produtor, l_id_mun, l_ano) THEN
        RAISE_APPLICATION_ERROR(-20003, 'Produtor ' || r.id_produtor || ' excede o limite anual de venda.');
      END IF;
    END LOOP;

    UPDATE proposta
       SET status = 'ENVIADA', vl_total = l_total, dt_envio = SYSTIMESTAMP,
           id_tecnico_revisor = NVL(p_id_tecnico, id_tecnico_revisor)
     WHERE id_proposta = p_id_proposta;

    UPDATE prospect ps SET status = 'ACEITO'
     WHERE (ps.id_item_chamada, ps.id_produtor) IN
           (SELECT id_item_chamada, id_produtor FROM item_proposta WHERE id_proposta = p_id_proposta)
       AND ps.status IN ('NOVO','NOTIFICADO');
  END sp_enviar_proposta;

  -- ---------------------------------------------------------------------------
  -- CONTRATAR: gera o calendario de entregas conforme a periodicidade do item,
  -- um PAGAMENTO previsto por entrega (30 dias), e converte indicacoes.
  -- ---------------------------------------------------------------------------
  PROCEDURE sp_contratar_proposta(
    p_id_proposta IN proposta.id_proposta%TYPE,
    p_id_escola   IN escola.id_escola%TYPE
  ) IS
    l_status proposta.status%TYPE;
    l_ini    chamada.dt_inicio_entrega%TYPE;
    l_fim    chamada.dt_fim_entrega%TYPE;
    l_passo  NUMBER;
    l_n      NUMBER;
    l_dt     DATE;
    l_id_ent entrega.id_entrega%TYPE;
  BEGIN
    SELECT p.status, c.dt_inicio_entrega, c.dt_fim_entrega
      INTO l_status, l_ini, l_fim
      FROM proposta p JOIN chamada c ON c.id_chamada = p.id_chamada
     WHERE p.id_proposta = p_id_proposta FOR UPDATE OF p.status;

    IF l_status <> 'ENVIADA' THEN
      RAISE_APPLICATION_ERROR(-20001, 'Somente proposta ENVIADA pode ser contratada.');
    END IF;

    UPDATE proposta SET status = 'CONTRATADA' WHERE id_proposta = p_id_proposta;

    FOR ip IN (
      SELECT ip.id_item_proposta, ip.qtd_ofertada, ip.vl_unitario, ic.periodicidade
        FROM item_proposta ip JOIN item_chamada ic ON ic.id_item_chamada = ip.id_item_chamada
       WHERE ip.id_proposta = p_id_proposta
    ) LOOP
      l_passo := CASE ip.periodicidade WHEN 'SEMANAL' THEN 7 WHEN 'QUINZENAL' THEN 14 ELSE 30 END;
      l_n     := GREATEST(FLOOR((l_fim - l_ini) / l_passo) + 1, 1);
      l_dt    := l_ini;
      FOR i IN 1..l_n LOOP
        INSERT INTO entrega (id_item_proposta, id_escola, dt_prevista, qtd_prevista, status)
        VALUES (ip.id_item_proposta, p_id_escola, l_dt, ROUND(ip.qtd_ofertada / l_n, 2), 'AGENDADA')
        RETURNING id_entrega INTO l_id_ent;

        INSERT INTO pagamento (id_entrega, vl_bruto, status, dt_prevista)
        VALUES (l_id_ent, ROUND(ip.qtd_ofertada / l_n * ip.vl_unitario, 2), 'PREVISTO', l_dt + c_prazo_pagto_dias);

        l_dt := l_dt + l_passo;
      END LOOP;
    END LOOP;

    -- indicacao do embaixador vira CONVERTIDA na primeira venda do indicado
    UPDATE indicacao i
       SET status = 'CONVERTIDO', dt_conversao = SYSDATE
     WHERE i.status <> 'CONVERTIDO'
       AND i.id_produtor_indicado IN (SELECT id_produtor FROM item_proposta WHERE id_proposta = p_id_proposta);
  END sp_contratar_proposta;

  FUNCTION fn_meta_af RETURN NUMBER IS
  BEGIN
    RETURN c_meta_af_pct;
  END fn_meta_af;

  -- ---------------------------------------------------------------------------
  -- LEMBRETES: entregas previstas para p_data (default amanha). Marca como
  -- LEMBRADA (na mesma transacao) e devolve a fila com a mensagem pronta
  -- para virar audio, como REF CURSOR (a API converte em JSON).
  -- ---------------------------------------------------------------------------
  PROCEDURE sp_gerar_lembretes(
    p_data      IN  DATE DEFAULT TRUNC(SYSDATE) + 1,
    p_lembretes OUT SYS_REFCURSOR
  ) IS
  BEGIN
    UPDATE entrega SET status = 'LEMBRADA'
     WHERE status = 'AGENDADA' AND TRUNC(dt_prevista) = TRUNC(p_data);

    OPEN p_lembretes FOR
      SELECT e.id_entrega, pr.id_produtor, u.telefone, u.nome AS nome_produtor,
             pd.nome AS produto, e.qtd_prevista AS qtd, pd.unidade, es.nome AS escola, e.dt_prevista,
             SUBSTR(u.nome, 1, INSTR(u.nome || ' ', ' ') - 1)
               || ', amanha tem entrega de ' || TO_CHAR(e.qtd_prevista, 'FM999G990D00', 'NLS_NUMERIC_CHARACTERS='',.''')
               || CASE pd.unidade WHEN 'KG' THEN ' quilos' WHEN 'UN' THEN ' unidades' WHEN 'MACO' THEN ' macos'
                                  WHEN 'DZ' THEN ' duzias' ELSE ' litros' END
               || ' de ' || LOWER(pd.nome) || ' na ' || es.nome || '. Esta tudo certo?' AS mensagem
        FROM entrega e
        JOIN item_proposta ip ON ip.id_item_proposta = e.id_item_proposta
        JOIN produtor pr      ON pr.id_produtor = ip.id_produtor
        JOIN usuario u        ON u.id_usuario = pr.id_usuario
        JOIN item_chamada ic  ON ic.id_item_chamada = ip.id_item_chamada
        JOIN produto pd       ON pd.id_produto = ic.id_produto
        JOIN escola es        ON es.id_escola = e.id_escola
       WHERE e.status = 'LEMBRADA' AND TRUNC(e.dt_prevista) = TRUNC(p_data)
       ORDER BY u.nome;
  END sp_gerar_lembretes;

  -- ---------------------------------------------------------------------------
  -- CONFIRMAR ENTREGA: status, qtd_atendida do item e compra AF do municipio.
  -- ---------------------------------------------------------------------------
  PROCEDURE sp_confirmar_entrega(
    p_id_entrega   IN entrega.id_entrega%TYPE,
    p_qtd_entregue IN NUMBER,
    p_observacao   IN VARCHAR2 DEFAULT NULL
  ) IS
    l_prevista   entrega.qtd_prevista%TYPE;
    l_status     entrega.status%TYPE;
    l_item_ch    item_chamada.id_item_chamada%TYPE;
    l_vl_unit    item_proposta.vl_unitario%TYPE;
    l_id_mun     municipio.id_municipio%TYPE;
    l_novo       entrega.status%TYPE;
  BEGIN
    SELECT e.qtd_prevista, e.status, ip.id_item_chamada, ip.vl_unitario, c.id_municipio
      INTO l_prevista, l_status, l_item_ch, l_vl_unit, l_id_mun
      FROM entrega e
      JOIN item_proposta ip ON ip.id_item_proposta = e.id_item_proposta
      JOIN proposta p       ON p.id_proposta = ip.id_proposta
      JOIN chamada c        ON c.id_chamada = p.id_chamada
     WHERE e.id_entrega = p_id_entrega FOR UPDATE OF e.status;

    IF l_status NOT IN ('AGENDADA','LEMBRADA') THEN
      RAISE_APPLICATION_ERROR(-20001, 'Entrega ' || p_id_entrega || ' ja foi encerrada.');
    END IF;

    l_novo := CASE WHEN p_qtd_entregue <= 0 THEN 'FALTOU'
                   WHEN p_qtd_entregue < l_prevista THEN 'PARCIAL'
                   ELSE 'ENTREGUE' END;

    UPDATE entrega
       SET status = l_novo, qtd_entregue = p_qtd_entregue, dt_realizada = SYSDATE,
           observacao = p_observacao
     WHERE id_entrega = p_id_entrega;

    UPDATE item_chamada SET qtd_atendida = qtd_atendida + GREATEST(p_qtd_entregue, 0)
     WHERE id_item_chamada = l_item_ch;

    UPDATE municipio SET vl_compra_af = vl_compra_af + GREATEST(p_qtd_entregue, 0) * l_vl_unit
     WHERE id_municipio = l_id_mun;

    IF l_novo = 'FALTOU' THEN
      UPDATE pagamento SET status = 'CANCELADO' WHERE id_entrega = p_id_entrega;
    ELSE
      UPDATE pagamento SET vl_bruto = ROUND(p_qtd_entregue * l_vl_unit, 2) WHERE id_entrega = p_id_entrega;
    END IF;
  END sp_confirmar_entrega;

END pkg_merendai;
/
SHOW ERRORS
