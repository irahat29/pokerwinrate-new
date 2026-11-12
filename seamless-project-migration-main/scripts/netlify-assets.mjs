// The published Lovable app. Netlify has no game server key and no Lovable image paths,
// so the Netlify site forwards images (/__l5e/*) and game requests (/_serverFn/*) here.
// Set LOVABLE_APP_ORIGIN in Netlify's environment, or edit the fallback after publishing on Lovable.
export const LOVABLE_APP_ORIGIN = (process.env.LOVABLE_APP_ORIGIN || 'https://masterpokers.lovable.app').replace(/\/+$/, '');
