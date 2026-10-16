import type { MessageKey } from "./messages/hu";

/**
 * A translatable message passed from the server to the browser: the code is
 * a catalogue key, params fill its placeholders. Params named `country` or
 * `countries` hold ISO codes and are shown as country names.
 */
export type AppMessage = { code: MessageKey; params?: Record<string, string | number> };

export const msg = (code: MessageKey, params?: AppMessage["params"]): AppMessage =>
  params ? { code, params } : { code };
