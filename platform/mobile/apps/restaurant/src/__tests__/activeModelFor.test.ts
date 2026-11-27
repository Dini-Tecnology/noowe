import { activeModelFor } from '../contexts/RestaurantRoleContext';

// QA 26/11: ao trocar de restaurante, o modelo do anterior (fine_dining) era pedido ao novo, que só tem casual_dining;
// o servidor recusava e o app desligava mesas, chamados etc.
test('o modelo ativo vale só para o restaurante em que foi escolhido', () => {
  const state = { restaurantId: 'brndev', model: 'fine_dining' };
  expect(activeModelFor(state, 'brndev')).toBe('fine_dining');
  expect(activeModelFor(state, 'casa')).toBeNull();
  expect(activeModelFor(null, 'casa')).toBeNull();
});
