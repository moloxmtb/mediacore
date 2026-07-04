import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Subir imágenes reales de contenido supera el límite por defecto (1 MB).
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
