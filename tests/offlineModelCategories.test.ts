import { describe, expect, it } from 'vitest';
import { classifyOfflineModel, isOfflineModelCategory, OFFLINE_MODEL_CATEGORIES } from '../src/lib/offlineModelCategories';

describe('offline model categories', () => {
  it('classifies education subcategories and the parent learning category', () => {
    expect(classifyOfflineModel(['english', 'grammar'], null)).toEqual(['english', 'learning']);
    expect(classifyOfflineModel(['robotics', 'ROS'], null)).toEqual(['robotics', 'learning']);
    expect(classifyOfflineModel(['mathematics', 'algebra'], null)).toEqual(['mathematics', 'learning']);
  });

  it('keeps science as an independent category and learning subcategory', () => {
    expect(classifyOfflineModel(['science', 'physics'], null)).toEqual(['science', 'learning']);
    expect(OFFLINE_MODEL_CATEGORIES).toContain('science');
  });

  it('classifies coding, creative and general independently', () => {
    expect(classifyOfflineModel(['python', 'programming'], null)).toEqual(['coding']);
    expect(classifyOfflineModel(['creative-writing', 'poetry'], null)).toEqual(['creative']);
    expect(classifyOfflineModel([], null)).toEqual(['general']);
  });

  it('validates only supported category keys', () => {
    expect(isOfflineModelCategory('robotics')).toBe(true);
    expect(isOfflineModelCategory('science')).toBe(true);
    expect(isOfflineModelCategory('unknown')).toBe(false);
  });
});
