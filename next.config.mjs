import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  turbopack: {
    root: process.cwd(),
  },
  async redirects() {
    return [
      {
        source: '/developer',
        destination: '/api',
        permanent: true,
      },
      {
        source: '/developer/guides',
        destination: '/api/guides',
        permanent: true,
      },
      {
        source: '/developer/apis/:path*',
        destination: '/api/rest/:path*',
        permanent: true,
      },
      {
        source: '/developer/websocket/:path*',
        destination: '/api/websocket/:path*',
        permanent: true,
      },
      {
        source: '/developer/protocol/:path*',
        destination: '/protocol/:path*',
        permanent: true,
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: '/:path*.mdx',
        destination: '/llms.mdx/:path*',
      },
    ];
  },
  reactStrictMode: true,
};

export default withMDX(config);
