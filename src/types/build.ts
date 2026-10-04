export type SupportedRuntime = 'nodejs' | 'python' | 'custom';

export interface BuildConfig {
  runtime: SupportedRuntime;
  runtimeVersion?: string | null | undefined;
  installCommand?: string | null | undefined;
  buildCommand?: string | null | undefined;
  startCommand: string;
  port: number;
  envVars?: Record<string, string> | undefined;
}