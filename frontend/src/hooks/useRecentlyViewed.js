import { useState, useEffect } from 'react';

const STORAGE_KEY = 'vtp-recently-viewed';
const MAX_ITEMS = 10;

export function useRecentlyViewed(currentName = null) {
  const [recentlyViewed, setRecentlyViewed] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch {
      return [];
    }
  });

  useEffect(() => {
    if (!currentName) return;

    setRecentlyViewed(prev => {
      const filtered = prev.filter(item => item.name !== currentName);
      const updated = [{ name: currentName, visitedAt: Date.now() }, ...filtered].slice(0, MAX_ITEMS);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch {}
      return updated;
    });
  }, [currentName]);

  return recentlyViewed;
}
