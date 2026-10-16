import "server-only";

export class ConfigError extends Error {}

/** An error whose message is safe to show to the user. */
export class UserError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}
