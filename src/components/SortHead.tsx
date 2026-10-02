import { useCallback, useEffect, useState } from "react";
import { TableCell, TableSortLabel, Tooltip, type SxProps, type Theme } from "@mui/material";
import { tokens } from "../theme";

// One way to sort every table in the dashboard (Accounts is the model):
// - Click a heading to sort by it; click again to flip it. The arrow shows
//   which column and which way.
// - Numbers and dates start biggest/newest first, words start A–Z.
// - The choice is remembered per table on this device.
// - Blank values always go last, whichever way it's sorted.
// Phones without a table use the same sort state through a "Sort by" select.

export type Dir = "asc" | "desc";
export interface Sort<K extends string> { k: K; dir: Dir }

export function useTableSort<K extends string>(storageKey: string, initial: Sort<K>, valid: readonly K[]) {
  const [sort, setSort] = useState<Sort<K>>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "null") as Sort<K> | null;
      if (saved && valid.includes(saved.k) && (saved.dir === "asc" || saved.dir === "desc")) return saved;
    } catch {
      // Private mode or a bad value: use the default.
    }
    return initial;
  });
  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(sort)); } catch { /* ignore */ }
  }, [storageKey, sort]);
  /** Heading click: same column flips, a new column starts at its first direction. */
  const onSort = useCallback((k: K, firstDir: Dir) => {
    setSort((s) => (s.k === k ? { k, dir: s.dir === "asc" ? "desc" : "asc" } : { k, dir: firstDir }));
  }, []);
  return { sort, setSort, onSort };
}

type Val = string | number | null | undefined;

/** Sorts a copy of `rows` by `get(row)`. Blanks last; ties keep their order. */
export function sortRows<T>(rows: T[], get: (r: T) => Val, dir: Dir): T[] {
  const sign = dir === "asc" ? 1 : -1;
  return rows
    .map((r, i) => ({ r, i, v: get(r) }))
    .sort((a, b) => {
      const ab = a.v === null || a.v === undefined || a.v === "";
      const bb = b.v === null || b.v === undefined || b.v === "";
      if (ab || bb) return ab === bb ? a.i - b.i : ab ? 1 : -1;
      const c = typeof a.v === "number" && typeof b.v === "number"
        ? a.v - b.v
        : String(a.v).localeCompare(String(b.v), "en", { sensitivity: "base", numeric: true });
      return c === 0 ? a.i - b.i : c * sign;
    })
    .map((x) => x.r);
}

/** The shared look of a table heading row cell. */
export const headCellSx: SxProps<Theme> = {
  fontSize: 12, fontWeight: 600, color: tokens.ink2, whiteSpace: "nowrap", py: 1.25, bgcolor: tokens.surface2,
};

export function SortHead<K extends string>({
  k, label, sort, onSort, num = false, firstDir, tip, sx,
}: {
  k: K;
  label: React.ReactNode;
  sort: Sort<K>;
  onSort: (k: K, firstDir: Dir) => void;
  /** Right-aligned number column: starts biggest first. */
  num?: boolean;
  /** Override the starting direction (dates: "desc"). */
  firstDir?: Dir;
  tip?: string;
  sx?: SxProps<Theme>;
}) {
  const first: Dir = firstDir ?? (num ? "desc" : "asc");
  const active = sort.k === k;
  return (
    <TableCell align={num ? "right" : "left"} sortDirection={active ? sort.dir : false} sx={{ ...headCellSx, ...sx } as SxProps<Theme>}>
      <Tooltip title={tip || ""} disableHoverListener={!tip}>
        <TableSortLabel
          active={active}
          direction={active ? sort.dir : first}
          onClick={() => onSort(k, first)}
          // Arrow on the left for right-aligned numbers, so the label lines up with the values.
          sx={num ? { flexDirection: "row-reverse" } : undefined}
        >
          {label}
        </TableSortLabel>
      </Tooltip>
    </TableCell>
  );
}

/** A heading that doesn't sort (an actions column), in the same look. */
export function PlainHead({ children, align, sx }: { children?: React.ReactNode; align?: "left" | "right"; sx?: SxProps<Theme> }) {
  return <TableCell align={align} sx={{ ...headCellSx, ...sx } as SxProps<Theme>}>{children}</TableCell>;
}
