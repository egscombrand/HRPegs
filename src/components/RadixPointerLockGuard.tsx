'use client';

import * as React from 'react';

// List of selectors for Radix UI components that can be in an "open" state.
const OPEN_SELECTOR = [
  '[data-state="open"][role="dialog"]',
  '[data-state="open"][data-radix-popper-content-wrapper]',
  '[data-state="open"][data-radix-menu-content]',
  '[data-state="open"][data-radix-select-content]',
].join(', ');


/**
 * This component acts as a global safety net to prevent the UI from becoming unresponsive.
 * It uses a MutationObserver to proactively detect situations where Radix UI components
 * might have incorrectly left pointer-events disabled on the body after closing, and
 * forcefully resets them.
 */
export function RadixPointerLockGuard() {
  React.useEffect(() => {
    const observer = new MutationObserver(() => {
      // Use a short delay to allow Radix's closing animations to complete
      // before checking the final state of the DOM.
      setTimeout(() => {
        const isOpenOverlay = document.querySelector(OPEN_SELECTOR);

        // This is the "stuck" state: the body has pointer events disabled,
        // but no Radix component reports itself as open.
        if (document.body.style.pointerEvents === 'none' && !isOpenOverlay) {
          // Force-reset the styles to make the page interactive again.
          document.body.style.pointerEvents = '';
          document.body.style.overflow = '';
          document.body.removeAttribute('data-scroll-locked');
          document.body.removeAttribute('data-radix-scroll-area-scroll-y');
        }
      }, 150); // 150ms should be safe enough for animations
    });

    // We observe the body for any style changes, which is what Radix does to lock the screen.
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['style'],
    });

    // Clean up the observer when the component unmounts.
    return () => observer.disconnect();
  }, []);

  // This component does not render anything to the DOM.
  return null;
}
