/**
 * StatusBadge Component
 * 
 * Displays a status indicator chip with semantic color theming.
 * Supports both default status colors and custom color mappings.
 * Uses semantic tokens for consistent dark/light mode support.
 * 
 * @module shared/components/StatusBadge
 */

import React, { useMemo } from 'react';
import { Chip } from 'react-native-paper';
import { useColors } from '../contexts/ThemeContext';

interface StatusBadgeProps {
  /** Status key to display */
  status: string;
  /** Optional custom color mappings (overrides defaults) */
  statusColors?: Record<string, string>;
}

/**
 * Status badge component with semantic token styling
 * Colors are derived from the theme's semantic tokens
 */
export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  statusColors,
}) => {
  const colors = useColors();

  // Default status colors using semantic tokens
  const defaultStatusColors: Record<string, string> = useMemo(() => ({
    pending: colors.warning,
    confirmed: colors.success,
    preparing: colors.info,
    ready: colors.secondary,
    delivering: colors.info,
    completed: colors.success,
    cancelled: colors.destructive,
    failed: colors.destructive,
    active: colors.success,
    inactive: colors.muted,
    seated: colors.info,
    new: colors.primary,
    in_progress: colors.warning,
  }), [colors]);

  const mergedColors = statusColors 
    ? { ...defaultStatusColors, ...statusColors }
    : defaultStatusColors;

  const backgroundColor = mergedColors[status] || colors.muted;

  return (
    <Chip
      style={{ backgroundColor }}
      textStyle={{ 
        color: colors.primaryForeground, 
        fontSize: 11, 
        fontWeight: '600' 
      }}
    >
      {status.replace('_', ' ').toUpperCase()}
    </Chip>
  );
};
