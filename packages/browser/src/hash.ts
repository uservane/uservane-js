/**
 * Stable 32-bit FNV-1a hash for deterministic percentage sampling.
 * Same userId+surveyId always yields the same bucket across loads.
 */

export function stableHash(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    // FNV prime 16777619, keep 32-bit
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Returns true if the respondent is inside the sampled audience.
 * samplePercent 100 => always; 0 => never.
 * Bucket is hash(userId + surveyId) % 100, in [0, 99].
 */
export function isSampledIn(userId: string, surveyId: string, samplePercent: number): boolean {
  if (samplePercent >= 100) return true;
  if (samplePercent <= 0) return false;
  const bucket = stableHash(`${userId}\0${surveyId}`) % 100;
  return bucket < samplePercent;
}
