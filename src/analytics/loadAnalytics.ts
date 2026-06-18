/**
 * Loads the Google Analytics `gtag.js` script OFF the boot critical path.
 *
 * `index.html` defines the `dataLayer`/`gtag()` stub and the `gtag('config', …)`
 * call synchronously, so any early events queue immediately. This module injects
 * the actual `gtag.js` network script when the browser is idle (or after a short
 * fallback delay), at which point the queued events are flushed. Keeping the
 * fetch off boot removes it from the long-task/`load` critical path. See AP-1.
 */

const GA_MEASUREMENT_ID = 'G-D8S0K3NWFV';

type IdleGlobal = typeof globalThis & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
};

export function loadAnalyticsWhenIdle(measurementId: string = GA_MEASUREMENT_ID): void {
  if (typeof document === 'undefined') return;

  const inject = (): void => {
    if (document.getElementById('ga-gtag-js')) return;
    const script = document.createElement('script');
    script.id = 'ga-gtag-js';
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
    document.head.appendChild(script);
  };

  const idle = (globalThis as IdleGlobal).requestIdleCallback;
  if (typeof idle === 'function') {
    idle(inject, { timeout: 5000 });
  } else {
    setTimeout(inject, 3000);
  }
}
