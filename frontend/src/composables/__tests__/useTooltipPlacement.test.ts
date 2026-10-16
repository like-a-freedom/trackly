import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ref } from 'vue';
import type { Ref } from 'vue';
import { useTooltipPlacement } from '../useTooltipPlacement';
import type { TooltipPlacement } from '../useTooltipPlacement';

/** jsdom reports zeroes for every element, so placement needs explicit geometry. */
const rect = (top: number, bottom: number): DOMRect =>
    ({
        top,
        bottom,
        left: 0,
        right: 0,
        width: 0,
        height: bottom - top,
        x: 0,
        y: top,
        toJSON: () => ({}),
    }) as DOMRect;

describe('useTooltipPlacement', () => {
    let panel: HTMLElement;
    let icon: HTMLElement;
    let container: Ref<HTMLElement | null>;
    let placement: TooltipPlacement;
    // Geometry the getBoundingClientRect stub reports to the composable.
    let tooltipHeight: number;
    let iconTop: number;
    let iconBottom: number;

    beforeEach(() => {
        tooltipHeight = 40;
        iconTop = 100;
        iconBottom = 120;

        // Panel spans 0..200 and the icon sits at 100..120 => 100px above, 80px below.
        panel = document.createElement('div');
        panel.innerHTML = '<span class="info-icon" data-tooltip="Hint"></span>';
        icon = panel.querySelector<HTMLElement>('.info-icon')!;
        document.body.appendChild(panel);

        vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
            function (this: HTMLElement) {
                if (this.classList.contains('info-icon__measure')) return rect(0, tooltipHeight);
                if (this === panel) return rect(0, 200);
                if (this === icon) return rect(iconTop, iconBottom);
                return rect(0, 0);
            }
        );

        container = ref<HTMLElement | null>(panel);
        placement = useTooltipPlacement(container);
    });

    afterEach(() => {
        placement.detach();
        panel.remove();
        vi.restoreAllMocks();
    });

    it('activates the tooltip on hover and deactivates it on leave', () => {
        placement.attach();

        icon.dispatchEvent(new Event('mouseenter'));
        expect(icon.classList.contains('tooltip-active')).toBe(true);

        icon.dispatchEvent(new Event('mouseleave'));
        expect(icon.classList.contains('tooltip-active')).toBe(false);
        expect(icon.classList.contains('tooltip-bottom')).toBe(false);
    });

    it('leaves icons without a data-tooltip attribute untouched', () => {
        panel.insertAdjacentHTML('beforeend', '<span class="info-icon"></span>');
        const plainIcon = panel.querySelectorAll<HTMLElement>('.info-icon')[1];

        placement.attach();
        plainIcon.dispatchEvent(new Event('mouseenter'));

        expect(plainIcon.classList.contains('tooltip-active')).toBe(false);
    });

    it('keeps the tooltip above the icon when there is enough room', () => {
        placement.updatePlacement(icon);

        // 40px of tooltip + 16px margin still fits in the 100px above the icon.
        expect(icon.classList.contains('tooltip-bottom')).toBe(false);
    });

    it('flips the tooltip below the icon when the room above runs out', () => {
        tooltipHeight = 90; // 90 + 16 > 100px above the icon
        iconTop = 10;
        iconBottom = 30; // 170px below the icon

        placement.updatePlacement(icon);

        expect(icon.classList.contains('tooltip-bottom')).toBe(true);
    });

    it('recomputes the placement of the active icon on resize and on panel scroll', () => {
        placement.attach();
        icon.dispatchEvent(new Event('mouseenter'));
        expect(icon.classList.contains('tooltip-active')).toBe(true);
        expect(icon.classList.contains('tooltip-bottom')).toBe(false);

        tooltipHeight = 90;
        iconTop = 10;
        iconBottom = 30;

        window.dispatchEvent(new Event('resize'));
        expect(icon.classList.contains('tooltip-bottom')).toBe(true);

        icon.classList.remove('tooltip-bottom');
        panel.dispatchEvent(new Event('scroll'));
        expect(icon.classList.contains('tooltip-bottom')).toBe(true);
    });

    it('detaches the listeners and stays idempotent', () => {
        placement.attach();
        placement.detach();
        placement.detach();

        icon.dispatchEvent(new Event('mouseenter'));
        expect(icon.classList.contains('tooltip-active')).toBe(false);

        // The resize handler must be gone too: flipping the geometry changes nothing.
        tooltipHeight = 90;
        iconTop = 10;
        iconBottom = 30;
        window.dispatchEvent(new Event('resize'));
        expect(icon.classList.contains('tooltip-bottom')).toBe(false);
    });

    it('does nothing while the container is unmounted', () => {
        container.value = null;

        expect(() => {
            placement.attach();
            placement.updatePlacement(icon);
            placement.detach();
        }).not.toThrow();
        expect(icon.classList.contains('tooltip-active')).toBe(false);
    });
});
