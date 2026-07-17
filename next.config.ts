import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Subir imágenes reales de contenido supera el límite por defecto (1 MB).
      bodySizeLimit: "10mb",
    },
  },
  // Portal v2: las 12 vistas se consolidaron en 7. Las rutas viejas se redirigen
  // a las nuevas para no romper enlaces guardados de los clientes. `permanent:
  // false` (307) mientras el rediseño está en revisión: evita que el navegador
  // cachee duro la redirección. Al aprobar, se puede subir a permanent.
  async redirects() {
    return [
      // Mi proyecto ← Proyectos + Avance + Estrategia
      { source: "/portal/proyectos", destination: "/portal/proyecto", permanent: false },
      { source: "/portal/proyectos/:id", destination: "/portal/proyecto?p=:id", permanent: false },
      { source: "/portal/avance", destination: "/portal/proyecto", permanent: false },
      { source: "/portal/estrategia", destination: "/portal/proyecto", permanent: false },
      // Aprobaciones ← Contenido + Entregables
      { source: "/portal/contenido", destination: "/portal/aprobaciones", permanent: false },
      { source: "/portal/entregables", destination: "/portal/aprobaciones", permanent: false },
      // Facturación ← Finanzas + Tu plan + Datos de pago
      { source: "/portal/finanzas", destination: "/portal/facturacion", permanent: false },
      { source: "/portal/plan", destination: "/portal/facturacion", permanent: false },
      { source: "/portal/datos-pago", destination: "/portal/facturacion", permanent: false },
      // Tareas del cliente viven ahora en el tablero de Inicio.
      { source: "/portal/tareas", destination: "/portal", permanent: false },
    ];
  },
};

export default nextConfig;
