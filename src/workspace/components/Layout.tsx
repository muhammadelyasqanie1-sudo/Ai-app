/** Page shell: sidebar + (header, active view) + mobile bottom nav. */

import { AnimatePresence, motion } from 'motion/react';
import { useWorkspace } from '../WorkspaceContext';
import Sidebar from './Sidebar';
import Header from './Header';
import BottomNav from './BottomNav';
import ChatArea from './ChatArea';
import TerminalView from './TerminalView';
import FilesView from './FilesView';
import ProvidersView from './ProvidersView';
import OfflineView from './OfflineView';
import MediaView from './MediaView';
import SettingsView from './SettingsView';

export default function Layout() {
  const { view } = useWorkspace();

  return (
    <div className="flex h-dvh overflow-hidden bg-canvas text-gray-900">
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        {/* pb-16 leaves room for the fixed bottom nav on mobile */}
        <main className="flex min-h-0 flex-1 flex-col pb-16 lg:pb-0">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={view}
              className="flex min-h-0 flex-1 flex-col"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
            >
              {view === 'chat' && <ChatArea />}
              {view === 'terminal' && <TerminalView />}
              {view === 'files' && <FilesView />}
              {view === 'providers' && <ProvidersView />}
              {view === 'offline' && <OfflineView />}
              {view === 'media' && <MediaView />}
              {view === 'settings' && <SettingsView />}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <BottomNav />
    </div>
  );
}
