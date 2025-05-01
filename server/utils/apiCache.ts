/**
 * API Cache Utility
 * 
 * Provides in-memory caching for API responses with
 * configurable TTL (time-to-live) to reduce external API calls.
 */

interface CacheEntry<T> {
  data: T;
  expiry: number;
}

interface CacheOptions {
  ttl: number; // Time-to-live in milliseconds
}

// Default cache options
const DEFAULT_OPTIONS: CacheOptions = {
  ttl: 15 * 60 * 1000, // 15 minutes
};

// In-memory cache store
const cacheStore: Record<string, CacheEntry<any>> = {};

/**
 * Clear the entire cache or just entries for a specific key
 * 
 * @param key Optional specific cache key to clear
 */
export function clearCache(key?: string): void {
  if (key) {
    delete cacheStore[key];
  } else {
    Object.keys(cacheStore).forEach(k => delete cacheStore[k]);
  }
}

/**
 * Get a cached value by key
 * 
 * @param key Cache key
 * @returns Cached value or undefined if not found or expired
 */
export function getCached<T>(key: string): T | undefined {
  const entry = cacheStore[key];
  
  if (!entry) {
    return undefined;
  }
  
  const now = Date.now();
  
  // Check if the entry has expired
  if (now > entry.expiry) {
    delete cacheStore[key];
    return undefined;
  }
  
  return entry.data;
}

/**
 * Set a value in the cache
 * 
 * @param key Cache key
 * @param data Data to cache
 * @param options Caching options (optional)
 */
export function setCached<T>(
  key: string, 
  data: T, 
  options: Partial<CacheOptions> = {}
): void {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const expiry = Date.now() + opts.ttl;
  
  cacheStore[key] = {
    data,
    expiry,
  };
}

/**
 * Get a value from cache or execute a function to retrieve and cache it
 * 
 * @param key Cache key
 * @param fn Function to execute if cache miss
 * @param options Caching options (optional)
 * @returns Retrieved or cached value
 */
export async function getOrFetch<T>(
  key: string,
  fn: () => Promise<T>,
  options: Partial<CacheOptions> = {}
): Promise<T> {
  // Try to get from cache first
  const cached = getCached<T>(key);
  
  if (cached !== undefined) {
    return cached;
  }
  
  // Cache miss, execute the function
  const data = await fn();
  
  // Cache the result
  setCached(key, data, options);
  
  return data;
}