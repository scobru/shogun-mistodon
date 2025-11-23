import React, { useState } from 'react';
import { useShogun } from 'shogun-button-react';
import { useSocialProtocol } from '../hooks/useSocialProtocol';
import { MAX_POST_LENGTH, validatePost } from '../utils/postUtils';

interface PostComposerProps {
  replyToId?: string | null;
  onPostCreated?: () => void;
  isModal?: boolean; // Se true, rimuove lo stile della card
}

export const PostComposer: React.FC<PostComposerProps> = ({
  replyToId = null,
  onPostCreated,
  isModal = false,
}) => {
  const { isLoggedIn, userPub } = useShogun();
  const { publishPost, isReady } = useSocialProtocol();
  const [content, setContent] = useState('');
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (!isLoggedIn || !isReady) {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    const validation = validatePost(content);
    if (!validation.valid) {
      setError(validation.error || 'Invalid post');
      return;
    }

    setIsSubmitting(true);
    console.log('Submitting post...');
    
    // Convert File to Blob if mediaFile exists
    const mediaBlob = mediaFile ? await fileToBlob(mediaFile) : null;
    const result = await publishPost(content, mediaBlob, replyToId);
    setIsSubmitting(false);

    if (result.success) {
      console.log('Post created successfully');
      setContent('');
      setMediaFile(null);
      setMediaPreview(null);
      setError(null);
      setSuccessMessage('Post created successfully!');
      setTimeout(() => setSuccessMessage(null), 3000);
      
      if (onPostCreated) {
        onPostCreated();
      }
    } else {
      console.error('Failed to create post:', result.error);
      setError(result.error || 'Failed to create post');
    }
  };

  const remainingChars = MAX_POST_LENGTH - content.length;
  const isOverLimit = content.length > MAX_POST_LENGTH;
  const charPercentage = (content.length / MAX_POST_LENGTH) * 100;

  // Helper to convert File to Blob
  const fileToBlob = async (file: File): Promise<Blob> => {
    return file;
  };

  // Handle file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file type
    if (!file.type.startsWith('image/')) {
      setError('Only image files are supported');
      return;
    }

    // Check file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('Image size must be less than 5MB');
      return;
    }

    setMediaFile(file);
    setError(null);

    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setMediaPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Remove media
  const handleRemoveMedia = () => {
    setMediaFile(null);
    setMediaPreview(null);
  };

  return (
    <div className={isModal ? "w-full" : "card content-card p-6 mb-6 w-full transition-all duration-300 hover:shadow-xl"}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Header with avatar */}
        <div className="flex items-start gap-4">
          <div className="avatar placeholder">
            <div className="bg-shogun-primary text-shogun-primary-content rounded-full w-12 h-12 ring-2 ring-shogun-primary/20 flex items-center justify-center">
              <span className="text-lg font-semibold">
                {userPub?.[0]?.toUpperCase() || '?'}
              </span>
            </div>
          </div>
          
          <div className="flex-1">
            <label className="block mb-2">
              <span className="text-lg font-semibold text-base-content">
                {replyToId ? "Reply to post" : "What's happening?"}
              </span>
            </label>
            
            <textarea
              className="textarea textarea-bordered w-full h-32 resize-none text-base focus:textarea-shogun-primary transition-all duration-200 focus:ring-2 focus:ring-shogun-primary/50"
              placeholder={
                replyToId
                  ? 'Write your reply...'
                  : 'Share your thoughts with the decentralized network...'
              }
              value={content}
              onChange={(e) => setContent(e.target.value)}
              disabled={isSubmitting}
              maxLength={MAX_POST_LENGTH * 2}
            />

            {/* Media Preview */}
            {mediaPreview && (
              <div className="mt-3 relative">
                <div className="relative inline-block">
                  <img
                    src={mediaPreview}
                    alt="Preview"
                    className="max-w-full max-h-64 rounded-lg object-contain"
                  />
                  <button
                    type="button"
                    onClick={handleRemoveMedia}
                    className="absolute top-2 right-2 btn btn-sm btn-circle btn-error"
                    disabled={isSubmitting}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-4 w-4"
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
              </div>
            )}

            {/* File Input */}
            <div className="mt-3">
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="hidden"
                  disabled={isSubmitting}
                />
                <span className="btn btn-ghost btn-sm gap-2">
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
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                  {mediaFile ? 'Change Image' : 'Add Image'}
                </span>
              </label>
            </div>
            
            {/* Character counter with progress bar */}
            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 min-h-[20px]">
                  {error && (
                    <div className="flex items-center gap-1 text-error animate-fade-in">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      <span>{error}</span>
                    </div>
                  )}
                  {successMessage && !error && (
                    <div className="flex items-center gap-1 text-success animate-fade-in">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                      <span>{successMessage}</span>
                    </div>
                  )}
                </div>
                
                <div className="flex items-center gap-3">
                  {/* Progress indicator */}
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 bg-base-300 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${
                          isOverLimit
                            ? 'bg-error'
                            : charPercentage > 80
                            ? 'bg-warning'
                            : 'bg-shogun-primary'
                        }`}
                        style={{ width: `${Math.min(charPercentage, 100)}%` }}
                      />
                    </div>
                    <span
                      className={`text-sm font-medium min-w-[3rem] text-right ${
                        isOverLimit
                          ? 'text-error'
                          : charPercentage > 80
                          ? 'text-warning'
                          : 'text-base-content/60'
                      }`}
                    >
                      {remainingChars}
                    </span>
                  </div>
                  
                  <button
                    type="submit"
                    className="btn btn-shogun-primary btn-sm px-6 font-semibold shadow-lg hover:shadow-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={isSubmitting || (!content.trim() && !mediaFile) || isOverLimit}
                  >
                    {isSubmitting ? (
                      <>
                        <span className="loading loading-spinner loading-xs"></span>
                        <span>Posting...</span>
                      </>
                    ) : (
                      <>
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-4 w-4"
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
                        <span>{replyToId ? 'Reply' : 'Post'}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
};

