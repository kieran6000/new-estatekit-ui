import { useEffect, useState, type ReactNode } from "react";
import { Box, CircularProgress, InputAdornment, TextField, Typography } from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import LocationCityOutlinedIcon from "@mui/icons-material/LocationCityOutlined";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import NearMeOutlinedIcon from "@mui/icons-material/NearMeOutlined";
import { tokens } from "../theme";
import { nearbySuburbs, POPULAR_CITIES, searchCities, searchSuburbs, type Place } from "../lib/places";

// The one-question-per-screen pieces of our own funnels: the sign-up page
// (/start) and the onboarding form (/onboarding). Same look, same taps.

export const ACCENT = "#1976d2";
export const MAX_SUBURBS = 5;

/** Debounced lookup that ignores out-of-order replies. */
function useLookup<T>(query: string, fn: (q: string, signal: AbortSignal) => Promise<T[]>, deps: unknown[] = []) {
  const [results, setResults] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const ctrl = new AbortController();
    if (query.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      const r = await fn(query, ctrl.signal);
      if (!ctrl.signal.aborted) {
        setResults(r);
        setLoading(false);
      }
    }, 220);
    return () => {
      ctrl.abort();
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, ...deps]);
  return { results, loading };
}

export function Question({ icon, title, hint, children }: { icon: ReactNode; title: string; hint?: string; children: ReactNode }) {
  return (
    <Box sx={{ mt: 1.5 }}>
      <Box
        sx={{
          width: 40, height: 40, borderRadius: "50%", bgcolor: "#e8f0fe", color: ACCENT, mb: 1.25,
          display: "flex", alignItems: "center", justifyContent: "center", "& svg": { fontSize: 22 },
        }}
      >
        {icon}
      </Box>
      <Typography sx={{ fontSize: 19, fontWeight: 600, lineHeight: 1.3 }}>{title}</Typography>
      {hint && <Typography sx={{ fontSize: 13.5, color: "text.secondary", mt: 0.5 }}>{hint}</Typography>}
      <Box sx={{ mt: 2, display: "flex", flexDirection: "column", gap: 1.25 }}>{children}</Box>
    </Box>
  );
}

export function Choice({ label, detail, icon, selected, onClick }: { label: string; detail?: string; icon?: ReactNode; selected: boolean; onClick: () => void }) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      sx={{
        display: "flex", alignItems: "center", gap: 1.5, width: "100%", textAlign: "left",
        p: "13px 16px", borderRadius: "8px", cursor: "pointer", font: "inherit", fontSize: 15,
        border: `1.5px solid ${selected ? ACCENT : "#dadce0"}`,
        bgcolor: selected ? "#e8f0fe" : "#fff",
        color: tokens.ink,
        transition: "border-color .12s, background-color .12s",
        "&:hover": { borderColor: ACCENT },
      }}
    >
      {icon && <Box sx={{ display: "flex", color: selected ? ACCENT : "#5f6368", "& svg": { fontSize: 22 } }}>{icon}</Box>}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        {label}
        {detail && <Box component="span" sx={{ color: "text.secondary", fontSize: 13 }}> · {detail}</Box>}
      </Box>
      <Box
        sx={{
          width: 20, height: 20, flexShrink: 0, borderRadius: "50%",
          border: `2px solid ${selected ? ACCENT : "#bdc1c6"}`, bgcolor: selected ? ACCENT : "transparent",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        {selected && <CheckIcon sx={{ fontSize: 14, color: "#fff" }} />}
      </Box>
    </Box>
  );
}

export function CityPicker({ value, onPick }: { value: Place | null; onPick: (p: Place) => void }) {
  const [q, setQ] = useState("");
  const { results, loading } = useLookup(q, searchCities);
  const typed = q.trim();
  const options: Place[] = typed.length >= 2 ? results : POPULAR_CITIES;

  return (
    <>
      <TextField
        autoFocus
        fullWidth
        placeholder="Start typing, e.g. Durban"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Enter" || typed.length < 2) return;
          onPick(results[0] ?? { name: typed, detail: "", lat: 0, lon: 0 });
        }}
        slotProps={{
          input: {
            startAdornment: <InputAdornment position="start"><LocationCityOutlinedIcon fontSize="small" sx={{ color: "text.disabled" }} /></InputAdornment>,
            endAdornment: loading ? <CircularProgress size={16} /> : null,
          },
        }}
      />
      {!typed && <Typography sx={{ fontSize: 12, color: "text.secondary", mt: 0.5 }}>Popular</Typography>}
      <Box sx={{ display: "grid", gridTemplateColumns: typed ? "1fr" : "1fr 1fr", gap: 1 }}>
        {options.map((p) => (
          <Choice key={p.name + p.detail} label={p.name} detail={typed ? p.detail : undefined} selected={value?.name === p.name} onClick={() => onPick(p)} />
        ))}
      </Box>
      {typed.length >= 2 && !loading && !results.length && (
        <Choice label={`Use “${typed}”`} selected={false} onClick={() => onPick({ name: typed, detail: "", lat: 0, lon: 0 })} />
      )}
    </>
  );
}

