import { useQuery } from "@tanstack/react-query";
import * as coursesApi from "../api/courses";
import { useTier } from "./useTier";
import type { CourseModuleWithLock } from "../types";

export function useCourseModules(): { data: CourseModuleWithLock[]; isLoading: boolean } {
  const { tier } = useTier();
  const { data = [], isLoading } = useQuery({
    queryKey: ["courseModules"],
    queryFn: coursesApi.listCourseModules,
  });
  return {
    isLoading,
    data: data.map((m) => ({ ...m, locked: tier === "free" && !m.freeTier })),
  };
}
