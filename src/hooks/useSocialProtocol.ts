/**
 * React hook for using the SocialNetwork protocol
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useShogun } from 'shogun-button-react';
import { SocialNetwork, type PostWithAuthor, type UserProfile } from '../utils/socialProtocol';
import type { Post } from '../utils/postUtils';

export interface UseSocialProtocolReturn {
  socialNetwork: SocialNetwork | null;
  isReady: boolean;
  posts: PostWithAuthor[];
  displayedPosts: PostWithAuthor[]; // Posts currently displayed (paginated)
  loading: boolean;
  error: string | null;
  hasMore: boolean; // Whether there are more posts to load
  loadMore: () => void; // Load more posts
  publishPost: (
    text: string,
    mediaFile?: Blob | null,
    replyToId?: string | null
  ) => Promise<{ success: boolean; error?: string; id?: string }>;
  viewGlobalTimeline: () => void;
  viewFollowingTimeline: (followingList: string[]) => void;
  viewHashtag: (hashtag: string) => void;
  clearTimeline: () => void;
  getUserProfile: (userPub: string) => Promise<UserProfile>;
  updateProfile: (profileData: Partial<UserProfile>) => Promise<void>;
  deletePost: (postId: string) => Promise<{ success: boolean; error?: string }>;
}

/**
 * Hook for managing social network protocol
 */
