import type { PluginErrorCode, PluginResult } from '../window';

/** Grader refused or failed a call of the bridge. */
export class BridgeFailure extends Error {
  constructor(
    readonly code: PluginErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'BridgeFailure';
  }
}

/** The value of a bridge answer; a refusal becomes a thrown BridgeFailure. */
export function unwrap<T>(result: PluginResult<T>): T {
  if (!result.ok) throw new BridgeFailure(result.error.code, result.error.message);
  return result.value;
}

/** What the teacher reads for any error. Grader's own messages are already explanatory, so they are shown as they are. */
export function errorText(error: unknown): string {
  if (error instanceof BridgeFailure) return error.message;
  if (error instanceof Error) return error.message;
  return 'Unbekannter Fehler.';
}

/** A plain copy of the data: a Vue reactive object is a Proxy and cannot be sent over the bridge. */
export function toPlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
