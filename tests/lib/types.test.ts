import { describe, expect, it } from 'vitest';
import { STUDY_DESIGNS, type StudyDesign } from '../../src/lib/types';

describe('shared types', () => {
  it('lists every study design exactly once', () => {
    expect(new Set(STUDY_DESIGNS).size).toBe(STUDY_DESIGNS.length);
    expect(STUDY_DESIGNS).toContain('rct');
    expect(STUDY_DESIGNS).toContain('unclear');
  });

  it('keeps STUDY_DESIGNS assignable to StudyDesign', () => {
    const designs: StudyDesign[] = [...STUDY_DESIGNS];
    expect(designs).toHaveLength(8);
  });
});
