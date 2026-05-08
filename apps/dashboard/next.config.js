/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@prisma/client'],
  serverExternalPackages: ['@prisma/client'],
};

module.exports = nextConfig;
