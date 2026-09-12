import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface ModalPortalProps {
  children: ReactNode;
}

/**
 * Mount modal layers directly under <body>.
 *
 * The signed-in app scrolls inside a dedicated overflow container. Mobile
 * Safari promotes that container to its own composited stacking context, so a
 * fixed overlay rendered by a page can still end up underneath the sibling
 * bottom nav. Portalling every modal out of the app shell gives overlays one
 * predictable viewport-level stacking context on every mobile browser.
 */
export default function ModalPortal({ children }: ModalPortalProps) {
  return createPortal(children, document.body);
}
