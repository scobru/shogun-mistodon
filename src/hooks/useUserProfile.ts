import { useState, useEffect, useCallback } from 'react';
import { useShogun } from 'shogun-button-react';
import { getCurrentUserPub } from '../utils/gunHelpers';

export interface UserProfile {
  username?: string;
  bio?: string;
  avatar?: string;
  createdAt?: number;
}

interface UseUserProfileReturn {
  profile: UserProfile | null;
  loading: boolean;
  error: string | null;
  updateProfile: (updates: Partial<UserProfile>) => Promise<{ success: boolean; error?: string }>;
  getProfile: (userPub: string) => Promise<UserProfile | null>;
}

/**
 * Hook for managing user profiles in GunDB
 */
export function useUserProfile(userPub?: string): UseUserProfileReturn {
  const { sdk, core, isLoggedIn, userPub: currentUserPub } = useShogun();
  // Use core if sdk is not available
  const shogunCore = sdk || core;
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const targetUserPub = userPub || currentUserPub || '';

  // Load profile from GunDB
  const loadProfile = useCallback(() => {
    if (!shogunCore?.gun || !targetUserPub) {
      setLoading(false);
      setProfile(null);
      return () => {}; // Return empty cleanup function
    }

    setLoading(true);
    setError(null);

    try {
      const gun = shogunCore.gun;
      const user = gun.user();
      
      // Try both paths: public path and user space
      const publicProfileNode = gun.get('users').get(targetUserPub).get('profile');
      const userSpaceNode = user && user.is && user.is.pub === targetUserPub 
        ? user.get('profile') 
        : null;

      // Use once() for initial load, then on() for updates
      let hasLoaded = false;
      let timeoutId: NodeJS.Timeout;
      
      // Helper function to process profile data
      const processProfileData = (data: any, source: string) => {
        console.log(`[Profile] Processing data from ${source}:`, data);
        
        // Check if data exists and is an object
        if (!data || typeof data !== 'object') {
          console.log(`[Profile] Invalid data from ${source}: not an object`);
          return null;
        }
        
        // GunDB always adds a _ property, so we ignore it
        // Check if object has any properties besides _
        const keys = Object.keys(data).filter(key => key !== '_');
        if (keys.length === 0) {
          console.log(`[Profile] Invalid data from ${source}: only _ property`);
          return null;
        }
        
        // Extract profile data, ignoring GunDB internal properties
        const { _, ...profileData } = data;
        
        // Only return profile if we have at least one field
        if (profileData.username || profileData.bio || profileData.avatar) {
          const processed = {
            username: profileData.username,
            bio: profileData.bio,
            avatar: profileData.avatar,
            createdAt: profileData.createdAt,
          } as UserProfile;
          console.log(`[Profile] Valid profile from ${source}:`, processed);
          return processed;
        }
        console.log(`[Profile] No valid fields from ${source}`);
        return null;
      };
      
      // Use on() for both initial load and updates - GunDB is eventually consistent
      // This ensures we get data even if it arrives after the initial load
      const handleProfileData = (data: any, source: string) => {
        const processed = processProfileData(data, source);
        if (processed) {
          if (!hasLoaded) {
            hasLoaded = true;
            if (timeoutId) {
              clearTimeout(timeoutId);
            }
            console.log(`[Profile] Profile loaded from ${source}`);
          }
          setProfile(processed);
          setLoading(false);
        }
      };

      // Listen to public path
      console.log(`[Profile] Setting up listener for public path: users/${targetUserPub}/profile`);
      const publicListener = publicProfileNode.on((data: any) => {
        handleProfileData(data, 'public');
      });
      
      // Also listen to user space if available
      let userSpaceListener: (() => void) | null = null;
      if (userSpaceNode) {
        console.log(`[Profile] Setting up listener for user space: user.get('profile')`);
        userSpaceNode.on((data: any) => {
          handleProfileData(data, 'userSpace');
        });
        userSpaceListener = () => userSpaceNode!.off();
      }
      
      // Timeout fallback - if no data after 8 seconds, assume no profile exists
      // Increased timeout to allow GunDB to sync from peers after refresh
      timeoutId = setTimeout(() => {
        if (!hasLoaded) {
          console.log('[Profile] Profile load timeout, assuming no profile exists');
          setProfile(null);
          setLoading(false);
        }
      }, 8000);

      // Return cleanup function
      return () => {
        try {
          clearTimeout(timeoutId);
          publicProfileNode.off();
          if (userSpaceListener) {
            userSpaceListener();
          }
          console.log('[Profile] Cleaned up profile listeners');
        } catch (e) {
          console.error('Error cleaning up profile listener:', e);
        }
      };
    } catch (err) {
      console.error('Error loading profile:', err);
      setError('Failed to load profile');
      setLoading(false);
      return () => {}; // Return empty cleanup function on error
    }
  }, [shogunCore, targetUserPub]);

  // Update profile
  const updateProfile = useCallback(
    async (updates: Partial<UserProfile>): Promise<{ success: boolean; error?: string }> => {
      if (!shogunCore?.gun || !isLoggedIn) {
        return { success: false, error: 'Not authenticated' };
      }

      const userPub = getCurrentUserPub(shogunCore.gun);
      if (!userPub) {
        return { success: false, error: 'User not authenticated' };
      }

      try {
        const gun = shogunCore.gun;
        const user = gun.user();
        
        // Get current profile from public path
        const publicProfileNode = gun.get('users').get(userPub).get('profile');
        const currentProfile = await new Promise<UserProfile | null>((resolve) => {
          publicProfileNode.once((data: any) => {
            if (!data || typeof data !== 'object' || data._) {
              resolve(null);
              return;
            }
            const { _, ...profileData } = data;
            resolve(profileData as UserProfile);
          });
        }) || {};

        // Merge updates
        const updatedProfile: UserProfile = {
          ...currentProfile,
          ...updates,
          createdAt: currentProfile?.createdAt || Date.now(),
        };

        console.log('Updating profile:', updatedProfile);

        // Save to BOTH paths for compatibility:
        // 1. Public path: users/{userPub}/profile (for public access)
        publicProfileNode.put(updatedProfile);
        
        // 2. User space: user.get('profile') (for compatibility with socialProtocol.ts)
        if (user && user.is && user.is.pub === userPub) {
          user.get('profile').put(updatedProfile);
        }

        console.log('Profile saved successfully to both paths');

        // Verify the save by reading back after a short delay
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Try to verify the save
        let verified = false;
        publicProfileNode.once((savedData: any) => {
          if (savedData && typeof savedData === 'object' && !savedData._) {
            const { _, ...savedProfile } = savedData;
            if (savedProfile.username === updatedProfile.username || 
                savedProfile.avatar === updatedProfile.avatar ||
                savedProfile.bio === updatedProfile.bio) {
              verified = true;
              console.log('Profile save verified');
            }
          }
        });

        // Wait a bit more for verification
        await new Promise(resolve => setTimeout(resolve, 300));

        return { success: true };
      } catch (err) {
        console.error('Error updating profile:', err);
        return { success: false, error: err instanceof Error ? err.message : 'Failed to update profile' };
      }
    },
    [shogunCore, isLoggedIn]
  );

  // Get profile for any user
  const getProfile = useCallback(
    async (userPub: string): Promise<UserProfile | null> => {
      if (!shogunCore?.gun || !userPub) {
        return null;
      }

      try {
        const gun = shogunCore.gun;
        const user = gun.user();
        
        // Try public path first
        const publicProfileNode = gun.get('users').get(userPub).get('profile');
        const profile = await new Promise<UserProfile | null>((resolve) => {
          publicProfileNode.once((data: any) => {
            if (!data || typeof data !== 'object' || data._) {
              // If public path doesn't have data, try user space
              const userSpaceNode = user && user.is && user.is.pub === userPub 
                ? user.get('profile') 
                : null;
              
              if (userSpaceNode) {
                userSpaceNode.once((userSpaceData: any) => {
                  if (!userSpaceData || typeof userSpaceData !== 'object' || userSpaceData._) {
                    resolve(null);
                    return;
                  }
                  const { _, ...profileData } = userSpaceData;
                  resolve(profileData as UserProfile);
                });
              } else {
                resolve(null);
              }
              return;
            }
            const { _, ...profileData } = data;
            resolve(profileData as UserProfile);
          });
        });
        return profile;
      } catch (err) {
        console.error('Error getting profile:', err);
        return null;
      }
    },
    [shogunCore]
  );

  // Load profile on mount and when dependencies change
  useEffect(() => {
    const cleanup = loadProfile();
    return cleanup;
  }, [loadProfile]);

  return {
    profile,
    loading,
    error,
    updateProfile,
    getProfile,
  };
}

