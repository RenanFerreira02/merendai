/**
 * Produtores da carteira do tecnico: mapa + lista com pendencias.
 * O mapa usa react-native-maps; marcadores sao memoizados e a lista e FlatList.
 */
import { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker } from 'react-native-maps';
import { useRouter } from 'expo-router';
import { api, type Painel } from '@/services/api';
import { useAuth } from '@/store/auth';
import { useOffline } from '@/hooks/useOffline';
import { AvisoOffline, Botao, Cartao, Corpo, Etiqueta, Subtitulo, Titulo, reais } from '@/components/ui';
import { cores, espaco } from '@/theme';

type P = Painel['produtores'][number];

export default function Produtores() {
  const user = useAuth((s) => s.user)!;
  const router = useRouter();
  const [mostrarMapa, setMostrarMapa] = useState(true);
  const buscar = useCallback(() => api.get<Painel>(`/tecnicos/${user.idTecnico}/painel`), [user.idTecnico]);
  const { dados, offline, recarregar, carregando } = useOffline(`painel/${user.idTecnico}`, buscar);

  const regiao = useMemo(() => {
    const ps = dados?.produtores ?? [];
    if (!ps.length) return { latitude: -23.98, longitude: -48.87, latitudeDelta: 0.5, longitudeDelta: 0.5 };
    const lat = ps.reduce((a, p) => a + p.latitude, 0) / ps.length;
    const lon = ps.reduce((a, p) => a + p.longitude, 0) / ps.length;
    return { latitude: lat, longitude: lon, latitudeDelta: 0.35, longitudeDelta: 0.35 };
  }, [dados]);

  const renderItem = useCallback(({ item: p }: { item: P }) => (
    <Cartao>
      <View style={s.linha}>
        <Subtitulo>{p.nome}{p.embaixador ? ' ★' : ''}</Subtitulo>
        <Etiqueta texto={p.situacaoCaf === 'OK' ? 'CAF ok' : p.situacaoCaf === 'VENCIDO' ? 'CAF vencido' : 'Sem CAF'} tom={p.situacaoCaf === 'OK' ? 'ok' : 'erro'} />
      </View>
      <Corpo suave>{p.prospectsAbertos} prospects abertos · {p.contratos} contratos · recebeu {reais(p.vlRecebido)}</Corpo>
    </Cartao>
  ), []);

  return (
    <SafeAreaView style={s.tela} edges={['top']}>
      <AvisoOffline visivel={offline} />
      <FlatList
        data={dados?.produtores ?? []}
        keyExtractor={(p) => String(p.id)}
        renderItem={renderItem}
        contentContainerStyle={{ padding: espaco.l }}
        initialNumToRender={8}
        windowSize={5}
        onRefresh={recarregar}
        refreshing={carregando}
        ListHeaderComponent={
          <>
            <Titulo>Produtores</Titulo>
            {mostrarMapa && (
              <View style={s.mapa}>
                <MapView style={StyleSheet.absoluteFill} initialRegion={regiao}>
                  {(dados?.produtores ?? []).map((p) => (
                    <Marker key={p.id} coordinate={{ latitude: p.latitude, longitude: p.longitude }} title={p.nome}
                      description={`${p.prospectsAbertos} prospects`} pinColor={p.situacaoCaf === 'OK' ? cores.verde : cores.erro} />
                  ))}
                </MapView>
              </View>
            )}
            <View style={{ flexDirection: 'row', gap: espaco.s }}>
              <View style={{ flex: 1 }}><Botao titulo={mostrarMapa ? 'Esconder mapa' : 'Ver mapa'} variante="secundario" icone="map-outline" onPress={() => setMostrarMapa((v) => !v)} /></View>
              <View style={{ flex: 1 }}><Botao titulo="Cadastrar" icone="person-add-outline" onPress={() => router.push('/(tecnico)/novo-produtor')} /></View>
            </View>
            <View style={{ height: espaco.m }} />
          </>
        }
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  mapa: { height: 240, borderRadius: 16, overflow: 'hidden', marginBottom: espaco.s },
  linha: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: espaco.s },
});
