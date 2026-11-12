/**
 * F1 - Oportunidades em voz.
 * Lista as chamadas publicas compativeis com o que o produtor planta.
 * Cada cartao tem um botao "Ouvir" que le o resumo em linguagem simples
 * (texto gerado pela function PL/SQL fn_resumo_chamada_audio) e um
 * "Quero vender" que leva ao agente ja com o item selecionado.
 */
import { useCallback } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { api, type Oportunidade } from '@/services/api';
import { useAuth } from '@/store/auth';
import { useOffline } from '@/hooks/useOffline';
import { useVoz } from '@/hooks/useVoz';
import { AvisoOffline, Botao, Cartao, Corpo, Etiqueta, Subtitulo, Titulo, Vazio, reais, unidade } from '@/components/ui';
import { cores, espaco } from '@/theme';

export default function Oportunidades() {
  const user = useAuth((s) => s.user)!;
  const router = useRouter();
  const { falar, falando, parar } = useVoz();
  const buscar = useCallback(() => api.get<Oportunidade[]>(`/produtores/${user.idProdutor}/oportunidades`), [user.idProdutor]);
  const { dados, carregando, offline, recarregar } = useOffline(`oportunidades/${user.idProdutor}`, buscar);

  const renderItem = useCallback(({ item }: { item: Oportunidade }) => {
    const pct = Math.round(item.cobertura * 100);
    const periodo = { SEMANAL: 'por semana', QUINZENAL: 'a cada 15 dias', MENSAL: 'por mes' }[item.periodicidade as 'SEMANAL'];
    return (
      <Cartao>
        <View style={s.linha}>
          <Subtitulo>{item.produto}</Subtitulo>
          <Etiqueta texto={pct >= 100 ? 'Voce cobre tudo' : `Voce cobre ${pct}%`} tom={pct >= 100 ? 'ok' : 'aviso'} />
        </View>
        <Corpo>{item.municipio} quer {unidade(item.unidade, item.qtdTotal)} {periodo}, pagando {reais(item.vlUnitario)} cada.</Corpo>
        <Corpo suave>A {item.distanciaKm} km de voce · responder ate {new Date(item.dtLimite).toLocaleDateString('pt-BR')}</Corpo>
        <View style={s.acoes}>
          <View style={{ flex: 1 }}>
            <Botao titulo={falando ? 'Parar' : 'Ouvir'} icone={falando ? 'stop-circle-outline' : 'volume-high-outline'} variante="secundario"
              onPress={() => falando ? parar() : falar(item.resumoAudio)} />
          </View>
          <View style={{ flex: 1, marginLeft: espaco.s }}>
            <Botao titulo="Quero vender" icone="mic-outline"
              onPress={() => router.push({ pathname: '/(produtor)/falar', params: { idItemChamada: item.idItemChamada, produto: item.produto } })} />
          </View>
        </View>
      </Cartao>
    );
  }, [falando, falar, parar, router]);

  return (
    <SafeAreaView style={s.tela} edges={['top']}>
      <AvisoOffline visivel={offline} />
      <FlatList
        data={dados ?? []}
        keyExtractor={(o) => String(o.idProspect)}
        renderItem={renderItem}
        contentContainerStyle={{ padding: espaco.l }}
        ListHeaderComponent={<><Titulo>Ola, {user.nome.split(' ')[0]}</Titulo><Corpo suave>Escolas da sua regiao querem comprar o que voce planta.{'\n'}</Corpo></>}
        ListEmptyComponent={carregando ? null : <Vazio texto="Por enquanto nao tem chamada aberta para o que voce planta. Assim que abrir, a gente te avisa." />}
        refreshControl={<RefreshControl refreshing={carregando} onRefresh={recarregar} />}
        initialNumToRender={4}
        windowSize={5}
        removeClippedSubviews
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  linha: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: espaco.s },
  acoes: { flexDirection: 'row', marginTop: espaco.xs },
});
