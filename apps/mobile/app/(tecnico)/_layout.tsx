import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { cores, fonte } from '@/theme';

export default function TecnicoLayout() {
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: cores.verde,
      tabBarInactiveTintColor: cores.textoSuave,
      tabBarStyle: { height: 64, paddingBottom: 8, paddingTop: 4, backgroundColor: '#fff' },
      tabBarLabelStyle: { fontSize: 13, fontWeight: '600' },
    }}>
      <Tabs.Screen name="index" options={{ title: 'Painel', tabBarIcon: ({ color }) => <Ionicons name="speedometer-outline" size={26} color={color} /> }} />
      <Tabs.Screen name="produtores" options={{ title: 'Produtores', tabBarIcon: ({ color }) => <Ionicons name="people-outline" size={26} color={color} /> }} />
      <Tabs.Screen name="propostas" options={{ title: 'Propostas', tabBarIcon: ({ color }) => <Ionicons name="documents-outline" size={26} color={color} /> }} />
      <Tabs.Screen name="novo-produtor" options={{ href: null }} />
    </Tabs>
  );
}
