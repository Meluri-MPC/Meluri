/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@prisma/client'],
  experimental: {
    outputFileTracingIncludes: {
      '/*': ['./node_modules/.prisma/**/*', './node_modules/@prisma/client/**/*.node'],
    },
  },
};

module.exports = nextConfig;
