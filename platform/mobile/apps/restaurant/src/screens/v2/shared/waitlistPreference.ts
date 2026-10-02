/**
 * Setor que o grupo pediu ao entrar na fila (nome do setor do mapa de mesas), ou null quando
 * não tem preferência. Entradas antigas guardavam 'salao' / 'terraco'.
 */
const LEGACY_LABELS: Record<string, string> = { salao: 'Salão', terraco: 'Terraço' };

export function waitlistPreferenceLabel(preference: string | null | undefined): string | null {
  const value = (preference ?? '').trim();
  if (!value || value.toLowerCase() === 'qualquer') return null;
  return LEGACY_LABELS[value.toLowerCase()] ?? value;
}
