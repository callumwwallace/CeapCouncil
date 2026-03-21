// validate env vars at startup, throws if missing

function requireEnv(name: string, devFallback?: string): string {
  const value = process.env[name];
  if (!value) {
    if (process.env.NODE_ENV !== 'production' && devFallback !== undefined) {
      return devFallback;
    }
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `Set it in your .env file or deployment environment.`
    );
  }
  return value;
}

function validateUrl(name: string, value: string): string {
  try {
    new URL(value);
  } catch {
    throw new Error(
      `Environment variable ${name}="${value}" is not a valid URL.`
    );
  }
  return value;
}

export const env = {
  NEXT_PUBLIC_API_URL: validateUrl(
    'NEXT_PUBLIC_API_URL',
    requireEnv('NEXT_PUBLIC_API_URL', 'http://localhost:8000/api/v1')
  ),
} as const;
