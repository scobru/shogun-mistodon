/**
 * Utility functions for post formatting and validation
 */

export interface Post {
  id: string;
  author: string; // userPub
  content: string;
  timestamp: number;
  likes?: Record<string, boolean>;
  reposts?: Record<string, boolean>;
  replyTo?: string; // postId if this is a reply
  media?: string | null; // IPFS CID or image URL
  authorProfile?: {
    username?: string;
    avatar?: string;
    bio?: string;
    [key: string]: any;
  };
}

export const MAX_POST_LENGTH = 500;

/**
 * Validates post content
 */
export function validatePost(content: string): { valid: boolean; error?: string } {
  if (!content || content.trim().length === 0) {
    return { valid: false, error: 'Post cannot be empty' };
  }
  
  if (content.length > MAX_POST_LENGTH) {
    return { 
      valid: false, 
      error: `Post must be ${MAX_POST_LENGTH} characters or less` 
    };
  }
  
  return { valid: true };
}

/**
 * Formats timestamp to relative time (e.g., "2 hours ago")
 */
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) {
    return `${days} day${days > 1 ? 's' : ''} ago`;
  }
  if (hours > 0) {
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  }
  if (minutes > 0) {
    return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  }
  return 'just now';
}

/**
 * Formats timestamp to date string
 */
export function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Generates a unique post ID
 */
export function generatePostId(): string {
  return `post_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Truncates content to max length with ellipsis
 */
export function truncateContent(content: string, maxLength: number = 280): string {
  if (content.length <= maxLength) {
    return content;
  }
  return content.substring(0, maxLength - 3) + '...';
}

