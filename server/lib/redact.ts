/**
 * Masks secret values in integration settings before they leave the server.
 *
 * `integration_settings` rows store Airtable and ImgBB API keys and the
 * Facebook access token as plaintext, and the settings endpoints returned those
 * rows verbatim to any signed-in user. The management UI only needs to know
 * whether a credential is present and to recognise which one it is, so it gets
 * the last four characters and nothing more.
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
