/**
 * routes.js - Endpoints REST do Merendai.
 * A regra de negocio mora no banco (pkg_merendai); aqui so validamos entrada,
 * chamamos a rotina certa e moldamos a saida para o app.
 */
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { withConn, query, oracledb, toHttpError } from './db.js';
import { conversar } from './agente.js';

const r = Router();

// ---------------------------------------------------------------- auth
const LoginSchema = z.object({ telefone: z.string().min(8), senha: z.string().min(4) });

r.post('/auth/login', async (req, res, next) => {
  try {
    const { telefone, senha } = LoginSchema.parse(req.body);
    const [u] = await query(
      `SELECT u.id_usuario, u.nome, u.perfil, u.senha_hash,
              p.id_produtor, p.embaixador, p.id_municipio AS mun_produtor,
              t.id_tecnico, t.id_municipio AS mun_tecnico
         FROM usuario u
         LEFT JOIN produtor p ON p.id_usuario = u.id_usuario
         LEFT JOIN tecnico  t ON t.id_usuario = u.id_usuario
        WHERE u.telefone = :telefone AND u.ativo = 'S'`,
      { telefone });
    if (!u || !(await bcrypt.compare(senha, u.SENHA_HASH))) {
      return res.status(401).json({ erro: 'Telefone ou senha invalidos' });
    }
    const user = {
      id: u.ID_USUARIO, nome: u.NOME, perfil: u.PERFIL,
      idProdutor: u.ID_PRODUTOR, embaixador: u.EMBAIXADOR === 'S',
      idTecnico: u.ID_TECNICO, idMunicipio: u.MUN_PRODUTOR ?? u.MUN_TECNICO,
    };
    const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user });
  } catch (e) { next(e); }
});

export function auth(req, res, next) {
  const h = req.headers.authorization || '';
  try {
    req.user = jwt.verify(h.replace('Bearer ', ''), process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ erro: 'Nao autenticado' });
  }
}

