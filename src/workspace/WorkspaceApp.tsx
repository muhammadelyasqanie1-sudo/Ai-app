/**
 * Entry component for the minimal AI app-builder workspace.
 *
 * Dev:   npm run dev, then open /workspace.html
 * Embed: import WorkspaceApp and render it from src/App.tsx when ready.
 *
 * Animations use `motion/react` (the Framer Motion successor, already a
 * dependency). MotionConfig reducedMotion="user" turns transform animations off
 * for people who ask the OS for reduced motion.
 */

import { MotionConfig } from 'motion/react';
import { WorkspaceProvider } from './WorkspaceContext';
import Layout from './components/Layout';

export default function WorkspaceApp() {
  return (
    <MotionConfig reducedMotion="user">
      <WorkspaceProvider>
        <Layout />
      </WorkspaceProvider>
    </MotionConfig>
  );
}
