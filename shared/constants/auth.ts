// Single source for the password rule. Must match `minimum_password_length` in supabase/config.toml
// (and the hosted Auth setting). Used by the auth zod schemas and the provisioning CLI.
export const PASSWORD_MIN_LENGTH = 8
