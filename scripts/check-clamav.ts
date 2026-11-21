// ClamAV doctor for the AFG AI media engine.
//
// Reports, with no fabrication: whether the scanner path is configured, what
// binary (if any) is present, its version, and whether a real EICAR test scan
// is detected. Exits non-zero with the exact fix when the media engine cannot
// rely on the current scanner state.
//
// Usage: npx tsx scripts/check-clamav.ts
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const configuredPath = process.env.AFG_CLAMSCAN_PATH || '';
const database = process.env.AFG_CLAMSCAN_DATABASE || '';

const report: string[] = [];
let failures = 0;

function fail(message: string) {
  failures++;
  report.push(`FAIL ${message}`);
}

report.push(`AFG_CLAMSCAN_PATH: ${configuredPath || '(not set)'}`);
if (database) report.push(`AFG_CLAMSCAN_DATABASE: ${database}`);

if (!configuredPath) {
  fail('AFG_CLAMSCAN_PATH is not set. Uploads stay quarantined and file-dependent media tasks fail closed. Fix: bash scripts/setup-clamav.sh');
} else if (!path.isAbsolute(configuredPath)) {
  fail('AFG_CLAMSCAN_PATH must be an absolute path (server requirement).');
} else {
  const probe = spawnSync(configuredPath, ['--version'], { encoding: 'utf8', timeout: 10_000 });
  if (probe.error || probe.status !== 0) {
    fail(`The configured clamscan binary is not executable: ${configuredPath}. Fix: bash scripts/setup-clamav.sh`);
  } else {
    report.push(`clamscan version: ${(probe.stdout || '').trim().split('\n')[0]}`);
    // Real detection check with the EICAR test string.
    const dir = mkdtempSync(path.join(tmpdir(), 'afg-clamav-check-'));
    try {
      const sample = path.join(dir, 'eicar.txt');
      writeFileSync(sample, 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*');
      const scan = spawnSync(configuredPath, ['--no-summary', '--stdout', sample], { encoding: 'utf8', timeout: 30_000 });
      if (scan.status === 1 && /eicar/i.test(scan.stdout || '')) {
        report.push('PASS a real EICAR scan was detected; the media engine can rely on this scanner.');
      } else if (scan.status === 0) {
        fail('clamscan ran but did NOT detect the EICAR test file. The signature database is missing or stale. Fix: sudo freshclam');
      } else {
        fail(`clamscan failed with exit code ${scan.status}. ${(scan.stderr || '').slice(0, 200)}`);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
}

process.stdout.write(report.join('\n') + '\n');
process.exit(failures > 0 ? 1 : 0);
