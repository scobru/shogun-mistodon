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

    console.log('Loading posts for user:', userPub, 'isCurrentUser:', isCurrentUser);

    // Listen for user's post indices
    const mainListener = userPostsNode.map().on((data: any, key: string) => {
      // Skip if already processed
      if (processedPosts.has(key)) {
        return;
      }
      
      if (!data || !key || typeof data !== 'object') {
        return;
      }

      if (key.startsWith('_')) {
        return;
      }

      // Get the actual post data
      const postId = data.id || key;
      
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
      console.log('Found post index:', postId, 'for user:', userPub, 'isRepost:', isRepost);

      // Use once() to get complete post data, then on() for updates
      gun.get('posts').get(postId).once((postData: any) => {
        // Double-check: skip if already in map (race condition protection)
        if (postsMap.has(postId)) {
          return;
        }
        
        if (!postData || typeof postData !== 'object') {
          processedPosts.delete(postId);
          return;
        }

        const { _, ...postPostData } = postData;

        // Extract timestamp from ID if missing
        let postTimestamp = postPostData.timestamp || data.timestamp;
        if (!postTimestamp && postId) {
          const idParts = postId.split('_');
          if (idParts.length >= 2 && idParts[0] === 'post') {
            const extractedTimestamp = parseInt(idParts[1]);
            if (!isNaN(extractedTimestamp)) {
              postTimestamp = extractedTimestamp;
            }
          }
        }
        if (!postTimestamp) {
          postTimestamp = Date.now();
        }

        // Validate post structure
        // Support both old format (author/content) and new format (authorPub/text)
        const postAuthor = postPostData.author || postPostData.authorPub;
        const postContent = postPostData.content || postPostData.text;
        
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
              console.log('Adding post to user profile:', post.id, 'isRepost:', isRepost);
              postsMap.set(postId, post);
              
              // Convert to array and sort by timestamp (newest first)
              const postsArray = Array.from(postsMap.values()).sort(
                (a, b) => b.timestamp - a.timestamp
              );
              
              setPosts(postsArray);
              setLoading(false);
            }
          } else {
            console.log('Skipping post in user profile (not user post and not repost):', postId, 'author:', postAuthor, 'userPub:', userPub);
            processedPosts.delete(postId);
          }
        } else {
          // Post is missing required fields - might still be syncing, wait a bit longer
          // Don't delete from processedPosts immediately, give it time to sync
          console.log('Post missing required fields (may still be syncing):', { 
            postId, 
            hasAuthor: !!postAuthor, 
            hasContent: !!postContent,
            hasAuthorPub: !!postPostData.authorPub,
            hasText: !!postPostData.text
          });
          // Don't delete from processedPosts - let it retry on next sync
        }
      });

      // Track if this is a repost
      const isRepostFromIndex = data.reposted === true;
      
      // Also listen for updates
      const updateListener = gun.get('posts').get(postId).on((postData: any) => {
        if (!postData || typeof postData !== 'object' || postData._) {
          return;
        }

        const { _, ...postPostData } = postData;

        // Extract timestamp from ID if missing
        let postTimestamp = postPostData.timestamp;
        if (!postTimestamp && postId) {
          const idParts = postId.split('_');
          if (idParts.length >= 2 && idParts[0] === 'post') {
            const extractedTimestamp = parseInt(idParts[1]);
            if (!isNaN(extractedTimestamp)) {
              postTimestamp = extractedTimestamp;
            }
          }
        }
        if (!postTimestamp) {
          postTimestamp = Date.now();
        }

        // Support both old format (author/content) and new format (authorPub/text)
        const postAuthor = postPostData.author || postPostData.authorPub;
        const postContent = postPostData.content || postPostData.text;
        
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
      console.log('User posts load timeout, current posts count:', postsMap.size);
      setLoading(false);
    }, 5000); // Increased to 5 seconds to allow peer sync

    // Return cleanup function
    return () => {
      try {
        clearTimeout(timeoutId);
        // Clean up main listener
        userPostsNode.map().off();
        // Clean up individual post listeners
        listeners.forEach((listener, postId) => {
          try {
            gun.get('posts').get(postId).off();
          } catch (e) {
            console.error(`Error cleaning up listener for post ${postId}:`, e);
          }
        });
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
