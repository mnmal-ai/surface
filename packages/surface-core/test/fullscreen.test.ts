import { describe, expect, it } from 'vitest';
import {
  FOLLOWING,
  linesBelow,
  pageStep,
  resolveFullscreen,
  scrollBy,
  viewTop
} from '../src/fullscreen.js';

describe('resolveFullscreen', () => {
  it('defaults on', () => {
    expect(resolveFullscreen(undefined, undefined)).toEqual({ on: true, invalid: null });
  });

  it('the option sets it', () => {
    expect(resolveFullscreen(false, undefined).on).toBe(false);
  });

  it('env beats the option', () => {
    expect(resolveFullscreen(false, 'on')).toEqual({ on: true, invalid: null });
    expect(resolveFullscreen(true, 'off')).toEqual({ on: false, invalid: null });
  });

  it('trims and ignores case', () => {
    expect(resolveFullscreen(true, ' Off ').on).toBe(false);
  });

  it('empty env is unset', () => {
    expect(resolveFullscreen(false, '')).toEqual({ on: false, invalid: null });
  });

  it('anything else is reported and falls back', () => {
    expect(resolveFullscreen(false, '1')).toEqual({ on: false, invalid: '1' });
    expect(resolveFullscreen(undefined, 'true')).toEqual({ on: true, invalid: 'true' });
  });
});

describe('scroll', () => {
  it('following shows the bottom', () => {
    expect(viewTop(FOLLOWING, 50, 10)).toBe(40);
    expect(linesBelow(FOLLOWING, 50, 10)).toBe(0);
  });

  it('content shorter than the viewport shows from the top', () => {
    expect(viewTop(FOLLOWING, 4, 10)).toBe(0);
  });

  it('page up holds', () => {
    const s = scrollBy(FOLLOWING, -9, 50, 10);
    expect(s).toEqual({ held: 31 });
    expect(linesBelow(s, 50, 10)).toBe(9);
  });

  it('a held view ignores new output', () => {
    const s = { held: 31 };
    expect(viewTop(s, 80, 10)).toBe(31);
    expect(linesBelow(s, 80, 10)).toBe(39);
  });

  it('clamps at the top', () => {
    expect(scrollBy({ held: 3 }, -9, 50, 10)).toEqual({ held: 0 });
  });

  it('reaching the bottom follows again', () => {
    expect(scrollBy({ held: 35 }, 9, 50, 10)).toBe(FOLLOWING);
  });

  it('a held top past the end (after a resize) is clamped', () => {
    expect(viewTop({ held: 45 }, 50, 20)).toBe(30);
  });

  it('page up on content that fits stays following', () => {
    expect(scrollBy(FOLLOWING, -9, 4, 10)).toBe(FOLLOWING);
  });

  it('page step keeps a line of overlap, never below 1', () => {
    expect(pageStep(10)).toBe(9);
    expect(pageStep(1)).toBe(1);
  });
});
