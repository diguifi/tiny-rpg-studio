import { describe, expect, it } from 'vitest';
import { DEV_PARTYKIT_HOST, PRODUCTION_PARTYKIT_HOST, resolvePartyKitHost } from '../../online/client/PartyKitHost';

describe('resolvePartyKitHost', () => {
    it('uses VITE_PARTYKIT_HOST when configured', () => {
        expect(resolvePartyKitHost({ DEV: false, VITE_PARTYKIT_HOST: 'tiny-rpg-online.example.partykit.dev' }, {})).toBe(
            'tiny-rpg-online.example.partykit.dev',
        );
    });

    it('normalizes protocol and trailing slash from configured hosts', () => {
        expect(resolvePartyKitHost({ DEV: false, VITE_PARTYKIT_HOST: 'wss://tiny-rpg-online.example.partykit.dev/' }, {})).toBe(
            'tiny-rpg-online.example.partykit.dev',
        );
    });

    it('allows runtime host override', () => {
        expect(resolvePartyKitHost(
            { DEV: false, VITE_PARTYKIT_HOST: 'tiny-rpg-online.example.partykit.dev' },
            { __TINY_RPG_PARTYKIT_HOST: 'https://runtime.example.com/' },
        )).toBe('runtime.example.com');
    });

    it('uses localhost only in development and the fixed PartyKit host in production', () => {
        expect(resolvePartyKitHost({ DEV: true }, {})).toBe(DEV_PARTYKIT_HOST);
        expect(resolvePartyKitHost({ DEV: false }, {})).toBe(PRODUCTION_PARTYKIT_HOST);
    });
});
