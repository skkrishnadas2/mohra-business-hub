declare module "pdfmake/build/pdfmake" {
  const pdfMake: {
    createPdf(
      document: unknown,
      layouts?: unknown,
      fonts?: Record<string, Record<string, string>>,
      vfs?: Record<string, string>,
    ): {
      getStream(): {
        on(event: "data", callback: (chunk: Uint8Array) => void): void;
        on(event: "error", callback: (error: Error) => void): void;
        on(event: "end", callback: () => void): void;
        end(): void;
      };
      getBlob(callback: (blob: Blob) => void): void;
      getBuffer(callback: (buffer: Uint8Array) => void): void;
    };
  };
  export default pdfMake;
}
