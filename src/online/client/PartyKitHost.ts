type PartyKitEnv = {
    DEV?: boolean;
    VITE_PARTYKIT_HOST?: string;
};

type PartyKitGlobal = {
    __TINY_RPG_PARTYKIT_HOST?: unknown;
};

const DEV_PARTYKIT_HOST = 'localhost:1999';
const PRODUCTION_PARTYKIT_HOST = 'tiny-rpg-online.andredarcie.partykit.dev';

function normalizePartyKitHost(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    return trimmed
        .replace(/^wss?:\/\//i, '')
        .replace(/^https?:\/\//i, '')
        .replace(/\/+$/g, '');
}

export function resolvePartyKitHost(
    env: PartyKitEnv = import.meta.env,
    runtime: PartyKitGlobal = globalThis as PartyKitGlobal,
): string {
    const runtimeHost = normalizePartyKitHost(runtime.__TINY_RPG_PARTYKIT_HOST);
    if (runtimeHost) return runtimeHost;

    const envHost = normalizePartyKitHost(env.VITE_PARTYKIT_HOST);
    if (envHost) return envHost;

    return env.DEV ? DEV_PARTYKIT_HOST : PRODUCTION_PARTYKIT_HOST;
}

export { DEV_PARTYKIT_HOST, PRODUCTION_PARTYKIT_HOST };
