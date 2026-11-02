/**
 * Entry component for the minimal AI coding workspace.
 *
 * Dev:   npm run dev, then open /workspace.html
 * Embed: import WorkspaceApp and render it from src/App.tsx when ready.
 *
 * Structure:
 *   WorkspaceContext.tsx  state (sidebar, tabs, chats, active view)
 *   api.ts                every place real API calls get injected
 *   data.ts               seed data
 *   components/           Layout, Sidebar, Header, ChatArea, InputBox,
 *                         ToolsMenu, BottomNav and the tool pages
 */

import { WorkspaceProvider } from './WorkspaceContext';
import Layout from './components/Layout';

export default function WorkspaceApp() {
  return (
    <WorkspaceProvider>
      <Layout />
    </WorkspaceProvider>
  );
}
