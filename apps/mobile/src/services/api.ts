/**
 * Cliente HTTP do Merendai.
 * - Uma unica instancia; token injetado a partir do store.
 * - Timeout de 12 s (rede rural) e erro legivel para a UI.
 * - Sem cache aqui: cada tela decide o que guardar (ver useOffline).
 */
import Constants from 'expo-constants';
import { useAuth } from '@/store/auth';

const BASE: string = Constants.expoConfig?.extra?.apiUrl ?? 'http://localhost:3333/api';

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = useAuth.getState().token;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(BASE + path, {
      ...init,
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init.headers || {}),
      },
    });
    const body = res.status === 204 ? null : await res.json().catch(() => null);
    if (!res.ok) throw new ApiError(res.status, body?.erro || `Erro ${res.status}`);
    return body as T;
  } catch (e: any) {
    if (e.name === 'AbortError') throw new ApiError(0, 'Sem conexao. Tente de novo quando tiver sinal.');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  get: <T>(p: string) => request<T>(p),
  post: <T>(p: string, body?: unknown) => request<T>(p, { method: 'POST', body: JSON.stringify(body ?? {}) }),
};

// ---------------------------------------------------------------- tipos
export type Perfil = 'PRODUTOR' | 'TECNICO' | 'GESTOR';
export interface Usuario {
  id: number; nome: string; perfil: Perfil;
  idProdutor?: number; embaixador?: boolean; idTecnico?: number; idMunicipio?: number;
}
export interface Oportunidade {
  idProspect: number; idChamada: number; idItemChamada: number; municipio: string;
  produto: string; unidade: string; qtdTotal: number; qtdAtendida: number; periodicidade: string;
  vlUnitario: number; distanciaKm: number; cobertura: number; score: number; status: string;
  dtLimite: string; dtInicioEntrega: string; dtFimEntrega: string; resumoAudio: string;
}
export interface Proposta {
  id: number; tipo: 'INDIVIDUAL' | 'MUTIRAO'; status: string; valorTotal: number; dtEnvio?: string;
  edital: string; municipio: string; lider: string; idLider: number; cobertura?: number;
  itens: { id: number; idProdutor: number; produtor: string; produto: string; unidade: string; qtd: number; vlUnitario: number; subtotal: number }[];
  participantes: { idProdutor: number; nome: string; confirmado: boolean; embaixador: boolean }[];
  historico: { de: string | null; para: string; em: string }[];
}
export interface Entrega {
  id: number; dtPrevista: string; dtRealizada?: string; qtdPrevista: number; qtdEntregue?: number; status: string;
  produto: string; unidade: string; escola: { nome: string; latitude: number; longitude: number };
  pagamento: { valor: number; status: string; dtPrevista: string; dtPagamento?: string } | null;
}
export interface RespostaAgente { fala: string; acao: string | null; dados?: any; contexto: any }
export interface Painel {
  municipio: Indicador | null; regiao: Indicador[];
  produtores: { id: number; nome: string; telefone: string; embaixador: boolean; caf?: string; situacaoCaf: string;
    prospectsAbertos: number; contratos: number; vlRecebido: number; latitude: number; longitude: number }[];
}
export interface Indicador {
  id: number; nome: string; uf: string; repasse: number; compraAf: number; pctAf: number; meta: number; faltante: number;
  produtoresCadastrados: number; produtoresVendendo: number; chamadasAbertas: number; mutiroes: number;
}
