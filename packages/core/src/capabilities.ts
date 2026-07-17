// Product packaging:
// - Reader is the app (always on).
// - Observer is an optional download / unlock.
// - Compiler is a specialized unlock for CGV teachers only.
// Writer remains a separate markdown editor outside this repo.

export type Capability = "observer" | "compiler";

const CAPABILITIES_KEY = "cgv-suite:capabilities";

export interface CapabilityState {
  observer: boolean;
  compiler: boolean;
}

const DEFAULT_CAPABILITIES: CapabilityState = {
  observer: true,
  compiler: false
};

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function readCapabilities(): CapabilityState {
  if (!isBrowser()) return { ...DEFAULT_CAPABILITIES };
  try {
    const raw = window.localStorage.getItem(CAPABILITIES_KEY);
    if (!raw) return { ...DEFAULT_CAPABILITIES };
    const parsed = JSON.parse(raw) as Partial<CapabilityState>;
    return {
      observer: parsed.observer ?? DEFAULT_CAPABILITIES.observer,
      compiler: parsed.compiler ?? DEFAULT_CAPABILITIES.compiler
    };
  } catch {
    return { ...DEFAULT_CAPABILITIES };
  }
}

export function writeCapabilities(next: CapabilityState): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(CAPABILITIES_KEY, JSON.stringify(next));
}

export function setCapability(capability: Capability, enabled: boolean): CapabilityState {
  const current = readCapabilities();
  const next = { ...current, [capability]: enabled };
  writeCapabilities(next);
  return next;
}
