/** A timeout is a failed observation, never evidence of process destruction.
 * The owner alone releases quarantine when its real exit callback runs. */
export async function observeReap<T>(
  exited: Promise<T>,
  milliseconds: number,
  expired: () => Error,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      exited,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(expired()), milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
