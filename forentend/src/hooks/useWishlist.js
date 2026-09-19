// hooks/useWishlist.js — a per-viewer convenience, stored locally.
//
// Deliberately localStorage and not the API: a wishlist that follows the user
// across devices needs a server-side collection, and that is Phase 3 in the
// roadmap. Until then this is honest about being device-local. Every access is
// wrapped, because localStorage throws in a private window.
import { useCallback, useEffect, useState } from 'react';

const KEY = 'electronia_wishlist';

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function write(ids) {
  try {
    localStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    // Private window or storage disabled — the wishlist is simply not kept.
  }
}

export function useWishlist() {
  const [ids, setIds] = useState(read);

  // Keep tabs in sync: a heart toggled in one tab shows in the other.
  useEffect(() => {
    const onStorage = (event) => {
      if (event.key === KEY) setIds(read());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const toggle = useCallback((id) => {
    setIds((current) => {
      const next = current.includes(id)
        ? current.filter((x) => x !== id)
        : [...current, id];
      write(next);
      return next;
    });
  }, []);

  const has = useCallback((id) => ids.includes(id), [ids]);

  return { ids, toggle, has, count: ids.length };
}
