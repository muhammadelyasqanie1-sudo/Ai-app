/** File list for the active project. Data comes from listFiles() in api.ts. */

import { useEffect, useState } from 'react';
import { File as FileIcon, Folder, Upload } from 'lucide-react';
import { listFiles, type FileEntry } from '../api';
import Page from './Page';

export default function FilesView() {
  const [files, setFiles] = useState<FileEntry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    // API INJECTION POINT: real file listing.
    listFiles().then((f) => {
      if (!cancelled) setFiles(f);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Page title="Files" subtitle="Files in your active project.">
      {/* UPLOAD INJECTION POINT */}
      <button className="mb-4 inline-flex items-center gap-2 rounded-xl bg-blue-700 px-3.5 py-2 text-sm font-medium text-white hover:bg-blue-800">
        <Upload size={16} />
        Upload
      </button>

      {files === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
          {files.map((f) => (
            <li key={f.name} className="flex items-center gap-3 px-4 py-3 text-sm">
              {f.kind === 'folder' ? (
                <Folder size={17} className="text-blue-700" />
              ) : (
                <FileIcon size={17} className="text-slate-400" />
              )}
              <span className="flex-1 truncate" dir="auto">
                {f.name}
              </span>
              {f.size && <span className="text-xs text-slate-400">{f.size}</span>}
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