export function SuburbPicker({ city, value, onChange }: { city: Place | null; value: string[]; onChange: (v: string[]) => void }) {
  const [q, setQ] = useState("");
  const near = city && (city.lat || city.lon) ? { lat: city.lat, lon: city.lon } : null;
  const { results, loading } = useLookup(q, (query, signal) => searchSuburbs(query, near, signal), [near?.lat, near?.lon]);
  const [nearby, setNearby] = useState<string[]>([]);
  const [nearbyLoading, setNearbyLoading] = useState(false);

  useEffect(() => {
    if (!near) return;
    const ctrl = new AbortController();
    setNearbyLoading(true);
    nearbySuburbs(near, ctrl.signal).then((r) => {
      if (!ctrl.signal.aborted) {
        setNearby(r);
        setNearbyLoading(false);
      }
    });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [near?.lat, near?.lon]);

  const full = value.length >= MAX_SUBURBS;
  const has = (n: string) => value.some((v) => v.toLowerCase() === n.toLowerCase());
  function add(n: string) {
    const name = n.trim();
    if (!name || has(name) || full) return;
    onChange([...value, name]);
    setQ("");
  }
  const remove = (n: string) => onChange(value.filter((v) => v !== n));
  const typed = q.trim();

  return (
    <>
      {value.length > 0 && (
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
          {value.map((v) => (
            <Box
              key={v}
              component="button"
              type="button"
              onClick={() => remove(v)}
              aria-label={`Remove ${v}`}
              sx={{
                display: "inline-flex", alignItems: "center", gap: 0.5, border: 0, cursor: "pointer", font: "inherit",
                bgcolor: ACCENT, color: "#fff", borderRadius: "999px", pl: 1.5, pr: 1, py: 0.625, fontSize: 14, fontWeight: 500,
              }}
            >
              {v}
              <CloseIcon sx={{ fontSize: 16, opacity: 0.85 }} />
            </Box>
          ))}
          <Typography sx={{ fontSize: 12.5, color: "text.secondary", alignSelf: "center", ml: 0.5 }}>
            {value.length}/{MAX_SUBURBS}
          </Typography>
        </Box>
      )}

      <Box sx={{ position: "relative" }}>
        <TextField
          fullWidth
          autoFocus
          disabled={full}
          placeholder={full ? `That's ${MAX_SUBURBS}. Tap one above to swap it.` : "Search for a suburb"}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter" || typed.length < 2) return;
            e.preventDefault();
            add(results[0]?.name ?? typed);
          }}
          slotProps={{
            input: {
              startAdornment: <InputAdornment position="start"><PlaceOutlinedIcon fontSize="small" sx={{ color: "text.disabled" }} /></InputAdornment>,
              endAdornment: loading ? <CircularProgress size={16} /> : null,
            },
          }}
        />
        {typed.length >= 2 && !full && (
          <Box sx={{ mt: 0.75, border: "1px solid #e0e0e0", borderRadius: "8px", overflow: "hidden" }}>
            {results.filter((r) => !has(r.name)).map((r) => (
              <Box
                key={r.name + r.detail}
                component="button"
                type="button"
                onClick={() => add(r.name)}
                sx={{
                  display: "flex", width: "100%", gap: 1, alignItems: "baseline", textAlign: "left", border: 0, bgcolor: "#fff",
                  font: "inherit", fontSize: 14.5, p: "11px 14px", cursor: "pointer", "&:hover": { bgcolor: "#f5f7fa" },
                  "& + &": { borderTop: "1px solid #f1f3f4" },
                }}
              >
                {r.name}
                {r.detail && <Box component="span" sx={{ fontSize: 12.5, color: "text.secondary" }}>{r.detail}</Box>}
              </Box>
            ))}
            {!loading && !results.some((r) => r.name.toLowerCase() === typed.toLowerCase()) && (
              <Box
                component="button"
                type="button"
                onClick={() => add(typed)}
                sx={{ display: "block", width: "100%", textAlign: "left", border: 0, borderTop: results.length ? "1px solid #f1f3f4" : 0, bgcolor: "#fff", font: "inherit", fontSize: 14.5, p: "11px 14px", cursor: "pointer", color: ACCENT, "&:hover": { bgcolor: "#f5f7fa" } }}
              >
                Add “{typed}”
              </Box>
            )}
          </Box>
        )}
      </Box>

      {!typed && near && (nearbyLoading || nearby.length > 0) && (
        <Box>
          <Typography sx={{ fontSize: 12, color: "text.secondary", mb: 0.75, display: "flex", alignItems: "center", gap: 0.5 }}>
            <NearMeOutlinedIcon sx={{ fontSize: 14 }} /> Near {city?.name}
          </Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
            {nearbyLoading && <CircularProgress size={18} />}
            {nearby.filter((n) => !has(n)).map((n) => (
              <Box
                key={n}
                component="button"
                type="button"
                disabled={full}
                onClick={() => add(n)}
                sx={{
                  border: "1.5px solid #dadce0", bgcolor: "#fff", borderRadius: "999px", px: 1.5, py: 0.625, font: "inherit", fontSize: 14,
                  cursor: full ? "default" : "pointer", color: full ? "text.disabled" : tokens.ink,
                  "&:hover": full ? {} : { borderColor: ACCENT, color: ACCENT },
                }}
              >
                + {n}
              </Box>
            ))}
          </Box>
        </Box>
      )}
    </>
  );
}
