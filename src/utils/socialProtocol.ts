/**
 * Social Protocol V2 - TypeScript implementation
 * Inspired by the social-protocol-v2.js design
 * Integrates with Shogun SDK and GunDB
 */

import type { ShogunCore } from 'shogun-core';
import type { Post } from './postUtils';

export interface UserProfile {
  displayName?: string;
  avatarCid?: string | null;
  bio?: string;
  [key: string]: any;
}

export interface PostWithAuthor extends Post {
  authorProfile?: UserProfile;
}

export interface PostPayload {
  id: string;
  text: string;
  media?: string | null;
  authorPub: string;
  timestamp: number;
  replyTo?: string | null;
}

export interface SocialNetworkConfig {
  appName?: string;
  shogunCore: ShogunCore;
}

export class SocialNetwork {
  private gun: any;
  private user: any;
  private appName: string;
  private profilesCache: Record<string, UserProfile> = {};

  constructor(config: SocialNetworkConfig) {
    if (!config.shogunCore?.gun) {
      throw new Error('ShogunCore gun instance is required');
    }

    this.gun = config.shogunCore.gun;
    this.user = this.gun.user();
    this.appName = config.appName || 'shogun-mistodon-clone-v1';
  }

  /**
   * Create a new account
   */
  createAccount(
    username: string,
    password: string,
    callback: (result: { error?: string; success?: string }) => void
  ): void {
    this.user.create(username, password, (ack: any) => {
      if (ack.err) {
        return callback({ error: ack.err });
      }

      // Auto-login after account creation
      this.login(username, password, (loginAck) => {
        if (loginAck.success) {
          // Set default profile data
          this.user.get('profile').put({
            displayName: username,
            avatarCid: null,
            bio: 'Nuovo utente su GunDB',
          });
          callback({ success: 'Account creato e inizializzato!' });
        } else {
          callback({ error: loginAck.error || 'Failed to login after account creation' });
        }
      });
    });
  }

  /**
   * Login with username and password
   */
  login(
    username: string,
    password: string,
    callback: (result: { error?: string; success?: string; pub?: string }) => void
  ): void {
    this.user.auth(username, password, (ack: any) => {
      if (ack.err) {
        callback({ error: ack.err });
      } else {
        callback({
          success: 'Login effettuato',
          pub: this.user.is?.pub,
        });
      }
    });
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return !!(this.user && this.user.is && this.user.is.pub);
  }

  /**
   * Get current user's public key
   */
  getCurrentUserPub(): string | null {
    return this.user?.is?.pub || null;
  }

  /**
   * Simulate media upload to IPFS
   * In a real implementation, this would use an IPFS library
   */
  async uploadMedia(fileBlob: Blob): Promise<string> {
    console.log('Simulazione upload su IPFS...');
    // TODO: Implement real IPFS upload
    // For now, return a fake CID
    return 'QmFakeHash' + Math.floor(Math.random() * 100000);
  }

