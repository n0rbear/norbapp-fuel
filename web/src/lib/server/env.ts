import "server-only";

export function tankerkoenigApiKey(): string | null {
  return process.env.TANKERKOENIG_API_KEY || null;
}

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
