import { useState } from "react";
import { Box, Button, Card, CardContent, TextField, Typography } from "@mui/material";
import { supabase } from "../api/_client";

// Generic bulk "add agent" helper — pastes in as CSV rather than baking any
// real person's name/email/phone into the app's source (and therefore into
// the public JS bundle). One row per agent: phone,displayName,email,area,company
// (email/area/company optional). Calls the same operator-authenticated
// create-agent function a normal "add agent" flow would use. Safe to re-run:
// create-agent fails per-row on a duplicate phone rather than doubling up.

interface Row {
  phone: string;
  displayName: string;
  email: string;
  area: string;
  company: string;
}

interface Result {
  name: string;
  ok: boolean;
  detail: string;
}

function parseCsv(text: string): Row[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [phone = "", displayName = "", email = "", area = "", company = ""] = line.split(",").map((s) => s.trim());
      return { phone: phone.replace(/\D/g, ""), displayName, email, area, company };
    })
    .filter((r) => r.phone && r.displayName);
}

// Generated fresh each run, never hardcoded — a real password has no business
// living as a literal string in source/git history.
function randomPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  return "Ek-" + btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, "").slice(0, 10);
}

export default function MigrateAgentsCard({ onSnack }: { onSnack: (msg: string) => void }) {
  const [csv, setCsv] = useState("");
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<Result[] | null>(null);
  const [password, setPassword] = useState<string | null>(null);

  async function run() {
    const rows = parseCsv(csv);
    if (rows.length === 0) return;
    setRunning(true);
    setResults(null);
    const pwd = randomPassword();
    setPassword(pwd);
    const out: Result[] = [];
    for (const a of rows) {
      try {
        const { data, error } = await supabase.functions.invoke("create-agent", {
          body: { phone: a.phone, password: pwd, displayName: a.displayName, email: a.email, area: a.area, company: a.company },
        });
        if (error || data?.error) {
          out.push({ name: a.displayName, ok: false, detail: data?.error || error?.message || "failed" });
        } else {
          out.push({ name: a.displayName, ok: true, detail: `login ${data.email}` });
        }
      } catch (e) {
        out.push({ name: a.displayName, ok: false, detail: e instanceof Error ? e.message : "failed" });
      }
    }
    setResults(out);
    setRunning(false);
    const okCount = out.filter((r) => r.ok).length;
    onSnack(`Onboarded ${okCount}/${rows.length} agents · password: ${pwd}`);
  }

  return (
    <Card variant="outlined" sx={{ mb: 3, borderColor: "#93c5fd" }}>
      <CardContent sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          Bulk-add agents
        </Typography>
        <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
          One row per agent: <code>phone,name,email,area,company</code> (email/area/company optional). A fresh password is generated when you click — shown below so you can pass it on; nothing is stored in the code.
        </Typography>
        <TextField
          multiline
          minRows={4}
          fullWidth
          placeholder={"27821234567,Jane Agent,jane@example.co.za,Cape Town,Acme Realty"}
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
        />
        <Button variant="contained" onClick={run} disabled={running || parseCsv(csv).length === 0} fullWidth>
          {running ? "Onboarding…" : `Onboard ${parseCsv(csv).length || ""} agent${parseCsv(csv).length === 1 ? "" : "s"}`}
        </Button>
        {password && (
          <Typography sx={{ fontSize: 13 }}>
            Password for all of them: <b>{password}</b> — tell them to change it after they sign in.
          </Typography>
        )}
        {results && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, mt: 0.5 }}>
            {results.map((r) => (
              <Typography key={r.name} sx={{ fontSize: 12.5, color: r.ok ? "#1e8e3e" : "#d93025" }}>
                {r.ok ? "✓" : "✗"} {r.name} — {r.detail}
              </Typography>
            ))}
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
