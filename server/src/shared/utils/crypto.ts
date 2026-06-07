/**
 * Cryptographic Utility Functions
 *
 * Centralized password hashing and verification.
 * Uses bcrypt with a cost factor of 12 — high enough to resist brute force,
 * low enough to not block login requests under load.
 *
 * All password hashing in the entire server goes through these two functions.
 * Never import bcrypt directly in any other file.
 */

import * as bcrypt from 'bcrypt';

/** Cost factor — 2^12 iterations. Balanced for security and performance. */
const BCRYPT_ROUNDS = 12;

/**
 * Hashes a plaintext password.
 * Returns the bcrypt hash string (includes salt).
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/**
 * Compares a plaintext password against a bcrypt hash.
 * Returns true if they match.
 */
export async function comparePassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}