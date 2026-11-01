import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js'

/**
 * Portable SHA-256 hash using audited @noble/hashes.
 * Generates identical hex output to node:crypto createHash('sha256') across Node, Bun, and browser workers.
 */
export function sha256Hex(input: string): string {
  return bytesToHex(sha256(utf8ToBytes(input)))
}
