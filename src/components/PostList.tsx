import React, { useEffect, useRef, useCallback } from 'react';
import { PostCard } from './PostCard';
import type { Post } from '../utils/postUtils';

interface PostListProps {
  posts: Post[];
  loading?: boolean;
  hasMore?: boolean;
  onRefresh?: () => void;
  onLoadMore?: () => void;
}

export const PostList: React.FC<PostListProps> = ({ 
  posts, 
  loading, 
  hasMore = false,
  onRefresh,
  onLoadMore 
}) => {
  const observerTarget = useRef<HTMLDivElement>(null);

  // Intersection Observer for infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading && onLoadMore) {
          onLoadMore();
        }
      },
      {
        threshold: 0.1,
        rootMargin: '100px', // Start loading 100px before reaching the bottom
      }
    );

    const currentTarget = observerTarget.current;
    if (currentTarget) {
      observer.observe(currentTarget);
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget);
      }
    };
  }, [hasMore, loading, onLoadMore]);

  if (loading && posts.length === 0) {
    return (
      <div className="flex justify-center items-center py-12">
        <span className="loading loading-lg"></span>
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="card content-card p-8 text-center w-full">
        <p className="text-secondary">No posts yet. Be the first to post!</p>
      </div>
    );
  }

  return (
    <div className="w-full">
      {posts.map((post) => (
        <PostCard key={post.id} post={post} onReply={onRefresh} />
      ))}
      
      {/* Infinite scroll trigger */}
      {hasMore && (
        <div ref={observerTarget} className="flex justify-center items-center py-8">
          {loading ? (
            <span className="loading loading-spinner loading-md"></span>
          ) : (
            <button
              onClick={onLoadMore}
              className="btn btn-ghost btn-sm"
            >
              Load more posts
            </button>
          )}
        </div>
      )}
      
      {/* Show message when all posts are loaded */}
      {!hasMore && posts.length > 0 && posts.length >= 20 && (
        <div className="text-center py-8 text-shogun-secondary text-sm">
          Showing all {posts.length} post{posts.length !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
};

