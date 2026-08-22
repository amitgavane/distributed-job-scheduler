import { describe, it, expect } from 'vitest';
import { generateHeuristicSummary } from '../src/services/failure-analysis.service';

describe('Failure analysis', () => {
  it('detects timeout patterns', () => {
    const summary = generateHeuristicSummary({
      error: 'ETIMEDOUT connecting to upstream',
      attempts: 3,
      handler: 'http_request',
    });
    expect(summary).toContain('Timed out');
  });

  it('notes deterministic failures', () => {
    const summary = generateHeuristicSummary({
      error: 'validation failed',
      attempts: 3,
      handler: 'process_data',
      recentErrors: ['validation failed', 'validation failed'],
    });
    expect(summary).toContain('not transient');
  });

  it('falls back when pattern is unknown', () => {
    const summary = generateHeuristicSummary({
      error: 'something weird happened',
      attempts: 2,
      handler: 'echo',
    });
    expect(summary).toContain('No obvious pattern');
  });
});
