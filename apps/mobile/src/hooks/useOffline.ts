/**
 * useOffline - cache "stale-while-revalidate" por chave.
 *
 * No campo a conexao cai. A tela mostra o ultimo dado salvo imediatamente e
 * atualiza quando a rede responder. Dados guardados em AsyncStorage com TTL;
 * ao expirar, sao descartados no proximo carregamento (nao crescem sem limite).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const TTL_PADRAO = 1000 * 60 * 60 * 24; // 24 h

export function useOffline<T>(chave: string, buscar: () => Promise<T>, ttlMs = TTL_PADRAO) {
  const [dados, setDados] = useState<T | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const montado = useRef(true);
  // ref espelha `dados` para o recarregar nao ler um closure antigo (null) e
  // marcar erro mesmo quando ha cache valido na tela
  const temDados = useRef(false);

  const recarregar = useCallback(async () => {
    setErro(null);
    try {
      const novo = await buscar();
      if (!montado.current) return;
      temDados.current = true;
      setDados(novo);
      setOffline(false);
      await AsyncStorage.setItem(`@merendai/cache/${chave}`, JSON.stringify({ t: Date.now(), v: novo }));
    } catch (e: any) {
      if (!montado.current) return;
      setOffline(true);
      if (!temDados.current) setErro(e.message || 'Falha ao carregar');
    } finally {
      if (montado.current) setCarregando(false);
    }
  }, [chave, buscar]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    montado.current = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(`@merendai/cache/${chave}`);
        if (raw) {
          const { t, v } = JSON.parse(raw);
          if (Date.now() - t < ttlMs) { temDados.current = true; setDados(v); }
          else AsyncStorage.removeItem(`@merendai/cache/${chave}`);
        }
      } catch { /* cache corrompido: ignora */ }
      recarregar();
    })();
    return () => { montado.current = false; };
  }, [chave]); // eslint-disable-line react-hooks/exhaustive-deps

  return { dados, carregando, erro, offline, recarregar };
}
