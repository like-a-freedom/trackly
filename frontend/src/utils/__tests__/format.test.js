import { describe, it, expect } from 'vitest';
import { formatDuration, formatDistance, convertUrlsToLinks } from '../format.js';

describe('format.js', () => {
    describe('formatDuration', () => {
        it('should format seconds to human readable format', () => {
            expect(formatDuration(0)).toBe('0:00');
            expect(formatDuration(59)).toBe('0:59');
            expect(formatDuration(60)).toBe('1:00');
            expect(formatDuration(3661)).toBe('1:01:01');
        });

        it('should handle null/undefined values', () => {
            expect(formatDuration(null)).toBe('0:00');
            expect(formatDuration(undefined)).toBe('0:00');
            expect(formatDuration(-1)).toBe('0:00');
        });
    });

    describe('formatDistance', () => {
        it('should format distance in kilometers', () => {
            expect(formatDistance(0)).toBe('0m');
            expect(formatDistance(0.5)).toBe('500m');
            expect(formatDistance(1)).toBe('1.00 km');
            expect(formatDistance(10.5)).toBe('10.50 km');
        });

        it('should format distance in miles', () => {
            expect(formatDistance(1.60934, 'mi')).toBe('1.00 mi');
            expect(formatDistance(16.0934, 'mi')).toBe('10.00 mi');
        });

        it('should handle null/undefined values', () => {
            expect(formatDistance(null)).toBe('0m');
            expect(formatDistance(undefined)).toBe('0m');
            expect(formatDistance(-1)).toBe('0m');
        });
    });

    describe('convertUrlsToLinks', () => {
        it('should convert http URLs to HTML links', () => {
            const input = 'Check out http://example.com for more info';
            const expected = 'Check out <a href="http://example.com" target="_blank" rel="noopener noreferrer">http://example.com</a> for more info';
            expect(convertUrlsToLinks(input)).toBe(expected);
        });

        it('should convert https URLs to HTML links', () => {
            const input = 'Visit https://google.com';
            const expected = 'Visit <a href="https://google.com" target="_blank" rel="noopener noreferrer">https://google.com</a>';
            expect(convertUrlsToLinks(input)).toBe(expected);
        });

        it('should convert www URLs to HTML links with https protocol', () => {
            const input = 'Go to www.example.com';
            const expected = 'Go to <a href="https://www.example.com" target="_blank" rel="noopener noreferrer">www.example.com</a>';
            expect(convertUrlsToLinks(input)).toBe(expected);
        });

        it('should handle multiple URLs in text', () => {
            const input = 'Visit http://site1.com and https://site2.com or www.site3.com';
            const expected = 'Visit <a href="http://site1.com" target="_blank" rel="noopener noreferrer">http://site1.com</a> and <a href="https://site2.com" target="_blank" rel="noopener noreferrer">https://site2.com</a> or <a href="https://www.site3.com" target="_blank" rel="noopener noreferrer">www.site3.com</a>';
            expect(convertUrlsToLinks(input)).toBe(expected);
        });

        it('should escape HTML entities in URLs', () => {
            const input = 'Check http://example.com/<script>';
            const expected = 'Check <a href="http://example.com/&lt;script&gt;" target="_blank" rel="noopener noreferrer">http://example.com/<script></a>';
            expect(convertUrlsToLinks(input)).toBe(expected);
        });

        it('should handle URLs with special characters', () => {
            const input = 'Visit https://example.com/path?query=value&other=test';
            const expected = 'Visit <a href="https://example.com/path?query=value&amp;other=test" target="_blank" rel="noopener noreferrer">https://example.com/path?query=value&other=test</a>';
            expect(convertUrlsToLinks(input)).toBe(expected);
        });

        it('should return original text if no URLs found', () => {
            const input = 'This is just plain text without any URLs';
            expect(convertUrlsToLinks(input)).toBe(input);
        });

        it('should handle null/undefined input', () => {
            expect(convertUrlsToLinks(null)).toBe(null);
            expect(convertUrlsToLinks(undefined)).toBe(undefined);
            expect(convertUrlsToLinks('')).toBe('');
        });

        it('should preserve text formatting around URLs', () => {
            const input = 'Text before http://example.com text after';
            const expected = 'Text before <a href="http://example.com" target="_blank" rel="noopener noreferrer">http://example.com</a> text after';
            expect(convertUrlsToLinks(input)).toBe(expected);
        });
    });
});
