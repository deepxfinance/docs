import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';

/**
 * Shared layout configurations
 *
 * you can customise layouts individually from:
 * Home Layout: app/(home)/layout.tsx
 * Docs Layout: app/docs/layout.tsx
 */
export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <>
          <img alt="" src="/favicon-light.svg" className="w-8 dark:hidden" />
          <img alt="" src="/favicon-dark.svg" className="hidden w-8 dark:block" />
          DeepX
        </>
      ),
    },
  };
}
