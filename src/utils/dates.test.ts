import { describe, expect, it } from 'vitest';
import { daysUntilExam, formatExamDate, normalizeExamDate } from './dates';

describe('exam date formatting', () => {
  it('formats Excel serial dates as DD/MM/YYYY', () => {
    expect(normalizeExamDate('46264')).toBe('2026-08-30');
    expect(formatExamDate('46264')).toBe('30/08/2026');
  });

  it('normalizes ISO and day-first dates for filtering and storage', () => {
    expect(normalizeExamDate('2026-08-30')).toBe('2026-08-30');
    expect(normalizeExamDate('30/08/2026')).toBe('2026-08-30');
    expect(normalizeExamDate('31/02/2026')).toBeNull();
  });

  it('calculates whole calendar days until an exam date', () => {
    const today = new Date(2026, 10, 3);
    expect(daysUntilExam('2026-11-10', today)).toBe(7);
    expect(daysUntilExam('2026-11-02', today)).toBe(-1);
    expect(daysUntilExam('invalid', today)).toBeNull();
  });
});
