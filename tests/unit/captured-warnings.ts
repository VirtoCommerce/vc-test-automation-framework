/** The process warnings emitted since {@link capturedWarnings} was called, until `stop` is called. */
export interface CapturedWarnings {
  readonly messages: string[];
  readonly stop: () => void;
}

/**
 * Starts recording the messages of process warnings, such as those of `process.emitWarning`.
 *
 * @returns The recorded messages and a function that stops recording.
 */
export function capturedWarnings(): CapturedWarnings {
  const messages: string[] = [];
  const listener = (warning: Error) => {
    messages.push(warning.message);
  };
  process.on("warning", listener);
  return { messages, stop: () => process.off("warning", listener) };
}