export function useSocialProtocol(): UseSocialProtocolReturn {
  const { sdk, core, isLoggedIn } = useShogun();
  const shogunCore = sdk || core;
  const shogunCoreRef = useRef(shogunCore);
  
  // Keep ref updated
  useEffect(() => {
    shogunCoreRef.current = shogunCore;
  }, [shogunCore]);
  /**
   * Pagination Strategy for Scalability:
   * 
   * With potentially thousands of posts in GunDB, we implement:
   * 1. Initial load: Only show first 20 posts (INITIAL_POSTS_LIMIT)
   * 2. Infinite scroll: Load 20 more posts when user scrolls near bottom
   * 3. Memory limit: Keep max 500 posts in memory to prevent performance issues
   * 4. Chronological sorting: Always sort by timestamp (newest first)
   * 
   * This ensures:
   * - Fast initial page load
   * - Smooth scrolling experience
   * - Efficient memory usage
   * - Works with 10,000+ posts
   */
  const INITIAL_POSTS_LIMIT = 20; // Initial number of posts to show
  const LOAD_MORE_INCREMENT = 20; // How many more posts to load each time
  const MAX_POSTS_IN_MEMORY = 500; // Maximum posts to keep in memory

  const [socialNetwork, setSocialNetwork] = useState<SocialNetwork | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [posts, setPosts] = useState<PostWithAuthor[]>([]); // All loaded posts
  const [displayedCount, setDisplayedCount] = useState(INITIAL_POSTS_LIMIT); // Number of posts to display
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track processed posts to avoid duplicates
  const processedPostsRef = useRef<Set<string>>(new Set());
  // Track active listeners
  const listenersRef = useRef<Map<string, () => void>>(new Map());
  // Debounce timer for state updates
  const updateTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize SocialNetwork instance
  useEffect(() => {
    if (!shogunCore?.gun) {
      setIsReady(false);
      setSocialNetwork(null);
      return;
    }

    try {
      const network = new SocialNetwork({
        appName: 'shogun-mistodon-clone-v1',
        shogunCore,
      });
      setSocialNetwork(network);
      setIsReady(true);
      setError(null);
    } catch (err) {
      console.error('Error initializing SocialNetwork:', err);
      setError(err instanceof Error ? err.message : 'Failed to initialize social network');
      setIsReady(false);
    }
  }, [shogunCore]);

  // Debounced state update function with sorting and limiting
  const debouncedUpdatePosts = useCallback((newPosts: PostWithAuthor[]) => {
    if (updateTimerRef.current) {
      clearTimeout(updateTimerRef.current);
    }

    updateTimerRef.current = setTimeout(() => {
      // Sort by timestamp (newest first)
      const sortedPosts = [...newPosts].sort((a, b) => b.timestamp - a.timestamp);
      
      // Limit posts in memory to prevent memory issues
      const limitedPosts = sortedPosts.slice(0, MAX_POSTS_IN_MEMORY);
      
      setPosts(limitedPosts);
      setLoading(false);
    }, 100); // 100ms debounce
  }, []);

  // View global timeline
  const viewGlobalTimeline = useCallback(() => {
    if (!socialNetwork) {
      setError('SocialNetwork not initialized');
      return;
    }

    // Clean up existing listeners
    listenersRef.current.forEach((cleanup) => {
      try {
        cleanup();
      } catch (e) {
        console.error('Error cleaning up listener:', e);
      }
    });
    listenersRef.current.clear();
    processedPostsRef.current.clear();

    setLoading(true);
    setError(null);

    const postsMap = new Map<string, PostWithAuthor>();

    const cleanup = socialNetwork.viewGlobalTimeline((post: PostWithAuthor) => {
      const postId = post.id || ('id' in post ? (post as any).id : null);
      if (!postId) {
        return;
      }

      // Avoid duplicates
      if (processedPostsRef.current.has(postId)) {
        return;
      }
      processedPostsRef.current.add(postId);

      // Initialize likes and reposts if not present
      const postWithInteractions: PostWithAuthor = {
        ...post,
        likes: post.likes || {},
        reposts: post.reposts || {},
      };

      postsMap.set(postId, postWithInteractions);
      
      // Set up real-time listeners for likes and reposts
      const currentShogunCore = shogunCoreRef.current;
      if (currentShogunCore?.gun) {
        const gun = currentShogunCore.gun;
        const postNode = gun.get('posts').get(postId);
        
        // Listen for likes updates
        const likesListener = postNode.get('likes').map().on((likeValue: any, likeKey: string) => {
          if (likeKey && !likeKey.startsWith('_')) {
            const currentPost = postsMap.get(postId);
            if (currentPost) {
              const updatedLikes = { ...(currentPost.likes || {}) };
              if (likeValue === true || (likeValue && typeof likeValue === 'object' && !likeValue._)) {
                updatedLikes[likeKey] = true;
              } else {
                delete updatedLikes[likeKey];
              }
              postsMap.set(postId, { ...currentPost, likes: updatedLikes });
              debouncedUpdatePosts(Array.from(postsMap.values()));
            }
          }
        });
        listenersRef.current.set(`${postId}_likes`, () => {
          try {
            postNode.get('likes').map().off();
          } catch (e) {
            console.error(`Error cleaning up likes listener for ${postId}:`, e);
          }
        });

        // Listen for reposts updates
        const repostsListener = postNode.get('reposts').map().on((repostValue: any, repostKey: string) => {
          if (repostKey && !repostKey.startsWith('_')) {
            const currentPost = postsMap.get(postId);
            if (currentPost) {
              const updatedReposts = { ...(currentPost.reposts || {}) };
              if (repostValue && typeof repostValue === 'object' && !repostValue._) {
                updatedReposts[repostKey] = true;
              } else {
                delete updatedReposts[repostKey];
              }
              postsMap.set(postId, { ...currentPost, reposts: updatedReposts });
              debouncedUpdatePosts(Array.from(postsMap.values()));
            }
          }
        });
        listenersRef.current.set(`${postId}_reposts`, () => {
          try {
            postNode.get('reposts').map().off();
          } catch (e) {
            console.error(`Error cleaning up reposts listener for ${postId}:`, e);
          }
        });
      }

      debouncedUpdatePosts(Array.from(postsMap.values()));
    });

    listenersRef.current.set('timeline', cleanup);
  }, [socialNetwork, debouncedUpdatePosts]);

  // View following timeline
  const viewFollowingTimeline = useCallback((followingList: string[]) => {
    if (!socialNetwork) {
      setError('SocialNetwork not initialized');
      return;
    }

    // Clean up existing listeners
    listenersRef.current.forEach((cleanup) => {
      try {
        cleanup();
      } catch (e) {
        console.error('Error cleaning up listener:', e);
      }
    });
    listenersRef.current.clear();
    processedPostsRef.current.clear();

    setLoading(true);
    setError(null);

    const postsMap = new Map<string, PostWithAuthor>();

    // Set timeout to stop loading if no posts arrive
    const loadingTimeout = setTimeout(() => {
      if (postsMap.size === 0) {
        setLoading(false);
        debouncedUpdatePosts([]);
      }
    }, 5000); // 5 seconds timeout

    const cleanup = socialNetwork.viewFollowingTimeline(followingList, (post: PostWithAuthor) => {
      clearTimeout(loadingTimeout);
      
      const postId = post.id || ('id' in post ? (post as any).id : null);
      if (!postId) {
        return;
      }

      // Avoid duplicates
      if (processedPostsRef.current.has(postId)) {
        return;
      }
      processedPostsRef.current.add(postId);

      // Initialize likes and reposts if not present
      const postWithInteractions: PostWithAuthor = {
        ...post,
        likes: post.likes || {},
        reposts: post.reposts || {},
      };

      postsMap.set(postId, postWithInteractions);
      
      // Set up real-time listeners for likes and reposts (same as global)
      const currentShogunCore = shogunCoreRef.current;
      if (currentShogunCore?.gun) {
        const gun = currentShogunCore.gun;
        const postNode = gun.get('posts').get(postId);
        
        // Listen for likes updates
        postNode.get('likes').map().on((likeValue: any, likeKey: string) => {
          if (likeKey && !likeKey.startsWith('_')) {
            const currentPost = postsMap.get(postId);
            if (currentPost) {
              const updatedLikes = { ...(currentPost.likes || {}) };
              if (likeValue === true || (likeValue && typeof likeValue === 'object' && !likeValue._)) {
                updatedLikes[likeKey] = true;
              } else {
                delete updatedLikes[likeKey];
              }
              postsMap.set(postId, { ...currentPost, likes: updatedLikes });
              debouncedUpdatePosts(Array.from(postsMap.values()));
            }
          }
        });

        // Listen for reposts updates
        postNode.get('reposts').map().on((repostValue: any, repostKey: string) => {
          if (repostKey && !repostKey.startsWith('_')) {
            const currentPost = postsMap.get(postId);
            if (currentPost) {
              const updatedReposts = { ...(currentPost.reposts || {}) };
              if (repostValue && typeof repostValue === 'object' && !repostValue._) {
                updatedReposts[repostKey] = true;
              } else {
                delete updatedReposts[repostKey];
              }
              postsMap.set(postId, { ...currentPost, reposts: updatedReposts });
              debouncedUpdatePosts(Array.from(postsMap.values()));
            }
          }
        });
      }

      debouncedUpdatePosts(Array.from(postsMap.values()));
    });

    listenersRef.current.set('following_timeline', () => {
      clearTimeout(loadingTimeout);
      cleanup();
    });
  }, [socialNetwork, debouncedUpdatePosts]);

  // View hashtag posts
  const viewHashtag = useCallback(
    (hashtag: string) => {
      if (!socialNetwork) {
        setError('SocialNetwork not initialized');
        return;
      }

      // Clean up existing listeners
      listenersRef.current.forEach((cleanup) => {
        try {
          cleanup();
        } catch (e) {
          console.error('Error cleaning up listener:', e);
        }
      });
      listenersRef.current.clear();
      processedPostsRef.current.clear();

      setLoading(true);
      setError(null);

      const postsMap = new Map<string, PostWithAuthor>();

      const cleanup = socialNetwork.viewHashtag(hashtag, (post: PostWithAuthor) => {
        const postId = post.id || ('id' in post ? (post as any).id : null);
        if (!postId) {
          return;
        }

        // Avoid duplicates
        if (processedPostsRef.current.has(postId)) {
          return;
        }
        processedPostsRef.current.add(postId);

        postsMap.set(postId, post);
        debouncedUpdatePosts(Array.from(postsMap.values()));
      });

      listenersRef.current.set(`hashtag_${hashtag}`, cleanup);
    },
    [socialNetwork, debouncedUpdatePosts]
  );

  // Clear timeline
  const clearTimeline = useCallback(() => {
    listenersRef.current.forEach((cleanup) => {
      try {
        cleanup();
      } catch (e) {
        console.error('Error cleaning up listener:', e);
      }
    });
    listenersRef.current.clear();
    processedPostsRef.current.clear();
    setPosts([]);
    setDisplayedCount(INITIAL_POSTS_LIMIT); // Reset displayed count
  }, []);

  // Load more posts (infinite scroll)
  const loadMore = useCallback(() => {
    setDisplayedCount((prev) => Math.min(prev + LOAD_MORE_INCREMENT, posts.length));
  }, [posts.length]);

  // Calculate displayed posts and hasMore
  const displayedPosts = posts.slice(0, displayedCount);
  const hasMore = posts.length > displayedCount;

  // Publish a post
  const publishPost = useCallback(
    async (
      text: string,
      mediaFile: Blob | null = null,
      replyToId: string | null = null
    ): Promise<{ success: boolean; error?: string; id?: string }> => {
      if (!socialNetwork) {
        return { success: false, error: 'SocialNetwork not initialized' };
      }

      if (!isLoggedIn) {
        return { success: false, error: 'Please sign in to create posts' };
      }

      setError(null);
      const result = await socialNetwork.publishPost(text, mediaFile, replyToId);

      if (result.success) {
        // Optionally refresh timeline after posting
        // viewGlobalTimeline();
      } else {
        setError(result.error || 'Failed to publish post');
      }

      return result;
    },
    [socialNetwork, isLoggedIn]
  );

  // Get user profile
  const getUserProfile = useCallback(
    async (userPub: string): Promise<UserProfile> => {
      if (!socialNetwork) {
        throw new Error('SocialNetwork not initialized');
      }

      return new Promise((resolve, reject) => {
        socialNetwork.getUserProfile(userPub, (profile) => {
          resolve(profile);
        });
      });
    },
    [socialNetwork]
  );

  // Update current user's profile
  const updateProfile = useCallback(
    async (profileData: Partial<UserProfile>): Promise<void> => {
      if (!socialNetwork) {
        throw new Error('SocialNetwork not initialized');
      }

      await socialNetwork.updateProfile(profileData);
    },
    [socialNetwork]
  );

  // Delete a post
  const deletePost = useCallback(
    async (postId: string): Promise<{ success: boolean; error?: string }> => {
      if (!socialNetwork) {
        return { success: false, error: 'SocialNetwork not initialized' };
      }

      return await socialNetwork.deletePost(postId);
    },
    [socialNetwork]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      listenersRef.current.forEach((cleanup, key) => {
        try {
          cleanup();
        } catch (e) {
          console.error(`Error cleaning up listener ${key} on unmount:`, e);
        }
      });
      listenersRef.current.clear();
      processedPostsRef.current.clear();

      if (updateTimerRef.current) {
        clearTimeout(updateTimerRef.current);
      }
    };
  }, []);

  return {
    socialNetwork,
    isReady,
    posts,
    displayedPosts,
    loading,
    error,
    hasMore,
    loadMore,
    publishPost,
    viewGlobalTimeline,
    viewFollowingTimeline,
    viewHashtag,
    clearTimeline,
    getUserProfile,
    updateProfile,
    deletePost,
  };
}

