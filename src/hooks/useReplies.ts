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
    const repliesNode = gun.get('posts').get(postId).get('replies');
    const repliesMap: Map<string, Post> = new Map();
    const listeners = new Map<string, any>(); // Track individual post listeners

    // Listen for reply IDs
    const mainListener = repliesNode.map().on((data: any, replyId: string) => {
      if (!replyId || replyId.startsWith('_')) {
        return;
      }

      // Get the actual reply post with real-time updates
      // Use once() first to get complete data, then on() for updates
      gun.get('posts').get(replyId).once((replyData: any) => {
        if (!replyData || typeof replyData !== 'object') {
          return;
        }

        const { _, ...replyPostData } = replyData;

        // Extract timestamp from ID if missing
        let replyTimestamp = replyPostData.timestamp;
        if (!replyTimestamp && replyId) {
          const idParts = replyId.split('_');
          if (idParts.length >= 2 && idParts[0] === 'post') {
            const extractedTimestamp = parseInt(idParts[1]);
            if (!isNaN(extractedTimestamp)) {
              replyTimestamp = extractedTimestamp;
            }
          }
        }
        if (!replyTimestamp) {
          replyTimestamp = Date.now();
        }

        if (replyPostData.author && replyPostData.content) {
          const reply: Post = {
            id: replyId,
            author: replyPostData.author,
            content: replyPostData.content,
            timestamp: replyTimestamp,
            likes: replyPostData.likes || {},
            reposts: replyPostData.reposts || {},
            replyTo: replyPostData.replyTo,
          };

          repliesMap.set(replyId, reply);
          
          const repliesArray = Array.from(repliesMap.values()).sort(
            (a, b) => a.timestamp - b.timestamp
          );
          
          setReplies(repliesArray);
          setLoading(false);
        }
      });

      // Also listen for updates
      const updateListener = gun.get('posts').get(replyId).on((replyData: any) => {
        if (!replyData || typeof replyData !== 'object' || replyData._) {
          return;
        }

        const { _, ...replyPostData } = replyData;

        // Extract timestamp from ID if missing
        let replyTimestamp = replyPostData.timestamp;
        if (!replyTimestamp && replyId) {
          const idParts = replyId.split('_');
          if (idParts.length >= 2 && idParts[0] === 'post') {
            const extractedTimestamp = parseInt(idParts[1]);
            if (!isNaN(extractedTimestamp)) {
              replyTimestamp = extractedTimestamp;
            }
          }
        }
        if (!replyTimestamp) {
          replyTimestamp = Date.now();
        }

        if (replyPostData.author && replyPostData.content) {
          const reply: Post = {
            id: replyId,
            author: replyPostData.author,
            content: replyPostData.content,
            timestamp: replyTimestamp,
            likes: replyPostData.likes || {},
            reposts: replyPostData.reposts || {},
            replyTo: replyPostData.replyTo,
          };

          repliesMap.set(replyId, reply);
          
          const repliesArray = Array.from(repliesMap.values()).sort(
            (a, b) => a.timestamp - b.timestamp
          );
          
          setReplies(repliesArray);
        }
      });

      // Store listener for cleanup
      listeners.set(replyId, updateListener);
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
        listeners.forEach((listener, replyId) => {
          try {
            gun.get('posts').get(replyId).off();
          } catch (e) {
            console.error(`Error cleaning up listener for reply ${replyId}:`, e);
          }
        });
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

