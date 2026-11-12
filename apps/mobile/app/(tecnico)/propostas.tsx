/**
 * Propostas da carteira: o tecnico revisa (envia um rascunho) e, no papel
 * de gestor da demo, contrata uma proposta enviada escolhendo a escola.
 */
import { useCallback, useState } from 'react';
import { Alert, FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '@/services/api';
import { useAuth } from '@/store/auth';
import { useOffline } from '@/hooks/useOffline';
import { AvisoOffline, Botao, Cartao, Corpo, Etiqueta, Subtitulo, Titulo, Vazio, reais } from '@/components/ui';
import { cores, espaco } from '@/theme';

interface Item { id: number; tipo: string; status: string; valor: number; dtEnvio?: string; lider: string; edital: string; municipio: string }
interface Catalogo { escolas: { id: number; idMunicipio: number; nome: string }[] }

export default function Propostas() {
  const user = useAuth((s) => s.user)!;
  const [acao, setAcao] = useState<number | null>(null);
  const buscar = useCallback(() => api.get<Item[]>(`/tecnicos/${user.idTecnico}/propostas`), [user.idTecnico]);
  const { dados, offline, recarregar, carregando } = useOffline(`propostas/${user.idTecnico}`, buscar);

  async function enviar(p: Item) {
    setAcao(p.id);
    try { await api.post(`/propostas/${p.id}/enviar`); recarregar(); }
    catch (e: any) { Alert.alert('Nao foi possivel enviar', e.message); }
    finally { setAcao(null); }
  }

  async function contratar(p: Item) {
    const cat = await api.get<Catalogo>('/catalogo');
    const escolas = cat.escolas.filter((e) => e.idMunicipio === user.idMunicipio);
    Alert.alert('Contratar: qual escola recebe?', 'As entregas serao agendadas para esta escola.', [
      ...escolas.map((e) => ({ text: e.nome, onPress: async () => {
        setAcao(p.id);
        try { await api.post(`/propostas/${p.id}/contratar`, { idEscola: e.id }); recarregar(); }
        catch (err: any) { Alert.alert('Nao foi possivel contratar', err.message); }
        finally { setAcao(null); }
      } })),
      { text: 'Cancelar', style: 'cancel' },
    ]);
  }

  const tom = (st: string) => st === 'CONTRATADA' ? 'ok' : st === 'ENVIADA' ? 'aviso' : st === 'RASCUNHO' ? 'neutro' : 'erro';

  return (
    <SafeAreaView style={s.tela} edges={['top']}>
      <AvisoOffline visivel={offline} />
      <FlatList
        data={dados ?? []}
        keyExtractor={(p) => String(p.id)}
        contentContainerStyle={{ padding: espaco.l }}
        ListHeaderComponent={<Titulo>Propostas</Titulo>}
        onRefresh={recarregar}
        refreshing={carregando}
        renderItem={({ item: p }) => (
          <Cartao>
            <View style={s.linha}>
              <Subtitulo>{p.tipo === 'MUTIRAO' ? 'Mutirao' : 'Individual'} · {p.lider.split(' ')[0]}</Subtitulo>
              <Etiqueta texto={p.status} tom={tom(p.status) as any} />
            </View>
            <Corpo suave>{p.edital} · {p.municipio}{p.valor ? ` · ${reais(p.valor)}` : ''}</Corpo>
            {p.status === 'RASCUNHO' && <Botao titulo="Revisar e enviar" icone="send-outline" onPress={() => enviar(p)} carregando={acao === p.id} />}
            {p.status === 'ENVIADA' && user.perfil !== 'PRODUTOR' && <Botao titulo="Contratar (simula prefeitura)" icone="ribbon-outline" variante="secundario" onPress={() => contratar(p)} carregando={acao === p.id} />}
          </Cartao>
        )}
        ListEmptyComponent={carregando ? null : <Vazio texto="Nenhuma proposta na sua carteira ainda." />}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  linha: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: espaco.s },
});
