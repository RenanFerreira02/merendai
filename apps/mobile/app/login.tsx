import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, type Usuario } from '@/services/api';
import { useAuth } from '@/store/auth';
import { Botao, Corpo, Titulo } from '@/components/ui';
import { cores, espaco, fonte, raio, alvoToque } from '@/theme';

export default function Login() {
  const entrar = useAuth((s) => s.entrar);
  const [telefone, setTelefone] = useState('15992000001');   // demo: Marta
  const [senha, setSenha] = useState('merendai123');
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);

  async function onEntrar() {
    setErro(''); setCarregando(true);
    try {
      const r = await api.post<{ token: string; user: Usuario }>('/auth/login', { telefone, senha });
      await entrar(r.token, r.user);
    } catch (e: any) {
      setErro(e.message);
    } finally { setCarregando(false); }
  }

  return (
    <SafeAreaView style={s.tela}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'center' }}>
        <View style={s.logo}><Text style={s.logoTexto}>Merendai</Text><Text style={s.slogan}>Da roca pra merenda</Text></View>
        <Titulo>Entrar</Titulo>
        <Corpo suave>Use o telefone que o tecnico cadastrou.</Corpo>
        <TextInput style={s.input} placeholder="Telefone" keyboardType="phone-pad" value={telefone} onChangeText={setTelefone}
          accessibilityLabel="Telefone" />
        <TextInput style={s.input} placeholder="Senha" secureTextEntry value={senha} onChangeText={setSenha}
          accessibilityLabel="Senha" />
        {!!erro && <Text style={s.erro}>{erro}</Text>}
        <Botao titulo="Entrar" icone="log-in-outline" onPress={onEntrar} carregando={carregando} grande />
        <Corpo suave>{'\n'}Demo: produtora 15992000001 · tecnico 15991000001 · senha merendai123</Corpo>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo, padding: espaco.l },
  logo: { alignItems: 'center', marginBottom: espaco.xl },
  logoTexto: { fontSize: 44, fontWeight: '800', color: cores.verde, letterSpacing: -1 },
  slogan: { fontSize: fonte.corpo, color: cores.terra, fontWeight: '600' },
  input: { minHeight: alvoToque, borderWidth: 1.5, borderColor: cores.borda, borderRadius: raio, paddingHorizontal: espaco.m,
    fontSize: fonte.corpo, backgroundColor: '#fff', marginTop: espaco.s, color: cores.texto },
  erro: { color: cores.erro, fontSize: fonte.corpo, marginTop: espaco.s },
});
