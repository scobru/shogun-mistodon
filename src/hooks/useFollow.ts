import { useState, useEffect, useCallback } from 'react';
import { useShogun } from 'shogun-button-react';
import { getCurrentUserPub } from '../utils/gunHelpers';

interface UseFollowReturn {
  following: string[];
  followers: string[];
  loading: boolean;
  follow: (userPub: string) => Promise<{ success: boolean; error?: string }>;
  unfollow: (userPub: string) => Promise<{ success: boolean; error?: string }>;
  isFollowing: (userPub: string) => boolean;
}

/**
 * Hook for managing follow relationships in GunDB
 */
export function useFollow(userPub?: string): UseFollowReturn {
  const { sdk, core, isLoggedIn, userPub: currentUserPub } = useShogun();
  const shogunCore = sdk || core;
  const [following, setFollowing] = useState<string[]>([]);
  const [followers, setFollowers] = useState<string[]>([]);
  const [currentUserFollowing, setCurrentUserFollowing] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const targetUserPub = userPub || currentUserPub || '';

  // Load following list
  const loadFollowing = useCallback(() => {
    if (!shogunCore?.gun || !targetUserPub) {
      setLoading(false);
      return () => {}; // Return empty cleanup function
    }

    const gun = shogunCore.gun;
    const followingNode = gun.get('users').get(targetUserPub).get('following');
    const followingSet = new Set<string>();

    console.log('Loading following for user:', targetUserPub);

    const listener = followingNode.map().on((data: any, key: string) => {
      if (!data || !key || typeof data !== 'object') {
        return;
      }

      if (key.startsWith('_')) {
        return;
      }

      // Extract actual data, ignoring GunDB internal properties
      const { _, ...actualData } = data;
      if (actualData && typeof actualData === 'object' && Object.keys(actualData).length > 0) {
        // Add to following set
        if (!followingSet.has(key)) {
          followingSet.add(key);
          console.log('Adding to following:', key);
          setFollowing((prev) => {
            if (!prev.includes(key)) {
              return [...prev, key];
            }
            return prev;
          });
        }
      } else {
        // Remove if data is null or empty
        console.log('Removing from following:', key);
        setFollowing((prev) => prev.filter(pub => pub !== key));
      }
    });

    setLoading(false);

    // Return cleanup function
    return () => {
      try {
        followingNode.map().off();
      } catch (e) {
        console.error('Error cleaning up following listener:', e);
      }
    };
  }, [shogunCore, targetUserPub]);

  // Load followers list
  const loadFollowers = useCallback(() => {
    if (!shogunCore?.gun || !targetUserPub) {
      return () => {}; // Return empty cleanup function
    }

    const gun = shogunCore.gun;
    const followersNode = gun.get('users').get(targetUserPub).get('followers');
    const followersSet = new Set<string>();

    console.log('Loading followers for user:', targetUserPub);

    const listener = followersNode.map().on((data: any, key: string) => {
      if (!data || !key || typeof data !== 'object') {
        return;
      }

      if (key.startsWith('_')) {
        return;
      }

      // Extract actual data, ignoring GunDB internal properties
      const { _, ...actualData } = data;
      if (actualData && typeof actualData === 'object' && Object.keys(actualData).length > 0) {
        // Add to followers set
        if (!followersSet.has(key)) {
          followersSet.add(key);
          console.log('Adding follower:', key);
          setFollowers((prev) => {
            if (!prev.includes(key)) {
              return [...prev, key];
            }
            return prev;
          });
        }
      } else {
        // Remove if data is null or empty
        console.log('Removing follower:', key);
        setFollowers((prev) => prev.filter(pub => pub !== key));
      }
    });

    // Return cleanup function
    return () => {
      try {
        followersNode.map().off();
      } catch (e) {
        console.error('Error cleaning up followers listener:', e);
      }
    };
  }, [shogunCore, targetUserPub]);

  // Follow a user
  const follow = useCallback(
    async (userPubToFollow: string): Promise<{ success: boolean; error?: string }> => {
      if (!shogunCore?.gun || !isLoggedIn) {
        return { success: false, error: 'Not authenticated' };
      }

      const gun = shogunCore.gun;
      const user = gun.user();
      let currentUserPub = getCurrentUserPub(gun);
      
      if (!currentUserPub && user && user.is && user.is.pub) {
        currentUserPub = user.is.pub;
      }
      
      if (!currentUserPub) {
        return { success: false, error: 'User not authenticated' };
      }

      if (currentUserPub === userPubToFollow) {
        return { success: false, error: 'Cannot follow yourself' };
      }

      try {
        // Add to current user's following list
        gun.get('users').get(currentUserPub).get('following').get(userPubToFollow).put({
          timestamp: Date.now(),
        });

        // Add to target user's followers list
        gun.get('users').get(userPubToFollow).get('followers').get(currentUserPub).put({
          timestamp: Date.now(),
        });

        // Update local state immediately for better UX
        setCurrentUserFollowing((prev) => {
          if (!prev.includes(userPubToFollow)) {
            return [...prev, userPubToFollow];
          }
          return prev;
        });

        // If we're viewing the target user's profile, update their followers count immediately
        if (targetUserPub === userPubToFollow) {
          setFollowers((prev) => {
            if (!prev.includes(currentUserPub)) {
              console.log('Updating followers count immediately for profile view');
              return [...prev, currentUserPub];
            }
            return prev;
          });
        }

        console.log('Followed user:', userPubToFollow);
        return { success: true };
      } catch (err) {
        console.error('Error following user:', err);
        return { success: false, error: 'Failed to follow user' };
      }
    },
    [shogunCore, isLoggedIn]
  );

  // Unfollow a user
  const unfollow = useCallback(
    async (userPubToUnfollow: string): Promise<{ success: boolean; error?: string }> => {
      if (!shogunCore?.gun || !isLoggedIn) {
        return { success: false, error: 'Not authenticated' };
      }

      const gun = shogunCore.gun;
      const user = gun.user();
      let currentUserPub = getCurrentUserPub(gun);
      
      if (!currentUserPub && user && user.is && user.is.pub) {
        currentUserPub = user.is.pub;
      }
      
      if (!currentUserPub) {
        return { success: false, error: 'User not authenticated' };
      }

      try {
        // Remove from current user's following list
        const followingNode = gun.get('users').get(currentUserPub).get('following').get(userPubToUnfollow);
        followingNode.put(null);
        console.log('Removed from following list:', currentUserPub, '->', userPubToUnfollow);

        // Remove from target user's followers list
        const followersNode = gun.get('users').get(userPubToUnfollow).get('followers').get(currentUserPub);
        followersNode.put(null);
        console.log('Removed from followers list:', userPubToUnfollow, '<-', currentUserPub);

        // Update local state immediately for better UX
        setCurrentUserFollowing((prev) => prev.filter(pub => pub !== userPubToUnfollow));

        // If we're viewing the target user's profile, update their followers count immediately
        if (targetUserPub === userPubToUnfollow) {
          setFollowers((prev) => {
            const updated = prev.filter(pub => pub !== currentUserPub);
            console.log('Updating followers count immediately for profile view (unfollow)');
            return updated;
          });
        }

        console.log('Unfollowed user successfully:', userPubToUnfollow);
        return { success: true };
      } catch (err) {
        console.error('Error unfollowing user:', err);
        return { success: false, error: 'Failed to unfollow user' };
      }
    },
    [shogunCore, isLoggedIn, targetUserPub]
  );

  // Check if current user is following a specific user
  const isFollowing = useCallback(
    (userPubToCheck: string): boolean => {
      // Check if current user follows the target user
      if (!isLoggedIn || !currentUserPub) {
        console.log('isFollowing: not logged in or no currentUserPub', { isLoggedIn, currentUserPub });
        return false;
      }
      const result = currentUserFollowing.includes(userPubToCheck);
      console.log('isFollowing check:', { userPubToCheck, currentUserFollowing, result });
      return result;
    },
    [currentUserFollowing, isLoggedIn, currentUserPub]
  );

  // Load current user's following list (to check if current user follows target user)
  const loadCurrentUserFollowing = useCallback(() => {
    if (!shogunCore?.gun || !currentUserPub || !isLoggedIn) {
      return () => {}; // Return empty cleanup function
    }

    const gun = shogunCore.gun;
    const currentUserFollowingNode = gun.get('users').get(currentUserPub).get('following');
    const followingSet = new Set<string>();

    const listener = currentUserFollowingNode.map().on((data: any, key: string) => {
      if (!data || !key || typeof data !== 'object') {
        return;
      }

      if (key.startsWith('_')) {
        return;
      }

      // Extract actual data, ignoring GunDB internal properties
      const { _, ...actualData } = data;
      if (actualData && typeof actualData === 'object' && Object.keys(actualData).length > 0) {
        if (!followingSet.has(key)) {
          followingSet.add(key);
          console.log('Adding to currentUserFollowing:', key);
          setCurrentUserFollowing((prev) => {
            if (!prev.includes(key)) {
              return [...prev, key];
            }
            return prev;
          });
        }
      } else {
        // Remove if data is null or empty
        console.log('Removing from currentUserFollowing:', key);
        setCurrentUserFollowing((prev) => prev.filter(pub => pub !== key));
      }
    });

    // Return cleanup function
    return () => {
      try {
        currentUserFollowingNode.map().off();
      } catch (e) {
        console.error('Error cleaning up currentUserFollowing listener:', e);
      }
    };
  }, [shogunCore, currentUserPub, isLoggedIn]);

  // Load data on mount
  useEffect(() => {
    const cleanupFollowing = loadFollowing();
    const cleanupFollowers = loadFollowers();
    const cleanupCurrentFollowing = isLoggedIn && currentUserPub ? loadCurrentUserFollowing() : () => {};

    // Return cleanup function
    return () => {
      cleanupFollowing();
      cleanupFollowers();
      cleanupCurrentFollowing();
    };
  }, [loadFollowing, loadFollowers, loadCurrentUserFollowing, isLoggedIn, currentUserPub]);

  return {
    following,
    followers,
    loading,
    follow,
    unfollow,
    isFollowing,
  };
}

