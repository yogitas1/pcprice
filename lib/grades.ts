export const GRADE_LABELS: Record<number, string> = {
  1: 'Poor',
  2: 'Fair',
  3: 'Good',
  4: 'Excellent',
  5: 'Mint',
};

export const GRADE_FRACTION: Record<number, string> = {
  1: '1/5',
  2: '2/5',
  3: '3/5',
  4: '4/5',
  5: '5/5',
};

export function gradeLabel(grade: number): string {
  return `${GRADE_FRACTION[grade] ?? grade}/5 · ${GRADE_LABELS[grade] ?? 'Unknown'}`;
}

export function gradeShort(grade: number): string {
  return `${GRADE_FRACTION[grade] ?? grade} ${GRADE_LABELS[grade] ?? ''}`;
}
