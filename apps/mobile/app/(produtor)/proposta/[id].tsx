/**
 * Detalhe da proposta: quem participa do mutirao, quanto cada um entrega,
 * valor total e a linha do tempo de status (vinda de HISTORICO_STATUS).
 * O participante confirma presenca no mutirao por aqui.
 */
import { useCallback } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { api, type Proposta } from '@/services/api';
import { useAuth } from '@/store/auth';
import { useOffline } from '@/hooks/useOffline';
import { Botao, Cartao, Corpo, Etiqueta, Subtitulo, Titulo, reais, unidade } from '@/components/ui';
import { cores, espaco } from '@/theme';

const tomStatus: Record<string, 'neutro' | 'ok' | 'aviso' | 'erro'> = { RASCUNHO: 'neutro', ENVIADA: 'aviso', CONTRATADA: 'ok', RECUSADA: 'erro', CANCELADA: 'erro' };
const nomeStatus: Record<string, string> = { RASCUNHO: 'Rascunho', ENVIADA: 'Em analise', CONTRATADA: 'Contratada', RECUSADA: 'Recusada', CANCELADA: 'Cancelada' };

export default function PropostaTela() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const user = useAuth((s) => s.user)!;
  const router = useRouter();
  const buscar = useCallback(() => api.get<Proposta>(`/propostas/${id}`), [id]);
  const { dados: p, recarregar } = useOffline(`proposta/${id}`, buscar);

  if (!p) return <SafeAreaView style={s.tela}><View style={{ padding: espaco.l }}><Corpo suave>Carregando...</Corpo></View></SafeAreaView>;

  const eu = p.participantes.find((x) => x.idProdutor === user.idProdutor);
  async function confirmar() {
    await api.post(`/propostas/${p!.id}/participantes/${user.idProdutor}/confirmar`);
    recarregar();
  }

  return (
    <SafeAreaView style={s.tela} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: espaco.l }}>
        <Botao titulo="Voltar" icone="arrow-back" variante="secundario" onPress={() => router.back()} />
        <View style={{ height: espaco.m }} />
        <View style={s.linha}>
          <Titulo>{p.tipo === 'MUTIRAO' ? 'Mutirao' : 'Proposta'}</Titulo>
          <Etiqueta texto={nomeStatus[p.status] ?? p.status} tom={tomStatus[p.status] ?? 'neutro'} />
        </View>
        <Corpo suave>{p.edital} · {p.municipio}</Corpo>

        <Cartao style={{ marginTop: espaco.m }}>
          <Subtitulo>Quem entrega o que</Subtitulo>
          {p.itens.map((i) => (
            <View key={i.id} style={s.item}>
              <Corpo>{i.produtor.split(' ')[0]}{i.idProdutor === user.idProdutor ? ' (voce)' : ''}</Corpo>
              <Corpo suave>{unidade(i.unidade, i.qtd)} de {i.produto.toLowerCase()} · {reais(i.subtotal)}</Corpo>
            </View>
          ))}
          <View style={[s.item, { borderTopWidth: 1, borderColor: cores.borda, paddingTop: espaco.s }]}>
            <Subtitulo>Total</Subtitulo><Subtitulo>{reais(p.valorTotal || p.itens.reduce((a, i) => a + i.subtotal, 0))}</Subtitulo>
          </View>
        </Cartao>

        {p.tipo === 'MUTIRAO' && (
          <Cartao>
            <Subtitulo>Participantes</Subtitulo>
            {p.participantes.map((x) => (
              <View key={x.idProdutor} style={s.item}>
                <Corpo>{x.nome}{x.embaixador ? ' ★' : ''}</Corpo>
                <Etiqueta texto={x.confirmado ? 'Confirmou' : 'Aguardando'} tom={x.confirmado ? 'ok' : 'aviso'} />
              </View>
            ))}
            {eu && !eu.confirmado && <Botao titulo="Eu confirmo minha parte" icone="checkmark-circle-outline" onPress={confirmar} grande />}
            <Corpo suave>{'\n'}★ produtor embaixador da regiao</Corpo>
          </Cartao>
        )}

        <Cartao>
          <Subtitulo>Caminho da proposta</Subtitulo>
          {p.historico.map((h, i) => (
            <Corpo key={i} suave>{new Date(h.em).toLocaleDateString('pt-BR')} · {nomeStatus[h.para] ?? h.para}</Corpo>
          ))}
          {p.status === 'ENVIADA' && <Corpo>{'\n'}O tecnico e a prefeitura estao analisando. A gente te avisa por aqui.</Corpo>}
          {p.status === 'CONTRATADA' && <Corpo>{'\n'}Contratada! As entregas ja estao na sua agenda.</Corpo>}
        </Cartao>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  linha: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  item: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: espaco.xs, gap: espaco.s },
});
