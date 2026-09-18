import { describe, it, expect } from 'vitest';
import { shouldShowBrowserNotification } from './notif-browser.js';

describe('shouldShowBrowserNotification', () => {
  it('shows when permission is granted and the page is not visible', () => {
    expect(shouldShowBrowserNotification('granted', false)).toBe(true);
  });

  it('does not show when the page is already visible, even with permission granted', () => {
    expect(shouldShowBrowserNotification('granted', true)).toBe(false);
  });

  it('does not show when permission is denied, regardless of visibility', () => {
    expect(shouldShowBrowserNotification('denied', false)).toBe(false);
    expect(shouldShowBrowserNotification('denied', true)).toBe(false);
  });

  it('does not show when permission is still default (never asked)', () => {
    expect(shouldShowBrowserNotification('default', false)).toBe(false);
  });
});