  /**
   * Publish a new post
   */
  async publishPost(
    text: string,
    mediaFile: Blob | null = null,
    replyToId: string | null = null
  ): Promise<{ success: boolean; error?: string; id?: string }> {
    if (!this.isAuthenticated()) {
      return { success: false, error: 'Non sei loggato' };
    }

    let mediaCid: string | null = null;
    if (mediaFile) {
      mediaCid = await this.uploadMedia(mediaFile);
    }

    const postId = this.gun.text?.random() || `post_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const timestamp = Date.now();
    const userPub = this.getCurrentUserPub();

    if (!userPub) {
      return { success: false, error: 'User pub not found' };
    }

    const postPayload: PostPayload = {
      id: postId,
      text: text,
      media: mediaCid,
      authorPub: userPub,
      timestamp: timestamp,
      replyTo: replyToId,
    };

    try {
      // 1. Save to user's personal graph (User Space - Data Sovereignty)
      this.user.get('posts').get(postId).put(postPayload);

      // 2. Save to Public Timeline (Discovery)
      // Use time-based key for easier sorting
      const timeKey = new Date().toISOString().split('T')[0]; // e.g., 2023-10-27
      this.gun.get(this.appName).get('timeline').get(timeKey).get(postId).put(postPayload);

      // 3. Handle Threading (Shogun-inspired improvement)
      // If it's a reply, add a reference in the original post
      if (replyToId) {
        this.gun.get(this.appName).get('posts').get(replyToId).get('replies').set(postPayload);
      }

      // 4. Hashtag Index
      this._indexHashtags(text, postPayload);

      // Also save to global posts node for compatibility with existing code
      this.gun.get('posts').get(postId).put({
        id: postId,
        author: userPub,
        content: text,
        timestamp: timestamp,
        replyTo: replyToId,
        likes: {},
        reposts: {},
      });

      // 5. Save to users/{userPub}/posts for "My Posts" view (publicly addressable)
      // This is what useUserPosts looks for
      this.gun.get('users').get(userPub).get('posts').get(postId).put({
        id: postId,
        timestamp: timestamp,
      });

      console.log('Post pubblicato (V2):', postPayload);
      return { success: true, id: postId };
    } catch (error) {
      console.error('Error publishing post:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to publish post',
      };
    }
  }

  /**
   * Index hashtags from post text
   */
  private _indexHashtags(text: string, postData: PostPayload): void {
    const hashtags = text.match(/#\w+/g);
    if (hashtags) {
      hashtags.forEach((tag) => {
        const cleanTag = tag.replace('#', '').toLowerCase();
        this.gun.get(this.appName).get('hashtags').get(cleanTag).set(postData);
      });
    }
  }

  /**
   * Get post with author profile information
   */
  getPostWithAuthor(
    postData: PostPayload | Post,
    callback: (post: PostWithAuthor) => void
  ): void {
    const authorPub = 'authorPub' in postData ? postData.authorPub : postData.author;

    // If we have the author in cache, use it
    if (this.profilesCache[authorPub]) {
      callback({
        ...postData,
        authorProfile: this.profilesCache[authorPub],
      });
    } else {
      // Otherwise, fetch from user space
      this.gun.user(authorPub).get('profile').once((profile: UserProfile) => {
        this.profilesCache[authorPub] = profile || { displayName: 'Anonimo' };
        callback({
          ...postData,
          authorProfile: this.profilesCache[authorPub],
        });
      });
    }
  }

  /**
   * View global timeline (improved version with profiles)
   */
  viewGlobalTimeline(callback: (post: PostWithAuthor) => void): () => void {
    // Get today's posts (for simplicity, in production load multiple days)
    const today = new Date().toISOString().split('T')[0];

    const listener = this.gun
      .get(this.appName)
      .get('timeline')
      .get(today)
      .map()
      .on((post: PostPayload) => {
        if (post && post.text) {
          this.getPostWithAuthor(post, callback);
        }
      });

    // Return cleanup function
    return () => {
      try {
        this.gun.get(this.appName).get('timeline').get(today).map().off();
      } catch (e) {
        console.error('Error cleaning up timeline listener:', e);
      }
    };
  }

  /**
   * View timeline of followed users only
   */
  viewFollowingTimeline(followingList: string[], callback: (post: PostWithAuthor) => void): () => void {
    if (!followingList || followingList.length === 0) {
      // Return empty cleanup function if no following
      return () => {};
    }

    const today = new Date().toISOString().split('T')[0];
    const followingSet = new Set(followingList);
    const cleanupFunctions: (() => void)[] = [];

    // Listen to timeline and filter by following
    const timelineListener = this.gun
      .get(this.appName)
      .get('timeline')
      .get(today)
      .map()
      .on((post: PostPayload) => {
        if (post && post.text) {
          const authorPub = post.authorPub || post.author;
          // Only show posts from users we follow
          if (authorPub && followingSet.has(authorPub)) {
            this.getPostWithAuthor(post, callback);
          }
        }
      });

    cleanupFunctions.push(() => {
      try {
        this.gun.get(this.appName).get('timeline').get(today).map().off();
      } catch (e) {
        console.error('Error cleaning up following timeline listener:', e);
      }
    });

    // Return cleanup function
    return () => {
      cleanupFunctions.forEach(cleanup => {
        try {
          cleanup();
        } catch (e) {
          console.error('Error in cleanup:', e);
        }
      });
    };
  }

  /**
   * View replies to a specific post (Thread)
   */
  viewReplies(postId: string, callback: (reply: PostWithAuthor) => void): () => void {
    const listener = this.gun
      .get(this.appName)
      .get('posts')
      .get(postId)
      .get('replies')
      .map()
      .on((reply: PostPayload) => {
        if (reply) {
          this.getPostWithAuthor(reply, callback);
        }
      });

    // Return cleanup function
    return () => {
      try {
        this.gun.get(this.appName).get('posts').get(postId).get('replies').map().off();
      } catch (e) {
        console.error('Error cleaning up replies listener:', e);
      }
    };
  }

  /**
   * Get posts by hashtag
   */
  viewHashtag(hashtag: string, callback: (post: PostWithAuthor) => void): () => void {
    const cleanTag = hashtag.replace('#', '').toLowerCase();

    const listener = this.gun
      .get(this.appName)
      .get('hashtags')
      .get(cleanTag)
      .map()
      .on((post: PostPayload) => {
        if (post && post.text) {
          this.getPostWithAuthor(post, callback);
        }
      });

    // Return cleanup function
    return () => {
      try {
        this.gun.get(this.appName).get('hashtags').get(cleanTag).map().off();
      } catch (e) {
        console.error('Error cleaning up hashtag listener:', e);
      }
    };
  }

  /**
   * Clear profiles cache
   */
  clearProfilesCache(): void {
    this.profilesCache = {};
  }

  /**
   * Get user profile
   */
  getUserProfile(userPub: string, callback: (profile: UserProfile) => void): void {
    if (this.profilesCache[userPub]) {
      callback(this.profilesCache[userPub]);
    } else {
      this.gun.user(userPub).get('profile').once((profile: UserProfile) => {
        this.profilesCache[userPub] = profile || { displayName: 'Anonimo' };
        callback(this.profilesCache[userPub]);
      });
    }
  }

  /**
   * Update current user's profile
   */
  updateProfile(profileData: Partial<UserProfile>): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.isAuthenticated()) {
        reject(new Error('Not authenticated'));
        return;
      }

      try {
        this.user.get('profile').put(profileData, (ack: any) => {
          if (ack?.err) {
            reject(new Error(ack.err));
          } else {
            // Update cache
            const userPub = this.getCurrentUserPub();
            if (userPub) {
              this.profilesCache[userPub] = {
                ...this.profilesCache[userPub],
                ...profileData,
              };
            }
            resolve();
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Delete a post (only if user is the author)
   */
  async deletePost(postId: string): Promise<{ success: boolean; error?: string }> {
    if (!this.isAuthenticated()) {
      return { success: false, error: 'Not authenticated' };
    }

    const userPub = this.getCurrentUserPub();
    if (!userPub) {
      return { success: false, error: 'User pub not found' };
    }

    try {
      // Get the post to verify ownership
      const postData = await new Promise<any>((resolve) => {
        this.gun.get('posts').get(postId).once((data: any) => {
          if (data && typeof data === 'object') {
            const { _, ...post } = data;
            resolve(post);
          } else {
            resolve(null);
          }
        });
      });

      if (!postData) {
        return { success: false, error: 'Post not found' };
      }

      // Check ownership - support both old and new format
      const postAuthor = postData.author || postData.authorPub;
      if (postAuthor !== userPub) {
        return { success: false, error: 'You can only delete your own posts' };
      }

      // Delete from global posts node
      this.gun.get('posts').get(postId).put(null);

      // Delete from user's authenticated posts index
      this.user.get('posts').get(postId).put(null);

      // Delete from users/{userPub}/posts (for My Posts view)
      this.gun.get('users').get(userPub).get('posts').get(postId).put(null);

      // Delete from timeline (if exists)
      if (postData.timestamp) {
        const timeKey = new Date(postData.timestamp).toISOString().split('T')[0];
        this.gun.get(this.appName).get('timeline').get(timeKey).get(postId).put(null);
      }

      // Delete from hashtags (if exists)
      if (postData.text) {
        const hashtags = postData.text.match(/#\w+/g);
        if (hashtags) {
          hashtags.forEach((tag: string) => {
            const cleanTag = tag.replace('#', '').toLowerCase();
            this.gun.get(this.appName).get('hashtags').get(cleanTag).get(postId).put(null);
          });
        }
      }

      console.log('Post deleted:', postId);
      return { success: true };
    } catch (error) {
      console.error('Error deleting post:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete post',
      };
    }
  }
}

