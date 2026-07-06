import { AppUpdateManager, type DirtyStateGuard } from './AppUpdateManager';
import { CURRENT_APP_VERSION } from './AppVersion';

export interface InstallPwaUpdateChecksOptions {
  dirtyState?: DirtyStateGuard;
}

let installed = false;

type NavigatorWithOptionalServiceWorker = Navigator & {
  serviceWorker?: ServiceWorkerContainer;
};

export function installPwaUpdateChecks(options: InstallPwaUpdateChecksOptions = {}): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  const manager = new AppUpdateManager({
    appBaseUrl: new URL(getBaseUrl(), window.location.href),
    currentVersion: CURRENT_APP_VERSION,
    getServiceWorkerRegistration: async () => getServiceWorkerContainer()?.ready,
    dirtyState: options.dirtyState,
  });

  manager.start();
}

function getBaseUrl(): string {
  return (import.meta.env as ImportMetaEnv).BASE_URL;
}

function getServiceWorkerContainer(): ServiceWorkerContainer | undefined {
  return (navigator as NavigatorWithOptionalServiceWorker).serviceWorker;
}
