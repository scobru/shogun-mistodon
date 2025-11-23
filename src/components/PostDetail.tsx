import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useShogun } from 'shogun-button-react';
import { useSocialProtocol } from '../hooks/useSocialProtocol';
import { PostCard } from './PostCard';
import { useReplies } from '../hooks/useReplies';
import type { Post } from '../utils/postUtils';

export const PostDetail: React.FC = () => {
  const { postId } = useParams<{ postId: string }>();
  const navigate = useNavigate();
  const { sdk, core } = useShogun();
  const shogunCore = sdk || core;
  const { socialNetwork, isReady } = useSocialProtocol();
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { replies, loading: repliesLoading } = useReplies(postId || '');

  useEffect(() => {
    if (!isReady || !socialNetwork || !postId || !shogunCore?.gun) {
      if (!isReady || !socialNetwork) {
        setLoading(false);
        return;
      }
      if (!postId) {
        setError('Post ID not provided');
        setLoading(false);
        return;
      }
      return;
    }

    setLoading(true);
    setError(null);

    const gun = shogunCore.gun;
    let found = false;

    // Try to get post from global posts node
    const postNode = gun.get('posts').get(postId);
    
    const listener = postNode.on((data: any) => {
      if (data && typeof data === 'object' && !found) {
        const { _, ...postData } = data;
        
        // Check if we have valid post data
        if (postData.id || postData.content || postData.text) {
          found = true;
          
          // Convert to Post format
          const post: Post = {
            id: postData.id || postId,
            author: postData.author || postData.authorPub || '',
            content: postData.content || postData.text || '',
            timestamp: postData.timestamp || Date.now(),
            likes: postData.likes || {},
            reposts: postData.reposts || {},
            replyTo: postData.replyTo || undefined,
            media: postData.media || undefined,
          };

          // Get author profile
          if (post.author) {
            socialNetwork.getUserProfile(post.author, (profile) => {
              setPost({
                ...post,
                authorProfile: {
                  username: profile.displayName,
                  avatar: profile.avatarCid,
                  bio: profile.bio,
                },
              });
              setLoading(false);
            });
          } else {
            setPost(post);
            setLoading(false);
          }
        }
      }
    });

    // Timeout after 5 seconds if post not found
    const timeout = setTimeout(() => {
      if (!found) {
        setError('Post not found');
        setLoading(false);
      }
    }, 5000);

    return () => {
      clearTimeout(timeout);
      try {
        postNode.off();
      } catch (e) {
        console.error('Error cleaning up post listener:', e);
      }
    };
  }, [isReady, socialNetwork, postId, shogunCore]);

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
const ParentPost: React.FC<{ postId: string }> = ({ postId }) => {
  const { sdk, core } = useShogun();
  const shogunCore = sdk || core;
  const { socialNetwork, isReady } = useSocialProtocol();
  const [parentPost, setParentPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isReady || !socialNetwork || !shogunCore?.gun) {
      setLoading(false);
      return;
    }

    const gun = shogunCore.gun;
    const postNode = gun.get('posts').get(postId);
    
    const listener = postNode.once((data: any) => {
      if (data && typeof data === 'object') {
        const { _, ...postData } = data;
        
        if (postData.id || postData.content || postData.text) {
          const post: Post = {
            id: postData.id || postId,
            author: postData.author || postData.authorPub || '',
            content: postData.content || postData.text || '',
            timestamp: postData.timestamp || Date.now(),
            likes: postData.likes || {},
            reposts: postData.reposts || {},
            replyTo: postData.replyTo || undefined,
            media: postData.media || undefined,
          };

          if (post.author) {
            socialNetwork.getUserProfile(post.author, (profile) => {
              setParentPost({
                ...post,
                authorProfile: {
                  username: profile.displayName,
                  avatar: profile.avatarCid,
                  bio: profile.bio,
                },
              });
              setLoading(false);
            });
          } else {
            setParentPost(post);
            setLoading(false);
          }
        } else {
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
    });

    return () => {
      try {
        postNode.off();
      } catch (e) {
        console.error('Error cleaning up parent post listener:', e);
      }
    };
  }, [isReady, socialNetwork, postId, shogunCore]);

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

