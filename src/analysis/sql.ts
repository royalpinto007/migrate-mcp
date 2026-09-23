import type { ParsedOperation } from "../domain/types.js";

type Dialect = "postgres" | "mysql" | "sqlite" | "generic";

interface Pattern {
  kind: string;
  regex: RegExp;
  object(match: RegExpExecArray): string | undefined;
}

const IDENT = '["`\\[]?[A-Za-z_][A-Za-z0-9_.-]*["`\\]]?';
const patterns: Pattern[] = [
  {
    kind: "drop-table",
    regex: new RegExp(`\\bDROP\\s+TABLE(?:\\s+IF\\s+EXISTS)?\\s+(${IDENT})`, "gi"),
    object: (m) => clean(m[1]),
  },
  {
    kind: "drop-column",
    regex: new RegExp(
      `\\bALTER\\s+TABLE\\s+(${IDENT})[\\s\\S]*?\\bDROP\\s+COLUMN(?:\\s+IF\\s+EXISTS)?\\s+(${IDENT})`,
      "gi",
    ),
    object: (m) => join(m[1], m[2]),
  },
  {
    kind: "add-column",
    regex: new RegExp(
      `\\bALTER\\s+TABLE\\s+(${IDENT})[\\s\\S]*?\\bADD(?:\\s+COLUMN)?\\s+(${IDENT})[^;]*`,
      "gi",
    ),
    object: (m) => join(m[1], m[2]),
  },
  {
    kind: "truncate",
    regex: new RegExp(`\\bTRUNCATE(?:\\s+TABLE)?\\s+(${IDENT})`, "gi"),
    object: (m) => clean(m[1]),
  },
  {
    kind: "delete",
    regex: new RegExp(`\\bDELETE\\s+FROM\\s+(${IDENT})[^;]*`, "gi"),
    object: (m) => clean(m[1]),
  },
  {
    kind: "update",
    regex: new RegExp(`\\bUPDATE\\s+(${IDENT})\\s+SET\\s+[^;]*`, "gi"),
    object: (m) => clean(m[1]),
  },
  {
    kind: "create-table",
    regex: new RegExp(`\\bCREATE\\s+TABLE(?:\\s+IF\\s+NOT\\s+EXISTS)?\\s+(${IDENT})`, "gi"),
    object: (m) => clean(m[1]),
  },
  {
    kind: "rename",
    regex: new RegExp(
      `\\bALTER\\s+TABLE\\s+(${IDENT})[\\s\\S]*?\\bRENAME\\s+(?:COLUMN\\s+)?(${IDENT})`,
      "gi",
    ),
    object: (m) => join(m[1], m[2]),
  },
];

export function parseSqlOperations(
  source: string,
  dialect: Dialect = "generic",
  file = "migration.sql",
  direction: ParsedOperation["direction"] = "up",
): ParsedOperation[] {
  const searchable = maskCommentsAndStrings(source);
  const operations: ParsedOperation[] = [];
  for (const pattern of patterns) {
    pattern.regex.lastIndex = 0;
    for (
      let match = pattern.regex.exec(searchable);
      match;
      match = pattern.regex.exec(searchable)
    ) {
      const raw = source.slice(match.index, match.index + match[0].length);
      const object = pattern.object(match);
      operations.push({
        kind: pattern.kind,
        ...(object === undefined ? {} : { object }),
        direction,
        raw,
        location: locationAt(source, file, match.index),
        confidence: "high",
        metadata: {
          dialect,
          hasWhere: /\bWHERE\b/i.test(raw),
          hasNotNull: /\bNOT\s+NULL\b/i.test(raw),
          hasDefault: /\bDEFAULT\b/i.test(raw),
        },
      });
    }
  }
  return operations.sort(
    (a, b) => a.location.line - b.location.line || a.location.column - b.location.column,
  );
}

function maskCommentsAndStrings(source: string): string {
  return source.replace(/--[^\n]*|\/\*[\s\S]*?\*\/|'(?:''|[^'])*'|"(?:""|[^"])*"/g, (value) =>
    value.replace(/[^\n]/g, " "),
  );
}

function locationAt(source: string, file: string, index: number) {
  const before = source.slice(0, index);
  const lines = before.split("\n");
  return { file, line: lines.length, column: (lines.at(-1)?.length ?? 0) + 1 };
}

function clean(value: string | undefined): string | undefined {
  return value?.replace(/^["`\[]|["`\]]$/g, "");
}

function join(first: string | undefined, second: string | undefined): string | undefined {
  const a = clean(first);
  const b = clean(second);
  return a && b ? `${a}.${b}` : (a ?? b);
}
