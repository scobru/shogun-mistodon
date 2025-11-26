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
   * Publish a new post with content-addressed storage (immutable)
   * Uses SEA for hashing and creates content-addressed references in public timeline
   * Based on GUN design pattern for immutable content-addressed storage
   */
  async publishPost(
    text: string,
    mediaFile: Blob | null = null,
    replyToId: string | null = null
  ): Promise<{ success: boolean; error?: string; id?: string; hash?: string }> {
    if (!this.isAuthenticated()) {
      return { success: false, error: 'Non sei loggato' };
    }

    let mediaCid: string | null = null;
    if (mediaFile) {
      mediaCid = await this.uploadMedia(mediaFile);
    }

    const timestamp = Date.now();
    const userPub = this.getCurrentUserPub();

    if (!userPub) {
      return { success: false, error: 'User pub not found' };
    }

    // Check if SEA is available (required for content-addressed storage)
    const SEA = (this.gun as any).SEA;
    if (!SEA || !SEA.work) {
      return { success: false, error: 'SEA not available - content-addressed storage requires SEA' };
    }

    // Create post data object (will be stored in user's signed graph)
    const postData = {
      text: text,
      media: mediaCid,
      authorPub: userPub,
      timestamp: timestamp,
      replyTo: replyToId,
    };

    try {
      // 1. Save to user's signed graph using .set() to create an object with soul (immutable)
      // This creates a content-addressed node in the user's signed graph
      return new Promise((resolve) => {
        this.user.get('posts').set(postData).on(async (data: any) => {
          if (data && data._ && data._['#']) {
            const postSoul = data._['#'];
            
            try {
              // 2. Create SHA-256 hash of the soul for content-addressed public storage
              const postHash = (await SEA.work(postSoul, null, null, { name: 'SHA-256' })) as string;
              
              // 3. Store the hash in public content-addressed node (#posts)
              // This makes the post immutable and verifiable
              this.gun.get('#posts').get(postHash).put(postSoul);
              
              // 4. Save hash to app-specific timeline for discovery (with date)
              const timeKey = new Date().toISOString().split('T')[0];
              this.gun.get(this.appName).get('timeline').get(timeKey).get(postHash).put(postSoul);
              
              // 5. Save to users/{userPub}/posts for "My Posts" view (using hash as key)
              const userPublicNode = this.gun.get('users').get(userPub);
              userPublicNode.get('posts').get(postHash).put({
                soul: postSoul,
                hash: postHash,
                timestamp: timestamp,
              });
              
              // 6. Create bidirectional User ↔ Post references
              const postNode = this.gun.get(this.appName).get('posts').get(postHash);
              postNode.get('author').put(userPublicNode);
              userPublicNode.get('posts_bidirectional').set(postNode);
              
              // 7. Handle Threading with bidirectional references (if reply)
              if (replyToId) {
                const parentPostNode = this.gun.get(this.appName).get('posts').get(replyToId);
                // Save hash explicitly for easier retrieval
                parentPostNode.get('replies').get(postHash).put({ hash: postHash, timestamp: timestamp });
                // Also set the node reference for graph navigation
                parentPostNode.get('replies').set(postNode);
                postNode.get('replyTo').put(parentPostNode);
              }
              
              // 8. Hashtag Index with bidirectional references
              const postPayload: PostPayload = {
                id: postHash,
                text: text,
                media: mediaCid,
                authorPub: userPub,
                timestamp: timestamp,
                replyTo: replyToId,
              };
              this._indexHashtags(text, postPayload, postNode);
              
              console.log('Post pubblicato (immutabile):', { soul: postSoul, hash: postHash });
              resolve({ success: true, id: postHash, hash: postHash });
            } catch (hashError) {
              console.error('Error creating hash:', hashError);
              resolve({ 
                success: false, 
                error: hashError instanceof Error ? hashError.message : 'Failed to create hash' 
              });
            }
          }
        });
      });
    } catch (error) {
      console.error('Error publishing post:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to publish post',
      };
    }
  }

  /**
   * Index hashtags from post text with bidirectional references (GUN Design Pattern)
   */
  private _indexHashtags(text: string, postData: PostPayload, postNode: any): void {
    const hashtags = text.match(/#\w+/g);
    if (hashtags) {
      hashtags.forEach((tag) => {
        const cleanTag = tag.replace('#', '').toLowerCase();
        const tagNode = this.gun.get(this.appName).get('hashtags').get(cleanTag);
        
        // Create tag object if it doesn't exist
        const tagData = {
          name: cleanTag,
          slug: cleanTag,
        };
        tagNode.put(tagData);
        
        // Bidirectional references: Tag ↔ Post
        // Tag → Posts reference (save hash explicitly for easier retrieval)
        const postHash = postData.id;
        tagNode.get('posts').get(postHash).put({ hash: postHash, timestamp: postData.timestamp });
        // Also set the node reference for graph navigation
        tagNode.get('posts').set(postNode);
        // Post → Tags reference
        postNode.get('tags').set(tagNode);
      });
    }
  }

  /**
   * Get post with author profile information
   * Handles both PostPayload (content-addressed) and Post (legacy) formats
   */
  getPostWithAuthor(
    postData: PostPayload | Post,
    callback: (post: PostWithAuthor) => void
  ): void {
    const authorPub = 'authorPub' in postData ? postData.authorPub : postData.author;

    // Convert PostPayload to Post format for consistency
    const post: Post = {
      id: postData.id,
      author: authorPub,
      content: 'text' in postData ? postData.text : postData.content,
      timestamp: postData.timestamp,
      likes: 'likes' in postData ? postData.likes : {},
      reposts: 'reposts' in postData ? postData.reposts : {},
      replyTo: postData.replyTo || undefined,
      media: 'media' in postData ? postData.media : postData.media,
    };

    // If we have the author in cache, use it
    if (this.profilesCache[authorPub]) {
      callback({
        ...post,
        authorProfile: this.profilesCache[authorPub],
      });
    } else {
      // Otherwise, fetch from user space
      this.gun.user(authorPub).get('profile').once((profile: UserProfile) => {
        this.profilesCache[authorPub] = profile || { displayName: 'Anonimo' };
        callback({
          ...post,
          authorProfile: this.profilesCache[authorPub],
        });
      });
    }
  }

  /**
   * View global timeline (content-addressed immutable posts)
   * Reads from #posts node using hashes stored in timeline
   */
  viewGlobalTimeline(callback: (post: PostWithAuthor) => void): () => void {
    // Get today's posts (for simplicity, in production load multiple days)
    const today = new Date().toISOString().split('T')[0];

    const listener = this.gun
      .get(this.appName)
      .get('timeline')
      .get(today)
      .map()
      .on((postSoul: string, hash: string) => {
        if (postSoul && typeof postSoul === 'string' && hash && !hash.startsWith('_')) {
          // Get the actual post data using the soul
          this.gun.get(postSoul).once((postData: any) => {
            if (postData && typeof postData === 'object') {
              const { _, ...cleanPostData } = postData;
              const postPayload: PostPayload = {
                id: hash,
                text: cleanPostData.text || '',
                media: cleanPostData.media || null,
                authorPub: cleanPostData.authorPub || '',
                timestamp: cleanPostData.timestamp || Date.now(),
                replyTo: cleanPostData.replyTo || null,
              };
              if (postPayload.text) {
                this.getPostWithAuthor(postPayload, callback);
              }
            }
          });
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
   * View timeline of followed users only (content-addressed)
   */
  viewFollowingTimeline(followingList: string[], callback: (post: PostWithAuthor) => void): () => void {
    if (!followingList || followingList.length === 0) {
      // Return empty cleanup function if no following
      return () => {};
    }

    const today = new Date().toISOString().split('T')[0];
    const followingSet = new Set(followingList);
    const cleanupFunctions: (() => void)[] = [];

    // Listen to timeline and filter by following (content-addressed)
    this.gun
      .get(this.appName)
      .get('timeline')
      .get(today)
      .map()
      .on((postSoul: string, hash: string) => {
        if (postSoul && typeof postSoul === 'string' && hash && !hash.startsWith('_')) {
          // Get the actual post data using the soul
          this.gun.get(postSoul).once((postData: any) => {
            if (postData && typeof postData === 'object') {
              const { _, ...cleanPostData } = postData;
              const authorPub = cleanPostData.authorPub || '';
              // Only show posts from users we follow
              if (authorPub && followingSet.has(authorPub)) {
                const postPayload: PostPayload = {
                  id: hash,
                  text: cleanPostData.text || '',
                  media: cleanPostData.media || null,
                  authorPub: authorPub,
                  timestamp: cleanPostData.timestamp || Date.now(),
                  replyTo: cleanPostData.replyTo || null,
                };
                if (postPayload.text) {
                  this.getPostWithAuthor(postPayload, callback);
                }
              }
            }
          });
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
   * Now uses bidirectional references (GUN Design Pattern) via getTagPosts
   */
  viewHashtag(hashtag: string, callback: (post: PostWithAuthor) => void): () => void {
    // Use the bidirectional getTagPosts method for better graph navigation
    return this.getTagPosts(hashtag, callback);
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
   * Updated for content-addressed storage. This function handles the "cancellation" of a post or a reply
   * by removing all its references across various GunDB indices, as content-addressed data is immutable.
   *
   * Key steps include:
   * 1. Verifying ownership of the post/reply.
   * 2. Removing the post/reply from the user's public posts index (`users/{userPub}/posts`).
   * 3. Removing the post/reply from the global timeline.
   * 4. Removing associated hashtag references (bidirectional).
   * 5. Removing bidirectional User ↔ Post references.
   * 6. If the post is a reply, removing its reference from the parent post's `replies` list and
   *    removing the `replyTo` reference from the reply itself.
   * 7. Recursively removing all replies to the deleted post, ensuring a clean cascade deletion.
   *    This step ensures that when a parent post is deleted, all its comments (replies) are also effectively removed.
   *    The `deletePost` function is robust enough to handle the deletion of a reply when called with the reply's ID.
   */
  async deletePost(postId: string): Promise<{ success: boolean; error?: string }> {
    if (!this.isAuthenticated()) {
      return { success: false, error: 'Non sei loggato' };
    }

    const userPub = this.getCurrentUserPub();
    if (!userPub) {
      return { success: false, error: 'Chiave pubblica utente non trovata' };
    }

    try {
      // Get the post from content-addressed storage to verify ownership
      // Try to get soul from #posts node
      let postSoul: string | null = null;
      let postData: any = null;

      // Method 1: Try #posts node
      postSoul = await new Promise<string | null>((resolve) => {
        this.gun.get('#posts').get(postId).once((soul: string) => {
          resolve(soul && typeof soul === 'string' ? soul : null);
        });
      });

      // Method 2: Try timeline (check last 7 days)
      if (!postSoul) {
        const today = new Date();
        for (let i = 0; i < 7; i++) {
          const date = new Date(today);
          date.setDate(date.getDate() - i);
          const timeKey = date.toISOString().split('T')[0];
          
          const soul = await new Promise<string | null>((resolve) => {
            this.gun.get(this.appName).get('timeline').get(timeKey).get(postId).once((s: string) => {
              resolve(s && typeof s === 'string' ? s : null);
            });
          });
          
          if (soul) {
            postSoul = soul;
            break;
          }
        }
      }

      // Method 3: Try to find in user's posts (for replies that might not be in timeline)
      if (!postSoul) {
        // Check if postId is in user's posts - if it's a reply, it might only be there
        const userPostsNode = this.gun.get('users').get(userPub).get('posts').get(postId);
        const userPostData = await new Promise<any>((resolve) => {
          userPostsNode.once((data: any) => {
            resolve(data);
          });
        });
        
        if (userPostData && typeof userPostData === 'object') {
          // The data might be { soul, hash, timestamp } or just the soul directly
          if (userPostData.soul) {
            postSoul = userPostData.soul;
          } else if (typeof userPostData === 'string') {
            // Sometimes it's stored as a string directly
            postSoul = userPostData;
          }
        }
      }
      
      // Method 4: Try to get soul directly using postId as hash (if all else fails)
      if (!postSoul) {
        // Last resort: try to get directly from the post data using the hash
        // This might work if the post exists but references are broken
        try {
          const directPostData = await new Promise<any>((resolve) => {
            this.gun.get(this.appName).get('posts').get(postId).once((data: any) => {
              resolve(data);
            });
          });
          
          if (directPostData && typeof directPostData === 'object') {
            // Try to extract soul from the data
            if (directPostData._ && directPostData._['#']) {
              postSoul = directPostData._['#'];
            }
          }
        } catch (e) {
          // Ignore errors in last resort method
        }
      }

      if (!postSoul) {
        console.error('Post not found, tried all methods. postId:', postId, 'userPub:', userPub);
        return { success: false, error: 'Post not found. Please try again or refresh the page.' };
      }
      
      console.log('Post found with soul:', postSoul, 'postId:', postId);

      // Get the actual post data using the soul
      postData = await new Promise<any>((resolve) => {
        this.gun.get(postSoul).once((data: any) => {
          if (data && typeof data === 'object') {
            const { _, ...post } = data;
            resolve(post);
          } else {
            resolve(null);
          }
        });
      });

      if (!postData) {
        return { success: false, error: 'Post data not found' };
      }

      // Check ownership - content-addressed uses authorPub
      const postAuthor = postData.authorPub || postData.author;
      if (postAuthor !== userPub) {
        return { success: false, error: 'You can only delete your own posts' };
      }

      // Note: Posts are immutable in content-addressed storage, so we can't delete the actual post
      // Instead, we remove all references to it
      // We CANNOT delete from #posts because it's content-addressed and immutable
      // The post data will remain in #posts, but it won't appear anywhere because we remove all references

      // Delete from user's authenticated posts index (signed graph)
      // In content-addressed storage, posts are saved with .set() which creates objects with souls
      // We need to remove the entry from the index. Since we use hash as key in users/{userPub}/posts,
      // we can remove it directly from there. The signed graph entries are harder to remove,
      // but removing public references is sufficient for the post to disappear from views.

      // Delete from users/{userPub}/posts (for My Posts view) - this is the main reference
      // This works for both regular posts and replies
      this.gun.get('users').get(userPub).get('posts').get(postId).put(null);
      
      // Also try to remove from user's signed graph if it exists there
      // (for replies that might be saved differently)
      try {
        this.user.get('posts').map().on((entry: any, key: string) => {
          if (entry && typeof entry === 'object' && (entry.soul === postSoul || entry.hash === postId || key === postId)) {
            this.user.get('posts').get(key).put(null);
          }
        });
      } catch (e) {
        // Ignore errors - signed graph removal is optional
      }

      // Delete from timeline (check multiple days to be sure)
      if (postData.timestamp) {
        const postDate = new Date(postData.timestamp);
        for (let i = 0; i < 7; i++) {
          const date = new Date(postDate);
          date.setDate(date.getDate() - i);
          const timeKey = date.toISOString().split('T')[0];
          this.gun.get(this.appName).get('timeline').get(timeKey).get(postId).put(null);
        }
      }

      // Delete from hashtags (if exists) - remove bidirectional references
      const postText = postData.text || '';
      if (postText) {
        const hashtags = postText.match(/#\w+/g);
        if (hashtags) {
          const postNode = this.gun.get(this.appName).get('posts').get(postId);
          hashtags.forEach((tag: string) => {
            const cleanTag = tag.replace('#', '').toLowerCase();
            const tagNode = this.gun.get(this.appName).get('hashtags').get(cleanTag);
            // Remove bidirectional references
            tagNode.get('posts').get(postId).put(null);
            postNode.get('tags').get(cleanTag).put(null);
          });
        }
      }

      // Remove bidirectional User ↔ Post references
      const postNode = this.gun.get(this.appName).get('posts').get(postId);
      const userPublicNode = this.gun.get('users').get(userPub);
      postNode.get('author').put(null);
      userPublicNode.get('posts_bidirectional').get(postId).put(null);

      // Remove bidirectional Reply ↔ Parent references (if it's a reply)
      if (postData.replyTo) {
        console.log('Removing reply from parent post:', postData.replyTo, 'replyId:', postId);
        const parentPostNode = this.gun.get(this.appName).get('posts').get(postData.replyTo);
        
        // Remove the explicit hash entry (this is the main way replies are stored)
        // This removes the entry from parentPostNode.get('replies').get(postId)
        parentPostNode.get('replies').get(postId).put(null);
        
        // Also try to remove using the node reference if it exists
        // First, check all entries in replies to find this one
        try {
          const repliesMap = parentPostNode.get('replies');
          repliesMap.map().once((entry: any, key: string) => {
            // Check if this is our reply
            if (key === postId) {
              repliesMap.get(key).put(null);
            } else if (entry && typeof entry === 'object') {
              // Check if entry contains our hash
              if (entry.hash === postId || entry.soul === postSoul) {
                repliesMap.get(key).put(null);
              }
            }
          });
        } catch (e) {
          console.error('Error removing reply node reference:', e);
        }
        
        // Remove the replyTo reference from this post
        postNode.get('replyTo').put(null);
        console.log('Reply removed from parent post references');
      }

      // Remove all replies to this post
      // First, get all replies and remove them from their authors' posts indices
      const repliesNode = postNode.get('replies');
      const processedReplies = new Set<string>();
      
      repliesNode.map().on((replyEntry: any, replyKey: string) => {
        if (replyKey && !replyKey.startsWith('_') && !processedReplies.has(replyKey)) {
          processedReplies.add(replyKey);
          
          // Get reply hash from entry
          let replyHash: string | null = null;
          if (replyEntry && typeof replyEntry === 'object' && replyEntry.hash) {
            replyHash = replyEntry.hash;
          } else if (replyKey.length > 20) {
            replyHash = replyKey;
          }
          
          if (replyHash) {
            // Get reply data to find the author
            this.gun.get('#posts').get(replyHash).once(async (replySoul: string) => {
              if (replySoul && typeof replySoul === 'string') {
                this.gun.get(replySoul).once((replyData: any) => {
                  if (replyData && typeof replyData === 'object') {
                    const { _, ...cleanReplyData } = replyData;
                    const replyAuthor = cleanReplyData.authorPub || cleanReplyData.author;
                    
                    if (replyAuthor) {
                      // Remove reply from author's posts index
                      this.gun.get('users').get(replyAuthor).get('posts').get(replyHash).put(null);
                      
                      // Remove reply from timeline
                      if (cleanReplyData.timestamp) {
                        const replyDate = new Date(cleanReplyData.timestamp);
                        for (let i = 0; i < 7; i++) {
                          const date = new Date(replyDate);
                          date.setDate(date.getDate() - i);
                          const timeKey = date.toISOString().split('T')[0];
                          this.gun.get(this.appName).get('timeline').get(timeKey).get(replyHash).put(null);
                        }
                      }
                      
                      // Remove replyTo reference from the reply
                      const replyPostNode = this.gun.get(this.appName).get('posts').get(replyHash);
                      replyPostNode.get('replyTo').put(null);
                    }
                  }
                });
              }
            });
          }
          
          // Remove reply reference from this post's replies
          repliesNode.get(replyKey).put(null);
        }
      });

      // Wait a bit to let GunDB sync the deletions
      await new Promise(resolve => setTimeout(resolve, 200));
      
      console.log('Post deleted:', postId, 'isReply:', !!postData.replyTo);
      return { success: true };
    } catch (error) {
      console.error('Error deleting post:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete post',
      };
    }
  }

  /**
   * Get all posts by a specific user (content-addressed)
   * Reads from user's posts node which contains hashes/souls
   */
  getUserPosts(userPub: string, callback: (post: PostWithAuthor) => void): () => void {
    // Use the public users node
    const userPublicNode = this.gun.get('users').get(userPub);
    
    userPublicNode
      .get('posts')
      .map()
      .on((postEntry: any, hash: string) => {
        if (postEntry && typeof postEntry === 'object' && hash && !hash.startsWith('_')) {
          // Get the soul from the entry or use hash to find it
          const postSoul = postEntry.soul || hash;
          
          // Get the actual post data using the soul
          this.gun.get(postSoul).once((postData: any) => {
            if (postData && typeof postData === 'object') {
              const { _, ...cleanPostData } = postData;
              const postPayload: PostPayload = {
                id: hash,
                text: cleanPostData.text || '',
                media: cleanPostData.media || null,
                authorPub: cleanPostData.authorPub || userPub,
                timestamp: cleanPostData.timestamp || postEntry.timestamp || Date.now(),
                replyTo: cleanPostData.replyTo || null,
              };
              if (postPayload.text) {
                this.getPostWithAuthor(postPayload, callback);
              }
            }
          });
        }
      });

    return () => {
      try {
        userPublicNode.get('posts').map().off();
      } catch (e) {
        console.error('Error cleaning up getUserPosts listener:', e);
      }
    };
  }

  /**
   * Get all tags for a specific post (using bidirectional references)
   * This leverages the Post → Tags reference created during publishPost
   */
  getPostTags(postId: string, callback: (tag: { name: string; slug: string }) => void): () => void {
    const postNode = this.gun.get(this.appName).get('posts').get(postId);
    
    postNode
      .get('tags')
      .map()
      .on((tagNode: any, tagSlug: string) => {
        if (tagNode && typeof tagNode === 'object' && tagSlug && !tagSlug.startsWith('_')) {
          // tagNode might be a reference or already contain data
          // Try to get tag data directly from hashtags node
          const tagDataNode = this.gun.get(this.appName).get('hashtags').get(tagSlug);
          tagDataNode.once((tagData: { name?: string; slug?: string }) => {
            if (tagData && tagData.name) {
              callback({
                name: tagData.name,
                slug: tagData.slug || tagData.name,
              });
            } else if (tagNode && typeof tagNode === 'object' && tagNode.name) {
              // Fallback: use tagNode directly if it has the data
              callback({
                name: tagNode.name,
                slug: tagNode.slug || tagNode.name,
              });
            }
          });
        }
      });

    return () => {
      try {
        postNode.get('tags').map().off();
      } catch (e) {
        console.error('Error cleaning up getPostTags listener:', e);
      }
    };
  }

  /**
   * Get all posts with a specific tag (using bidirectional references)
   * This leverages the Tag → Posts reference created during publishPost
   */
  getTagPosts(tagSlug: string, callback: (post: PostWithAuthor) => void): () => void {
    const cleanTag = tagSlug.replace('#', '').toLowerCase();
    const tagNode = this.gun.get(this.appName).get('hashtags').get(cleanTag);
    
    const loadPostFromHash = (postHash: string) => {
      // Get soul from #posts using hash
      this.gun.get('#posts').get(postHash).once((postSoul: string) => {
        if (postSoul && typeof postSoul === 'string') {
          // Get the actual post data using the soul
          this.gun.get(postSoul).once((postData: any) => {
            if (postData && typeof postData === 'object') {
              const { _, ...cleanPostData } = postData;
              const postPayload: PostPayload = {
                id: postHash,
                text: cleanPostData.text || '',
                media: cleanPostData.media || null,
                authorPub: cleanPostData.authorPub || '',
                timestamp: cleanPostData.timestamp || Date.now(),
                replyTo: cleanPostData.replyTo || null,
              };
              if (postPayload.text) {
                this.getPostWithAuthor(postPayload, callback);
              }
            }
          });
        }
      });
    };
    
    // Method 1: Read from explicit hash entries (added during indexing)
    tagNode
      .get('posts')
      .map()
      .on((postEntry: any, key: string) => {
        if (key && !key.startsWith('_')) {
          let postHash: string | null = null;
          
          // Check if entry contains hash explicitly
          if (postEntry && typeof postEntry === 'object' && postEntry.hash) {
            postHash = postEntry.hash;
          } else if (key.length > 20) {
            // key might be the hash itself
            postHash = key;
          }
          
          if (postHash) {
            loadPostFromHash(postHash);
          }
        }
      });

    return () => {
      try {
        tagNode.get('posts').map().off();
      } catch (e) {
        console.error('Error cleaning up getTagPosts listener:', e);
      }
    };
  }

  /**
   * Get the author of a post (using bidirectional references)
   * This leverages the Post → Author reference created during publishPost
   */
  getPostAuthor(postId: string, callback: (profile: UserProfile) => void): void {
    const postNode = this.gun.get(this.appName).get('posts').get(postId);
    
    postNode.get('author').once((userNode: any) => {
      if (userNode && typeof userNode === 'object') {
        // Extract pub from user node if available
        const userPub = userNode.is?.pub || userNode._?.soul || null;
        if (userPub) {
          this.getUserProfile(userPub, callback);
        }
      }
    });
  }

  /**
   * Get parent post of a reply (using bidirectional references)
   * This leverages the Reply → Parent reference created during publishPost
   */
  getParentPost(replyId: string, callback: (post: PostWithAuthor) => void): void {
    const replyNode = this.gun.get(this.appName).get('posts').get(replyId);
    
    replyNode.get('replyTo').once((parentNode: any) => {
      if (parentNode && typeof parentNode === 'object') {
        parentNode.once((postData: PostPayload) => {
          if (postData) {
            this.getPostWithAuthor(postData, callback);
          }
        });
      }
    });
  }
}

