/**
 * A random id for idempotency keys: unique per device is all the API needs
 * (keys are scoped to one learner). Avoids a native crypto module.
 */
export function createId(): string {
  const random = () => Math.random().toString(36).slice(2, 10).padEnd(8, '0');
  return `${Date.now().toString(36)}-${random()}-${random()}`;
}
