"use client";

import { useEffect, useState } from "react";
import { AppShell } from "./AppShell";
import { api, cx } from "./format";
import { useDashboard } from "./hooks";
import { useToast } from "./Toast";
import { Button, Card, CardHeader, Skeleton, Tag } from "./ui";

type ProfileFields = { firstName: string; middleName: string; lastName: string; email: string; phone: string; street: string; city: string; state: string; zip: string; dob: string };
type ProfileResponse = { saved: boolean; profile: (ProfileFields & { synthetic?: boolean }) | null; demo: { firstName: string; lastName: string }; settings: { dryRun: boolean }; encryption: string };

const EMPTY: ProfileFields = { firstName: "", middleName: "", lastName: "", email: "", phone: "", street: "", city: "", state: "", zip: "", dob: "" };

const FIELDS: { key: keyof ProfileFields; label: string; type?: string; required?: boolean; span?: 2 | 3 | 6; placeholder?: string; autoComplete: string }[] = [
  { key: "firstName", label: "First name", required: true, span: 2, autoComplete: "given-name" },
  { key: "middleName", label: "Middle name", span: 2, autoComplete: "additional-name" },
  { key: "lastName", label: "Last name", required: true, span: 2, autoComplete: "family-name" },
  { key: "email", label: "Email", type: "email", required: true, span: 3, autoComplete: "email" },
  { key: "phone", label: "Phone", type: "tel", span: 3, autoComplete: "tel" },
  { key: "street", label: "Street address", span: 6, autoComplete: "street-address" },
  { key: "city", label: "City", span: 2, autoComplete: "address-level2" },
  { key: "state", label: "State", span: 2, placeholder: "CA", autoComplete: "address-level1" },
  { key: "zip", label: "ZIP", span: 2, autoComplete: "postal-code" },
  { key: "dob", label: "Date of birth", type: "date", span: 2, autoComplete: "bday" },
];

const SPAN = { 2: "sm:col-span-2", 3: "sm:col-span-3", 6: "sm:col-span-6" } as const;

