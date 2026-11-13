import { reais, unidade, data } from '@/components/ui';

describe('formatadores (linguagem do produtor)', () => {
  it('formata reais em pt-BR', () => {
    expect(reais(10080).replace(/ /g, ' ')).toBe('R$ 10.080,00');
    expect(reais(0).replace(/ /g, ' ')).toBe('R$ 0,00');
  });
  it('formata quantidade com unidade curta', () => {
    expect(unidade('KG', 2400)).toBe('2.400 kg');
    expect(unidade('MACO', 60)).toBe('60 macos');
    expect(unidade('DZ', 12)).toBe('12 dz');
  });
  it('formata data curta e aceita vazio', () => {
    expect(data('2027-02-08T03:00:00.000Z')).toMatch(/08/);
    expect(data(undefined)).toBe('');
  });
});
