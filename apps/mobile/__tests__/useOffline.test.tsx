import { renderHook, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useOffline } from '@/hooks/useOffline';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

describe('useOffline', () => {
  beforeEach(() => AsyncStorage.clear());

  it('busca, entrega os dados e grava no cache', async () => {
    const buscar = jest.fn().mockResolvedValue([{ id: 1 }]);
    const { result } = renderHook(() => useOffline('t1', buscar));
    await waitFor(() => expect(result.current.carregando).toBe(false));
    expect(result.current.dados).toEqual([{ id: 1 }]);
    expect(result.current.offline).toBe(false);
    const raw = await AsyncStorage.getItem('@merendai/cache/t1');
    expect(JSON.parse(raw!).v).toEqual([{ id: 1 }]);
  });

  it('sem rede, mostra o ultimo salvo e marca offline', async () => {
    await AsyncStorage.setItem('@merendai/cache/t2', JSON.stringify({ t: Date.now(), v: { salvo: true } }));
    const buscar = jest.fn().mockRejectedValue(new Error('Sem conexao'));
    const { result } = renderHook(() => useOffline('t2', buscar));
    await waitFor(() => expect(result.current.offline).toBe(true));
    expect(result.current.dados).toEqual({ salvo: true });
    expect(result.current.erro).toBeNull();
  });

  it('descarta cache expirado', async () => {
    await AsyncStorage.setItem('@merendai/cache/t3', JSON.stringify({ t: Date.now() - 1000 * 60 * 60 * 48, v: 'velho' }));
    const buscar = jest.fn().mockRejectedValue(new Error('x'));
    const { result } = renderHook(() => useOffline('t3', buscar));
    await waitFor(() => expect(result.current.carregando).toBe(false));
    expect(result.current.dados).toBeNull();
    expect(result.current.erro).toBe('x');
  });
});