function ProfileForm({ data, onSaved }: { data: ProfileResponse; onSaved: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState<ProfileFields>({ ...EMPTY, ...(data.profile ?? {}) });
  const [busy, setBusy] = useState<"save" | "clear" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy("save");
    setErr(null);
    try {
      await api("/api/profile", { method: "PUT", json: form });
      toast("Profile saved", { detail: "Encrypted and stored. Telltale now uses your details." });
      onSaved();
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function clear() {
    setBusy("clear");
    try {
      await api("/api/profile", { method: "DELETE" });
      setForm(EMPTY);
      toast("Back to the demo persona", { detail: "Your saved details were deleted.", tone: "accent" });
      onSaved();
    } finally {
      setBusy(null);
    }
  }

  return (
    <form onSubmit={save}>
      <div className="grid grid-cols-1 gap-x-3 gap-y-3.5 p-4 sm:grid-cols-6">
        {FIELDS.map((f) => (
          <div key={f.key} className={cx("flex flex-col gap-1", f.span && SPAN[f.span])}>
            <label htmlFor={`p-${f.key}`} className="label">
              {f.label}
              {f.required && <span className="text-accent-ink"> *</span>}
            </label>
            <input
              id={`p-${f.key}`}
              type={f.type ?? "text"}
              required={f.required}
              autoComplete={f.autoComplete}
              placeholder={f.placeholder}
              value={form[f.key]}
              onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
              className="h-9 border border-line-strong bg-surface px-2.5 text-[13.5px] text-ink transition-colors placeholder:text-faint focus:border-ink focus:outline-none"
            />
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-well px-4 py-3">
        <p className="font-mono text-[11px] text-muted">{data.encryption}</p>
        <div className="flex items-center gap-2">
          {err && <span className="text-[12px] text-accent-ink">{err}</span>}
          {data.saved && (
            <Button type="button" onClick={clear} busy={busy === "clear"} disabled={!!busy}>
              Delete and use demo persona
            </Button>
          )}
          <Button type="submit" variant="primary" busy={busy === "save"} disabled={!!busy}>
            {data.saved ? "Save changes" : "Save my profile"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function DryRun({ data, onSaved }: { data: ProfileResponse; onSaved: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const forced = !data.saved;
  const on = forced || data.settings.dryRun;

  async function toggle() {
    setBusy(true);
    try {
      await api("/api/profile", { method: "PATCH", json: { dryRun: !data.settings.dryRun } });
      toast(data.settings.dryRun ? "Dry run off" : "Dry run on", { detail: data.settings.dryRun ? "The agent submits forms after you release them." : "The agent fills forms but never presses submit." });
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-start justify-between gap-4 p-4">
      <div>
        <p className="text-[13.5px] font-medium text-ink">Dry run</p>
        <p className="mt-0.5 max-w-[520px] text-[12.5px] text-muted">
          {forced
            ? "Always on for the synthetic persona, so demo details never reach a real company."
            : "When on, the agent fills forms but never presses submit. Turn it off to let the agent finish tasks after you release your data."}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        disabled={forced || busy}
        onClick={toggle}
        className={cx("relative h-6 w-11 shrink-0 border transition-colors disabled:cursor-not-allowed disabled:opacity-60", on ? "border-ink bg-ink" : "border-line-strong bg-surface")}
      >
        <span className={cx("absolute top-[3px] size-4 transition-[left] duration-150", on ? "left-[23px] bg-on-ink" : "left-[3px] bg-line-strong")} />
        <span className="sr-only">Dry run</span>
      </button>
    </div>
  );
}

export function ProfileView() {
  const { state, refresh } = useDashboard();
  const [data, setData] = useState<ProfileResponse | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    api<ProfileResponse>("/api/profile").then(setData).catch(() => {});
  }, [version]);

  const reload = () => {
    setVersion((v) => v + 1);
    void refresh();
  };

  return (
    <AppShell active="profile" state={state} crumbs={["Telltale", "Profile"]}>
      <div className="mx-auto flex max-w-[880px] flex-col gap-4 p-6">
        <header>
          <div className="flex items-center gap-2">
            <h1 className="text-[22px] font-semibold text-ink">Profile</h1>
            {data && (data.saved ? <Tag tone="ink">Your details</Tag> : <Tag tone="accent">Demo persona active</Tag>)}
          </div>
          <p className="mt-1 max-w-[680px] text-[14px] text-muted">
            The details Telltale types into forms you approve. The agent and the model never see them: they ask for a field type, and Telltale fills in the value after checking who receives it.
          </p>
        </header>

        {!data ? (
          <Skeleton className="h-[420px]" />
        ) : (
          <>
            {!data.saved && (
              <div className="border border-accent bg-surface px-4 py-3 shadow-[inset_3px_0_0_0_var(--color-accent)]">
                <p className="text-[13.5px] text-ink">
                  Running as <span className="font-mono font-medium">{data.demo.firstName} {data.demo.lastName}</span>, a synthetic persona for demos. Save your own details below to use Telltale for real.
                </p>
              </div>
            )}

            <Card>
              <CardHeader title="Your details" meta={<span className="font-mono text-[10.5px] text-faint">* required</span>} />
              <ProfileForm key={`${data.saved}-${version}`} data={data} onSaved={reload} />
            </Card>

            <Card>
              <CardHeader title="Agent behaviour" />
              <DryRun data={data} onSaved={reload} />
            </Card>

            <Card>
              <CardHeader title="Where this lives" />
              <ul className="flex flex-col gap-2 p-4 text-[13px] leading-snug text-ink-2">
                <li>Encrypted with AES-256-GCM before it reaches the database. The key is held apart from the data.</li>
                <li>Only typed into a form after Telltale has checked the recipient, and after you release it when the recipient is a registered broker.</li>
                <li>Never sent to the model provider. Opt-out and deletion letters use your tagged identifiers, not this page.</li>
              </ul>
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}
