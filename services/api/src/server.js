import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { initPool, closePool } from './db.js';
import routes from './routes.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => res.json({ ok: true, servico: 'merendai-api' }));
app.use('/api', routes);

// erro padrao: ZodError -> 400, erro de negocio -> status proprio, resto -> 500
app.use((err, _req, res, _next) => {
  if (err.name === 'ZodError') return res.status(400).json({ erro: 'Dados invalidos', detalhes: err.issues });
  const status = err.status || 500;
  if (status === 500) console.error(err);
  res.status(status).json({ erro: err.message });
});

const port = Number(process.env.PORT || 3333);
initPool()
  .then(() => app.listen(port, () => console.log(`Merendai API em http://localhost:${port}`)))
  .catch((e) => { console.error('Falha ao conectar no Oracle:', e.message); process.exit(1); });

process.on('SIGINT', async () => { await closePool(); process.exit(0); });
