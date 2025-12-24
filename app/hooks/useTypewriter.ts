'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface UseTypewriterOptions {
  words: string[];
  typeSpeed?: number;
  deleteSpeed?: number;
  pauseDuration?: number;
  loop?: boolean;
  enabled?: boolean;
}

export function useTypewriter({
  words,
  typeSpeed = 100,
  deleteSpeed = 50,
  pauseDuration = 2000,
  loop = true,
  enabled = true,
}: UseTypewriterOptions) {
  const [displayText, setDisplayText] = useState('');
  const [wordIndex, setWordIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout>();

  const tick = useCallback(() => {
    if (!enabled || words.length === 0) return;

    const currentWord = words[wordIndex];

    if (isDeleting) {
      // Deleting characters
      setDisplayText(prev => prev.slice(0, -1));

      if (displayText.length <= 1) {
        setIsDeleting(false);
        const nextIndex = (wordIndex + 1) % words.length;

        if (nextIndex === 0 && !loop) {
          setIsComplete(true);
          return;
        }

        setWordIndex(nextIndex);
      }
    } else {
      // Typing characters
      const targetLength = displayText.length + 1;
      setDisplayText(currentWord.slice(0, targetLength));

      if (targetLength === currentWord.length) {
        // Word complete, pause before deleting
        timeoutRef.current = setTimeout(() => {
          setIsDeleting(true);
        }, pauseDuration);
        return;
      }
    }
  }, [displayText, isDeleting, wordIndex, words, loop, enabled, pauseDuration]);

  useEffect(() => {
    if (!enabled || isComplete) return;

    const speed = isDeleting ? deleteSpeed : typeSpeed;
    timeoutRef.current = setTimeout(tick, speed);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [tick, isDeleting, typeSpeed, deleteSpeed, enabled, isComplete]);

  const reset = () => {
    setDisplayText('');
    setWordIndex(0);
    setIsDeleting(false);
    setIsComplete(false);
  };

  return { displayText, isComplete, reset, currentWord: words[wordIndex] };
}

export default useTypewriter;
