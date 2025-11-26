import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useShogun } from 'shogun-button-react';
import { useSocialProtocol } from '../hooks/useSocialProtocol';
import { PostCard } from './PostCard';
import { useReplies } from '../hooks/useReplies';
import type { Post } from '../utils/postUtils';

export const PostDetail: React.FC = () => {
  const { postId: rawPostId } = useParams<{ postId: string }>();
  // React Router should decode URL params, but handle both cases
  // Try the raw value first, then try decoded if different
  const postIdDecoded = rawPostId ? decodeURIComponent(rawPostId) : undefined;
  const postId = rawPostId || undefined;
  const navigate = useNavigate();
  const { sdk, core } = useShogun();
  const shogunCore = sdk || core;
  const { socialNetwork, isReady, getPostAuthor, getUserProfile } = useSocialProtocol();
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Use decoded version for replies
  const { replies, loading: repliesLoading } = useReplies(postIdDecoded || postId || '');

  useEffect(() => {
    // Use decoded version if available, otherwise use raw
    const searchPostId = postIdDecoded || postId;
    
    if (!isReady || !socialNetwork || !searchPostId || !shogunCore?.gun) {
      if (!isReady || !socialNetwork) {
        setLoading(false);
        return;
      }
      if (!searchPostId) {
        setError('Post ID not provided');
        setLoading(false);
        return;
      }
      return;
    }

    console.log('Loading post with ID (raw):', postId);
    console.log('Loading post with ID (decoded):', postIdDecoded);
    console.log('Using search ID:', searchPostId);
    setLoading(true);
    setError(null);

    const gun = shogunCore.gun;
    const appName = 'shogun-mistodon-clone-v1';
    let found = false;
    let cleanupFunctions: Array<() => void> = [];

    const loadPostFromSoul = (postSoul: string, source: string) => {
      if (!postSoul || typeof postSoul !== 'string' || found) return;
      
      console.log(`Found post soul from ${source}:`, postSoul);
      found = true;
      
      // Get the actual post data using the soul
      console.log('Loading post data from soul:', postSoul);
      const postDataNode = gun.get(postSoul);
      let postDataReceived = false;
      
      // Use .on() to listen for data (may not be immediately available)
      const postDataListener = (postData: any) => {
        // Skip if we already processed this or if data is not ready
        if (postDataReceived || !postData) return;
        
        // Wait for actual data (not just the node reference)
        if (typeof postData === 'object' && postData._ !== null) {
          postDataReceived = true;
          console.log('Post data received:', postData);
          
          // Clean up listener once we have data
          try {
            postDataNode.off(postDataListener);
          } catch (e) {
            console.warn('Error removing post data listener:', e);
          }
          
          const { _, ...cleanPostData } = postData;
          console.log('Clean post data:', cleanPostData);
          
          // Validate that we have at least author and content
          const postAuthor = cleanPostData.authorPub || cleanPostData.author || '';
          const postContent = cleanPostData.text || cleanPostData.content || '';
          
          if (!postAuthor || !postContent) {
            console.warn('Post missing required fields - author:', postAuthor, 'content:', postContent);
            if (!found) {
              found = false;
              return;
            } else {
              setError('Post data is incomplete (missing author or content)');
              setLoading(false);
              return;
            }
          }
          
          // Convert to Post format (content-addressed uses authorPub/text)
          const post: Post = {
            id: searchPostId, // Use hash as ID
            author: postAuthor,
            content: postContent,
            timestamp: cleanPostData.timestamp || Date.now(),
            likes: cleanPostData.likes || {},
            reposts: cleanPostData.reposts || {},
            replyTo: cleanPostData.replyTo || undefined,
            media: cleanPostData.media || undefined,
          };

          console.log('Post object created:', post);

          // Get likes/reposts from interactions node (posts are immutable)
          const likesNode = gun.get(appName).get('posts').get(searchPostId).get('likes');
          const repostsNode = gun.get(appName).get('posts').get(searchPostId).get('reposts');
          
          // Load likes
          const likes: Record<string, boolean> = {};
          likesNode.map().once((likeValue: any, likeKey: string) => {
            if (likeKey && !likeKey.startsWith('_') && (likeValue === true || (likeValue && typeof likeValue === 'object' && !likeValue._))) {
              likes[likeKey] = true;
            }
          });
          
          // Load reposts
          const reposts: Record<string, boolean> = {};
          repostsNode.map().once((repostValue: any, repostKey: string) => {
            if (repostKey && !repostKey.startsWith('_') && (repostValue && typeof repostValue === 'object' && !repostValue._)) {
              reposts[repostKey] = true;
            }
          });
          
          // Update post with interactions after a small delay to allow data to load
          setTimeout(() => {
            post.likes = likes;
            post.reposts = reposts;
            console.log('Loading author profile for post:', searchPostId);
            console.log('Post authorPub:', post.author);
            
            let profileLoaded = false;
            const setPostWithProfile = (profile: any) => {
              if (profileLoaded) return;
              profileLoaded = true;
              
              console.log('Author profile received:', profile);
              if (profile && profile.displayName) {
                setPost({
                  ...post,
                  authorProfile: {
                    username: profile.displayName,
                    avatar: profile.avatarCid,
                    bio: profile.bio,
                  },
                });
              } else {
                // Set post without profile if profile is not available
                console.warn('Author profile not available, setting post without profile');
                setPost(post);
              }
              console.log('Post set in state, loading complete');
              setLoading(false);
            };
            
            // Method 1: Try getPostAuthor (bidirectional reference)
            try {
              getPostAuthor(searchPostId, setPostWithProfile);
            } catch (error) {
              console.error('Error calling getPostAuthor:', error);
            }
            
            // Method 2: Fallback - use authorPub directly if we have it
            if (post.author) {
              const fallbackTimeout = setTimeout(async () => {
                if (!profileLoaded) {
                  console.log('getPostAuthor timeout, trying direct getUserProfile with authorPub:', post.author);
                  try {
                    const profile = await getUserProfile(post.author);
                    setPostWithProfile(profile);
                  } catch (error) {
                    console.error('Error getting user profile directly:', error);
                    // Final fallback: set post without profile
                    if (!profileLoaded) {
                      setPost(post);
                      setLoading(false);
                    }
                  }
                }
              }, 2000); // Wait 2 seconds for getPostAuthor
              
              cleanupFunctions.push(() => {
                clearTimeout(fallbackTimeout);
              });
            } else {
              // No authorPub, set post without profile
              if (!profileLoaded) {
                console.warn('No authorPub in post, setting post without profile');
                setPost(post);
                setLoading(false);
              }
            }
          }, 100);
        } else {
          console.warn('Post data invalid or null:', postData);
          console.warn('Post data type:', typeof postData);
          console.warn('Post data _ value:', postData?._);
          if (!found) {
            // Don't set error yet, try other methods
            found = false;
          } else {
            // If we already found it but data is invalid, show error
            setError('Post data is invalid or corrupted');
            setLoading(false);
          }
        }
      };
      
      postDataNode.on(postDataListener);
      cleanupFunctions.push(() => {
        try {
          postDataNode.off(postDataListener);
        } catch (e) {
          console.warn('Error cleaning up postDataNode listener:', e);
        }
      });
    };

    // Try both raw and decoded versions of the postId
    const postIdsToTry = [searchPostId];
    if (postIdDecoded && postIdDecoded !== postId) {
      postIdsToTry.push(postIdDecoded);
    }
    if (postId && postId !== searchPostId && postId !== postIdDecoded) {
      postIdsToTry.push(postId);
    }

    // Method 1: Try to get post from content-addressed storage (#posts)
    postIdsToTry.forEach(tryPostId => {
      const hashNode = gun.get('#posts').get(tryPostId);
      const hashListener = (postSoul: string) => {
        if (postSoul && typeof postSoul === 'string') {
          loadPostFromSoul(postSoul, `#posts-${tryPostId}`);
        }
      };
      hashNode.on(hashListener);
      cleanupFunctions.push(() => {
        try {
          hashNode.off(hashListener);
        } catch (e) {
          console.error('Error cleaning up hashNode listener:', e);
        }
      });
    });

    // Method 2: Try to find in timeline (check last 30 days for better coverage)
    const today = new Date();
    const timelineListeners: Array<() => void> = [];
    
    postIdsToTry.forEach(tryPostId => {
      for (let i = 0; i < 30; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const timeKey = date.toISOString().split('T')[0];
        
        const timelineNode = gun.get(appName).get('timeline').get(timeKey).get(tryPostId);
        const timelineListener = (postSoul: string) => {
          if (postSoul && typeof postSoul === 'string') {
            loadPostFromSoul(postSoul, `timeline-${timeKey}-${tryPostId}`);
          }
        };
        timelineNode.on(timelineListener);
        
        timelineListeners.push(() => {
          try {
            timelineNode.off(timelineListener);
          } catch (e) {
            // Ignore cleanup errors
          }
        });
      }
    });
    cleanupFunctions.push(...timelineListeners);

    // Method 3: Try to find through bidirectional post references
    postIdsToTry.forEach(tryPostId => {
      const postNode = gun.get(appName).get('posts').get(tryPostId);
      const postNodeListener = (data: any) => {
        if (data && data._ && data._['#']) {
          const postSoul = data._['#'];
          loadPostFromSoul(postSoul, `bidirectional-post-node-${tryPostId}`);
        }
      };
      postNode.on(postNodeListener);
      cleanupFunctions.push(() => {
        try {
          postNode.off(postNodeListener);
        } catch (e) {
          console.error('Error cleaning up postNode listener:', e);
        }
      });
    });

    // Method 4: Search through all users' posts (fallback - slower but more thorough)
    const usersNode = gun.get('users');
    let userSearchTimeout: ReturnType<typeof setTimeout> | null = null;
    
    // Only do this if other methods fail
    const startUserSearch = setTimeout(() => {
      if (!found) {
        console.log('Trying user posts search as fallback...');
        usersNode.map().on((userData: any, userPub: string) => {
          if (found || !userPub || userPub.startsWith('_')) return;
          
          postIdsToTry.forEach(tryPostId => {
              userPostsNode.on((postEntry: any) => {
              if (found) return;
              if (postEntry && postEntry.soul && typeof postEntry.soul === 'string') {
                loadPostFromSoul(postEntry.soul, `user-${userPub}-${tryPostId}`);
              } else if (postEntry && typeof postEntry === 'string') {
                loadPostFromSoul(postEntry, `user-${userPub}-${tryPostId}`);
              }
            });
          });
        });
        
        userSearchTimeout = setTimeout(() => {
          usersNode.map().off();
        }, 5000);
      }
    }, 3000);

    // Timeout after 10 seconds if post not found (more time for sync)
    const timeout = setTimeout(() => {
      if (!found) {
        console.error('Post not found after 10 seconds. PostId (raw):', postId);
        console.error('Post not found after 10 seconds. PostId (decoded):', postIdDecoded);
        console.error('Post not found after 10 seconds. Search ID:', searchPostId);
        setError('Post not found. It may not exist or may not have synced yet.');
        setLoading(false);
      }
    }, 10000);

    return () => {
      clearTimeout(timeout);
      if (userSearchTimeout) clearTimeout(userSearchTimeout);
      if (startUserSearch) clearTimeout(startUserSearch);
      cleanupFunctions.forEach(cleanup => {
        try {
          cleanup();
        } catch (e) {
          console.error('Error during cleanup:', e);
        }
      });
    };
  }, [isReady, socialNetwork, postId, postIdDecoded, shogunCore, getPostAuthor, getUserProfile]);

  if (!isReady) {
    return (
      <div className="flex items-center justify-center p-8">
        <span className="loading loading-spinner loading-lg"></span>
        <p className="ml-4 text-shogun-secondary">Initializing...</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <span className="loading loading-spinner loading-lg"></span>
        <p className="ml-4 text-shogun-secondary">Loading post...</p>
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="card content-card p-8">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Post Not Found</h2>
          <p className="text-shogun-secondary mb-6">{error || 'The post you are looking for does not exist.'}</p>
          <button
            className="btn btn-shogun-primary"
            onClick={() => navigate('/')}
          >
            Back to Timeline
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="mb-4">
        <button
          className="btn btn-ghost btn-sm gap-2"
          onClick={() => navigate(-1)}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 19l-7-7m0 0l7-7m-7 7h18"
            />
          </svg>
          Back
        </button>
      </div>

      {/* Main post */}
      <PostCard post={post} />

      {/* Show parent post if this is a reply */}
      {post.replyTo && (
        <div className="mb-4">
          <h3 className="text-sm font-semibold mb-2 text-shogun-secondary">
            Replying to:
          </h3>
          <ParentPost postId={post.replyTo} />
        </div>
      )}

      {/* Replies section */}
      {!repliesLoading && replies.length > 0 && (
        <div className="mt-6">
          <h3 className="text-xl font-bold mb-4">
            {replies.length} {replies.length === 1 ? 'Reply' : 'Replies'}
          </h3>
          <div className="space-y-4">
            {replies.map((reply) => (
              <PostCard key={reply.id} post={reply} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// Component to show parent post (if this is a reply)
// Now uses the new bidirectional getParentPost method
const ParentPost: React.FC<{ postId: string }> = ({ postId }) => {
  const { getParentPost } = useSocialProtocol();
  const [parentPost, setParentPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!postId) {
      setLoading(false);
      return;
    }

    // Use the new bidirectional getParentPost method
    getParentPost(postId, (post) => {
      if (post) {
        const convertedPost: Post = {
          id: post.id,
          author: post.authorPub || post.author || '',
          content: post.text || post.content || '',
          timestamp: post.timestamp || Date.now(),
          likes: post.likes || {},
          reposts: post.reposts || {},
          replyTo: post.replyTo || undefined,
          media: post.media || undefined,
          authorProfile: post.authorProfile ? {
            username: post.authorProfile.displayName,
            avatar: post.authorProfile.avatarCid || undefined,
            bio: post.authorProfile.bio,
          } : undefined,
        };
        setParentPost(convertedPost);
      }
      setLoading(false);
    });
  }, [postId, getParentPost]);

  if (loading) {
    return (
      <div className="card content-card p-4">
        <span className="loading loading-spinner loading-sm"></span>
        <span className="ml-2 text-sm text-shogun-secondary">Loading parent post...</span>
      </div>
    );
  }

  if (!parentPost) {
    return (
      <div className="card content-card p-4">
        <p className="text-sm text-shogun-secondary">Parent post not found</p>
      </div>
    );
  }

  return (
    <div className="opacity-75">
      <PostCard post={parentPost} />
    </div>
  );
};

