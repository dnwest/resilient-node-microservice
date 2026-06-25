export type HealthStatus = "up" | "down";

export interface HealthCheck {
  readonly name: string;
  check(): Promise<HealthStatus>;
}
