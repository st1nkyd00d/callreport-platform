// pdfmake no publica tipos (ni @types/pdfmake existe) -- declaración
// ambiental mínima, solo con lo que usa reports-pdf.template.ts.
// docDefinition/fonts quedan `any` a propósito: replicar el shape
// completo del document definition de pdfmake no aporta nada acá.
declare module 'pdfmake' {
  interface PdfMakeDocument {
    getBuffer(): Promise<Buffer>;
  }

  interface PdfMake {
    setFonts(fonts: Record<string, unknown>): void;
    setUrlAccessPolicy(callback: (url: string) => boolean): void;
    setLocalAccessPolicy(callback: (path: string) => boolean): void;
    createPdf(
      docDefinition: unknown,
      options?: Record<string, unknown>,
    ): PdfMakeDocument;
  }

  const pdfMake: PdfMake;
  export default pdfMake;
}
