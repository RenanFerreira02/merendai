/**
 * agente.js - O agente Merendai.
 *
 * Recebe o texto ja transcrito (o reconhecimento de fala roda no celular) e
 * devolve { fala, acao, dados }. `fala` e o que o app le em voz alta.
 *
 * Duas implementacoes, mesma interface:
 *  - modo LLM (ANTHROPIC_API_KEY definida): Claude com tool use. As ferramentas
 *    chamam as rotinas PL/SQL; o modelo so conversa e decide qual chamar.
 *  - modo regras (sem chave): maquina de estados simples que cobre o fluxo
 *    da demo (ouvir oportunidade -> aceitar -> mutirao -> enviar). Garante
 *    que o app funciona mesmo sem internet para a API externa.
 *
 * O prompt e as regras foram escritos para o publico: frases curtas,
 * sem jargao, sempre confirmando o que entendeu antes de agir.
 */
import Anthropic from '@anthropic-ai/sdk';
import { withConn, query, oracledb } from './db.js';

const SYSTEM = `Voce e o Merendai, um assistente por voz para agricultores familiares venderem para a merenda escolar (PNAE).
Fale em portugues do Brasil, simples, frases curtas, sem siglas (diga "cadastro de agricultor familiar", nao "CAF").
Trate a pessoa pelo primeiro nome. Nunca peca senha, dados bancarios ou pagamento.
Antes de executar uma acao (aceitar oportunidade, montar mutirao, enviar proposta), repita o que entendeu e peca confirmacao.
Quando faltar volume, explique o mutirao como "juntar com vizinhos para fechar a quantidade".
Respostas com no maximo 3 frases, porque serao lidas em voz alta.`;

const tools = [
  { name: 'listar_oportunidades', description: 'Lista as chamadas publicas da regiao compativeis com o que o produtor planta.',
    input_schema: { type: 'object', properties: {}, required: [] } },
  { name: 'montar_proposta', description: 'Monta a proposta (projeto de venda) para um item da chamada. Se faltar volume, o banco junta vizinhos (mutirao).',
    input_schema: { type: 'object', properties: { idItemChamada: { type: 'number' } }, required: ['idItemChamada'] } },
  { name: 'enviar_proposta', description: 'Envia a proposta em rascunho para analise do tecnico e da prefeitura.',
    input_schema: { type: 'object', properties: { idProposta: { type: 'number' } }, required: ['idProposta'] } },
  { name: 'proximas_entregas', description: 'Lista as proximas entregas e a situacao dos pagamentos do produtor.',
    input_schema: { type: 'object', properties: {}, required: [] } },
];

// ---------------------------------------------------------------- ferramentas (compartilhadas pelos dois modos)
async function listarOportunidades(idProdutor) {
  const rows = await query(
    `SELECT id_item_chamada, municipio, produto, unidade, qtd_total, periodicidade, vl_unitario_ref, cobertura, resumo_simples
       FROM vw_oportunidades_produtor WHERE id_produtor = :id AND status_prospect <> 'RECUSADO' ORDER BY score DESC FETCH FIRST 3 ROWS ONLY`,
    { id: idProdutor });
  return rows.map((x) => ({
    idItemChamada: x.ID_ITEM_CHAMADA, municipio: x.MUNICIPIO, produto: x.PRODUTO, unidade: x.UNIDADE,
    qtdTotal: x.QTD_TOTAL, periodicidade: x.PERIODICIDADE, vlUnitario: x.VL_UNITARIO_REF, cobertura: x.COBERTURA,
  }));
}

async function montarProposta(idItemChamada, idProdutor) {
  const out = await withConn(async (c) => (await c.execute(
    `BEGIN pkg_merendai.sp_montar_mutirao(:item, :lider, :idp, :cob); END;`,
    { item: idItemChamada, lider: idProdutor,
      idp: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }, cob: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER } })).outBinds);
  const parts = await query(
    `SELECT u.nome FROM participante_mutirao pm JOIN produtor p ON p.id_produtor = pm.id_produtor
       JOIN usuario u ON u.id_usuario = p.id_usuario WHERE pm.id_proposta = :id AND pm.id_produtor <> :lider`,
    { id: out.idp, lider: idProdutor });
  return { idProposta: out.idp, cobertura: out.cob, vizinhos: parts.map((p) => p.NOME.split(' ')[0]) };
}

