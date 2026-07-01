export const RARITY_LABELS: Record<string, string> = {
  common:       'Album PC',
  uncommon:     'Version PC',
  rare:         '1 in 5',
  'ultra-rare': '1 in 25',
  secret:       'Lucky Draw',
  legendary:    'Event Only',
};

export const RARITY_DESCRIPTIONS: Record<string, string> = {
  common:       'Included in every album copy — every buyer gets one.',
  uncommon:     'Exclusive to a specific album version or sub-unit.',
  rare:         'Approximately 1 in 5 albums include this card.',
  'ultra-rare': 'Approximately 1 in 25 albums include this card.',
  secret:       'Lucky draw — awarded randomly at events or pop-up shops.',
  legendary:    'Event exclusive — fansign, showcase, or unreleased print.',
};

export const RARITY_COLORS: Record<string, string> = {
  common:       'text-zinc-400',
  uncommon:     'text-emerald-400',
  rare:         'text-blue-400',
  'ultra-rare': 'text-purple-400',
  secret:       'text-amber-400',
  legendary:    'text-rose-400',
};

export function rarityLabel(tier: string | null | undefined): string {
  return RARITY_LABELS[tier ?? ''] ?? tier ?? '';
}
