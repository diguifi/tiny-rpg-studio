const viteEnv = import.meta.env as ImportMetaEnv & { VITE_APP_VERSION?: string };

export const CURRENT_APP_VERSION: string = viteEnv.VITE_APP_VERSION || 'development';

export function createVersionManifest(version: string): { version: string } {
  return { version };
}

export function resolveVersionJsonUrl(baseUrl: string, currentHref: string): URL {
  return new URL('version.json', new URL(baseUrl, currentHref));
}
