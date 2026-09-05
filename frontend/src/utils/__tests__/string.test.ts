import { describe, it, expect } from 'vitest';
import { capitalize } from '../string';

describe('string utils', () => {
    describe('capitalize', () => {
        it('capitalizes first letter', () => {
            expect(capitalize('hello')).toBe('Hello');
        });

        it('handles empty string', () => {
            expect(capitalize('')).toBe('');
        });

        it('handles null/undefined', () => {
            expect(capitalize(null as any)).toBe('');
            expect(capitalize(undefined as any)).toBe('');
        });

        it('handles single character', () => {
            expect(capitalize('a')).toBe('A');
        });

        it('handles already capitalized', () => {
            expect(capitalize('Hello')).toBe('Hello');
        });

        it('handles non-string input', () => {
            expect(capitalize(123 as any)).toBe('123');
        });
    });
});
