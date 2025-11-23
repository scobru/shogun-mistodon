/**
 * Helper functions for GunDB operations
 */

import type { IGunInstance, IGunUserInstance } from 'gun/types';

/**
 * Promisified GunDB get operation
 */
export function gunGet<T>(
  chain: any,
  key: string
): Promise<T | null> {
  return new Promise((resolve) => {
    chain.get(key).once((data: T | null) => {
      resolve(data || null);
    });
  });
}

/**
 * Promisified GunDB put operation with timeout
 */
export function gunPut<T>(
  chain: any,
  data: T,
  timeout: number = 3000
): Promise<void> {
  return new Promise((resolve, reject) => {
    let resolved = false;
    
    // Set up timeout
    const timeoutId = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        // GunDB might not always call the callback, but the put might still succeed
        // Resolve anyway to avoid hanging - GunDB will sync asynchronously
        console.warn('gunPut timeout - data may still be saved (GunDB async sync)');
        resolve();
      }
    }, timeout);
    
    try {
      chain.put(data, (ack: any) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeoutId);
        
        if (ack?.err) {
          reject(new Error(String(ack.err)));
          return;
        }
        resolve();
      });
    } catch (err) {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeoutId);
      reject(err);
    }
  });
}

/**
 * Get user instance from Gun instance
 */
export function getUserInstance(gun: IGunInstance): IGunUserInstance | null {
  try {
    const user = gun.user();
    if (user && user.is && user.is.pub) {
      return user;
    }
    return null;
  } catch (error) {
    console.error('Error getting user instance:', error);
    return null;
  }
}

/**
 * Check if user is authenticated
 */
export function isUserAuthenticated(gun: IGunInstance): boolean {
  const user = getUserInstance(gun);
  return user !== null && !!user.is?.pub;
}

/**
 * Get current user's public key
 */
export function getCurrentUserPub(gun: IGunInstance): string | null {
  const user = getUserInstance(gun);
  return user?.is?.pub || null;
}

/**
 * Debounce function for GunDB operations
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  
  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };
    
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(later, wait);
  };
}

