export type CapabilityResult<T> =
  | { status: "verified"; value: T; evidence: string[] }
  | { status: "partial"; value: T; reason: string; evidence: string[] }
  | { status: "unsupported"; reason: string }
  | { status: "failed"; reason: string; diagnostics?: string[] };

export const success = <T>(value: T, evidence: string[]): CapabilityResult<T> => ({
  status: "verified",
  value,
  evidence,
});

export const partial = <T>(value: T, reason: string, evidence: string[]): CapabilityResult<T> => ({
  status: "partial",
  value,
  reason,
  evidence,
});

export const unsupported = (reason: string): CapabilityResult<never> => ({
  status: "unsupported",
  reason,
});

export const failed = (reason: string, diagnostics?: string[]): CapabilityResult<never> => ({
  status: "failed",
  reason,
  ...(diagnostics ? { diagnostics } : {}),
});
