/**
 * Ambient types for html2pdf.js (no official package types).
 */

declare module "html2pdf.js" {
  type Html2PdfOptions = {
    margin?: number | number[];
    filename?: string;
    image?: { type?: string; quality?: number };
    html2canvas?: Record<string, unknown>;
    jsPDF?: Record<string, unknown>;
    pagebreak?: Record<string, unknown>;
  };

  type Html2PdfWorker = {
    set: (options: Html2PdfOptions) => Html2PdfWorker;
    from: (element: HTMLElement | string) => Html2PdfWorker;
    toPdf: () => Html2PdfWorker;
    get: (key: string) => Promise<unknown>;
    save: () => Promise<void>;
    outputPdf: (type: "blob") => Promise<Blob>;
    then: (
      onFulfilled?: (value: unknown) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => Promise<unknown>;
  };

  function html2pdf(): Html2PdfWorker;
  export default html2pdf;
}
