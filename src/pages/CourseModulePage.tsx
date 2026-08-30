import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppBar, Box, IconButton, Toolbar, Typography } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import LockIcon from "@mui/icons-material/Lock";
import PlayCircleOutlineIcon from "@mui/icons-material/PlayCircleOutlineRounded";
import { tokens } from "../theme";
import { useCourseModules } from "../hooks/useCourses";
import type { CourseLesson, CourseModuleWithLock } from "../types";

export default function CourseModulePage() {
  const { moduleId } = useParams<{ moduleId: string }>();
  const navigate = useNavigate();
  const { data: modules } = useCourseModules();
  const current = modules.find((m) => m.id === moduleId);
  const [lesson, setLesson] = useState<CourseLesson | null>(null);

  useEffect(() => {
    if (current && !current.locked && !lesson) setLesson(current.lessons[0]);
  }, [current, lesson]);

  if (modules.length === 0) return null;

  if (!current) {
    return (
      <Box sx={{ p: 4 }}>
        <Typography color="text.secondary">Course not found.</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <AppBar position="sticky">
        <Toolbar sx={{ height: 56, minHeight: "56px !important" }}>
          <IconButton onClick={() => navigate("/home")}>
            <ArrowBackIcon />
          </IconButton>
          <Typography sx={{ fontSize: 18, fontWeight: 500 }}>{current.title}</Typography>
        </Toolbar>
      </AppBar>

      {current.locked ? (
        <Box sx={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, p: 4, textAlign: "center" }}>
          <LockIcon sx={{ fontSize: 40, color: "text.disabled" }} />
          <Typography sx={{ fontSize: 18, fontWeight: 500 }}>This module is part of the paid plan</Typography>
          <Box
            component="button"
            onClick={() => navigate("/upgrade")}
            sx={{ border: 0, bgcolor: tokens.primary, color: "#fff", borderRadius: "4px", px: 3, py: 1.5, fontWeight: 500, fontSize: 14, textTransform: "uppercase", cursor: "pointer" }}
          >
            Unlock with paid
          </Box>
        </Box>
      ) : (
        <Box sx={{ flex: 1, display: "flex", flexDirection: { xs: "column", sm: "row" } }}>
          <Box sx={{ width: { xs: "100%", sm: 280 }, flex: "0 0 auto", bgcolor: "background.paper", borderRight: { sm: `1px solid ${tokens.divider}` }, borderBottom: { xs: `1px solid ${tokens.divider}`, sm: 0 } }}>
            {modules.map((m) => (
              <ModuleGroup key={m.id} module={m} activeLessonId={lesson?.id} onPick={(l) => (m.locked ? navigate("/upgrade") : setLesson(l))} />
            ))}
          </Box>
          <Box sx={{ flex: 1, p: 2 }}>
            {lesson && (
              <>
                <Typography sx={{ fontSize: 16, fontWeight: 500, mb: 1.5 }}>{lesson.title}</Typography>
                <Box sx={{ position: "relative", width: "100%", pt: "56.25%", borderRadius: "8px", overflow: "hidden", bgcolor: "#000" }}>
                  <Box
                    component="iframe"
                    src={lesson.youtubeEmbedUrl}
                    title={lesson.title}
                    allowFullScreen
                    sx={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
                  />
                </Box>
              </>
            )}
          </Box>
        </Box>
      )}
    </Box>
  );
}

function ModuleGroup({
  module,
  activeLessonId,
  onPick,
}: {
  module: CourseModuleWithLock;
  activeLessonId: string | undefined;
  onPick: (lesson: CourseLesson) => void;
}) {
  return (
    <Box sx={{ borderBottom: `1px solid ${tokens.divider2}` }}>
      <Typography sx={{ fontSize: 12, fontWeight: 500, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.05em", p: "12px 16px 6px", display: "flex", alignItems: "center", gap: 0.75 }}>
        {module.locked && <LockIcon sx={{ fontSize: 14 }} />}
        {module.title}
      </Typography>
      {module.lessons.map((l) => (
        <Box
          key={l.id}
          component="button"
          onClick={() => onPick(l)}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.25,
            width: "100%",
            border: 0,
            bgcolor: activeLessonId === l.id ? tokens.primaryBg : "transparent",
            p: "10px 16px",
            fontSize: 14,
            textAlign: "left",
            cursor: "pointer",
            color: module.locked ? "text.disabled" : "text.primary",
          }}
        >
          {module.locked ? <LockIcon sx={{ fontSize: 16, color: "text.disabled" }} /> : <PlayCircleOutlineIcon sx={{ fontSize: 18, color: tokens.primary }} />}
          {l.title}
        </Box>
      ))}
    </Box>
  );
}
