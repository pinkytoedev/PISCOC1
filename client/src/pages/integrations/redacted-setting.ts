/**
 * The settings endpoints mask credential values before sending them: a secret
 * comes back as `••••1234` with `redacted: true`, and `configured` says whether
 * a value is stored at all.
 *
 * The mask is display-only. Saving it would overwrite the real credential with
 * bullet characters, so a form must send a secret field only when the user has
 * actually typed a replacement.
 */

import type { IntegrationSetting } from "@shared/schema";

export type MaybeRedactedSetting = IntegrationSetting & {
  configured?: boolean;
  redacted?: boolean;
};

/** True when `value` is a mask standing in for a stored secret, not the secret. */
export function isRedacted(setting?: MaybeRedactedSetting): boolean {
  return setting?.redacted === true;
}

/**
 * Whether a credential is stored server-side. Falls back to value truthiness so
 * this still reports correctly for non-secret keys, which are never masked.
 */
export function isConfigured(setting?: MaybeRedactedSetting): boolean {
  return setting?.configured ?? Boolean(setting?.value);
}

/**
 * The value safe to prefill an editable field with: empty for a masked secret so
 * the user types a real replacement, otherwise the stored value.
 */
export function editableValue(setting?: MaybeRedactedSetting): string {
  return isRedacted(setting) ? "" : setting?.value ?? "";
}
