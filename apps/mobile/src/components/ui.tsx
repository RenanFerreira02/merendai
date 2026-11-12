/**
 * Componentes base, pensados para o produtor:
 * texto grande, alvo de toque grande, uma acao principal por tela.
 * Todos memoizados: sao reutilizados em listas.
 */
import React, { memo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { alvoToque, cores, espaco, fonte, raio } from '@/theme';

export const Titulo = memo(({ children }: { children: React.ReactNode }) => (
  <Text style={s.titulo} accessibilityRole="header">{children}</Text>
));

export const Subtitulo = memo(({ children }: { children: React.ReactNode }) => (
  <Text style={s.subtitulo}>{children}</Text>
));

export const Corpo = memo(({ children, suave }: { children: React.ReactNode; suave?: boolean }) => (
  <Text style={[s.corpo, suave && { color: cores.textoSuave }]}>{children}</Text>
));

export const Cartao = memo(({ children, style }: { children: React.ReactNode; style?: ViewStyle }) => (
  <View style={[s.cartao, style]}>{children}</View>
));

interface BotaoProps {
  titulo: string; onPress: () => void; icone?: keyof typeof Ionicons.glyphMap;
  variante?: 'primario' | 'secundario' | 'perigo'; carregando?: boolean; desabilitado?: boolean; grande?: boolean;
}
export const Botao = memo(({ titulo, onPress, icone, variante = 'primario', carregando, desabilitado, grande }: BotaoProps) => {
  const bg = variante === 'primario' ? cores.verde : variante === 'perigo' ? cores.erro : cores.verdeClaro;
  const fg = variante === 'secundario' ? cores.verde : '#fff';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={titulo}
      accessibilityState={{ disabled: !!desabilitado }}
      onPress={onPress}
      disabled={desabilitado || carregando}
      style={({ pressed }) => [s.botao, { backgroundColor: bg, opacity: pressed || desabilitado ? 0.7 : 1 },
        grande && { minHeight: alvoToque + 16 }]}
    >
      {carregando ? <ActivityIndicator color={fg} /> : (
        <>
          {icone && <Ionicons name={icone} size={26} color={fg} style={{ marginRight: espaco.s }} />}
          <Text style={[s.botaoTexto, { color: fg }, grande && { fontSize: fonte.subtitulo }]}>{titulo}</Text>
        </>
      )}
    </Pressable>
  );
});

export const Etiqueta = memo(({ texto, tom = 'neutro' }: { texto: string; tom?: 'neutro' | 'ok' | 'aviso' | 'erro' }) => {
  const cor = tom === 'ok' ? cores.ok : tom === 'aviso' ? cores.aviso : tom === 'erro' ? cores.erro : cores.textoSuave;
  return (
    <View style={[s.etiqueta, { borderColor: cor }]}>
      <Text style={{ color: cor, fontSize: fonte.pequeno, fontWeight: '600' }}>{texto}</Text>
    </View>
  );
});

export const Vazio = memo(({ texto }: { texto: string }) => (
  <View style={s.vazio}><Ionicons name="leaf-outline" size={48} color={cores.textoSuave} /><Corpo suave>{texto}</Corpo></View>
));

export const AvisoOffline = memo(({ visivel }: { visivel: boolean }) => visivel ? (
  <View style={s.offline}><Ionicons name="cloud-offline-outline" size={18} color="#fff" />
    <Text style={{ color: '#fff', marginLeft: 8 }}>Sem sinal. Mostrando o ultimo que foi salvo.</Text></View>
) : null);

export const reais = (n: number) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const data = (d?: string) => d ? new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : '';
export const unidade = (u: string, q: number) => {
  const nome = { KG: 'kg', UN: 'un', MACO: 'macos', DZ: 'dz', L: 'L' }[u as 'KG'] ?? u;
  return `${Number(q).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} ${nome}`;
};

const s = StyleSheet.create({
  titulo: { fontSize: fonte.titulo, fontWeight: '700', color: cores.texto, marginBottom: espaco.s },
  subtitulo: { fontSize: fonte.subtitulo, fontWeight: '600', color: cores.texto, marginBottom: espaco.xs },
  corpo: { fontSize: fonte.corpo, color: cores.texto, lineHeight: fonte.corpo * 1.4 },
  cartao: { backgroundColor: cores.cartao, borderRadius: raio, padding: espaco.m, marginBottom: espaco.m,
    borderWidth: 1, borderColor: cores.borda },
  botao: { minHeight: alvoToque, borderRadius: raio, paddingHorizontal: espaco.l, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', marginTop: espaco.s },
  botaoTexto: { fontSize: fonte.corpo, fontWeight: '700' },
  etiqueta: { alignSelf: 'flex-start', borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  vazio: { alignItems: 'center', padding: espaco.xl, gap: espaco.s },
  offline: { backgroundColor: cores.aviso, padding: espaco.s, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
});
