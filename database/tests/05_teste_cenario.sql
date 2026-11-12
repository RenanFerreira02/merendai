-- =============================================================================
-- MERENDAI - Teste de cenario ponta a ponta (roda apos o seed)
-- Cenario da demo: Marta quer vender mandioca para Itapeva, nao tem volume,
-- o banco monta um mutirao com Joao e Rita, a proposta e enviada, contratada,
-- entregas sao agendadas, lembretes gerados e uma entrega confirmada.
-- Cada passo imprime o resultado esperado. Falha = RAISE.
-- =============================================================================
SET SERVEROUTPUT ON SIZE UNLIMITED;

DECLARE
  l_id_proposta   NUMBER;
  l_cobertura     NUMBER;
  l_n             NUMBER;
  l_tipo          VARCHAR2(10);
  l_status        VARCHAR2(12);
  l_pct_antes     NUMBER;
  l_pct_depois    NUMBER;
  l_hist          NUMBER;
  l_lembretes     NUMBER := 0;
  l_item_mandioca NUMBER;
  l_id_entrega    NUMBER;

  PROCEDURE ok(p_msg VARCHAR2) IS BEGIN DBMS_OUTPUT.PUT_LINE('[OK] ' || p_msg); END;
  PROCEDURE assert(p_cond BOOLEAN, p_msg VARCHAR2) IS
  BEGIN
    IF NOT p_cond THEN RAISE_APPLICATION_ERROR(-20999, '[FALHA] ' || p_msg); END IF;
    ok(p_msg);
  END;
