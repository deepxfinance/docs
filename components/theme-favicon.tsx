'use client';

import { useTheme } from 'fumadocs-ui/provider/base';
import { useEffect } from 'react';

export function ThemeFavicon() {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"][type="image/svg+xml"]');
    if (!icon || !resolvedTheme) return;

    icon.href = resolvedTheme === 'dark' ? '/favicon-dark.svg' : '/favicon-light.svg';
  }, [resolvedTheme]);

  return null;
}
