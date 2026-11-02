import { Box, Dialog, DialogContent, DialogTitle, IconButton, Skeleton, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { useQuery } from "@tanstack/react-query";
import { getFbForm, getLeadPagePublic } from "../api/leadPages";
import FbFormPreview from "./FbFormPreview";

// The Facebook form this lead filled in, as they saw it.
export default function LeadFormDialog({ pageId, open, onClose }: { pageId: string; open: boolean; onClose: () => void }) {
  const { data: page } = useQuery({
    queryKey: ["leadPagePublic", pageId],
    queryFn: () => getLeadPagePublic(pageId),
    enabled: open,
    staleTime: 60 * 60_000,
  });
  const { data, isLoading, isError } = useQuery({
    queryKey: ["fbForm", page?.fbPageId, page?.fbFormId],
    queryFn: () => getFbForm(page!.fbPageId, page!.fbFormId!),
    enabled: open && !!page?.fbFormId,
    staleTime: 60 * 60_000,
    retry: false,
  });

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle sx={{ display: "flex", alignItems: "center", pr: 1 }}>
        <Box sx={{ flex: 1 }}>Their form</Box>
        <IconButton onClick={onClose} aria-label="Close"><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent>
        {isLoading || !page ? (
          <Skeleton variant="rounded" height={520} sx={{ borderRadius: "12px" }} />
        ) : data?.form ? (
          <FbFormPreview form={data.form} pageName={data.page?.name || page.agentName} avatarUrl={data.page?.picture} formName={data.form.name || page.name} />
        ) : (
          <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
            {data?.rateLimited ? "Facebook is busy right now. Try again in a few minutes." : isError ? "Couldn't load the form from Facebook." : "Couldn't load the form from Facebook."}
          </Typography>
        )}
      </DialogContent>
    </Dialog>
  );
}
