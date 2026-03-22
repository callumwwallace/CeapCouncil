// Same as backend: letters, numbers, underscore only
const USERNAME_REGEX = /^[a-zA-Z0-9_]+$/;

// Sanitise username before building profile URLs (extra safety on top of backend)
export function safeProfilePath(username: string | null | undefined): string {
  if (!username || typeof username !== 'string') return '/profile';
  const s = username.trim();
  if (!s || !USERNAME_REGEX.test(s)) return '/profile';
  return `/profile/${s}`;
}
