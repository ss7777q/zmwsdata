const FORCE_LEGACY_ACCESS_KEY = 'zmws.forceLegacyAccess';

const REQUIRED_CSS_SUPPORTS = [
  ['selector(:where(*))'],
  ['color', 'oklch(50% 0.1 120)'],
  ['width', 'min(100px, 50vw)'],
] as const;

type CssSupports = {
  supports(conditionText: string): boolean;
  supports(property: string, value: string): boolean;
};

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export type BrowserCompatEnvironment = {
  css?: CssSupports;
  fetch?: unknown;
  promise?: unknown;
  localStorage?: StorageLike;
};

export function supportsRequiredBrowserFeatures(env: BrowserCompatEnvironment): boolean {
  if (!env.css || typeof env.css.supports !== 'function') return false;
  if (typeof env.fetch !== 'function') return false;
  if (typeof env.promise !== 'function') return false;

  try {
    return REQUIRED_CSS_SUPPORTS.every((args) => (
      args.length === 1 ? env.css!.supports(args[0]) : env.css!.supports(args[0], args[1])
    ));
  } catch {
    return false;
  }
}

export function hasForcedLegacyAccess(storage: StorageLike | undefined): boolean {
  if (!storage) return false;

  try {
    return storage.getItem(FORCE_LEGACY_ACCESS_KEY) === '1';
  } catch {
    return false;
  }
}

export function rememberForcedLegacyAccess(storage: StorageLike | undefined): void {
  if (!storage) return;

  try {
    storage.setItem(FORCE_LEGACY_ACCESS_KEY, '1');
  } catch {
    return;
  }
}

export function getBrowserCompatEnvironment(): BrowserCompatEnvironment {
  let localStorage: StorageLike | undefined;
  try {
    localStorage = window.localStorage;
  } catch {
    localStorage = undefined;
  }

  return {
    css: window.CSS,
    fetch: window.fetch,
    promise: window.Promise,
    localStorage,
  };
}
