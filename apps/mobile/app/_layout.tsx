/**
 * Layout raiz: restaura a sessao e roteia por perfil.
 *  /login                   -> sem sessao
 *  /(produtor)/*            -> PRODUTOR (abas: Oportunidades, Falar, Entregas)
 *  /(tecnico)/*             -> TECNICO e GESTOR (abas: Painel, Produtores, Propostas)
 */
import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '@/store/auth';
import { cores } from '@/theme';

export default function RootLayout() {
  const { user, carregado, restaurar } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => { restaurar(); }, []);

  useEffect(() => {
    if (!carregado) return;
    const emLogin = segments[0] === 'login';
    if (!user && !emLogin) router.replace('/login');
    else if (user && emLogin) router.replace(user.perfil === 'PRODUTOR' ? '/(produtor)' : '/(tecnico)');
  }, [user, carregado, segments]);

  if (!carregado) {
    return <View style={{ flex: 1, justifyContent: 'center', backgroundColor: cores.fundo }}><ActivityIndicator size="large" color={cores.verde} /></View>;
  }
  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: cores.fundo } }} />
    </>
  );
}
