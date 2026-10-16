import type { Ref } from "vue";

type TooltipIcon = HTMLElement & {
    _tooltipHandlers?: { showHandler: () => void; hideHandler: () => void };
};

export interface TooltipPlacement {
    /** Bind tooltip listeners to every `.info-icon[data-tooltip]` inside the container. */
    attach: () => void;
    /** Unbind listeners and global resize/scroll handlers. Idempotent. */
    detach: () => void;
    /** Recompute above/below placement for a single icon. */
    updatePlacement: (icon: HTMLElement) => void;
}

/**
 * Tooltip placement for the info icons inside a scrollable panel.
 *
 * The measurement node has to live inside the panel so the panel's scoped
 * styles (font, padding) apply to it; that is why placement is measured rather
 * than derived from the icon alone.
 *
 * Extracted from `TrackDetailPanel.vue` (ADR 0033).
 */
export function useTooltipPlacement(container: Ref<HTMLElement | null>): TooltipPlacement {
    let resizeHandler: (() => void) | null = null;
    let scrollHandler: (() => void) | null = null;

    const icons = (): TooltipIcon[] =>
        container.value
            ? Array.from(
                  container.value.querySelectorAll<TooltipIcon>(
                      ".info-icon[data-tooltip]"
                  )
              )
            : [];

    const createMeasureNode = (text: string): HTMLElement => {
        const measure = document.createElement("div");
        measure.className = "info-icon__measure";
        measure.textContent = text;
        return measure;
    };

    const updatePlacement = (el: HTMLElement): void => {
        const panel = container.value;
        if (!el || !panel) return;

        const tooltipText = el.getAttribute("data-tooltip");
        if (!tooltipText) return;

        const measure = createMeasureNode(tooltipText);
        panel.appendChild(measure);

        const panelRect = panel.getBoundingClientRect();
        const iconRect = el.getBoundingClientRect();
        const measureRect = measure.getBoundingClientRect();

        const aboveSpace = iconRect.top - panelRect.top;
        const belowSpace = panelRect.bottom - iconRect.bottom;

        // Default: place above; flip below when there is not enough room above.
        el.classList.remove("tooltip-bottom");
        if (measureRect.height + 16 > aboveSpace && belowSpace > aboveSpace) {
            el.classList.add("tooltip-bottom");
        }

        measure.remove();
    };

    // Resize and scroll both invalidate the placement of whichever icon is open.
    const repaintActive = (): void => {
        icons().forEach((icon) => {
            if (icon.classList.contains("tooltip-active")) updatePlacement(icon);
        });
    };

    const attach = (): void => {
        const panel = container.value;
        if (!panel) return;

        icons().forEach((icon) => {
            const showHandler = (): void => {
                icon.classList.add("tooltip-active");
                updatePlacement(icon);
            };
            const hideHandler = (): void => {
                icon.classList.remove("tooltip-active");
                icon.classList.remove("tooltip-bottom");
            };
            icon._tooltipHandlers = { showHandler, hideHandler };
            icon.addEventListener("mouseenter", showHandler);
            icon.addEventListener("focus", showHandler);
            icon.addEventListener("touchstart", showHandler, { passive: true });
            icon.addEventListener("mouseleave", hideHandler);
            icon.addEventListener("blur", hideHandler);
        });

        resizeHandler = repaintActive;
        scrollHandler = repaintActive;
        window.addEventListener("resize", resizeHandler);
        panel.addEventListener("scroll", scrollHandler);
    };

    const detach = (): void => {
        icons().forEach((icon) => {
            const handlers = icon._tooltipHandlers;
            if (!handlers) return;
            icon.removeEventListener("mouseenter", handlers.showHandler);
            icon.removeEventListener("focus", handlers.showHandler);
            icon.removeEventListener("touchstart", handlers.showHandler);
            icon.removeEventListener("mouseleave", handlers.hideHandler);
            icon.removeEventListener("blur", handlers.hideHandler);
            delete icon._tooltipHandlers;
        });

        if (resizeHandler) {
            window.removeEventListener("resize", resizeHandler);
            resizeHandler = null;
        }
        if (scrollHandler && container.value) {
            container.value.removeEventListener("scroll", scrollHandler);
            scrollHandler = null;
        }
    };

    return { attach, detach, updatePlacement };
}
