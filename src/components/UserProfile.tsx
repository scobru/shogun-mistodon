import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useShogun } from 'shogun-button-react';
import { useUserProfile } from '../hooks/useUserProfile';
import { useFollow } from '../hooks/useFollow';
import { useUserPosts } from '../hooks/useUserPosts';
import { PostList } from './PostList';
import { getCurrentUserPub } from '../utils/gunHelpers';

// Component to display a user in the following/followers list
const UserListItem: React.FC<{ userPub: string }> = ({ userPub }) => {
  const { profile } = useUserProfile(userPub);
  const currentUserFollow = useFollow(); // For current user's following status
  const { userPub: currentUserPub, isLoggedIn } = useShogun();
  const [isToggling, setIsToggling] = useState(false);

  const isFollowingUser = currentUserFollow.isFollowing(userPub);

  const handleFollowToggle = async () => {
    if (!isLoggedIn || userPub === currentUserPub) return;
    setIsToggling(true);
    if (isFollowingUser) {
      await currentUserFollow.unfollow(userPub);
    } else {
      await currentUserFollow.follow(userPub);
    }
    setIsToggling(false);
  };

  const displayName = profile?.username || userPub.substring(0, 16) + '...';

  return (
    <div className="flex items-center justify-between p-3 rounded-lg hover:bg-base-200 transition-colors">
      <div className="flex items-center gap-3 flex-1">
        <div className="avatar placeholder">
          {profile?.avatar ? (
            <div className="rounded-full w-12 h-12">
              <img
                src={profile.avatar}
                alt={displayName}
                className="rounded-full w-12 h-12 object-cover"
              />
            </div>
          ) : (
            <div className="bg-shogun-primary text-shogun-primary-content rounded-full w-12 h-12 flex items-center justify-center">
              <span className="text-lg">
                {profile?.username?.[0]?.toUpperCase() || userPub[0]?.toUpperCase() || '?'}
              </span>
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <Link
            to={`/profile/${userPub}`}
            className="font-semibold hover:underline block truncate"
          >
            {displayName}
          </Link>
          {profile?.bio && (
            <p className="text-sm text-shogun-secondary truncate">{profile.bio}</p>
          )}
        </div>
      </div>
      {isLoggedIn && currentUserPub && currentUserPub !== userPub && (
        <button
          className={`btn btn-sm ${isFollowingUser ? 'btn-outline' : 'btn-shogun-primary'}`}
          onClick={handleFollowToggle}
          disabled={isToggling}
        >
          {isToggling ? (
            <span className="loading loading-spinner loading-xs"></span>
          ) : isFollowingUser ? (
            'Unfollow'
          ) : (
            'Follow'
          )}
        </button>
      )}
    </div>
  );
};

interface UserProfileProps {
  userPub?: string;
}

export const UserProfile: React.FC<UserProfileProps> = ({ userPub }) => {
  const { sdk, core, isLoggedIn, userPub: currentUserPub } = useShogun();
  const shogunCore = sdk || core;
  const targetUserPub = userPub || currentUserPub || '';
  
  // IMPORTANT: Always call ALL hooks in the same order, before any conditional returns
  const { profile, loading: profileLoading, updateProfile } = useUserProfile(targetUserPub);
  const { following, followers, loading: followLoading, follow, unfollow, isFollowing } = useFollow(targetUserPub);
  const { posts: userPosts, loading: postsLoading } = useUserPosts(targetUserPub);
  
  // All useState hooks must be called before any conditional returns
  const [isEditing, setIsEditing] = useState(false);
  const [editUsername, setEditUsername] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editAvatar, setEditAvatar] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showFollowing, setShowFollowing] = useState(false);
  const [showFollowers, setShowFollowers] = useState(false);

  const isOwnProfile = !userPub || targetUserPub === currentUserPub;

  React.useEffect(() => {
    if (profile && isEditing) {
      setEditUsername(profile.username || '');
      setEditBio(profile.bio || '');
      setEditAvatar(profile.avatar || '');
    }
  }, [profile, isEditing]);
  
  // If no userPub provided and user is not logged in, show message
  // This check must come AFTER all hooks
  if (!userPub && !isLoggedIn) {
    return (
      <div className="card content-card p-8 text-center">
        <p className="text-shogun-secondary mb-4">Please sign in to view your profile.</p>
      </div>
    );
  }

  const handleSaveProfile = async () => {
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    
    console.log('Saving profile...');
    const result = await updateProfile({
      username: editUsername.trim(),
      bio: editBio.trim(),
      avatar: editAvatar.trim() || undefined,
    });
    setIsSaving(false);

    if (result.success) {
      console.log('Profile saved successfully');
      setSaveSuccess(true);
      setIsEditing(false);
      setTimeout(() => setSaveSuccess(false), 3000);
    } else {
      console.error('Failed to save profile:', result.error);
      setSaveError(result.error || 'Failed to save profile');
    }
  };

  const handleFollow = async () => {
    if (!shogunCore?.gun || !isLoggedIn) {
      console.log('Cannot follow: not authenticated', { hasGun: !!shogunCore?.gun, isLoggedIn });
      return;
    }
    
    const gun = shogunCore.gun;
    const user = gun.user();
    let currentPub = getCurrentUserPub(gun);
    
    if (!currentPub && user && user.is && user.is.pub) {
      currentPub = user.is.pub;
    }
    
    if (!currentPub) {
      console.log('Cannot follow: user pub not found', { user, hasUser: !!user, hasIs: !!(user && user.is), hasPub: !!(user && user.is && user.is.pub) });
      return;
    }
    
    if (currentPub === targetUserPub) {
      console.log('Cannot follow yourself');
      return;
    }

    console.log('Following/unfollowing user:', targetUserPub, 'isFollowing:', isFollowing(targetUserPub), 'currentPub:', currentPub);
    if (isFollowing(targetUserPub)) {
      const result = await unfollow(targetUserPub);
      console.log('Unfollow result:', result);
    } else {
      const result = await follow(targetUserPub);
      console.log('Follow result:', result);
    }
  };

  // Show loading only if we have a target user and are still loading
  if (profileLoading && targetUserPub) {
    return (
      <div className="flex justify-center items-center py-12">
        <span className="loading loading-lg"></span>
        <p className="ml-4 text-shogun-secondary">Loading profile...</p>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Back to Timeline link */}
      <div className="mb-4">
        <Link to="/" className="btn btn-ghost btn-sm gap-2">
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
          Back to Timeline
        </Link>
      </div>

      {/* Profile Header */}
      <div className="card content-card p-6 mb-6 w-full">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-4">
            <div className="avatar placeholder">
              {profile?.avatar ? (
                <div className="rounded-full w-20 h-20">
                  <img src={profile.avatar} alt={profile?.username || 'Avatar'} className="rounded-full w-20 h-20 object-cover" />
                </div>
              ) : (
                <div className="bg-shogun-primary text-shogun-primary-content rounded-full w-20 h-20 flex items-center justify-center">
                  <span className="text-3xl">
                    {profile?.username?.[0]?.toUpperCase() || targetUserPub[0]?.toUpperCase() || '?'}
                  </span>
                </div>
              )}
            </div>
            <div>
              <h2 className="text-2xl font-bold">
                {profile?.username || targetUserPub.substring(0, 16) + '...'}
              </h2>
              <p className="text-shogun-secondary text-sm font-mono break-all">
                {targetUserPub}
              </p>
            </div>
          </div>

          {isOwnProfile ? (
            <button
              className="btn btn-shogun-primary btn-sm"
              onClick={() => setIsEditing(!isEditing)}
            >
              {isEditing ? 'Cancel' : 'Edit Profile'}
            </button>
          ) : (
            isLoggedIn && (
              <button
                className={`btn btn-sm ${isFollowing(targetUserPub) ? 'btn-outline' : 'btn-shogun-primary'}`}
                onClick={handleFollow}
                disabled={followLoading}
              >
                {followLoading ? (
                  <span className="loading loading-spinner loading-xs"></span>
                ) : isFollowing(targetUserPub) ? (
                  'Unfollow'
                ) : (
                  'Follow'
                )}
              </button>
            )
          )}
        </div>

        {/* Edit Form */}
        {isEditing && isOwnProfile && (
          <div className="mt-4 pt-4 border-t border-base-300">
            {saveError && (
              <div className="alert alert-error mb-4">
                <span className="text-sm">{saveError}</span>
              </div>
            )}
            {saveSuccess && (
              <div className="alert alert-success mb-4">
                <span className="text-sm">Profile saved successfully!</span>
              </div>
            )}
            <div className="form-control mb-4">
              <label className="label">
                <span className="label-text">Username</span>
              </label>
              <input
                type="text"
                className="input input-bordered"
                value={editUsername}
                onChange={(e) => setEditUsername(e.target.value)}
                placeholder="Your username"
              />
            </div>
            <div className="form-control mb-4">
              <label className="label">
                <span className="label-text">Avatar URL</span>
                <span className="label-text-alt">(IPFS CID or image URL)</span>
              </label>
              <input
                type="text"
                className="input input-bordered"
                value={editAvatar}
                onChange={(e) => setEditAvatar(e.target.value)}
                placeholder="https://example.com/avatar.jpg or QmHash..."
              />
              {editAvatar && (
                <div className="mt-2">
                  <img 
                    src={editAvatar} 
                    alt="Avatar preview" 
                    className="w-20 h-20 rounded-full object-cover border-2 border-shogun-primary"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </div>
              )}
            </div>
            <div className="form-control mb-4">
              <label className="label">
                <span className="label-text">Bio</span>
              </label>
              <textarea
                className="textarea textarea-bordered h-24"
                value={editBio}
                onChange={(e) => setEditBio(e.target.value)}
                placeholder="Tell us about yourself..."
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setIsEditing(false);
                  setSaveError(null);
                  setSaveSuccess(false);
                }}
              >
                Cancel
              </button>
              <button
                className="btn btn-shogun-primary btn-sm"
                onClick={handleSaveProfile}
                disabled={isSaving}
              >
                {isSaving ? (
                  <>
                    <span className="loading loading-spinner loading-xs"></span>
                    Saving...
                  </>
                ) : (
                  'Save'
                )}
              </button>
            </div>
          </div>
        )}

        {/* Bio */}
        {!isEditing && profile?.bio && (
          <p className="mb-4 whitespace-pre-wrap">{profile.bio}</p>
        )}

        {/* Stats */}
        <div className="flex gap-6">
          <div>
            <span className="font-semibold">{userPosts.length}</span>
            <span className="text-shogun-secondary ml-1">Posts</span>
          </div>
          <button
            className="hover:opacity-80 transition-opacity"
            onClick={() => {
              setShowFollowing(true);
              setShowFollowers(false);
            }}
          >
            <span className="font-semibold">{following.length}</span>
            <span className="text-shogun-secondary ml-1">Following</span>
          </button>
          <button
            className="hover:opacity-80 transition-opacity"
            onClick={() => {
              setShowFollowers(true);
              setShowFollowing(false);
            }}
          >
            <span className="font-semibold">{followers.length}</span>
            <span className="text-shogun-secondary ml-1">Followers</span>
          </button>
        </div>
      </div>

      {/* Following/Followers Lists */}
      {(showFollowing || showFollowers) && (
        <div className="card content-card p-6 mb-6 w-full">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold">
              {showFollowing ? 'Following' : 'Followers'}
            </h3>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setShowFollowing(false);
                setShowFollowers(false);
              }}
            >
              Close
            </button>
          </div>
          
          {(showFollowing ? following : followers).length === 0 ? (
            <p className="text-shogun-secondary text-center py-8">
              {showFollowing ? 'Not following anyone yet' : 'No followers yet'}
            </p>
          ) : (
            <div className="space-y-3">
              {(showFollowing ? following : followers).map((userPub) => (
                <UserListItem key={userPub} userPub={userPub} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* User Posts - REMOVED */}
      {/* <div className="mb-4">
        <h3 className="text-xl font-bold mb-2">Posts</h3>
      </div>
      <PostList posts={userPosts} loading={postsLoading} /> */}
    </div>
  );
};

