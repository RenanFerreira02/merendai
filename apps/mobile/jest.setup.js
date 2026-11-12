// Icones dependem de expo-font/expo-asset nativos; no Jest viram um componente vazio.
jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return { Ionicons: (p) => React.createElement(Text, null, p.name) };
});
