/**
 * F2 - Falar com o Merendai (proposta por conversa e mutirao).
 *
 * Um botao grande. Toque, fale, o agente responde em voz e executa:
 *  oferta -> "sim" -> sp_montar_mutirao -> "sim" -> sp_enviar_proposta.
 * O contexto da conversa (etapa, ids) vem da API e volta a cada turno,
 * entao o servidor e stateless e o app guarda so o ultimo contexto.
 *
 * Memoria: a lista de balões e limitada aos ultimos 12 turnos.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { api, type RespostaAgente } from '@/services/api';
import { useAuth } from '@/store/auth';
import { useVoz } from '@/hooks/useVoz';
import { Botao, Corpo, Titulo } from '@/components/ui';
import { cores, espaco, fonte, raio } from '@/theme';

type Balao = { de: 'eu' | 'merendai'; texto: string };
const MAX_BALOES = 12;

export default function Falar() {
  const user = useAuth((s) => s.user)!;
  const router = useRouter();
  const params = useLocalSearchParams<{ idItemChamada?: string; produto?: string }>();
  const { falar, ouvir, parar, ouvindo, falando, transcricao } = useVoz();
  const [baloes, setBaloes] = useState<Balao[]>([]);
  const [contexto, setContexto] = useState<any>({});
  const [processando, setProcessando] = useState(false);
  const [idProposta, setIdProposta] = useState<number | null>(null);
  const scroll = useRef<ScrollView>(null);

  const adicionar = useCallback((b: Balao) => setBaloes((xs) => [...xs, b].slice(-MAX_BALOES)), []);

  const enviar = useCallback(async (mensagem: string, ctx = contexto) => {
    if (!mensagem.trim()) return;
    adicionar({ de: 'eu', texto: mensagem });
    setProcessando(true);
    try {
      const r = await api.post<RespostaAgente>('/agente/conversar', { mensagem, contexto: ctx });
      setContexto(r.contexto ?? {});
      adicionar({ de: 'merendai', texto: r.fala });
      if (r.acao === 'PROPOSTA_MONTADA' || r.acao === 'PROPOSTA_ENVIADA') setIdProposta(r.dados?.idProposta ?? null);
      await falar(r.fala);
    } catch (e: any) {
      const msg = e.message || 'Nao consegui falar com o servidor.';
      adicionar({ de: 'merendai', texto: msg });
      await falar(msg);
    } finally { setProcessando(false); }
  }, [contexto, adicionar, falar]);

  // veio da tela de oportunidades com um item escolhido: ja abre a conversa nele
  useEffect(() => {
    if (params.idItemChamada && params.produto) {
      enviar(`Quero vender ${params.produto.toLowerCase()}`);
    } else if (baloes.length === 0) {
      const oi = `Oi, ${user.nome.split(' ')[0]}. Aperte o botao e me diga o que voce quer: ouvir as oportunidades, vender, ou saber das entregas.`;
      adicionar({ de: 'merendai', texto: oi });
      falar(oi);
    }
    return () => parar();
  }, [params.idItemChamada]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { scroll.current?.scrollToEnd({ animated: true }); }, [baloes]);

  async function onMic() {
    if (falando) { parar(); return; }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const texto = await ouvir();
    if (texto) enviar(texto);
    else { const m = 'Nao entendi. Pode falar de novo?'; adicionar({ de: 'merendai', texto: m }); falar(m); }
  }

  const estado = ouvindo ? 'Estou ouvindo...' : falando ? 'Falando... (toque para parar)' : processando ? 'Um momento...' : 'Toque e fale';

  return (
    <SafeAreaView style={s.tela} edges={['top']}>
      <View style={{ paddingHorizontal: espaco.l }}><Titulo>Falar com o Merendai</Titulo></View>
      <ScrollView ref={scroll} contentContainerStyle={{ padding: espaco.l, paddingTop: 0 }}>
        {baloes.map((b, i) => (
          <View key={i} style={[s.balao, b.de === 'eu' ? s.eu : s.merendai]}>
            <Text style={[s.balaoTexto, b.de === 'eu' && { color: '#fff' }]}>{b.texto}</Text>
          </View>
        ))}
        {ouvindo && !!transcricao && <Text style={s.parcial}>{transcricao}</Text>}
        {idProposta && (
          <Botao titulo="Ver a proposta" icone="document-text-outline" variante="secundario"
            onPress={() => router.push(`/(produtor)/proposta/${idProposta}`)} />
        )}
      </ScrollView>
      <View style={s.rodape}>
        <Corpo suave>{estado}</Corpo>
        <Pressable onPress={onMic} disabled={processando} accessibilityRole="button" accessibilityLabel="Falar"
          style={({ pressed }) => [s.mic, ouvindo && s.micAtivo, (pressed || processando) && { opacity: 0.8 }]}>
          <Ionicons name={falando ? 'stop' : 'mic'} size={56} color="#fff" />
        </Pressable>
        {/* atalhos de toque para quem prefere nao falar */}
        <View style={s.atalhos}>
          <Atalho texto="Sim" onPress={() => enviar('sim')} />
          <Atalho texto="Agora nao" onPress={() => enviar('agora nao')} />
          <Atalho texto="Minhas entregas" onPress={() => enviar('quando e a proxima entrega')} />
        </View>
      </View>
    </SafeAreaView>
  );
}

function Atalho({ texto, onPress }: { texto: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={s.atalho} accessibilityRole="button">
      <Text style={s.atalhoTexto}>{texto}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  balao: { maxWidth: '88%', padding: espaco.m, borderRadius: raio, marginBottom: espaco.s },
  eu: { alignSelf: 'flex-end', backgroundColor: cores.verde, borderBottomRightRadius: 4 },
  merendai: { alignSelf: 'flex-start', backgroundColor: '#fff', borderWidth: 1, borderColor: cores.borda, borderBottomLeftRadius: 4 },
  balaoTexto: { fontSize: fonte.corpo, lineHeight: fonte.corpo * 1.4, color: cores.texto },
  parcial: { fontSize: fonte.corpo, color: cores.textoSuave, fontStyle: 'italic', alignSelf: 'flex-end' },
  rodape: { alignItems: 'center', padding: espaco.m, borderTopWidth: 1, borderColor: cores.borda, backgroundColor: '#fff', gap: espaco.s },
  mic: { width: 112, height: 112, borderRadius: 56, backgroundColor: cores.verde, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, elevation: 6 },
  micAtivo: { backgroundColor: cores.milho },
  atalhos: { flexDirection: 'row', gap: espaco.s, flexWrap: 'wrap', justifyContent: 'center' },
  atalho: { borderWidth: 1.5, borderColor: cores.verde, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10, minHeight: 44 },
  atalhoTexto: { color: cores.verde, fontWeight: '700', fontSize: fonte.pequeno },
});
