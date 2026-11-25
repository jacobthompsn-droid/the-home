// Site-wide settings for The Home. Most of this "just works" on GitHub Pages.
export const CONFIG = {
  appName: 'The Home',
  // "owner/repo". Leave blank to auto-detect when hosted on <owner>.github.io/<repo>/
  githubRepo: '',
  // Used when the repo can't be detected (localhost, custom domains) so links to the repo always work.
  defaultRepo: 'jacobthompsn-droid/the-home',
  githubBranch: 'main',
  designsDir: 'designs',
  modelsDir: 'models',
  // Latitude drives sun angle & day length (40° ≈ New York / Denver / Madrid).
  latitude: 40,
  // Prefix for live-session peer IDs (PeerJS public broker).
  peerPrefix: 'thehome-v1-',
};

export function detectRepo() {
  if (CONFIG.githubRepo) return CONFIG.githubRepo;
  const host = location.hostname;
  if (host.endsWith('.github.io')) {
    const owner = host.split('.')[0];
    const first = location.pathname.split('/').filter(Boolean)[0];
    return first ? `${owner}/${first}` : `${owner}/${host}`;
  }
  return localStorage.getItem('thehome.repo') || '';
}
