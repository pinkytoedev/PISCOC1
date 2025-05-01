/**
 * Rate Limiter Utility
 * 
 * Provides functionality to track and limit API calls to external services
 * with support for different rate limits per endpoint.
 */

interface RateLimitTracker {
  count: number;
  resetAt: number;
  lastRequestTime: number;
  queue: Array<() => Promise<any>>;
  processing: boolean;
}

// Default rate limits (requests per hour) for different Graph API endpoints
const DEFAULT_RATE_LIMITS: Record<string, number> = {
  'User/apprequestformerrecipients': 100,  // Highest frequency call
  'User': 100,
  'Application/subscriptions': 50,
  'User/accounts': 20,
  'Page': 20,
  'default': 100 // Default rate limit for unlisted endpoints
};

// Time window in milliseconds (1 hour)
const RATE_LIMIT_WINDOW = 60 * 60 * 1000;

// Track rate limits for different endpoints
const rateLimitTrackers: Record<string, RateLimitTracker> = {};

/**
 * Get the rate limit for a specific endpoint
 * 
 * @param endpoint The Graph API endpoint
 * @returns The rate limit for the endpoint
 */
function getRateLimit(endpoint: string): number {
  // Find the matching endpoint in our rate limits
  const matchingEndpoint = Object.keys(DEFAULT_RATE_LIMITS).find(key => 
    endpoint.includes(key)
  );
  
  return matchingEndpoint 
    ? DEFAULT_RATE_LIMITS[matchingEndpoint] 
    : DEFAULT_RATE_LIMITS.default;
}

/**
 * Check if a request would exceed the rate limit
 * 
 * @param endpoint The Graph API endpoint
 * @returns Whether the request would exceed the limit
 */
function wouldExceedRateLimit(endpoint: string): boolean {
  const now = Date.now();
  
  // Initialize tracker if it doesn't exist
  if (!rateLimitTrackers[endpoint]) {
    rateLimitTrackers[endpoint] = {
      count: 0,
      resetAt: now + RATE_LIMIT_WINDOW,
      lastRequestTime: 0,
      queue: [],
      processing: false
    };
    return false;
  }
  
  const tracker = rateLimitTrackers[endpoint];
  
  // Reset counter if the window has passed
  if (now > tracker.resetAt) {
    tracker.count = 0;
    tracker.resetAt = now + RATE_LIMIT_WINDOW;
    return false;
  }
  
  // Check if we've hit the limit
  const limit = getRateLimit(endpoint);
  return tracker.count >= limit;
}

/**
 * Track a request to an endpoint
 * 
 * @param endpoint The Graph API endpoint
 */
function trackRequest(endpoint: string): void {
  const now = Date.now();
  
  // Initialize tracker if it doesn't exist
  if (!rateLimitTrackers[endpoint]) {
    rateLimitTrackers[endpoint] = {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW,
      lastRequestTime: now,
      queue: [],
      processing: false
    };
    return;
  }
  
  const tracker = rateLimitTrackers[endpoint];
  
  // Reset counter if the window has passed
  if (now > tracker.resetAt) {
    tracker.count = 1;
    tracker.resetAt = now + RATE_LIMIT_WINDOW;
  } else {
    tracker.count++;
  }
  
  tracker.lastRequestTime = now;
}

/**
 * Process the next queued request for an endpoint
 * 
 * @param endpoint The Graph API endpoint
 */
async function processQueue(endpoint: string): Promise<void> {
  const tracker = rateLimitTrackers[endpoint];
  
  if (!tracker || tracker.queue.length === 0 || tracker.processing) {
    return;
  }
  
  tracker.processing = true;
  
  try {
    // If we're at the rate limit, wait until we can process the next request
    if (wouldExceedRateLimit(endpoint)) {
      const delay = Math.max(100, tracker.resetAt - Date.now());
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    const nextRequest = tracker.queue.shift();
    if (nextRequest) {
      trackRequest(endpoint);
      await nextRequest();
    }
  } finally {
    tracker.processing = false;
    
    // Process the next request if there are any
    if (tracker.queue.length > 0) {
      // Add a small delay between requests
      setTimeout(() => processQueue(endpoint), 200);
    }
  }
}

/**
 * Queue a request to an endpoint and execute it when possible
 * 
 * @param endpoint The Graph API endpoint
 * @param requestFn The function to execute the request
 * @returns A promise that resolves with the request result
 */
export async function queueRateLimitedRequest<T>(
  endpoint: string, 
  requestFn: () => Promise<T>
): Promise<T> {
  return new Promise((resolve, reject) => {
    const wrappedRequest = async () => {
      try {
        const result = await requestFn();
        resolve(result);
      } catch (error) {
        reject(error);
      }
    };
    
    // Initialize tracker if needed
    if (!rateLimitTrackers[endpoint]) {
      rateLimitTrackers[endpoint] = {
        count: 0,
        resetAt: Date.now() + RATE_LIMIT_WINDOW,
        lastRequestTime: 0,
        queue: [],
        processing: false
      };
    }
    
    const tracker = rateLimitTrackers[endpoint];
    
    // Add request to the queue
    tracker.queue.push(wrappedRequest);
    
    // Start processing the queue if it's not already being processed
    if (!tracker.processing) {
      processQueue(endpoint);
    }
  });
}

/**
 * Execute a rate-limited request with exponential backoff retry
 * 
 * @param endpoint The Graph API endpoint
 * @param requestFn The function to execute the request
 * @param maxRetries Maximum number of retries on failure (default: 3)
 * @param initialDelay Initial delay in ms (default: 1000)
 * @returns A promise that resolves with the request result
 */
export async function executeRateLimitedRequest<T>(
  endpoint: string,
  requestFn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 1000
): Promise<T> {
  let attempts = 0;
  let delay = initialDelay;
  
  while (true) {
    try {
      return await queueRateLimitedRequest(endpoint, requestFn);
    } catch (error) {
      attempts++;
      
      // Check if we should retry
      const isRateLimitError = error instanceof Error && 
        (error.message.includes('Application request limit reached') || 
         error.message.includes('#4') ||
         error.message.includes('#17') ||
         error.message.includes('rate limit'));
      
      if (isRateLimitError && attempts <= maxRetries) {
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; // Double the delay for the next attempt
        continue;
      }
      
      // No more retries or not a rate limit error
      throw error;
    }
  }
}