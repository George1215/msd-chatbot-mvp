import crypto from 'node:crypto';
export const hashInstallToken = token => crypto.createHash('sha256').update(token).digest('hex');
export function matchesInstallToken(site, token) {
  if (typeof token !== 'string' || !token || !site.installTokenHash) return false;
  const actual = Buffer.from(hashInstallToken(token), 'hex');
  const expected = Buffer.from(site.installTokenHash, 'hex');
  return expected.length === actual.length && crypto.timingSafeEqual(actual, expected);
}
export function migrateInstallCredentials(data) {
  let changed = false;
  for (const site of data.sites) {
    if (site.installToken) {
      site.installTokenHash = hashInstallToken(site.installToken);
      delete site.installToken;
      changed = true;
    }
  }
  return changed;
}
