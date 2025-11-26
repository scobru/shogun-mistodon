import { useState, useEffect, useCallback } from 'react';
import { useShogun } from 'shogun-button-react';
import type { Post } from '../utils/postUtils';

interface UseUserPostsReturn {
  posts: Post[];
  loading: boolean;
  error: string | null;
  refreshPosts: () => void;
}

/**
 * Hook for loading posts from a specific user
 */
export function useUserPosts(userPub: string): UseUserPostsReturn {
  const { sdk, core } = useShogun();
  const shogunCore = sdk || core;
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load posts from GunDB for specific user
  const loadPosts = useCallback(() => {
    if (!shogunCore?.gun || !userPub) {
      setLoading(false);
      return () => {}; // Return empty cleanup function
    }

    setLoading(true);
    setError(null);

    const gun = shogunCore.gun;
    const user = gun.user();
    const currentUserPub = user?.is?.pub;
    const isCurrentUser = currentUserPub === userPub;
    
    // Always use public path for consistency - both paths should contain the same data
    // The public path is more reliable for reading posts
    const userPostsNode = gun.get('users').get(userPub).get('posts');
    
    const postsMap: Map<string, Post> = new Map();
    const processedPosts = new Set<string>(); // Track processed posts to prevent duplicates
    const listeners = new Map<string, any>(); // Track individual post listeners

    // Listen for user's post indices (content-addressed - contains hash/soul)
    userPostsNode.map().on((data: any, hash: string) => {
      // Skip if already processed
      if (processedPosts.has(hash)) {
        return;
      }
      
      if (!data || !hash || typeof data !== 'object') {
        return;
      }

      if (hash.startsWith('_')) {
        return;
      }

      // Get the soul from the entry (content-addressed storage)
      const postSoul = data.soul || hash;
      const postId = hash; // Use hash as postId
      
      // Check if this is a repost (data has reposted: true)
      const isRepost = data.reposted === true;
      
      // Skip if already processing this post
      if (processedPosts.has(postId)) {
        return;
      }
      
      // Check if post already exists in map to prevent duplicates
      if (postsMap.has(postId)) {
        return;
      }
      
      processedPosts.add(postId);

      // Get the actual post data using the soul (content-addressed)
      gun.get(postSoul).once((postData: any) => {
        // Double-check: skip if already in map (race condition protection)
        if (postsMap.has(postId)) {
          return;
        }
        
        if (!postData || typeof postData !== 'object') {
          processedPosts.delete(postId);
          return;
        }

        const { _, ...postPostData } = postData;

        // Get timestamp from post data or entry
        let postTimestamp = postPostData.timestamp || data.timestamp || Date.now();

        // Validate post structure (content-addressed format uses authorPub/text)
        const postAuthor = postPostData.authorPub || postPostData.author || userPub;
        const postContent = postPostData.text || postPostData.content;
        
        if (postAuthor && postContent) {
          // Include post if:
          // 1. It's the user's own post (postAuthor === userPub), OR
          // 2. It's a repost (isRepost === true)
          if (postAuthor === userPub || isRepost) {
            const post: Post = {
              id: postId,
              author: postAuthor,
              content: postContent,
              timestamp: postTimestamp,
              likes: postPostData.likes || {},
              reposts: postPostData.reposts || {},
              replyTo: postPostData.replyTo,
              media: postPostData.media || null,
            };

            // Final check before adding to map
            if (!postsMap.has(postId)) {
              postsMap.set(postId, post);
              
              // Convert to array and sort by timestamp (newest first)
              const postsArray = Array.from(postsMap.values()).sort(
                (a, b) => b.timestamp - a.timestamp
              );
              
              setPosts(postsArray);
              setLoading(false);
            }
          } else {
            processedPosts.delete(postId);
          }
        } else {
          // Post is missing required fields - might still be syncing, wait a bit longer
          // Don't delete from processedPosts immediately, give it time to sync
        }
      });

      // Track if this is a repost
      const isRepostFromIndex = data.reposted === true;
      
      // Also listen for updates (using soul for content-addressed posts)
      const updateListener = gun.get(postSoul).on((postData: any) => {
        if (!postData || typeof postData !== 'object' || postData._) {
          return;
        }

        const { _, ...postPostData } = postData;

        // Get timestamp from post data
        let postTimestamp = postPostData.timestamp || Date.now();

        // Content-addressed format uses authorPub/text
        const postAuthor = postPostData.authorPub || postPostData.author || userPub;
        const postContent = postPostData.text || postPostData.content;
        
        if (postAuthor && postContent) {
          // Check if post is still in user's posts (could be original or repost)
          // We check by looking at the index node
          userPostsNode.get(postId).once((indexEntry: any) => {
            const stillInUserPosts = indexEntry && typeof indexEntry === 'object' && !indexEntry._;
            const isRepost = indexEntry && indexEntry.reposted === true;
          
            // Include post if it's the user's own post OR it's a repost that's still in the index
            if (postAuthor === userPub || (isRepost && stillInUserPosts)) {
              const post: Post = {
                id: postId,
                author: postAuthor,
                content: postContent,
                timestamp: postTimestamp,
                likes: postPostData.likes || {},
                reposts: postPostData.reposts || {},
                replyTo: postPostData.replyTo,
                media: postPostData.media || null,
              };

              postsMap.set(postId, post);
              
              const postsArray = Array.from(postsMap.values()).sort(
                (a, b) => b.timestamp - a.timestamp
              );
              
              setPosts(postsArray);
            } else {
              // If a post that was in our list is no longer in user's posts, remove it
              if (postsMap.has(postId)) {
                postsMap.delete(postId);
                const postsArray = Array.from(postsMap.values()).sort(
                  (a, b) => b.timestamp - a.timestamp
                );
                setPosts(postsArray);
              }
            }
          });
        }
      });

      // Store listener for cleanup
      listeners.set(postId, updateListener);
    });

    // Set loading to false after initial load attempt
    // Increase timeout to allow GunDB to sync from peers
    const timeoutId = setTimeout(() => {
      setLoading(false);
    }, 5000); // Increased to 5 seconds to allow peer sync

    // Return cleanup function
    return () => {
      try {
        clearTimeout(timeoutId);
        // Clean up main listener
        userPostsNode.map().off();
        // Clean up individual post listeners
        // Cleanup is handled by the main listener
        // Individual post listeners use souls which are managed by GunDB
        listeners.clear();
      } catch (e) {
        console.error('Error cleaning up user posts listeners:', e);
      }
    };
    // Only recreate when gun instance or userPub changes
  }, [shogunCore?.gun, userPub]);

  // Refresh posts
  const refreshPosts = useCallback(() => {
    loadPosts();
  }, [loadPosts]);

  // Load posts on mount and when dependencies change
  useEffect(() => {
    const cleanup = loadPosts();
    return cleanup;
  }, [loadPosts]);

  return {
    posts,
    loading,
    error,
    refreshPosts,
  };
}
