/**
 * Timeline - Uses the Social Protocol V2
 * Features:
 * - Organized timeline by date
 * - Profile caching
 * - Hashtag indexing
 * - Improved threading
 */

import React, { useEffect, useState } from 'react';
import { useShogun } from 'shogun-button-react';
import { useSocialProtocol } from '../hooks/useSocialProtocol';
import { useFollow } from '../hooks/useFollow';
import { PostComposer } from './PostComposer';
import { PostList } from './PostList';
import { formatRelativeTime } from '../utils/postUtils';
import type { PostWithAuthor } from '../utils/socialProtocol';

type TimelineMode = 'global' | 'following';

export const Timeline: React.FC = () => {
  const { isLoggedIn } = useShogun();
  const {
    isReady,
    displayedPosts,
    loading,
    error,
    hasMore,
    loadMore,
    viewGlobalTimeline,
    viewFollowingTimeline,
    viewHashtag,
    clearTimeline,
  } = useSocialProtocol();
  const { following } = useFollow();
  // IMPORTANT: All hooks must be called before any conditional returns
  const [timelineMode, setTimelineMode] = useState<TimelineMode>('global');
  const [hashtagFilter, setHashtagFilter] = useState<string | null>(null);
  const [hashtagSearch, setHashtagSearch] = useState<string>('');
  const [showComposer, setShowComposer] = useState(false);

  // Load timeline when component mounts and protocol is ready
  useEffect(() => {
    if (!isReady) return;

    clearTimeline();

    if (hashtagFilter) {
      viewHashtag(hashtagFilter);
    } else if (timelineMode === 'following' && isLoggedIn && following.length > 0) {
      viewFollowingTimeline(following);
    } else {
      viewGlobalTimeline();
    }

    return () => {
      clearTimeline();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, timelineMode, hashtagFilter, isLoggedIn, following.length]);

  // Refresh timeline after post creation
  const handlePostCreated = () => {
    // Timeline will update automatically via listeners, but we can refresh to be sure
    setTimeout(() => {
      if (hashtagFilter) {
        viewHashtag(hashtagFilter);
      } else if (timelineMode === 'following' && isLoggedIn && following.length > 0) {
        viewFollowingTimeline(following);
      } else {
        viewGlobalTimeline();
      }
    }, 500);
  };

  // Handle hashtag search
  const handleHashtagSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const hashtag = hashtagSearch.trim().replace('#', '').toLowerCase();
    if (hashtag) {
      setHashtagFilter(`#${hashtag}`);
      setHashtagSearch('');
    }
  };

  // Extract hashtags from posts for display
  const extractHashtags = (postText: string): string[] => {
    const hashtags = postText.match(/#\w+/g);
    return hashtags ? [...new Set(hashtags)] : [];
  };

  // Convert PostWithAuthor to Post format for PostList component
  // Use displayedPosts instead of all posts for pagination
  const convertedPosts = displayedPosts.map((post) => ({
    id: post.id,
    author: ('authorPub' in post ? post.authorPub : post.author) as string,
    content: ('text' in post ? post.text : post.content) as string,
    timestamp: post.timestamp,
    likes: post.likes || {},
    reposts: post.reposts || {},
    replyTo: post.replyTo,
    media: 'media' in post ? post.media : undefined,
    // Add author profile info if available
    authorProfile: post.authorProfile,
  }));

  // Conditional return must come AFTER all hooks
  if (!isReady) {
    return (
      <div className="flex items-center justify-center p-8">
        <span className="loading loading-spinner loading-lg"></span>
        <p className="ml-4 text-shogun-secondary">Initializing Social Protocol...</p>
      </div>
    );
  }

  return (
    <div className="w-full">
      {isLoggedIn && (
        <div className="mb-4 flex justify-end">
          <button
            className="btn btn-shogun-shogun-shogun-primary btn-sm gap-2"
            onClick={() => setShowComposer(true)}
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
                d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
              />
            </svg>
            New Post
          </button>
        </div>
      )}

      {/* Post Composer Modal */}
      {showComposer && (
        <div className="modal modal-open">
          <div className="modal-box max-w-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold">Create Post</h3>
              <button
                className="btn btn-sm btn-circle btn-ghost"
                onClick={() => setShowComposer(false)}
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
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
            <PostComposer 
              isModal={true}
              onPostCreated={() => {
                handlePostCreated();
                setShowComposer(false);
              }} 
            />
          </div>
          <div className="modal-backdrop" onClick={() => setShowComposer(false)}></div>
        </div>
      )}

      <div className="mb-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold mb-1">Timeline</h2>
            <p className="text-shogun-secondary text-sm">
              {hashtagFilter
                ? `Posts with ${hashtagFilter}`
                : timelineMode === 'following'
                ? 'Posts from people you follow'
                : isLoggedIn
                ? 'All posts from the decentralized network'
                : 'Sign in to create and interact with posts'}
            </p>
          </div>
        </div>

        {/* Timeline mode toggle (only if logged in) */}
        {isLoggedIn && !hashtagFilter && (
          <div className="flex gap-2 mb-4">
            <button
              className={`btn btn-sm ${timelineMode === 'global' ? 'btn-shogun-primary' : 'btn-ghost'}`}
              onClick={() => {
                setTimelineMode('global');
                setHashtagFilter(null);
              }}
            >
              Global
            </button>
            <button
              className={`btn btn-sm ${timelineMode === 'following' ? 'btn-shogun-primary' : 'btn-ghost'}`}
              onClick={() => {
                setTimelineMode('following');
                setHashtagFilter(null);
              }}
              disabled={following.length === 0}
            >
              Following {following.length > 0 && `(${following.length})`}
            </button>
          </div>
        )}

        {/* Hashtag search */}
        <form onSubmit={handleHashtagSearch} className="mb-4">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Search hashtag (e.g. #music)"
              className="input input-bordered input-sm flex-1"
              value={hashtagSearch}
              onChange={(e) => setHashtagSearch(e.target.value)}
            />
            <button type="submit" className="btn btn-shogun-primary btn-sm">
              Search
            </button>
          </div>
        </form>

        {error && (
          <div className="alert alert-error mb-4">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="stroke-current shrink-0 h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {/* Hashtag filter info */}
        {hashtagFilter && (
          <div className="alert alert-info mb-4">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="stroke-current shrink-0 h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>Filtering by hashtag: {hashtagFilter}</span>
            <button
              className="btn btn-sm btn-ghost"
              onClick={() => {
                setHashtagFilter(null);
                if (timelineMode === 'following' && isLoggedIn && following.length > 0) {
                  viewFollowingTimeline(following);
                } else {
                  viewGlobalTimeline();
                }
              }}
            >
              Clear filter
            </button>
          </div>
        )}

      </div>

      <PostList 
        posts={convertedPosts} 
        loading={loading} 
        hasMore={hasMore}
        onRefresh={viewGlobalTimeline}
        onLoadMore={loadMore}
      />
    </div>
  );
};