// ---------------------------------------------------------------- F1: oportunidades
r.get('/produtores/:id/oportunidades', auth, async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT * FROM vw_oportunidades_produtor
        WHERE id_produtor = :id AND status_prospect IN ('NOVO','NOTIFICADO','ACEITO')
        ORDER BY score DESC`,
      { id: Number(req.params.id) });
    // marca como NOTIFICADO ao listar (o produtor "ouviu")
    await withConn((c) => c.execute(
      `UPDATE prospect SET status = 'NOTIFICADO' WHERE id_produtor = :id AND status = 'NOVO'`,
      { id: Number(req.params.id) }));
    res.json(rows.map(mapOportunidade));
  } catch (e) { next(e); }
});

r.get('/chamadas/:id/audio', auth, async (req, res, next) => {
  try {
    const [row] = await query(
      `SELECT pkg_merendai.fn_resumo_chamada_audio(:id) AS texto FROM dual`,
      { id: Number(req.params.id) });
    res.json({ texto: row.TEXTO });
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------- F2: proposta e mutirao
const MutiraoSchema = z.object({ idItemChamada: z.number(), idProdutorLider: z.number() });

r.post('/propostas/mutirao', auth, async (req, res, next) => {
  try {
    const { idItemChamada, idProdutorLider } = MutiraoSchema.parse(req.body);
    const out = await withConn(async (c) => {
      const rs = await c.execute(
        `BEGIN pkg_merendai.sp_montar_mutirao(:item, :lider, :idp, :cob); END;`,
        {
          item: idItemChamada, lider: idProdutorLider,
          idp: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
          cob: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
        });
      return rs.outBinds;
    });
    const proposta = await carregarProposta(out.idp);
    res.status(201).json({ ...proposta, cobertura: out.cob });
  } catch (e) { next(toHttpError(e)); }
});

r.get('/propostas/:id', auth, async (req, res, next) => {
  try { res.json(await carregarProposta(Number(req.params.id))); } catch (e) { next(e); }
});

r.post('/propostas/:id/enviar', auth, async (req, res, next) => {
  try {
    await withConn((c) => c.execute(
      `BEGIN pkg_merendai.sp_enviar_proposta(:id, :tec); END;`,
      { id: Number(req.params.id), tec: req.user.idTecnico ?? null }));
    res.json(await carregarProposta(Number(req.params.id)));
  } catch (e) { next(toHttpError(e)); }
});

r.post('/propostas/:id/contratar', auth, async (req, res, next) => {
  try {
    if (req.user.perfil === 'PRODUTOR') return res.status(403).json({ erro: 'Somente tecnico ou gestor' });
    await withConn((c) => c.execute(
      `BEGIN pkg_merendai.sp_contratar_proposta(:id, :escola); END;`,
      { id: Number(req.params.id), escola: Number(req.body.idEscola) }));
    res.json(await carregarProposta(Number(req.params.id)));
  } catch (e) { next(toHttpError(e)); }
});

r.post('/propostas/:id/participantes/:idProdutor/confirmar', auth, async (req, res, next) => {
  try {
    await withConn((c) => c.execute(
      `UPDATE participante_mutirao SET confirmado = 'S' WHERE id_proposta = :p AND id_produtor = :pr`,
      { p: Number(req.params.id), pr: Number(req.params.idProdutor) }));
    res.json(await carregarProposta(Number(req.params.id)));
  } catch (e) { next(e); }
});

// Agente de voz: recebe o texto transcrito e devolve fala + acao executada
r.post('/agente/conversar', auth, async (req, res, next) => {
  try {
    const resposta = await conversar({ user: req.user, mensagem: req.body.mensagem, contexto: req.body.contexto });
    res.json(resposta);
  } catch (e) { next(toHttpError(e)); }
});

// ---------------------------------------------------------------- F3: entregas e pagamentos
r.get('/produtores/:id/entregas', auth, async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT e.id_entrega, e.dt_prevista, e.dt_realizada, e.qtd_prevista, e.qtd_entregue, e.status,
              pd.nome AS produto, pd.unidade, es.nome AS escola, es.latitude, es.longitude,
              pg.vl_bruto, pg.status AS status_pagamento, pg.dt_prevista AS dt_pagamento_prevista, pg.dt_pagamento
         FROM entrega e
         JOIN item_proposta ip ON ip.id_item_proposta = e.id_item_proposta
         JOIN item_chamada ic  ON ic.id_item_chamada = ip.id_item_chamada
         JOIN produto pd       ON pd.id_produto = ic.id_produto
         JOIN escola es        ON es.id_escola = e.id_escola
         LEFT JOIN pagamento pg ON pg.id_entrega = e.id_entrega
        WHERE ip.id_produtor = :id
        ORDER BY e.dt_prevista`,
      { id: Number(req.params.id) });
    res.json(rows.map((x) => ({
      id: x.ID_ENTREGA, dtPrevista: x.DT_PREVISTA, dtRealizada: x.DT_REALIZADA,
      qtdPrevista: x.QTD_PREVISTA, qtdEntregue: x.QTD_ENTREGUE, status: x.STATUS,
      produto: x.PRODUTO, unidade: x.UNIDADE,
      escola: { nome: x.ESCOLA, latitude: x.LATITUDE, longitude: x.LONGITUDE },
      pagamento: x.VL_BRUTO == null ? null : {
        valor: x.VL_BRUTO, status: x.STATUS_PAGAMENTO, dtPrevista: x.DT_PAGAMENTO_PREVISTA, dtPagamento: x.DT_PAGAMENTO,
      },
    })));
  } catch (e) { next(e); }
});

r.post('/entregas/:id/confirmar', auth, async (req, res, next) => {
  try {
    await withConn((c) => c.execute(
      `BEGIN pkg_merendai.sp_confirmar_entrega(:id, :qtd, :obs); END;`,
      { id: Number(req.params.id), qtd: Number(req.body.qtdEntregue), obs: req.body.observacao ?? null }));
    res.json({ ok: true });
  } catch (e) { next(toHttpError(e)); }
});

