export function categoryNameKey(name: string): string {
  return name.trim().toLocaleLowerCase('pt-BR');
}

export function hasDuplicateCategoryName(
  categories: { id: string; name: string }[],
  name: string,
  ignoreId?: string,
): boolean {
  const key = categoryNameKey(name);
  if (!key) return false;
  return categories.some(
    (category) => category.id !== ignoreId && categoryNameKey(category.name) === key,
  );
}
