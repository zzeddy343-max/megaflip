export async function releaseStaleWithBackoff<T>(
  releaseFn: (opts?: Record<string, unknown>) => Promise<T>,
  { attempts = 3, initialDelay = 300 } = {},
): Promise<T | { ok: false; released: number }> {
  let tryCount = 0;
  let delay = initialDelay;
  while (tryCount < attempts) {
    tryCount += 1;
    try {
      const res = await releaseFn({});
      return res;
    } catch (err) {
      if (tryCount >= attempts) throw err;
      // exponential backoff
      await new Promise((r) => setTimeout(r, delay));
      delay *= 2;
    }
  }
  // should not reach
  return { ok: false, released: 0 };
}

export default releaseStaleWithBackoff;
