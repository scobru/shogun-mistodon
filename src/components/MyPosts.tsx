import React, { useState } from 'react';
import { useShogun } from 'shogun-button-react';
import { useUserPosts } from '../hooks/useUserPosts';
import { PostComposer } from './PostComposer';
import { PostList } from './PostList';

interface MyPostsProps {
  userPub?: string;
}

export const MyPosts: React.FC<MyPostsProps> = ({ userPub }) => {
  const { isLoggedIn, userPub: currentUserPub } = useShogun();
  const targetUserPub = userPub || currentUserPub || '';

  // IMPORTANT: All hooks must be called before any conditional returns
  const { posts: userPosts, loading: postsLoading, refreshPosts } = useUserPosts(targetUserPub);
  const [showComposer, setShowComposer] = useState(false);

  // Conditional return must come AFTER all hooks
  if (!targetUserPub) {
    return (
      <div className="card content-card p-8 text-center">
        <p className="text-shogun-secondary mb-4">Please sign in to view your posts.</p>
      </div>
    );
  }

  // Refresh posts after creation
  const handlePostCreated = () => {
    setTimeout(() => {
      refreshPosts?.();
    }, 500);
    setShowComposer(false);
  };

  return (
    <div className="w-full">
      {isLoggedIn && (
        <div className="mb-4 flex justify-end">
          <button
            className="btn btn-shogun-shogun-primary btn-sm gap-2"
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
            <PostComposer isModal={true} onPostCreated={handlePostCreated} />
          </div>
          <div className="modal-backdrop" onClick={() => setShowComposer(false)}></div>
        </div>
      )}

      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h2 className="text-2xl font-bold mb-1">My Posts</h2>
            <p className="text-shogun-secondary text-sm">
              Your posts from the decentralized network
            </p>
          </div>
        </div>
      </div>

      <PostList 
        posts={userPosts} 
        loading={postsLoading} 
        onRefresh={refreshPosts}
      />
    </div>
  );
};
