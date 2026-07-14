import { describe, it, expect } from 'vitest';
import { toEgp, fmtInt, fmtEgp, initials, FX_TO_EGP } from './format';

describe('toEgp', () => {
  it('returns 0 for null/zero', () => {
    expect(toEgp(null)).toBe(0);
    expect(toEgp(0, 'USD')).toBe(0);
  });
  it('multiplies USD by FX_TO_EGP.USD', () => {
    expect(toEgp(100, 'USD')).toBe(100 * FX_TO_EGP.USD);
  });
  it('defaults to 1 for unknown currency', () => {
    expect(toEgp(100, 'XYZ')).toBe(100);
  });
  it('treats missing currency as EGP', () => {
    expect(toEgp(1500)).toBe(1500);
  });
});

describe('fmtInt / fmtEgp', () => {
  it('thousand-separates', () => {
    expect(fmtInt(1234567)).toBe('1,234,567');
  });
  it('rounds', () => {
    expect(fmtInt(1.6)).toBe('2');
  });
  it('prefixes EGP', () => {
    expect(fmtEgp(1000)).toBe('EGP 1,000');
  });
});

describe('initials', () => {
  it('handles empty', () => { expect(initials(null)).toBe('?'); });
  it('takes first two words', () => { expect(initials('Nour Adel Salem')).toBe('NA'); });
  it('uppercases', () => { expect(initials('nour')).toBe('N'); });
});