BEGIN
  DBMS_OUTPUT.PUT_LINE('=== Merendai: teste de cenario ===');

  -- 1. Matching gerou prospects para a mandioca de Itapeva (Marta, Joao, Rita; Jose fora por CAF vencido)
  SELECT id_item_chamada INTO l_item_mandioca FROM item_chamada WHERE id_chamada = 1 AND id_produto = 1;
  SELECT COUNT(*) INTO l_n FROM prospect WHERE id_item_chamada = l_item_mandioca;
  assert(l_n = 3, 'Matching: 3 prospects para mandioca (Marta, Joao, Rita). Encontrados: ' || l_n);
  SELECT COUNT(*) INTO l_n FROM prospect ps JOIN produtor p ON p.id_produtor = ps.id_produtor
   WHERE ps.id_item_chamada = l_item_mandioca AND p.numero_caf = 'SP2301006';
  assert(l_n = 0, 'Matching: Jose (CAF vencido) nao entra');

  -- 2. Resumo em audio da chamada
  DBMS_OUTPUT.PUT_LINE('Audio: ' || pkg_merendai.fn_resumo_chamada_audio(1));

  -- 3. Marta sozinha cobre 40*20/2400 = 33%. Mutirao deve puxar Joao e Rita.
  pkg_merendai.sp_montar_mutirao(l_item_mandioca, 1, l_id_proposta, l_cobertura);
  SELECT tipo INTO l_tipo FROM proposta WHERE id_proposta = l_id_proposta;
  SELECT COUNT(*) INTO l_n FROM participante_mutirao WHERE id_proposta = l_id_proposta;
  assert(l_tipo = 'MUTIRAO', 'Proposta criada como MUTIRAO (id ' || l_id_proposta || ')');
  assert(l_n = 3, 'Mutirao com 3 participantes. Encontrados: ' || l_n);
  -- 40+60+30 = 130 kg/sem * 20 sem = 2600 >= 2400 -> cobertura 100%
  assert(l_cobertura = 1, 'Cobertura do mutirao = 100%. Obtida: ' || l_cobertura);

  -- 4. Enviar proposta (tecnico Carlos revisa)
  pkg_merendai.sp_enviar_proposta(l_id_proposta, 1);
  SELECT status INTO l_status FROM proposta WHERE id_proposta = l_id_proposta;
  assert(l_status = 'ENVIADA', 'Proposta ENVIADA com vl_total calculado');
  SELECT COUNT(*) INTO l_n FROM prospect WHERE id_item_chamada = l_item_mandioca AND status = 'ACEITO';
  assert(l_n = 3, 'Prospects dos participantes marcados como ACEITO');

  -- 5. Transicao invalida deve ser bloqueada pela trigger
  BEGIN
    UPDATE proposta SET status = 'RASCUNHO' WHERE id_proposta = l_id_proposta;
    RAISE_APPLICATION_ERROR(-20999, '[FALHA] Trigger deveria bloquear ENVIADA -> RASCUNHO');
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLCODE = -20010 THEN ok('Trigger bloqueou ENVIADA -> RASCUNHO');
      ELSE RAISE; END IF;
  END;

  -- 6. Contratar: agenda 20 entregas semanais por participante + pagamentos
  l_pct_antes := pkg_merendai.fn_percentual_af(1);
  pkg_merendai.sp_contratar_proposta(l_id_proposta, 1);
  SELECT COUNT(*) INTO l_n FROM entrega e JOIN item_proposta ip ON ip.id_item_proposta = e.id_item_proposta
   WHERE ip.id_proposta = l_id_proposta;
  assert(l_n = 63, 'Entregas agendadas: 21 semanas x 3 produtores = 63. Encontradas: ' || l_n);
  SELECT COUNT(*) INTO l_n FROM pagamento pg JOIN entrega e ON e.id_entrega = pg.id_entrega
    JOIN item_proposta ip ON ip.id_item_proposta = e.id_item_proposta WHERE ip.id_proposta = l_id_proposta;
  assert(l_n = 63, 'Um pagamento PREVISTO por entrega');

  -- 7. Indicacao da Marta para Rita virou CONVERTIDO (Rita fechou a primeira venda)
  SELECT status INTO l_status FROM indicacao WHERE id_produtor_indicado = 3;
  assert(l_status = 'CONVERTIDO', 'Indicacao Marta -> Rita CONVERTIDA (bonus de embaixador)');

  -- 8. Lembretes para a primeira data de entrega (ref cursor)
  DECLARE
    l_cur  SYS_REFCURSOR;
    l_id   NUMBER; l_idp NUMBER; l_tel VARCHAR2(20); l_nome VARCHAR2(120); l_prod VARCHAR2(80);
    l_qtd  NUMBER; l_un VARCHAR2(5); l_esc VARCHAR2(150); l_dt DATE; l_msg VARCHAR2(4000);
  BEGIN
    pkg_merendai.sp_gerar_lembretes(DATE '2027-02-08', l_cur);
    LOOP
      FETCH l_cur INTO l_id, l_idp, l_tel, l_nome, l_prod, l_qtd, l_un, l_esc, l_dt, l_msg;
      EXIT WHEN l_cur%NOTFOUND;
      l_lembretes := l_lembretes + 1;
      IF l_lembretes = 1 THEN DBMS_OUTPUT.PUT_LINE('Lembrete: ' || l_msg); END IF;
    END LOOP;
    CLOSE l_cur;
  END;
  assert(l_lembretes = 3, 'Lembretes gerados para 08/02/2027: 3. Obtidos: ' || l_lembretes);
  SELECT COUNT(*) INTO l_n FROM entrega WHERE dt_prevista = DATE '2027-02-08' AND status = 'LEMBRADA';
  assert(l_n = 3, 'Entregas marcadas como LEMBRADA');

  -- 9. Confirmar uma entrega: qtd_atendida e compra AF do municipio sobem
  SELECT MIN(e.id_entrega) INTO l_id_entrega FROM entrega e JOIN item_proposta ip ON ip.id_item_proposta = e.id_item_proposta
   WHERE ip.id_proposta = l_id_proposta AND e.dt_prevista = DATE '2027-02-08';
  pkg_merendai.sp_confirmar_entrega(l_id_entrega, 40, 'Entregue na cozinha, conferido pela merendeira');
  l_pct_depois := pkg_merendai.fn_percentual_af(1);
  assert(l_pct_depois > l_pct_antes, 'Percentual AF de Itapeva subiu: ' || l_pct_antes || '% -> ' || l_pct_depois || '%');

  -- 10. Historico append-only registrou tudo
  SELECT COUNT(*) INTO l_hist FROM historico_status WHERE entidade = 'PROPOSTA' AND id_registro = l_id_proposta;
  assert(l_hist = 3, 'Historico da proposta: RASCUNHO, ENVIADA, CONTRATADA (3 eventos). Obtidos: ' || l_hist);

  -- 11. Indicadores do municipio
  FOR r IN (SELECT * FROM vw_indicadores_municipio ORDER BY id_municipio) LOOP
    DBMS_OUTPUT.PUT_LINE('Indicador ' || RPAD(r.nome, 12) || ' AF=' || r.pct_af || '% meta=' || r.meta_pct
      || '% falta=R$' || r.vl_faltante_meta || ' produtores=' || r.produtores_cadastrados
      || ' vendendo=' || r.produtores_vendendo || ' mutiroes=' || r.mutiroes_contratados);
  END LOOP;

  DBMS_OUTPUT.PUT_LINE('=== Todos os testes passaram ===');
  ROLLBACK;  -- deixa o seed limpo para a demo
END;
/