r.get('/lembretes', auth, async (req, res, next) => {
  try {
    const data = req.query.data ? new Date(String(req.query.data)) : null;
    const rows = await withConn(async (c) => {
      const rs = await c.execute(
        data ? `BEGIN pkg_merendai.sp_gerar_lembretes(:d, :cur); END;`
             : `BEGIN pkg_merendai.sp_gerar_lembretes(p_lembretes => :cur); END;`,
        { ...(data ? { d: data } : {}), cur: { dir: oracledb.BIND_OUT, type: oracledb.CURSOR } });
      const cursor = rs.outBinds.cur;
      const out = await cursor.getRows(500);   // fila diaria; 500 e teto generoso
      await cursor.close();
      return out;
    });
    res.json(rows.map((x) => ({
      idEntrega: x.ID_ENTREGA, idProdutor: x.ID_PRODUTOR, telefone: x.TELEFONE,
      produtor: x.NOME_PRODUTOR, mensagem: x.MENSAGEM, dtPrevista: x.DT_PREVISTA,
    })));
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------- F4: painel do tecnico
r.get('/tecnicos/:id/painel', auth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [produtores, [tec], indicadores] = await Promise.all([
      query(`SELECT * FROM vw_painel_tecnico WHERE id_tecnico = :id ORDER BY prospects_abertos DESC, produtor`, { id }),
      query(`SELECT id_municipio FROM tecnico WHERE id_tecnico = :id`, { id }),
      query(`SELECT * FROM vw_indicadores_municipio ORDER BY nome`),
    ]);
    res.json({
      municipio: indicadores.map(mapIndicador).find((m) => m.id === tec?.ID_MUNICIPIO) ?? null,
      regiao: indicadores.map(mapIndicador),
      produtores: produtores.map((p) => ({
        id: p.ID_PRODUTOR, nome: p.PRODUTOR, telefone: p.TELEFONE, embaixador: p.EMBAIXADOR === 'S',
        caf: p.NUMERO_CAF, situacaoCaf: p.NUMERO_CAF ? p.SITUACAO_CAF : 'SEM_CAF',
        prospectsAbertos: p.PROSPECTS_ABERTOS, contratos: p.CONTRATOS, vlRecebido: p.VL_RECEBIDO,
        latitude: p.LATITUDE, longitude: p.LONGITUDE,
      })),
    });
  } catch (e) { next(e); }
});

r.get('/tecnicos/:id/propostas', auth, async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT p.id_proposta, p.tipo, p.status, p.vl_total, p.dt_envio, u.nome AS lider, c.numero_edital, m.nome AS municipio
         FROM proposta p
         JOIN produtor pr ON pr.id_produtor = p.id_produtor_lider
         JOIN usuario u   ON u.id_usuario = pr.id_usuario
         JOIN chamada c   ON c.id_chamada = p.id_chamada
         JOIN municipio m ON m.id_municipio = c.id_municipio
        WHERE pr.id_tecnico = :id
        ORDER BY p.dt_criacao DESC`,
      { id: Number(req.params.id) });
    res.json(rows.map((x) => ({
      id: x.ID_PROPOSTA, tipo: x.TIPO, status: x.STATUS, valor: x.VL_TOTAL, dtEnvio: x.DT_ENVIO,
      lider: x.LIDER, edital: x.NUMERO_EDITAL, municipio: x.MUNICIPIO,
    })));
  } catch (e) { next(e); }
});

const ProdutorSchema = z.object({
  nome: z.string().min(3), telefone: z.string().min(8), numeroCaf: z.string().optional(),
  cafValidoAte: z.string().optional(), latitude: z.number(), longitude: z.number(),
  raioEntregaKm: z.number().default(30), idMunicipio: z.number(),
  producao: z.array(z.object({ idProduto: z.number(), qtdSemanal: z.number().positive(), organico: z.boolean().default(false) })).min(1),
  idEmbaixador: z.number().optional(),
});

r.post('/tecnicos/:id/produtores', auth, async (req, res, next) => {
  try {
    const d = ProdutorSchema.parse(req.body);
    const hash = await bcrypt.hash('merendai123', 10);  // senha inicial; o produtor troca por voz no 1o acesso
    const idProdutor = await withConn(async (c) => {
      const u = await c.execute(
        `INSERT INTO usuario (nome, telefone, senha_hash, perfil) VALUES (:n, :t, :h, 'PRODUTOR') RETURNING id_usuario INTO :id`,
        { n: d.nome, t: d.telefone, h: hash, id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER } });
      const p = await c.execute(
        `INSERT INTO produtor (id_usuario, id_municipio, id_tecnico, numero_caf, caf_valido_ate, latitude, longitude, raio_entrega_km)
         VALUES (:u, :m, :t, :caf, :val, :lat, :lon, :raio) RETURNING id_produtor INTO :id`,
        { u: u.outBinds.id[0], m: d.idMunicipio, t: Number(req.params.id), caf: d.numeroCaf ?? null,
          val: d.cafValidoAte ? new Date(d.cafValidoAte) : null, lat: d.latitude, lon: d.longitude, raio: d.raioEntregaKm,
          id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER } });
      const idp = p.outBinds.id[0];
      await c.executeMany(
        `INSERT INTO producao (id_produtor, id_produto, qtd_semanal, organico) VALUES (:p, :prod, :q, :o)`,
        d.producao.map((x) => ({ p: idp, prod: x.idProduto, q: x.qtdSemanal, o: x.organico ? 'S' : 'N' })));
      if (d.idEmbaixador) {
        await c.execute(`INSERT INTO indicacao (id_produtor_embaixador, id_produtor_indicado, status) VALUES (:e, :i, 'CADASTRADO')`,
          { e: d.idEmbaixador, i: idp });
      }
      // gera prospects nas chamadas abertas do municipio para o novo produtor ja aparecer no painel
      await c.execute(
        `BEGIN FOR ch IN (SELECT id_chamada FROM chamada WHERE status = 'ABERTA') LOOP
                 DECLARE n NUMBER; BEGIN pkg_merendai.sp_gerar_prospects(ch.id_chamada, n); END;
               END LOOP; END;`);
      return idp;
    });
    res.status(201).json({ idProdutor });
  } catch (e) { next(toHttpError(e)); }
});

r.get('/catalogo', auth, async (_req, res, next) => {
  try {
    const [produtos, municipios, escolas] = await Promise.all([
      query(`SELECT id_produto, nome, unidade, categoria FROM produto ORDER BY nome`),
      query(`SELECT id_municipio, nome, uf FROM municipio ORDER BY nome`),
      query(`SELECT id_escola, id_municipio, nome FROM escola ORDER BY nome`),
    ]);
    res.json({
      produtos: produtos.map((p) => ({ id: p.ID_PRODUTO, nome: p.NOME, unidade: p.UNIDADE, categoria: p.CATEGORIA })),
      municipios: municipios.map((m) => ({ id: m.ID_MUNICIPIO, nome: m.NOME, uf: m.UF })),
      escolas: escolas.map((e) => ({ id: e.ID_ESCOLA, idMunicipio: e.ID_MUNICIPIO, nome: e.NOME })),
    });
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------- helpers
async function carregarProposta(id) {
  const [[p], itens, parts, hist] = await Promise.all([
    query(`SELECT p.*, c.numero_edital, m.nome AS municipio, u.nome AS lider
             FROM proposta p JOIN chamada c ON c.id_chamada = p.id_chamada
             JOIN municipio m ON m.id_municipio = c.id_municipio
             JOIN produtor pr ON pr.id_produtor = p.id_produtor_lider
             JOIN usuario u ON u.id_usuario = pr.id_usuario
            WHERE p.id_proposta = :id`, { id }),
    query(`SELECT ip.*, pd.nome AS produto, pd.unidade, u.nome AS produtor
             FROM item_proposta ip JOIN item_chamada ic ON ic.id_item_chamada = ip.id_item_chamada
             JOIN produto pd ON pd.id_produto = ic.id_produto
             JOIN produtor pr ON pr.id_produtor = ip.id_produtor JOIN usuario u ON u.id_usuario = pr.id_usuario
            WHERE ip.id_proposta = :id`, { id }),
    query(`SELECT pm.*, u.nome, pr.embaixador FROM participante_mutirao pm
             JOIN produtor pr ON pr.id_produtor = pm.id_produtor JOIN usuario u ON u.id_usuario = pr.id_usuario
            WHERE pm.id_proposta = :id`, { id }),
    query(`SELECT status_de, status_para, dt_evento FROM historico_status
            WHERE entidade = 'PROPOSTA' AND id_registro = :id ORDER BY dt_evento`, { id }),
  ]);
  if (!p) { const e = new Error('Proposta nao encontrada'); e.status = 404; throw e; }
  return {
    id: p.ID_PROPOSTA, tipo: p.TIPO, status: p.STATUS, valorTotal: p.VL_TOTAL, dtEnvio: p.DT_ENVIO,
    edital: p.NUMERO_EDITAL, municipio: p.MUNICIPIO, lider: p.LIDER, idLider: p.ID_PRODUTOR_LIDER,
    itens: itens.map((i) => ({
      id: i.ID_ITEM_PROPOSTA, idProdutor: i.ID_PRODUTOR, produtor: i.PRODUTOR, produto: i.PRODUTO,
      unidade: i.UNIDADE, qtd: i.QTD_OFERTADA, vlUnitario: i.VL_UNITARIO, subtotal: i.QTD_OFERTADA * i.VL_UNITARIO,
    })),
    participantes: parts.map((x) => ({ idProdutor: x.ID_PRODUTOR, nome: x.NOME, confirmado: x.CONFIRMADO === 'S', embaixador: x.EMBAIXADOR === 'S' })),
    historico: hist.map((h) => ({ de: h.STATUS_DE, para: h.STATUS_PARA, em: h.DT_EVENTO })),
  };
}

function mapOportunidade(x) {
  return {
    idProspect: x.ID_PROSPECT, idChamada: x.ID_CHAMADA, idItemChamada: x.ID_ITEM_CHAMADA,
    municipio: x.MUNICIPIO, produto: x.PRODUTO, unidade: x.UNIDADE,
    qtdTotal: x.QTD_TOTAL, qtdAtendida: x.QTD_ATENDIDA, periodicidade: x.PERIODICIDADE,
    vlUnitario: x.VL_UNITARIO_REF, distanciaKm: x.DISTANCIA_KM, cobertura: x.COBERTURA, score: x.SCORE,
    status: x.STATUS_PROSPECT, dtLimite: x.DT_LIMITE, dtInicioEntrega: x.DT_INICIO_ENTREGA,
    dtFimEntrega: x.DT_FIM_ENTREGA, resumoAudio: x.RESUMO_SIMPLES,
  };
}

function mapIndicador(m) {
  return {
    id: m.ID_MUNICIPIO, nome: m.NOME, uf: m.UF, repasse: m.VL_REPASSE_FNDE, compraAf: m.VL_COMPRA_AF,
    pctAf: m.PCT_AF, meta: m.META_PCT, faltante: m.VL_FALTANTE_META,
    produtoresCadastrados: m.PRODUTORES_CADASTRADOS, produtoresVendendo: m.PRODUTORES_VENDENDO,
    chamadasAbertas: m.CHAMADAS_ABERTAS, mutiroes: m.MUTIROES_CONTRATADOS,
  };
}

export default r;
