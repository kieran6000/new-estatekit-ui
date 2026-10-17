import { Box } from "@mui/material";

/** A phone around a preview, so agents see their page the way leads do:
 *  on a phone. The screen scrolls inside the phone; the strip at the top is
 *  in the page's colour, like a browser on a phone. */
export default function PhoneFrame({ children, accent = "#202124" }: { children: React.ReactNode; accent?: string }) {
  return (
    <Box sx={{ mx: "auto", width: 340, maxWidth: "100%", p: "10px", borderRadius: "44px", bgcolor: "#1d1d1f", boxShadow: "0 12px 32px rgba(0,0,0,.18)" }}>
      <Box
        sx={{
          position: "relative", borderRadius: "34px", overflow: "hidden", bgcolor: "#fff", display: "flex", flexDirection: "column",
          height: { xs: 620, md: "min(660px, calc(100vh - 230px))" }, minHeight: 480,
        }}
      >
        <Box sx={{ flex: "none", height: 34, bgcolor: accent, display: "flex", justifyContent: "center", alignItems: "center" }}>
          <Box sx={{ width: 88, height: 22, borderRadius: 11, bgcolor: "#1d1d1f" }} />
        </Box>
        <Box
          sx={{
            flex: 1, minHeight: 0, overflowY: "auto", overscrollBehavior: "contain",
            scrollbarWidth: "none", "&::-webkit-scrollbar": { display: "none" },
          }}
        >
          {children}
        </Box>
      </Box>
    </Box>
  );
}
