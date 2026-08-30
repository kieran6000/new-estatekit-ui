import { useState, type MouseEvent, type ReactNode } from "react";
import { Menu, MenuItem } from "@mui/material";
import { STAGES, type Stage } from "../types";

export default function StageMenu({
  current,
  onPick,
  children,
}: {
  current: Stage;
  onPick: (stage: Stage) => void;
  children: (open: (e: MouseEvent<HTMLElement>) => void) => ReactNode;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      {children((e) => setAnchor(e.currentTarget))}
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
        {STAGES.map((s) => (
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
