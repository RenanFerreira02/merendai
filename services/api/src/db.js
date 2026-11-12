/**
 * db.js - Pool de conexoes Oracle.
 *
 * Decisoes:
 *  - Um unico pool por processo (poolMin 1, poolMax 8). O app e pequeno e o
 *    Oracle XE limita sessoes; abrir conexao por request estouraria.
 *  - outFormat OBJECT: linhas viram objetos JS com o nome da coluna.
 *  - fetchAsString para CLOB: a transcricao da proposta vem como string.
 *  - `withConn` garante que a conexao volta ao pool mesmo com erro (sem leak).
 */
import oracledb from 'oracledb';
import 'dotenv/config';

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
oracledb.fetchAsString = [oracledb.CLOB];
oracledb.autoCommit = false;

let pool;

export async function initPool() {
  pool = await oracledb.createPool({
    user: process.env.ORACLE_USER,
    password: process.env.ORACLE_PASSWORD,
    connectString: process.env.ORACLE_CONNECT,
    poolMin: 1,
    poolMax: 8,
    poolIncrement: 1,
    poolTimeout: 60,
  });
  return pool;
}

export async function closePool() {
  if (pool) await pool.close(10);
}

/** Executa fn(conn) com commit automatico; rollback em erro; sempre devolve a conexao. */
export async function withConn(fn) {
  const conn = await pool.getConnection();
  try {
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    try { await conn.rollback(); } catch { /* ignora */ }
    throw err;
  } finally {
    await conn.close();
  }
}

/** Atalho para SELECT. */
export async function query(sql, binds = {}) {
  return withConn(async (conn) => (await conn.execute(sql, binds)).rows);
}

/** Converte ORA-2000x (erros de negocio do package) em erro HTTP 422 legivel. */
export function toHttpError(err) {
  const m = /ORA-(\d{5}): (.*)/.exec(err.message || '');
  if (m && Number(m[1]) >= 20000 && Number(m[1]) < 21000) {
    const e = new Error(m[2].split('\n')[0]);
    e.status = 422;
    return e;
  }
  return err;
}

export { oracledb };
