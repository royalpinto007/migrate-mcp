import type { CapabilityResult } from "../domain/capabilities.js";
import type {
  DetectedFramework,
  DriftReport,
  FrameworkCapabilities,
  FrameworkId,
  GenerationReport,
  MigrationStatusReport,
  RollbackGuidance,
} from "../domain/types.js";
import type { RepositoryContext } from "../security/repository.js";

export interface AdapterContext {
  repository: RepositoryContext;
  environment?: Record<string, string>;
}

export interface GenerationInput extends AdapterContext {
  name: string;
  approved: true;
  options?: Record<string, string | boolean>;
}

export interface MigrationAdapter {
  readonly id: FrameworkId;
  readonly capabilities: FrameworkCapabilities;
  detect(repository: RepositoryContext): Promise<DetectedFramework | undefined>;
  status(context: AdapterContext): Promise<CapabilityResult<MigrationStatusReport>>;
  drift(context: AdapterContext): Promise<CapabilityResult<DriftReport>>;
  generate(input: GenerationInput): Promise<CapabilityResult<GenerationReport>>;
  rollback(context: AdapterContext, paths: string[]): Promise<CapabilityResult<RollbackGuidance>>;
}
