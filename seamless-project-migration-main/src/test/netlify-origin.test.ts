import { describe, expect, it } from 'vitest';
import { LOVABLE_APP_ORIGIN } from '../../scripts/netlify-assets.mjs';

describe('Netlify service destination', () => {
  it('forwards game requests and logo assets to the current published project', () => {
    expect(LOVABLE_APP_ORIGIN).toBe('https://masterpokers.lovable.app');
  });
});