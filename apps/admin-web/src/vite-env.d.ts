/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * 'mock' (default) usa los datos en memoria de src/mocks/seed.ts.
   * 'real' apuntará al API de NestJS — el cliente real se construye en
   * la Fase 3 (ver plan.md), cuando existan endpoints CRUD que consumir.
   */
  readonly VITE_API_MODE?: 'mock' | 'real';
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
