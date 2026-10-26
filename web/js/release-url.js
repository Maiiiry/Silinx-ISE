// The URLs the update check may link to (#1444): GitHub's release object (api.github.com, kept in localStorage
// for the next sessions) gives the release's page and its assets' downloads; an anchor is made only from a URL of
// GitHub's own origins, anything else is shown as text. No side effects when loaded.

// where a release's page and its downloads live
const RELEASE_ORIGINS = new Set(['https://github.com', 'https://api.github.com', 'https://objects.githubusercontent.com']);

/** The URL as given when it is an https URL of GitHub (its site, its API, its downloads), else null. */
export function safeReleaseUrl(u) {
  if (typeof u !== 'string') return null;
  try { return RELEASE_ORIGINS.has(new URL(u).origin) ? u : null; } catch { return null; }
}
