import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { cores, fonte } from '@/theme';

export default function ProdutorLayout() {
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: cores.verde,
      tabBarInactiveTintColor: cores.textoSuave,
      tabBarStyle: { height: 72, paddingBottom: 10, paddingTop: 6, backgroundColor: '#fff' },
      tabBarLabelStyle: { fontSize: fonte.pequeno, fontWeight: '600' },
    }}>
      <Tabs.Screen name="index" options={{ title: 'Oportunidades', tabBarIcon: ({ color }) => <Ionicons name="megaphone-outline" size={28} color={color} /> }} />
      <Tabs.Screen name="falar" options={{ title: 'Falar', tabBarIcon: ({ color }) => <Ionicons name="mic-circle" size={40} color={color} /> }} />
      <Tabs.Screen name="entregas" options={{ title: 'Entregas', tabBarIcon: ({ color }) => <Ionicons name="calendar-outline" size={28} color={color} /> }} />
      <Tabs.Screen name="proposta/[id]" options={{ href: null }} />
    </Tabs>
  );
}
