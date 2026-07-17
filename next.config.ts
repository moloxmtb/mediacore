import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Subir imágenes reales de contenido supera el límite por defecto (1 MB).
      bodySizeLimit: "10mb",
    },
  },
  // Portal v2: las 12 vistas se consolidaron en 7. Las rutas viejas se redirigen
  // PERMANENTEMENTE (308) a las nuevas para no romper enlaces guardados de los
  // clientes. Aprobado el rediseño, la consolidación es firme.
  async redirects() {
    return [
      // Mi proyecto ← Proyectos + Avance + Estrategia
      { source: "/portal/proyectos", destination: "/portal/proyecto", permanent: true },
      { source: "/portal/proyectos/:id", destination: "/portal/proyecto?p=:id", permanent: true },
      { source: "/portal/avance", destination: "/portal/proyecto", permanent: true },
      { source: "/portal/estrategia", destination: "/portal/proyecto", permanent: true },
      // Aprobaciones ← Contenido + Entregables
      { source: "/portal/contenido", destination: "/portal/aprobaciones", permanent: true },
      { source: "/portal/entregables", destination: "/portal/aprobaciones", permanent: true },
      // Facturación ← Finanzas + Tu plan + Datos de pago
      { source: "/portal/finanzas", destination: "/portal/facturacion", permanent: true },
      { source: "/portal/plan", destination: "/portal/facturacion", permanent: true },
      { source: "/portal/datos-pago", destination: "/portal/facturacion", permanent: true },
      // Tareas del cliente viven ahora en el tablero de Inicio.
      { source: "/portal/tareas", destination: "/portal", permanent: true },
    ];
  },
};

export default nextConfig;
