import { useState, useCallback } from 'react';
import { useShogun } from 'shogun-button-react';
import { getCurrentUserPub } from '../utils/gunHelpers';
import type { Post } from '../utils/postUtils';

interface UsePostInteractionsReturn {
  likePost: (postId: string) => Promise<{ success: boolean; error?: string }>;
  unlikePost: (postId: string) => Promise<{ success: boolean; error?: string }>;
  repost: (postId: string) => Promise<{ success: boolean; error?: string }>;
  unrepost: (postId: string) => Promise<{ success: boolean; error?: string }>;
  replyToPost: (postId: string, content: string) => Promise<{ success: boolean; error?: string; postId?: string }>;
  isLiked: (post: Post) => boolean;
  isReposted: (post: Post) => boolean;
  getLikeCount: (post: Post) => number;
  getRepostCount: (post: Post) => number;
}

/**
 * Hook for managing post interactions (like, repost, reply) in GunDB
 */
export function usePostInteractions(): UsePostInteractionsReturn {
  const { sdk, core, isLoggedIn } = useShogun();
  const shogunCore = sdk || core;

  // Like a post
  const likePost = useCallback(
    async (postId: string): Promise<{ success: boolean; error?: string }> => {
      if (!shogunCore?.gun || !isLoggedIn) {
        return { success: false, error: 'Not authenticated' };
      }

      const userPub = getCurrentUserPub(shogunCore.gun);
      if (!userPub) {
        const user = shogunCore.gun.user();
        if (user && user.is && user.is.pub) {
          const actualUserPub = user.is.pub;
          try {
            const gun = shogunCore.gun;
            gun.get('posts').get(postId).get('likes').get(actualUserPub).put(true);
            console.log('Liked post:', postId);
            return { success: true };
          } catch (err) {
            console.error('Error liking post:', err);
            return { success: false, error: 'Failed to like post' };
          }
        }
        return { success: false, error: 'User not authenticated' };
      }

      try {
        const gun = shogunCore.gun;
        gun.get('posts').get(postId).get('likes').get(userPub).put(true);
        console.log('Liked post:', postId);
        return { success: true };
      } catch (err) {
        console.error('Error liking post:', err);
        return { success: false, error: 'Failed to like post' };
      }
    },
    [shogunCore, isLoggedIn]
  );

  // Unlike a post
  const unlikePost = useCallback(
    async (postId: string): Promise<{ success: boolean; error?: string }> => {
      if (!shogunCore?.gun || !isLoggedIn) {
        return { success: false, error: 'Not authenticated' };
      }

      const userPub = getCurrentUserPub(shogunCore.gun);
      if (!userPub) {
        const user = shogunCore.gun.user();
        if (user && user.is && user.is.pub) {
          const actualUserPub = user.is.pub;
          try {
            const gun = shogunCore.gun;
            gun.get('posts').get(postId).get('likes').get(actualUserPub).put(null);
            console.log('Unliked post:', postId);
            return { success: true };
          } catch (err) {
            console.error('Error unliking post:', err);
            return { success: false, error: 'Failed to unlike post' };
          }
        }
        return { success: false, error: 'User not authenticated' };
      }

      try {
        const gun = shogunCore.gun;
        gun.get('posts').get(postId).get('likes').get(userPub).put(null);
        console.log('Unliked post:', postId);
        return { success: true };
      } catch (err) {
        console.error('Error unliking post:', err);
        return { success: false, error: 'Failed to unlike post' };
      }
    },
    [shogunCore, isLoggedIn]
  );

  // Repost
  const repost = useCallback(
    async (postId: string): Promise<{ success: boolean; error?: string }> => {
      if (!shogunCore?.gun || !isLoggedIn) {
        return { success: false, error: 'Not authenticated' };
      }

      const gun = shogunCore.gun;
      const user = gun.user();
      let userPub = getCurrentUserPub(gun);
      
      if (!userPub && user && user.is && user.is.pub) {
        userPub = user.is.pub;
      }
      
      if (!userPub || !user || !user.is || !user.is.pub) {
        return { success: false, error: 'User not authenticated' };
      }

      try {
        // Get the original post to get its timestamp
        const originalPost = await new Promise<any>((resolve) => {
          gun.get('posts').get(postId).once((data: any) => {
            if (!data || typeof data !== 'object') {
              resolve(null);
              return;
            }
            const { _, ...post } = data;
            resolve(post);
          });
        });

        if (!originalPost) {
          return { success: false, error: 'Post not found' };
        }

        const repostTimestamp = originalPost.timestamp || Date.now();

        // Save repost reference in the original post
        gun.get('posts').get(postId).get('reposts').get(userPub).put({ timestamp: Date.now() });
        
        // Add to user's posts index so it appears in profile
        user.get('posts').get(postId).put({ id: postId, timestamp: repostTimestamp, reposted: true });
        
        // Also save to users/{userPub}/posts for profile view
        gun.get('users').get(userPub).get('posts').get(postId).put({ id: postId, timestamp: repostTimestamp, reposted: true });
        
        console.log('Reposted:', postId, 'added to profile of user:', userPub);
        return { success: true };
      } catch (err) {
        console.error('Error reposting:', err);
        return { success: false, error: 'Failed to repost' };
      }
    },
    [shogunCore, isLoggedIn]
  );

  // Unrepost
  const unrepost = useCallback(
    async (postId: string): Promise<{ success: boolean; error?: string }> => {
      if (!shogunCore?.gun || !isLoggedIn) {
        return { success: false, error: 'Not authenticated' };
      }

      const gun = shogunCore.gun;
      const user = gun.user();
      let userPub = getCurrentUserPub(gun);
      
      if (!userPub && user && user.is && user.is.pub) {
        userPub = user.is.pub;
      }
      
      if (!userPub || !user || !user.is || !user.is.pub) {
        return { success: false, error: 'User not authenticated' };
      }

      try {
        // Remove repost reference from the original post
        gun.get('posts').get(postId).get('reposts').get(userPub).put(null);
        
        // Remove from user's posts index
        user.get('posts').get(postId).put(null);
        
        // Remove from users/{userPub}/posts for profile view
        gun.get('users').get(userPub).get('posts').get(postId).put(null);
        
        console.log('Unreposted:', postId, 'removed from profile of user:', userPub);
        return { success: true };
      } catch (err) {
        console.error('Error unreposting:', err);
        return { success: false, error: 'Failed to unrepost' };
      }
    },
    [shogunCore, isLoggedIn]
  );

  // Reply to a post
  const replyToPost = useCallback(
    async (postId: string, content: string): Promise<{ success: boolean; error?: string; postId?: string }> => {
      if (!shogunCore?.gun || !isLoggedIn) {
        return { success: false, error: 'Not authenticated' };
      }

      const userPub = getCurrentUserPub(shogunCore.gun);
      if (!userPub) {
        const user = shogunCore.gun.user();
        if (user && user.is && user.is.pub) {
          const actualUserPub = user.is.pub;
          try {
            const gun = shogunCore.gun;
            const replyId = `post_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            
            const reply: Post = {
              id: replyId,
              author: actualUserPub,
              content: content.trim(),
              timestamp: Date.now(),
              replyTo: postId,
              likes: {},
              reposts: {},
            };

            console.log('Creating reply:', reply);

            // Save reply as a post
            gun.get('posts').get(replyId).put(reply);

            // Link reply to original post
            gun.get('posts').get(postId).get('replies').get(replyId).put({ timestamp: Date.now() });

            // Also save to user's posts index
            user.get('posts').get(replyId).put({ id: replyId, timestamp: reply.timestamp });

            console.log('Reply created successfully:', replyId);
            return { success: true, postId: replyId };
          } catch (err) {
            console.error('Error replying to post:', err);
            return { success: false, error: 'Failed to reply to post' };
          }
        }
        return { success: false, error: 'User not authenticated' };
      }

      try {
        const gun = shogunCore.gun;
        const replyId = `post_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        const reply: Post = {
          id: replyId,
          author: userPub,
          content: content.trim(),
          timestamp: Date.now(),
          replyTo: postId,
          likes: {},
          reposts: {},
        };

        console.log('Creating reply:', reply);

        // Save reply as a post
        gun.get('posts').get(replyId).put(reply);

        // Link reply to original post
        gun.get('posts').get(postId).get('replies').get(replyId).put({ timestamp: Date.now() });

        // Also save to user's posts index
        const user = gun.user();
        if (user && user.is && user.is.pub) {
          user.get('posts').get(replyId).put({ id: replyId, timestamp: reply.timestamp });
        }

        console.log('Reply created successfully:', replyId);
        return { success: true, postId: replyId };
      } catch (err) {
        console.error('Error replying to post:', err);
        return { success: false, error: 'Failed to reply to post' };
      }
    },
    [shogunCore, isLoggedIn]
  );

  // Check if post is liked by current user
  const isLiked = useCallback(
    (post: Post): boolean => {
      if (!shogunCore?.gun || !isLoggedIn) {
        return false;
      }

      const userPub = getCurrentUserPub(shogunCore.gun);
      if (!userPub) {
        const user = shogunCore.gun.user();
        if (user && user.is && user.is.pub) {
          const actualUserPub = user.is.pub;
          return !!(post.likes && post.likes[actualUserPub]);
        }
        return false;
      }

      if (!post.likes) {
        return false;
      }

      return !!post.likes[userPub];
    },
    [shogunCore, isLoggedIn]
  );

  // Check if post is reposted by current user
  const isReposted = useCallback(
    (post: Post): boolean => {
      if (!shogunCore?.gun || !isLoggedIn) {
        return false;
      }

      const userPub = getCurrentUserPub(shogunCore.gun);
      if (!userPub) {
        const user = shogunCore.gun.user();
        if (user && user.is && user.is.pub) {
          const actualUserPub = user.is.pub;
          const repostValue = post.reposts && post.reposts[actualUserPub];
          // Check if repost exists (could be true, or an object like { timestamp: ... })
          return !!(repostValue && (repostValue === true || (typeof repostValue === 'object' && !repostValue._)));
        }
        return false;
      }

      if (!post.reposts) {
        return false;
      }

      const repostValue = post.reposts[userPub];
      // Check if repost exists (could be true, or an object like { timestamp: ... })
      return !!(repostValue && (repostValue === true || (typeof repostValue === 'object' && !repostValue._)));
    },
    [shogunCore, isLoggedIn]
  );

  // Get like count
  const getLikeCount = useCallback((post: Post): number => {
    if (!post.likes) {
      return 0;
    }
    return Object.keys(post.likes).filter((key) => post.likes![key] && !key.startsWith('_')).length;
  }, []);

  // Get repost count
  const getRepostCount = useCallback((post: Post): number => {
    if (!post.reposts) {
      return 0;
    }
    return Object.keys(post.reposts).filter((key) => post.reposts![key] && !key.startsWith('_')).length;
  }, []);

  return {
    likePost,
    unlikePost,
    repost,
    unrepost,
    replyToPost,
    isLiked,
    isReposted,
    getLikeCount,
    getRepostCount,
  };
}