async function enviarProposta(idProposta) {
  await withConn((c) => c.execute(`BEGIN pkg_merendai.sp_enviar_proposta(:id); END;`, { id: idProposta }));
  const [p] = await query(`SELECT vl_total FROM proposta WHERE id_proposta = :id`, { id: idProposta });
  return { idProposta, valorTotal: p.VL_TOTAL };
}

async function proximasEntregas(idProdutor) {
  const rows = await query(
    `SELECT e.dt_prevista, e.qtd_prevista, pd.nome AS produto, pd.unidade, es.nome AS escola, pg.status AS pagto
       FROM entrega e JOIN item_proposta ip ON ip.id_item_proposta = e.id_item_proposta
       JOIN item_chamada ic ON ic.id_item_chamada = ip.id_item_chamada JOIN produto pd ON pd.id_produto = ic.id_produto
       JOIN escola es ON es.id_escola = e.id_escola LEFT JOIN pagamento pg ON pg.id_entrega = e.id_entrega
      WHERE ip.id_produtor = :id AND e.status IN ('AGENDADA','LEMBRADA') ORDER BY e.dt_prevista FETCH FIRST 3 ROWS ONLY`,
    { id: idProdutor });
  return rows.map((x) => ({ data: x.DT_PREVISTA, qtd: x.QTD_PREVISTA, produto: x.PRODUTO, unidade: x.UNIDADE, escola: x.ESCOLA, pagamento: x.PAGTO }));
}

async function executar(nome, input, user) {
  switch (nome) {
    case 'listar_oportunidades': return listarOportunidades(user.idProdutor);
    case 'montar_proposta':      return montarProposta(input.idItemChamada, user.idProdutor);
    case 'enviar_proposta':      return enviarProposta(input.idProposta);
    case 'proximas_entregas':    return proximasEntregas(user.idProdutor);
    default: throw new Error('Ferramenta desconhecida: ' + nome);
  }
}

// ---------------------------------------------------------------- frases compartilhadas
const un = (u, q) => `${fmt(q)} ${({ KG: 'quilos', UN: 'unidades', MACO: 'macos', DZ: 'duzias', L: 'litros' })[u]}`;
const per = (p) => ({ SEMANAL: 'por semana', QUINZENAL: 'a cada quinze dias', MENSAL: 'por mes' })[p];
const fmt = (n) => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
const reais = (n) => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const primeiroNome = (n) => (n || '').split(' ')[0];

function falaOportunidade(nome, o) {
  const pct = Math.round(o.cobertura * 100);
  const base = `${nome}, a prefeitura de ${o.municipio} quer comprar ${un(o.unidade, o.qtdTotal)} de ${o.produto.toLowerCase()}, ${per(o.periodicidade)}, pagando ${reais(o.vlUnitario)} cada.`;
  const sobre = pct >= 100
    ? ' Voce consegue entregar tudo sozinha. Quer que eu monte a proposta?'
    : ` Sozinha voce cobre uns ${pct} por cento. Posso juntar com vizinhos para fechar a quantidade. Quer que eu monte?`;
  return base + sobre;
}

