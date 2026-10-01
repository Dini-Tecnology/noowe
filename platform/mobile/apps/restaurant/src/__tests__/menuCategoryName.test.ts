import { hasDuplicateCategoryName } from '../screens/v2/menuCategoryName';

const categories = [
  { id: 'a', name: 'Sobremesa' },
  { id: 'b', name: 'Bebidas' },
];

describe('category names', () => {
  it('rejects a second category with the same name, ignoring case and surrounding spaces', () => {
    expect(hasDuplicateCategoryName(categories, '  sobremesa  ')).toBe(true);
    expect(hasDuplicateCategoryName(categories, 'SOBREMESA')).toBe(true);
  });

  it('allows the category to keep its own name', () => {
    expect(hasDuplicateCategoryName(categories, 'Sobremesa', 'a')).toBe(false);
  });

  it('allows a name that is not taken', () => {
    expect(hasDuplicateCategoryName(categories, 'Entradas')).toBe(false);
    expect(hasDuplicateCategoryName(categories, '   ')).toBe(false);
  });
});
