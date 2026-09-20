import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { Button, ErrorText, Field, Input, PageTitle, Panel } from "@/components/ui";

function useSubmit<T>(fn: () => Promise<T>, onDone: (r: T) => void) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onDone(await fn());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };
  return { submit, error, busy };
}

function AuthLayout({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto mt-10 max-w-sm">
      <PageTitle>{title}</PageTitle>
      <Panel className="mt-5">{children}</Panel>
    </div>
  );
}

export function LoginPage() {
  const login = useAuth((s) => s.login);
  const nav = useNavigate();
  const loc = useLocation();
  const [handle, setHandle] = useState("");
  const [password, setPassword] = useState("");
  const { submit, error, busy } = useSubmit(
    () => login(handle, password),
    () => nav((loc.state as { from?: string } | null)?.from ?? "/decks", { replace: true }),
  );
  return (
    <AuthLayout title="Sign in">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Handle">
          <Input autoFocus autoComplete="username" value={handle} onChange={(e) => setHandle(e.target.value)} />
        </Field>
        <Field label="Password">
          <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <ErrorText>{error}</ErrorText>
        <Button type="submit" disabled={busy || !handle || !password} className="w-full">
          Sign in
        </Button>
      </form>
      <p className="mt-4 text-sm text-chalk-dim">
        No account? <Link to="/register" className="text-chalk underline">Register</Link> ·{" "}
        <Link to="/recover" className="text-chalk underline">Forgot password</Link>
      </p>
    </AuthLayout>
  );
}

/** Shown once after registering or resetting. The code is never retrievable again. */
export function RecoveryCodeScreen({ code, onDone }: { code: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const [ack, setAck] = useState(false);
  return (
    <AuthLayout title="Save your recovery code">
      <p className="text-sm text-chalk-dim">
        There is no email on this site, so this code is the <strong className="text-chalk">only</strong> way to reset your
        password. Store it in your password manager now — it won't be shown again.
      </p>
      <div className="tabular mt-4 select-all rounded bg-felt-900 px-3 py-3 text-center font-mono text-lg tracking-wider">
        {code}
      </div>
      <div className="mt-3 flex gap-2">
        <Button
          variant="ghost"
          onClick={() => {
            void navigator.clipboard?.writeText(code).then(() => setCopied(true));
          }}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <label className="mt-5 flex items-start gap-2 text-sm">
        <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-1 accent-brass" />
        <span>I've saved this code somewhere safe.</span>
      </label>
      <Button onClick={onDone} disabled={!ack} className="mt-4 w-full">
        Continue
      </Button>
    </AuthLayout>
  );
}

export function RegisterPage() {
  const register = useAuth((s) => s.register);
  const nav = useNavigate();
  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState<string | null>(null);
  const { submit, error, busy } = useSubmit(
    () => register({ handle, password, displayName: displayName || undefined }),
    (r) => setCode(r.recoveryCode),
  );
  if (code) return <RecoveryCodeScreen code={code} onDone={() => nav("/decks", { replace: true })} />;
  return (
    <AuthLayout title="Create an account">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Handle" hint="3–20 characters: a–z, 0–9, underscore. This is your login and your profile URL.">
          <Input
            autoFocus
            autoComplete="username"
            value={handle}
            onChange={(e) => setHandle(e.target.value.toLowerCase())}
            placeholder="e.g. tomas"
          />
        </Field>
        <Field label="Display name (optional)">
          <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={40} />
        </Field>
        <Field label="Password" hint="At least 8 characters.">
          <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <ErrorText>{error}</ErrorText>
        <Button type="submit" disabled={busy || handle.length < 3 || password.length < 8} className="w-full">
          Register
        </Button>
      </form>
      <p className="mt-4 text-sm text-chalk-dim">
        Already have an account? <Link to="/login" className="text-chalk underline">Sign in</Link>
      </p>
    </AuthLayout>
  );
}

export function RecoverPage() {
  const reset = useAuth((s) => s.reset);
  const nav = useNavigate();
  const [handle, setHandle] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [code, setCode] = useState<string | null>(null);
  const { submit, error, busy } = useSubmit(
    () => reset({ handle, recoveryCode, newPassword }),
    (r) => setCode(r.recoveryCode),
  );
  if (code) return <RecoveryCodeScreen code={code} onDone={() => nav("/decks", { replace: true })} />;
  return (
    <AuthLayout title="Reset password">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Handle">
          <Input autoFocus autoComplete="username" value={handle} onChange={(e) => setHandle(e.target.value)} />
        </Field>
        <Field label="Recovery code" hint="The code you were shown when you registered.">
          <Input value={recoveryCode} onChange={(e) => setRecoveryCode(e.target.value)} placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX" className="font-mono" />
        </Field>
        <Field label="New password">
          <Input type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        </Field>
        <ErrorText>{error}</ErrorText>
        <Button type="submit" disabled={busy || !handle || !recoveryCode || newPassword.length < 8} className="w-full">
          Reset password
        </Button>
      </form>
    </AuthLayout>
  );
}
