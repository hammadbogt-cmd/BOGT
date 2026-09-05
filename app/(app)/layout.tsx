import { requireUser } from "../../lib/auth/current-user";
import { Sidebar } from "../../components/Sidebar";
import { GlobalSearch } from "../../components/GlobalSearch";
import { SyncButton } from "../../components/SyncButton";
import { ROLE_LABELS } from "../../lib/auth/permissions";
import { logoutAction } from "../actions/auth-actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-50 text-slate-900">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-6 py-3">
          <GlobalSearch />
          <div className="flex items-center gap-4">
            <SyncButton />
            <div className="flex items-center gap-3 border-l border-slate-200 pl-4">
              <div className="text-right">
                <div className="text-sm font-medium text-slate-800">{user.name}</div>
                <div className="text-xs text-slate-500">{ROLE_LABELS[user.role]}</div>
              </div>
              <form action={logoutAction}>
                <button type="submit" className="text-xs text-slate-500 hover:text-slate-800 hover:underline">
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
