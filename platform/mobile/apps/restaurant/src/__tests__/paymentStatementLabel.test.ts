/**
 * Extrato do Dono: pagamento fora do app passou pela maquininha da casa, menos dinheiro,
 * que vai para a gaveta e não pode aparecer como "Maquininha – dinheiro".
 */
import { statementLabel } from '../screens/v2/shared/PaymentStatementCard';

jest.mock('@react-navigation/native', () => ({ useFocusEffect: jest.fn() }));
jest.mock('@okinawa/shared/contexts/ThemeContext', () => ({ useColors: () => ({}) }));
jest.mock('@okinawa/shared/services/supabase-api', () => ({ supabaseApiAdapter: {} }));
jest.mock('../contexts/RestaurantRoleContext', () => ({ useRestaurantRole: jest.fn() }));

describe('statementLabel', () => {
  it('dinheiro fora do app continua sendo dinheiro, sem maquininha', () => {
    expect(statementLabel('cash', true)).toBe('Dinheiro');
  });

  it('cartão e Pix fora do app aparecem como maquininha', () => {
    expect(statementLabel('credit_card', true)).toBe('Maquininha – crédito');
    expect(statementLabel('debit_card', true)).toBe('Maquininha – débito');
    expect(statementLabel('pix', true)).toBe('Maquininha – pix');
  });

  it('pagamento pelo app mostra só a forma de pagamento', () => {
    expect(statementLabel('credit_card', false)).toBe('Crédito');
    expect(statementLabel('tap_card', false)).toBe('Aproximação');
    expect(statementLabel('cash', false)).toBe('Dinheiro');
  });

  it('forma desconhecida aparece como veio, sem quebrar o extrato', () => {
    expect(statementLabel('outra', false)).toBe('outra');
  });
});
