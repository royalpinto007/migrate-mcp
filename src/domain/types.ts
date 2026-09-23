export const FRAMEWORK_IDS = [
  "alembic",
  "golang-migrate",
  "typeorm",
  "sequelize",
  "prisma",
] as const;

export type FrameworkId = (typeof FRAMEWORK_IDS)[number];
export type EvidenceLevel = "high" | "medium" | "low";
export type Severity = "critical" | "warning" | "info";

export interface SourceLocation {
  file: string;
  line: number;
  column: number;
}

export interface DetectionEvidence {
  kind: "config" | "dependency" | "migration-file" | "script" | "cli";
  detail: string;
  path?: string;
  confidence: EvidenceLevel;
}

export interface FrameworkCapabilities {
  inventory: boolean;
  databaseStatus: boolean;
  codeDrift: boolean;
  databaseDrift: boolean;
  generation: "automatic" | "skeleton" | "unsupported";
}

export interface DetectedFramework {
  id: FrameworkId;
  confidence: EvidenceLevel;
  evidence: DetectionEvidence[];
  capabilities: FrameworkCapabilities;
  version?: string;
}

export interface MigrationRecord {
  id: string;
  name: string;
  framework: FrameworkId;
  paths: string[];
  direction?: "up" | "down" | "both";
  status?: "applied" | "pending" | "unknown" | "dirty";
}

export interface ParsedOperation {
  kind: string;
  object?: string;
  direction: "up" | "down" | "unknown";
  raw: string;
  location: SourceLocation;
  confidence: EvidenceLevel;
  metadata?: Record<string, string | number | boolean>;
}

export interface RiskFinding {
  ruleId: string;
  severity: Severity;
  category: "destructive" | "availability" | "data" | "rollback" | "unknown";
  message: string;
  rationale: string;
  confidence: EvidenceLevel;
  location?: SourceLocation;
  saferAlternative?: string;
}

export interface MigrationStatusReport {
  framework: FrameworkId;
  migrations: MigrationRecord[];
  summary: string;
  evidence: string[];
  databaseBacked: boolean;
}

export interface DriftDimension {
  status: "verified" | "partial" | "unsupported" | "failed";
  drifted?: boolean;
  summary: string;
  evidence: string[];
}

export interface DriftReport {
  framework: FrameworkId;
  codeToMigrations: DriftDimension;
  migrationsToDatabase: DriftDimension;
  codeToDatabase: DriftDimension;
}

export interface GenerationReport {
  framework: FrameworkId;
  created: string[];
  modified: string[];
  findings: RiskFinding[];
  summary: string;
  frameworkOutput: string;
}

export interface RollbackGuidance {
  framework: FrameworkId;
  reversible: boolean | "unknown";
  summary: string;
  steps: string[];
  caveats: string[];
}
