/**
 * Masks secret values in integration settings before they leave the server.
 *
 * `integration_settings` rows store the Airtable API key as plaintext, and the
 * settings endpoints would otherwise return those rows verbatim. The management
 * UI only needs to know whether a credential is present and to recognise which
 * one it is, so it gets the last four characters and nothing more.
 *
 * ImgBB's key is never stored here — `routes/integrationSettings.ts` refuses
 * the service outright, and it is read from IMGBB_API_KEY only.
 */

export interface RedactedSetting {
  value: string;
  /** Whether a value is stored at all — what the UI actually branches on. */
  configured: boolean;
  /** Present when the value shown is masked rather than real. */
  redacted?: true;
}

/** Keys whose values are credentials rather than configuration. */
const SECRET_KEY_PATTERN = /key|token|secret|password|credential/i;

export function redactIntegrationSetting<T extends { key: string; value: string }>(
  setting: T,
): T & RedactedSetting {
  const hasValue = Boolean(setting.value);

  if (!SECRET_KEY_PATTERN.test(setting.key)) {
    return { ...setting, configured: hasValue };
  }

  return {
    ...setting,
    // A four-character tail is enough to tell two keys apart without being
    // useful to anyone who should not have the key.
    value: hasValue ? `••••${setting.value.slice(-4)}` : '',
    configured: hasValue,
    redacted: true,
  };
}
