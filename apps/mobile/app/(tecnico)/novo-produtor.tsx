/**
 * Cadastro de produtor pelo tecnico (camada humana 1).
 * Formulario curto: o tecnico esta no sitio, com o produtor do lado.
 * Ao salvar, a API ja roda o matching e o produtor aparece com prospects.
 */
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { api } from '@/services/api';
import { useAuth } from '@/store/auth';
import { Botao, Cartao, Corpo, Subtitulo, Titulo } from '@/components/ui';
import { alvoToque, cores, espaco, fonte, raio } from '@/theme';

interface Catalogo { produtos: { id: number; nome: string; unidade: string }[] }

export default function NovoProdutor() {
  const user = useAuth((s) => s.user)!;
  const router = useRouter();
  const [cat, setCat] = useState<Catalogo | null>(null);
  const [f, setF] = useState({ nome: '', telefone: '', numeroCaf: '', latitude: '-24.00', longitude: '-48.90', raio: '30' });
  const [producao, setProducao] = useState<Record<number, { qtd: string; organico: boolean }>>({});
  const [salvando, setSalvando] = useState(false);

  useEffect(() => { api.get<Catalogo>('/catalogo').then(setCat); }, []);

  async function salvar() {
    const itens = Object.entries(producao).filter(([, v]) => Number(v.qtd) > 0)
      .map(([id, v]) => ({ idProduto: Number(id), qtdSemanal: Number(v.qtd), organico: v.organico }));
    if (!f.nome || !f.telefone || !itens.length) return Alert.alert('Faltou algo', 'Nome, telefone e pelo menos um produto.');
    setSalvando(true);
    try {
      await api.post(`/tecnicos/${user.idTecnico}/produtores`, {
        nome: f.nome, telefone: f.telefone, numeroCaf: f.numeroCaf || undefined,
        latitude: Number(f.latitude), longitude: Number(f.longitude), raioEntregaKm: Number(f.raio),
        idMunicipio: user.idMunicipio, producao: itens,
      });
      Alert.alert('Cadastrado', 'O produtor ja pode entrar no app com o telefone e a senha inicial merendai123.', [{ text: 'OK', onPress: () => router.back() }]);
    } catch (e: any) { Alert.alert('Erro', e.message); }
    finally { setSalvando(false); }
  }

  const campo = (k: keyof typeof f, label: string, extra = {}) => (
    <TextInput style={s.input} placeholder={label} value={f[k]} onChangeText={(v) => setF({ ...f, [k]: v })} accessibilityLabel={label} {...extra} />
  );

  return (
    <SafeAreaView style={s.tela} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: espaco.l }}>
        <Botao titulo="Voltar" icone="arrow-back" variante="secundario" onPress={() => router.back()} />
        <Titulo>Novo produtor</Titulo>
        <Corpo suave>Preencha junto com o produtor. Leva uns dois minutos.</Corpo>
        {campo('nome', 'Nome completo')}
        {campo('telefone', 'Telefone (com DDD)', { keyboardType: 'phone-pad' })}
        {campo('numeroCaf', 'Numero do CAF (se tiver)')}
        <View style={{ flexDirection: 'row', gap: espaco.s }}>
          <View style={{ flex: 1 }}>{campo('latitude', 'Latitude', { keyboardType: 'numbers-and-punctuation' })}</View>
          <View style={{ flex: 1 }}>{campo('longitude', 'Longitude', { keyboardType: 'numbers-and-punctuation' })}</View>
        </View>
        {campo('raio', 'Ate quantos km entrega?', { keyboardType: 'number-pad' })}

        <Subtitulo>O que planta e quanto entrega por semana</Subtitulo>
        {cat?.produtos.map((p) => (
          <Cartao key={p.id} style={{ paddingVertical: espaco.s }}>
            <View style={s.linha}>
              <Text style={s.prod}>{p.nome} ({p.unidade.toLowerCase()})</Text>
              <TextInput style={[s.input, s.qtd]} placeholder="0" keyboardType="number-pad"
                value={producao[p.id]?.qtd ?? ''} onChangeText={(v) => setProducao({ ...producao, [p.id]: { qtd: v, organico: producao[p.id]?.organico ?? false } })} />
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 12, color: cores.textoSuave }}>organico</Text>
                <Switch value={producao[p.id]?.organico ?? false} onValueChange={(v) => setProducao({ ...producao, [p.id]: { qtd: producao[p.id]?.qtd ?? '', organico: v } })} />
              </View>
            </View>
          </Cartao>
        ))}
        <Botao titulo="Salvar produtor" icone="save-outline" onPress={salvar} carregando={salvando} grande />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  input: { minHeight: alvoToque, borderWidth: 1.5, borderColor: cores.borda, borderRadius: raio, paddingHorizontal: espaco.m,
    fontSize: fonte.corpo, backgroundColor: '#fff', marginTop: espaco.s, color: cores.texto },
  linha: { flexDirection: 'row', alignItems: 'center', gap: espaco.s },
  prod: { flex: 1, fontSize: fonte.corpo, color: cores.texto },
  qtd: { width: 90, marginTop: 0, textAlign: 'center' },
});
