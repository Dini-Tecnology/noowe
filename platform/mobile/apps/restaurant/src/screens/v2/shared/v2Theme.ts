export type V2Tone = 'success' | 'danger' | 'warning' | 'info';

export const V2_TONE = {
  success: { bg: '#ECFDF5', text: '#059669' },
  danger: { bg: '#FEF2F2', text: '#EF4444' },
  warning: { bg: '#FFFBEB', text: '#D97706' },
  info: { bg: '#EFF6FF', text: '#0284C7' },
} as const;
