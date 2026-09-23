import { useState, type MouseEvent, type ReactNode } from "react";
import { Menu, MenuItem } from "@mui/material";
import { stageLabel } from "../types";
import type { PipelineKind, Stage } from "../types";

export default function StageMenu({
  current,
  stages,
  kind = "seller",
  onPick,
  children,
}: {
  current: Stage;
  /** The current lead's pipeline stage list — each pipeline kind differs. */
  stages: Stage[];
  /** Only changes the wording. A "general" pipeline stores the same stages but
   *  shows neutral labels, so a recruitment lead never reads "Mandate Signed". */
  kind?: PipelineKind;
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
            {stageLabel(s, kind)}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
