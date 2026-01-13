/**
 * Badge Icons Component
 * Uses Ionicons with consistent purple brand color
 */

import React from 'react';
import { Ionicons } from '@expo/vector-icons';

const COLORS = {
  primary: '#200191',
  locked: '#9CA3AF',
};

// Badge icon mapping - all use primary purple when earned
const BADGE_ICONS: Record<string, string> = {
  first_step: 'footsteps',
  saver: 'wallet',
  committed: 'trending-up',
  serious_saver: 'star',
  goal_getter: 'trophy',
  consistent: 'flame',
  dedicated: 'ribbon',
};

interface BadgeIconProps {
  badgeId: string;
  size?: number;
  isLocked?: boolean;
}

export default function BadgeIcon({ badgeId, size = 24, isLocked = false }: BadgeIconProps) {
  const icon = BADGE_ICONS[badgeId] || 'help-circle';
  const color = isLocked ? COLORS.locked : COLORS.primary;

  return (
    <Ionicons
      name={icon as any}
      size={size}
      color={color}
    />
  );
}
