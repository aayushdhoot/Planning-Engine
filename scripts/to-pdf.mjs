// Convert the generated HTML reports to PDF.
// Optional step: uses LibreOffice if it is on PATH. In the browser, the same reports
// print to PDF directly (they carry @page A4 landscape rules).
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';

const DIR = 'sample-output';
if (!existsSync(DIR)) {
  console.error(`No ${DIR}/ — run "npm run sample" first.`);
  process.exit(1);
}

let soffice = null;
for (const bin of ['libreoffice', 'soffice']) {
  try {
    execFileSync('which', [bin], { stdio: 'pipe' });
    soffice = bin;
    break;
  } catch {
    /* not present */
  }
}
if (!soffice) {
  console.log('LibreOffice not found — skipping PDF generation. Open the HTML reports and print to PDF instead.');
  process.exit(0);
}

const files = readdirSync(DIR).filter((f) => f.endsWith('-report.html'));
for (const f of files) {
  execFileSync(soffice, ['--headless', '--convert-to', 'pdf', '--outdir', DIR, `${DIR}/${f}`], { stdio: 'pipe' });
  console.log(`  ${f} -> ${f.replace(/\.html$/, '.pdf')}`);
}
console.log(`${files.length} PDF report(s) written to ${DIR}/`);
