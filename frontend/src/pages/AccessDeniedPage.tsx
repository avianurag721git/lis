import { Link } from "react-router-dom";
import { ShieldOff } from "lucide-react";
import { useAuth } from "../modules/auth/auth.context";
import { resolveHomePath } from "../modules/auth/homePath";

export const AccessDeniedPage = (): JSX.Element => {
  const { user } = useAuth();
  const home = resolveHomePath(user);

  return (
    <section className="page-shell flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-500">
        <ShieldOff size={32} aria-hidden />
      </div>
      <h1 className="page-title mb-2">403 — Access Denied</h1>
      <p className="page-subtitle mb-6 max-w-md text-slate-500">
        Your role does not include permission to view this module. Contact your lab manager if you need access.
      </p>
      <Link to={home} className="btn btn-primary">
        Go to my workspace
      </Link>
    </section>
  );
};
