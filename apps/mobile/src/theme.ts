/**
 * Tema do Merendai.
 * Decisoes de acessibilidade para o publico (produtor rural, 50+, pouca familiaridade digital):
 *  - tipografia grande (corpo 18, titulos 26+), contraste alto;
 *  - alvos de toque >= 56 px;
 *  - uma acao principal por tela, sempre a mesma cor;
 *  - verde da terra + amarelo do milho: paleta familiar, sem "cara de banco".
 */
export const cores = {
  verde: '#1B5E3A',
  verdeClaro: '#E6F2EB',
  milho: '#F2B705',
  terra: '#7A4E2D',
  fundo: '#FBFAF6',
  cartao: '#FFFFFF',
  texto: '#1E2A22',
  textoSuave: '#5A6B60',
  borda: '#DDE5DF',
  erro: '#B3261E',
  ok: '#2E7D32',
  aviso: '#C77700',
};

export const fonte = {
  titulo: 28,
  subtitulo: 22,
  corpo: 18,
  pequeno: 15,
};

export const espaco = { xs: 6, s: 12, m: 16, l: 24, xl: 32 };
export const raio = 16;
export const alvoToque = 56;
