import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useResizableColumns } from './useResizableColumns';

const KEY = 'test.colWidths';
const DEFAULTS = { a: 100, b: 200, c: 300 };

describe('useResizableColumns', () => {
  beforeEach(() => { localStorage.clear(); });

  it('returns defaults when localStorage is empty', () => {
    const { result } = renderHook(() => useResizableColumns(KEY, DEFAULTS));
    expect(result.current.widths).toEqual(DEFAULTS);
  });

  it('reads persisted widths from localStorage', () => {
    localStorage.setItem(KEY, JSON.stringify({ a: 150 }));
    const { result } = renderHook(() => useResizableColumns(KEY, DEFAULTS));
    expect(result.current.widths).toEqual({ a: 150, b: 200, c: 300 });
  });

  it('reset() restores defaults', () => {
    localStorage.setItem(KEY, JSON.stringify({ a: 999 }));
    const { result } = renderHook(() => useResizableColumns(KEY, DEFAULTS));
    act(() => { result.current.reset(); });
    expect(result.current.widths).toEqual(DEFAULTS);
  });

  it('persists to localStorage on change', () => {
    localStorage.setItem(KEY, JSON.stringify({ a: 555, b: 200, c: 300 }));
    const { result } = renderHook(() => useResizableColumns(KEY, DEFAULTS));
    expect(result.current.widths.a).toBe(555);
  });

  it('handles malformed localStorage without crashing', () => {
    localStorage.setItem(KEY, 'not json');
    const { result } = renderHook(() => useResizableColumns(KEY, DEFAULTS));
    expect(result.current.widths).toEqual(DEFAULTS);
  });
});
