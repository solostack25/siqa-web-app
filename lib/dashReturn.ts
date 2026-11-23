// "Opened from the dashboard": when a dashboard button opens a tool (Start a Seed, Add product, Camera, Upload…),
// remember where in the dashboard you were. The tool then keeps the dashboard's look (no viewer sidebar), and Back
// returns to that exact space and page, even after a reload. Cleared once you go back to the viewer app.
import { Platform } from 'react-native';

const KEY = 'siqa_dash_return';
const web = () => Platform.OS === 'web' && typeof window !== 'undefined' && typeof sessionStorage !== 'undefined';

/** Pages a dashboard button can open. */
export const DASHBOARD_TOOLS = [
  '/seller-dashboard', '/listing-create', '/sell', '/studio', '/create', '/gem-upload', '/go-live', '/watermark', '/seed-create',
  '/chai-admin', '/org-register', '/apply-speaker', '/link-tv',
];
export const isDashboardTool = (path: string) => DASHBOARD_TOOLS.some((p) => path === p || path.startsWith(p + '/'));

export function rememberDashboard() {
  if (!web()) return;
  try { sessionStorage.setItem(KEY, window.location.pathname + window.location.search); } catch { /* private mode */ }
}
export function dashboardReturn(): string | null {
  if (!web()) return null;
  try { return sessionStorage.getItem(KEY); } catch { return null; }
}
export function forgetDashboard() {
  if (!web()) return;
  try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
}
/** True while you're in a tool that the dashboard opened. */
export function inDashboardTool(path: string) {
  return !!dashboardReturn() && isDashboardTool(path);
}
