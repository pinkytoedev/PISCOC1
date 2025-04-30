/**
 * Token Generator Utility
 * Provides functionality for creating secure random tokens for public direct uploads
 */

import crypto from 'crypto';

/**
 * Generate a cryptographically secure random token
 * @param length Length of the token (default: 32)
 * @returns Random token string
 */
export function generateSecureToken(length: number = 32): string {
  // Generate random bytes and convert to hex string
  const randomBytes = crypto.randomBytes(Math.ceil(length / 2));
  return randomBytes.toString('hex').slice(0, length);
}

/**
 * Calculate expiration date for a token
 * @param days Number of days until token expiration (default: 7)
 * @returns Date object representing expiration time
 */
export function calculateExpirationDate(days: number = 7): Date {
  const expirationDate = new Date();
  expirationDate.setDate(expirationDate.getDate() + days);
  return expirationDate;
}

/**
 * Generate unique token with safeguards
 * @param existingTokens Array of existing tokens to check against
 * @param length Length of the token (default: 32)
 * @returns Unique secure token
 */
export async function generateUniqueToken(
  checkTokenExists: (token: string) => Promise<boolean>, 
  length: number = 32
): Promise<string> {
  let token: string;
  let isUnique = false;
  let attempts = 0;
  const maxAttempts = 5;
  
  while (!isUnique && attempts < maxAttempts) {
    token = generateSecureToken(length);
    // Check if token already exists in database
    const exists = await checkTokenExists(token);
    isUnique = !exists;
    attempts++;
    
    if (isUnique) {
      return token;
    }
  }
  
  // If we've tried multiple times and still get collisions,
  // increase the token length to reduce collision probability
  return generateUniqueToken(checkTokenExists, length + 8);
}