import { useState, type MouseEvent, type ReactNode } from "react";
import { Menu, MenuItem } from "@mui/material";
import type { Stage } from "../types";

export default function StageMenu({
  current,
  stages,
  onPick,
  children,
}: {
  current: Stage;
  /** The current lead's pipeline stage list — Seller and Buyer pipelines have different stages. */
  stages: Stage[];
  onPick: (stage: Stage) => void;
  children: (open: (e: MouseEvent<HTMLElement>) => void) => ReactNode;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      {children((e) => setAnchor(e.currentTarget))}
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
        {stages.map((s) => (
          <MenuItem
            key={s}
            selected={s === current}
            onClick={() => {
              setAnchor(null);
              onPick(s);
            }}
          >
            {s}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
