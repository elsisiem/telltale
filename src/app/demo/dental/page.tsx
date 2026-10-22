"use client";

import { useState } from "react";

// A fictional, ordinary business for the stage demo: the "silent pass" case. It lives on this app's
// own origin, so it is never mistaken for a real company.
export default function DentalDemo() {
  const [sent, setSent] = useState(false);
  return (
    <div style={{ minHeight: "100vh", background: "#f6f8f7", color: "#1d2b28", fontFamily: "Georgia, serif" }}>
      <header style={{ background: "#2f6f62", color: "white", padding: "18px 32px" }}>
        <strong style={{ fontSize: 22 }}>Bayview Dental</strong>
        <span style={{ marginLeft: 12, opacity: 0.8, fontSize: 13 }}>fictional demo business · Telltale stage</span>
      </header>
      <main style={{ maxWidth: 520, margin: "40px auto", padding: "0 20px" }}>
        <h1 style={{ fontSize: 28 }}>Book a cleaning</h1>
        {sent ? (
          <p style={{ fontSize: 18 }}>Thanks, we&apos;ll email you to confirm a time.</p>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setSent(true);
            }}
            style={{ display: "grid", gap: 14, fontSize: 16 }}
          >
            {[
              ["name", "Full name", "text", true],
              ["email", "Email", "email", true],
              ["phone", "Phone", "tel", false],
              ["zip", "ZIP code", "text", false],
            ].map(([id, label, type, required]) => (
              <label key={id as string} htmlFor={id as string} style={{ display: "grid", gap: 4 }}>
                {label as string}
                <input id={id as string} name={id as string} type={type as string} required={required as boolean} style={{ padding: 10, border: "1px solid #b9c7c3", borderRadius: 6 }} />
              </label>
            ))}
            <label htmlFor="reason" style={{ display: "grid", gap: 4 }}>
              Reason for visit
              <select id="reason" name="reason" style={{ padding: 10, border: "1px solid #b9c7c3", borderRadius: 6 }}>
                <option>Cleaning</option>
                <option>Checkup</option>
                <option>Tooth pain</option>
              </select>
            </label>
            <button type="submit" style={{ padding: 12, background: "#2f6f62", color: "white", border: 0, borderRadius: 6, fontSize: 16 }}>
              Request appointment
            </button>
          </form>
        )}
      </main>
    </div>
  );
}
