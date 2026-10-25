"use client";

import { useEffect, useState } from "react";

/** Current server time (local clock corrected by `offset`), ticking while `active`. */
export function useNow(offset: number, active: boolean) {
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    setNow(Date.now() + offset);
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now() + offset), 200);
    return () => clearInterval(timer);
  }, [offset, active]);
  return now;
}
