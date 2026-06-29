/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  webpack: (config, { isServer, webpack }) => {
    if (!isServer) {
      // @butterbase/shared imports node:crypto in its quota enforcer.
      // Strip the node: scheme prefix so webpack can resolve it via fallback.
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(/^node:/, (resource) => {
          resource.request = resource.request.replace(/^node:/, '');
        })
      );
      config.resolve.fallback = {
        ...config.resolve.fallback,
        crypto: false,
        buffer: false,
        stream: false,
        path: false,
        fs: false,
      };
    }
    return config;
  },
};

export default nextConfig;
