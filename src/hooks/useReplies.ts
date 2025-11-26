import { useState, useEffect, useCallback } from 'react';
import { useShogun } from 'shogun-button-react';
import type { Post } from '../utils/postUtils';

interface UseRepliesReturn {
  replies: Post[];
  loading: boolean;
}

/**
 * Hook for loading replies to a specific post
 */
export function useReplies(postId: string): UseRepliesReturn {
  const { sdk, core } = useShogun();
  const shogunCore = sdk || core;
  const [replies, setReplies] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  const loadReplies = useCallback(() => {
    if (!shogunCore?.gun || !postId) {
      setLoading(false);
      return () => {}; // Return empty cleanup function
    }

    setLoading(true);
    const gun = shogunCore.gun;
    const appName = 'shogun-mistodon-clone-v1';
    // Read replies from app posts node (using bidirectional references)
    const repliesNode = gun.get(appName).get('posts').get(postId).get('replies');
    const repliesMap: Map<string, Post> = new Map();
    const listeners = new Map<string, any>(); // Track individual post listeners

    const loadReplyFromHash = (replyHash: string) => {
      // Get soul from #posts using hash
      gun.get('#posts').get(replyHash).once((replySoul: string) => {
        if (replySoul && typeof replySoul === 'string') {
          // Get the actual reply data using the soul (content-addressed)
          gun.get(replySoul).once((replyData: any) => {
            if (!replyData || typeof replyData !== 'object' || replyData._ === null) {
              // Filter out null or undefined data (deleted replies)
              if (repliesMap.has(replyHash)) {
                repliesMap.delete(replyHash);
                const repliesArray = Array.from(repliesMap.values()).sort(
                  (a, b) => a.timestamp - b.timestamp
                );
                setReplies(repliesArray);
              }
              return;
            }

            const { _, ...replyPostData } = replyData;
            const replyTimestamp = replyPostData.timestamp || Date.now();

            // Content-addressed format uses authorPub/text
            const replyAuthor = replyPostData.authorPub || replyPostData.author || '';
            const replyContent = replyPostData.text || replyPostData.content || '';

            if (replyAuthor && replyContent) {
              const reply: Post = {
                id: replyHash,
                author: replyAuthor,
                content: replyContent,
                timestamp: replyTimestamp,
                likes: replyPostData.likes || {},
                reposts: replyPostData.reposts || {},
                replyTo: replyPostData.replyTo || postId,
              };

              repliesMap.set(replyHash, reply);
              
              const repliesArray = Array.from(repliesMap.values()).sort(
                (a, b) => a.timestamp - b.timestamp
              );
              
              setReplies(repliesArray);
              setLoading(false);
            }
          });
        }
      });
    };

    // Listen for reply entries (content-addressed - contains hash explicitly)
    repliesNode.map().on((replyEntry: any, key: string) => {
      if (!key || key.startsWith('_')) {
        return;
      }

      // If replyEntry is null or undefined, it means the reply has been deleted
      if (replyEntry === null || typeof replyEntry === 'undefined') {
        if (repliesMap.has(key)) {
          repliesMap.delete(key);
          const repliesArray = Array.from(repliesMap.values()).sort(
            (a, b) => a.timestamp - b.timestamp
          );
          setReplies(repliesArray);
        }
        return;
      }

      let replyHash: string | null = null;
      
      // Check if entry contains hash explicitly
      if (replyEntry && typeof replyEntry === 'object' && replyEntry.hash) {
        replyHash = replyEntry.hash;
      } else if (key.length > 20) {
        // key might be the hash itself
        replyHash = key;
      }
      
      if (replyHash) {
        loadReplyFromHash(replyHash);
      }
    });

    setTimeout(() => {
      setLoading(false);
    }, 2000);

    // Return cleanup function
    return () => {
      try {
        // Clean up main listener
        repliesNode.map().off();
        // Clean up individual post listeners
        // Cleanup is handled by the main listener
        // Individual reply listeners use souls which are managed by GunDB
        listeners.clear();
      } catch (e) {
        console.error('Error cleaning up replies listeners:', e);
      }
    };
  }, [shogunCore, postId]);

  useEffect(() => {
    const cleanup = loadReplies();
    return cleanup;
  }, [loadReplies]);

  return {
    replies,
    loading,
  };
}

