import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-xl font-semibold text-slate-900">BOGT Operations Portal</h1>
          <p className="mt-1 text-sm text-slate-500">Amazon inventory, replenishment &amp; purchasing intelligence</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <LoginForm />
        </div>
        <p className="mt-6 text-center text-xs text-slate-400">
          Seeded demo accounts: admin@bogt.local / purchasing@bogt.local / warehouse@bogt.local / finance@bogt.local / viewer@bogt.local
          <br />
          Password: ChangeMe123!
        </p>
      </div>
    </div>
  );
}
