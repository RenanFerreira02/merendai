/**
 * F3 - Entregas e pagamento.
 * Agenda de entregas com a situacao de cada pagamento, em linguagem simples.
 * O produtor confirma a entrega aqui (sp_confirmar_entrega), e o lembrete da
 * vespera e lido em voz (texto vindo de sp_gerar_lembretes).
 */
import { useCallback, useMemo } from 'react';
import { Alert, SectionList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, type Entrega } from '@/services/api';
import { useAuth } from '@/store/auth';
import { useOffline } from '@/hooks/useOffline';
import { useVoz } from '@/hooks/useVoz';
import { AvisoOffline, Botao, Cartao, Corpo, Etiqueta, Subtitulo, Titulo, Vazio, data, reais, unidade } from '@/components/ui';
import { cores, espaco } from '@/theme';

const nomeEntrega: Record<string, string> = { AGENDADA: 'Agendada', LEMBRADA: 'Amanha', ENTREGUE: 'Entregue', PARCIAL: 'Entregue parte', FALTOU: 'Nao entregue', CANCELADA: 'Cancelada' };
const nomePagto: Record<string, string> = { PREVISTO: 'Pagamento previsto', PAGO: 'Pago', ATRASADO: 'Pagamento atrasado', CANCELADO: 'Sem pagamento' };

export default function Entregas() {
  const user = useAuth((s) => s.user)!;
  const { falar } = useVoz();
  const buscar = useCallback(() => api.get<Entrega[]>(`/produtores/${user.idProdutor}/entregas`), [user.idProdutor]);
  const { dados, carregando, offline, recarregar } = useOffline(`entregas/${user.idProdutor}`, buscar);

  const secoes = useMemo(() => {
    const xs = dados ?? [];
    const proximas = xs.filter((e) => ['AGENDADA', 'LEMBRADA'].includes(e.status));
    const feitas = xs.filter((e) => !['AGENDADA', 'LEMBRADA'].includes(e.status)).reverse();
    const recebido = xs.filter((e) => e.pagamento?.status === 'PAGO').reduce((a, e) => a + (e.pagamento?.valor ?? 0), 0);
    const aReceber = xs.filter((e) => e.pagamento?.status === 'PREVISTO' && e.status !== 'AGENDADA' && e.status !== 'LEMBRADA')
      .reduce((a, e) => a + (e.pagamento?.valor ?? 0), 0);
    return { recebido, aReceber, lista: [{ titulo: 'Proximas', data: proximas.slice(0, 20) }, { titulo: 'Feitas', data: feitas.slice(0, 20) }] };
  }, [dados]);

  function confirmar(e: Entrega) {
    Alert.alert('Confirmar entrega', `Voce entregou ${unidade(e.unidade, e.qtdPrevista)} de ${e.produto.toLowerCase()} na ${e.escola.nome}?`, [
      { text: 'Ainda nao', style: 'cancel' },
      { text: 'Entreguei tudo', onPress: async () => { await api.post(`/entregas/${e.id}/confirmar`, { qtdEntregue: e.qtdPrevista }); recarregar(); } },
    ]);
  }

  const ouvirResumo = () => {
    const p = secoes.lista[0].data[0];
    const txt = p
      ? `Sua proxima entrega e dia ${new Date(p.dtPrevista).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' })}: ${unidade(p.unidade, p.qtdPrevista)} de ${p.produto.toLowerCase()} na ${p.escola.nome}. Voce ja recebeu ${reais(secoes.recebido)} e tem ${reais(secoes.aReceber)} a receber.`
      : `Voce nao tem entrega marcada. Ja recebeu ${reais(secoes.recebido)} este ano.`;
    falar(txt);
  };

  return (
    <SafeAreaView style={s.tela} edges={['top']}>
      <AvisoOffline visivel={offline} />
      <SectionList
        sections={secoes.lista}
        keyExtractor={(e) => String(e.id)}
        contentContainerStyle={{ padding: espaco.l }}
        stickySectionHeadersEnabled={false}
        initialNumToRender={6}
        windowSize={5}
        ListHeaderComponent={
          <>
            <Titulo>Entregas e pagamento</Titulo>
            <View style={s.resumo}>
              <Cartao style={s.caixa}><Corpo suave>Ja recebi</Corpo><Subtitulo>{reais(secoes.recebido)}</Subtitulo></Cartao>
              <Cartao style={s.caixa}><Corpo suave>A receber</Corpo><Subtitulo>{reais(secoes.aReceber)}</Subtitulo></Cartao>
            </View>
            <Botao titulo="Ouvir resumo" icone="volume-high-outline" variante="secundario" onPress={ouvirResumo} />
            <View style={{ height: espaco.m }} />
          </>
        }
        renderSectionHeader={({ section }) => section.data.length ? <Subtitulo>{section.titulo}</Subtitulo> : null}
        renderItem={({ item: e }) => (
          <Cartao>
            <View style={s.linha}>
              <Subtitulo>{data(e.dtPrevista)} · {e.produto}</Subtitulo>
              <Etiqueta texto={nomeEntrega[e.status]} tom={e.status === 'ENTREGUE' ? 'ok' : e.status === 'FALTOU' ? 'erro' : e.status === 'LEMBRADA' ? 'aviso' : 'neutro'} />
            </View>
            <Corpo>{unidade(e.unidade, e.qtdPrevista)} na {e.escola.nome}</Corpo>
            {e.pagamento && (
              <Corpo suave>{nomePagto[e.pagamento.status]}: {reais(e.pagamento.valor)}
                {e.pagamento.status === 'PREVISTO' ? ` ate ${data(e.pagamento.dtPrevista)}` : e.pagamento.dtPagamento ? ` em ${data(e.pagamento.dtPagamento)}` : ''}</Corpo>
            )}
            {['AGENDADA', 'LEMBRADA'].includes(e.status) && <Botao titulo="Entreguei" icone="checkmark-done-outline" onPress={() => confirmar(e)} />}
          </Cartao>
        )}
        ListEmptyComponent={carregando ? null : <Vazio texto="Quando uma proposta for contratada, suas entregas aparecem aqui." />}
        onRefresh={recarregar}
        refreshing={carregando}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  resumo: { flexDirection: 'row', gap: espaco.s },
  caixa: { flex: 1 },
  linha: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: espaco.s },
});
