const SENSITIVE_KEY = /^(?:.*(?:password|passwd|secret|token|api[_-]?key|credential).*)$/i;

export function redactSensitive(input: string): string {
  let output = input.replace(
    /\b([a-z][a-z0-9+.-]*:\/\/[^\s:/?#]+):([^\s@/?#]+)@/gi,
    "$1:[REDACTED]@",
  );
  output = output.replace(
    /([?&](?:password|passwd|secret|token|api[_-]?key|credential)[A-Za-z0-9_.-]*=)[^&\s]*/gi,
    "$1[REDACTED]",
  );
  output = output.replace(
    /\b((?:password|passwd|secret|token|api[_-]?key|credential)[A-Za-z0-9_.-]*\s*[=:]\s*)[^\s,;&]+/gi,
    "$1[REDACTED]",
  );
  return output;
}

export function redactEnvironment(environment: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(environment).map(([key, value]) => [
      key,
      SENSITIVE_KEY.test(key) ? "[REDACTED]" : value,
    ]),
  );
}
