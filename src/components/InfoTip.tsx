import { useState, type ReactNode } from "react";
import { ClickAwayListener, IconButton, Tooltip } from "@mui/material";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";

/** A small ⓘ that explains something without cluttering the screen. Opens on
 *  tap (phones have no hover) as well as on hover, and closes when tapping
 *  anywhere else. Use it instead of long helper paragraphs. */
export default function InfoTip({ children, label = "What's this?" }: { children: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <ClickAwayListener onClickAway={() => setOpen(false)}>
      <span style={{ display: "inline-flex" }}>
        <Tooltip
          open={open}
          onOpen={() => setOpen(true)}
          onClose={() => setOpen(false)}
          title={children}
          arrow
          placement="top"
          slotProps={{ tooltip: { sx: { fontSize: 13, lineHeight: 1.5, p: "8px 12px", maxWidth: 300 } } }}
        >
          <IconButton
            size="small"
            aria-label={label}
            onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
            sx={{ p: 0.75, color: "text.secondary" }}
          >
            <InfoOutlinedIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
      </span>
    </ClickAwayListener>
  );
}
