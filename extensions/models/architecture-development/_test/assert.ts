export function assertEquals<T>(actual: T, expected: T, message = "values differ"): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`);
  }
}

export function assertIncludes(actual: string, expected: string): void {
  if (!actual.includes(expected)) throw new Error(`expected string to include ${expected}`);
}

export async function assertRejects(
  action: () => unknown,
  _errorType?: unknown,
  messageIncludes?: string,
): Promise<void> {
  try {
    await action();
  } catch (error) {
    if (messageIncludes && !String(error).includes(messageIncludes)) {
      throw new Error(`error did not include ${messageIncludes}: ${String(error)}`);
    }
    return;
  }
  throw new Error("expected action to reject");
}
