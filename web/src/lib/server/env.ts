import "server-only";
import type { AppMessage } from "../../i18n/message";

export class ConfigError extends Error {}

/** An error the user can act on; the message is translated in the browser. */
export class UserError extends Error {
  constructor(
    readonly userMessage: AppMessage,
    readonly status = 400,
  ) {
    super(userMessage.code);
  }
}
