/// <reference types="vite/client" />

// pdf.js ships its worker as a plain .mjs file. Vite's `?worker&inline` suffix bundles it and
// hands back a Worker constructor with the code inlined, which is what keeps the single-file
// build a single file — there is no server to serve a separate worker asset from when the app
// is opened as a standalone HTML page. vite/client declares `*?worker&inline` generically, but
// only for paths it can see as modules; the explicit declaration below covers the pdf.js path.
declare module 'pdfjs-dist/build/pdf.worker.min.mjs?worker&inline' {
  const workerConstructor: new () => Worker;
  export default workerConstructor;
}
