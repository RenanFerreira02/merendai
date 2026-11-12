/**
 * Teste do agente em modo regras, com o banco substituido por um dublê.
 * Cobre o fluxo da demo: oferta -> sim (mutirao) -> sim (envio).
 * Roda com: npm test  (node --test)
 */
import { test, before, mock } from 'node:test';
import assert from 'node:assert/strict';

delete process.env.ANTHROPIC_API_KEY;

// dublê de db.js antes de importar o agente
const oportunidade = {
  ID_ITEM_CHAMADA: 1, MUNICIPIO: 'Itapeva', PRODUTO: 'Mandioca', UNIDADE: 'KG', QTD_TOTAL: 2400,
  PERIODICIDADE: 'SEMANAL', VL_UNITARIO_REF: 4.2, COBERTURA: 0.35, RESUMO_SIMPLES: 'x',
};
const chamadas = [];
mock.module('../src/db.js', {
  namedExports: {
    oracledb: { BIND_OUT: 1, NUMBER: 2 },
    query: async (sql) => {
      if (sql.includes('vw_oportunidades_produtor')) return [oportunidade];
      if (sql.includes('participante_mutirao')) return [{ NOME: 'Joao Batista' }, { NOME: 'Rita Aparecida' }];
      if (sql.includes('vl_total')) return [{ VL_TOTAL: 10080 }];
      return [];
    },
    withConn: async (fn) => {
      const conn = { execute: async (sql) => { chamadas.push(sql); return { outBinds: { idp: 42, cob: 1 } }; } };
      return fn(conn);
    },
  },
});

let conversar;
before(async () => { ({ conversar } = await import('../src/agente.js')); });

const user = { nome: 'Marta de Oliveira', idProdutor: 1 };

test('oferece a melhor oportunidade e pede confirmacao', async () => {
  const r = await conversar({ user, mensagem: 'quero vender mandioca', contexto: {} });
  assert.equal(r.acao, 'OFERTA');
  assert.match(r.fala, /Marta/);
  assert.match(r.fala, /2\.400 quilos de mandioca/);
  assert.match(r.fala, /35 por cento/);
  assert.equal(r.contexto.etapa, 'OFERTA');
});

test('"sim" monta o mutirao via sp_montar_mutirao e nomeia os vizinhos', async () => {
  const r = await conversar({ user, mensagem: 'sim, pode', contexto: { etapa: 'OFERTA', idItemChamada: 1 } });
  assert.equal(r.acao, 'PROPOSTA_MONTADA');
  assert.ok(chamadas.some((s) => s.includes('sp_montar_mutirao')));
  assert.match(r.fala, /Joao e Rita/);
  assert.equal(r.contexto.etapa, 'ENVIO');
  assert.equal(r.contexto.idProposta, 42);
});

test('"sim" na etapa de envio chama sp_enviar_proposta e fala o valor', async () => {
  const r = await conversar({ user, mensagem: 'manda', contexto: { etapa: 'ENVIO', idProposta: 42 } });
  assert.equal(r.acao, 'PROPOSTA_ENVIADA');
  assert.ok(chamadas.some((s) => s.includes('sp_enviar_proposta')));
  assert.match(r.fala, /10\.080/);
});

test('"agora nao" encerra sem executar acao', async () => {
  const antes = chamadas.length;
  const r = await conversar({ user, mensagem: 'agora nao', contexto: { etapa: 'OFERTA', idItemChamada: 1 } });
  assert.equal(r.acao, null);
  assert.equal(chamadas.length, antes);
});

test('nao atende quem nao e produtor', async () => {
  const r = await conversar({ user: { nome: 'Carlos', idTecnico: 1 }, mensagem: 'oi', contexto: {} });
  assert.equal(r.acao, null);
});
