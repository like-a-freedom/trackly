// @ts-nocheck - Test mocks don't need full type fidelity
import { describe, it, expect } from 'vitest';
import { generatePkce, generateState, parseJwt } from '../pkce';

describe('pkce', () => {
    describe('generatePkce', () => {
        it('generates a code verifier of correct length', async () => {
            const { codeVerifier } = await generatePkce();
            expect(typeof codeVerifier).toBe('string');
            expect(codeVerifier.length).toBeGreaterThanOrEqual(40);
            expect(codeVerifier.length).toBeLessThanOrEqual(50);
        });

        it('generates a code challenge derived from the verifier', async () => {
            const { codeVerifier, codeChallenge } = await generatePkce();
            expect(codeChallenge).toBeTruthy();
            expect(codeChallenge).not.toBe(codeVerifier);
            // Challenge is base64url-encoded SHA-256, should be ~43 chars
            expect(codeChallenge.length).toBeGreaterThanOrEqual(40);
        });

        it('produces different values on successive calls', async () => {
            const a = await generatePkce();
            const b = await generatePkce();
            expect(a.codeVerifier).not.toBe(b.codeVerifier);
            expect(a.codeChallenge).not.toBe(b.codeChallenge);
        });
    });

    describe('generateState', () => {
        it('returns a 32-character hex string', () => {
            const state = generateState();
            expect(state).toMatch(/^[0-9a-f]{32}$/);
        });

        it('produces different values on successive calls', () => {
            const a = generateState();
            const b = generateState();
            expect(a).not.toBe(b);
        });
    });

    describe('parseJwt', () => {
        it('parses a valid JWT payload', () => {
            // Minimal JWT: header.payload.signature
            const payload = { sub: '123', exp: 9999999999 };
            const encoded = btoa(JSON.stringify(payload));
            const token = `header.${encoded}.signature`;
            const result = parseJwt(token);
            expect(result).toEqual(payload);
        });

        it('returns null for invalid tokens', () => {
            expect(parseJwt('invalid')).toBeNull();
            expect(parseJwt('')).toBeNull();
        });
    });
});