// ---------------------------------------------------------------- modo regras
async function conversarRegras({ user, mensagem, contexto = {} }) {
  const nome = primeiroNome(user.nome);
  const m = (mensagem || '').toLowerCase();
  const sim = /\b(sim|pode|quero|bora|manda|fecha|confirmo|isso|claro|ta bom|tá bom|ok)\b/.test(m);
  const nao = /\b(nao|não|agora nao|depois|deixa)\b/.test(m);

  // etapa 2: usuario respondeu a uma oportunidade oferecida
  if (contexto.etapa === 'OFERTA' && contexto.idItemChamada) {
    if (sim) {
      const r = await montarProposta(contexto.idItemChamada, user.idProdutor);
      const fala = r.vizinhos.length
        ? `Pronto. Juntei voce com ${r.vizinhos.join(' e ')}, e assim fecham ${Math.round(r.cobertura * 100)} por cento da quantidade. Quer que eu envie a proposta para o tecnico Carlos revisar?`
        : `Pronto, montei a proposta so com a sua producao. Quer que eu envie para o tecnico revisar?`;
      return { fala, acao: 'PROPOSTA_MONTADA', dados: r, contexto: { etapa: 'ENVIO', idProposta: r.idProposta } };
    }
    if (nao) return { fala: `Tudo bem, ${nome}. Fica guardada. Quando quiser, e so me chamar.`, acao: null, contexto: {} };
  }

  // etapa 3: confirmar envio
  if (contexto.etapa === 'ENVIO' && contexto.idProposta) {
    if (sim) {
      const r = await enviarProposta(contexto.idProposta);
      return { fala: `Enviado. A proposta soma ${reais(r.valorTotal)}. O tecnico vai olhar e eu te aviso quando a prefeitura responder.`, acao: 'PROPOSTA_ENVIADA', dados: r, contexto: {} };
    }
    if (nao) return { fala: `Sem problema. A proposta fica salva como rascunho e o tecnico pode revisar com voce.`, acao: null, contexto: {} };
  }

  // intencoes iniciais
  if (/entrega|pagamento|receb|quando/.test(m)) {
    const e = await proximasEntregas(user.idProdutor);
    if (!e.length) return { fala: `${nome}, voce ainda nao tem entrega marcada. Quer ouvir as oportunidades da regiao?`, acao: null, contexto: {} };
    const x = e[0];
    const d = new Date(x.data).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' });
    return { fala: `Sua proxima entrega e dia ${d}: ${un(x.unidade, x.qtd)} de ${x.produto.toLowerCase()} na ${x.escola}. O pagamento sai em ate trinta dias depois da entrega.`, acao: 'ENTREGAS', dados: e, contexto: {} };
  }

  // padrao: oferecer a melhor oportunidade
  const ops = await listarOportunidades(user.idProdutor);
  if (!ops.length) return { fala: `${nome}, por enquanto nao tem chamada aberta para o que voce planta. Assim que abrir, eu te aviso.`, acao: null, contexto: {} };
  const alvo = /mandioca|alface|banana|couve|feij|ovo|tomate|laranja|batata/.exec(m);
  const o = (alvo && ops.find((x) => x.produto.toLowerCase().includes(alvo[0]))) || ops[0];
  return { fala: falaOportunidade(nome, o), acao: 'OFERTA', dados: o, contexto: { etapa: 'OFERTA', idItemChamada: o.idItemChamada } };
}

// ---------------------------------------------------------------- modo LLM
async function conversarLLM({ user, mensagem, contexto = {} }) {
  const client = new Anthropic();
  const messages = [...(contexto.historico || []), { role: 'user', content: mensagem }];
  let resposta = await client.messages.create({
    model: 'claude-sonnet-4-5', max_tokens: 400, system: SYSTEM + `\nProdutor: ${user.nome}.`, tools, messages,
  });
  let acao = null, dados = null;
  // loop de tool use (no maximo 3 rodadas por fala)
  for (let i = 0; i < 3 && resposta.stop_reason === 'tool_use'; i++) {
    const usos = resposta.content.filter((c) => c.type === 'tool_use');
    const results = [];
    for (const u of usos) {
      try {
        const out = await executar(u.name, u.input, user);
        acao = u.name.toUpperCase(); dados = out;
        results.push({ type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(out) });
      } catch (e) {
        results.push({ type: 'tool_result', tool_use_id: u.id, content: 'Erro: ' + e.message, is_error: true });
      }
    }
    messages.push({ role: 'assistant', content: resposta.content }, { role: 'user', content: results });
    resposta = await client.messages.create({ model: 'claude-sonnet-4-5', max_tokens: 400, system: SYSTEM, tools, messages });
  }
  const fala = resposta.content.filter((c) => c.type === 'text').map((c) => c.text).join(' ').trim();
  messages.push({ role: 'assistant', content: resposta.content });
  // mantem so as ultimas 10 mensagens no contexto (economia de memoria e tokens)
  return { fala, acao, dados, contexto: { historico: messages.slice(-10) } };
}

export async function conversar(args) {
  if (!args.user?.idProdutor) return { fala: 'Este assistente e para produtores.', acao: null, contexto: {} };
  return process.env.ANTHROPIC_API_KEY ? conversarLLM(args) : conversarRegras(args);
}
