/**
 * F4 - Painel do tecnico.
 * Indicador central: % do repasse FNDE do municipio gasto com agricultura
 * familiar contra a meta legal de 45% (vw_indicadores_municipio).
 * Abaixo, a regiao e os numeros da carteira do tecnico.
 */
import { useCallback } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, type Painel } from '@/services/api';
import { useAuth } from '@/store/auth';
import { useOffline } from '@/hooks/useOffline';
import { AvisoOffline, Botao, Cartao, Corpo, Subtitulo, Titulo, reais } from '@/components/ui';
import { cores, espaco, fonte } from '@/theme';

export default function PainelTela() {
  const { user, sair } = useAuth();
  const buscar = useCallback(() => api.get<Painel>(`/tecnicos/${user!.idTecnico}/painel`), [user]);
  const { dados, offline, recarregar } = useOffline(`painel/${user!.idTecnico}`, buscar);
  const m = dados?.municipio;
  const pendencias = dados?.produtores.filter((p) => p.situacaoCaf !== 'OK').length ?? 0;
  const prospects = dados?.produtores.reduce((a, p) => a + p.prospectsAbertos, 0) ?? 0;

  return (
    <SafeAreaView style={s.tela} edges={['top']}>
      <AvisoOffline visivel={offline} />
      <ScrollView contentContainerStyle={{ padding: espaco.l }}>
        <Titulo>Painel · {user!.nome.split(' ')[0]}</Titulo>
        {m && (
          <Cartao>
            <Corpo suave>Meta de 45% da agricultura familiar · {m.nome}</Corpo>
            <Medidor pct={m.pctAf} meta={m.meta} />
            <Corpo>{m.pctAf >= m.meta ? 'Meta cumprida.' : `Faltam ${reais(m.faltante)} em compras da agricultura familiar para cumprir a lei.`}</Corpo>
            <View style={s.grade}>
              <Num rotulo="Produtores" valor={m.produtoresCadastrados} />
              <Num rotulo="Vendendo" valor={m.produtoresVendendo} />
              <Num rotulo="Chamadas abertas" valor={m.chamadasAbertas} />
              <Num rotulo="Mutiroes" valor={m.mutiroes} />
            </View>
          </Cartao>
        )}
        <Cartao>
          <Subtitulo>Sua carteira</Subtitulo>
          <View style={s.grade}>
            <Num rotulo="Prospects abertos" valor={prospects} destaque />
            <Num rotulo="Pendencias de CAF" valor={pendencias} alerta={pendencias > 0} />
          </View>
          <Corpo suave>Prospects sao produtores que o sistema encontrou para chamadas abertas e ainda nao fecharam proposta.</Corpo>
        </Cartao>
        <Subtitulo>Regiao</Subtitulo>
        {dados?.regiao.map((r) => (
          <Cartao key={r.id}>
            <View style={s.linha}><Subtitulo>{r.nome}</Subtitulo><Text style={[s.pct, { color: r.pctAf >= r.meta ? cores.ok : cores.aviso }]}>{r.pctAf}%</Text></View>
            <Barra pct={r.pctAf} meta={r.meta} />
          </Cartao>
        ))}
        <Botao titulo="Atualizar" icone="refresh-outline" variante="secundario" onPress={recarregar} />
        <Botao titulo="Sair" icone="log-out-outline" variante="secundario" onPress={sair} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Medidor({ pct, meta }: { pct: number; meta: number }) {
  return (
    <View style={{ marginVertical: espaco.s }}>
      <Text style={[s.grande, { color: pct >= meta ? cores.ok : cores.aviso }]}>{pct}%</Text>
      <Barra pct={pct} meta={meta} />
    </View>
  );
}

function Barra({ pct, meta }: { pct: number; meta: number }) {
  return (
    <View style={s.trilho}>
      <View style={[s.preenchido, { width: `${Math.min(pct, 100)}%`, backgroundColor: pct >= meta ? cores.ok : cores.milho }]} />
      <View style={[s.marca, { left: `${meta}%` }]} />
    </View>
  );
}

function Num({ rotulo, valor, destaque, alerta }: { rotulo: string; valor: number; destaque?: boolean; alerta?: boolean }) {
  return (
    <View style={s.num}>
      <Text style={[s.numValor, destaque && { color: cores.verde }, alerta && { color: cores.erro }]}>{valor}</Text>
      <Text style={s.numRotulo}>{rotulo}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  grande: { fontSize: 48, fontWeight: '800' },
  trilho: { height: 14, backgroundColor: cores.verdeClaro, borderRadius: 7, overflow: 'visible', marginVertical: espaco.xs },
  preenchido: { height: 14, borderRadius: 7 },
  marca: { position: 'absolute', top: -4, width: 3, height: 22, backgroundColor: cores.texto, borderRadius: 2 },
  grade: { flexDirection: 'row', flexWrap: 'wrap', marginTop: espaco.s },
  num: { width: '50%', paddingVertical: espaco.xs },
  numValor: { fontSize: fonte.titulo, fontWeight: '700', color: cores.texto },
  numRotulo: { fontSize: fonte.pequeno, color: cores.textoSuave },
  linha: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pct: { fontSize: fonte.subtitulo, fontWeight: '700' },
});
