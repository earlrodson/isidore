"use client";

import { useMemo } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { buildPresenterSections, type PresenterData } from "@/lib/presenter/narration";
import { useVoicePresenter } from "@/lib/presenter/use-voice-presenter";
import { VoiceWidget } from "@/components/presenter/voice-widget";
import { ProjectsSection } from "@/components/presenter/sections/projects-section";
import { CompletionsSection } from "@/components/presenter/sections/completions-section";
import { DriftSection } from "@/components/presenter/sections/drift-section";
import { AllocationSection } from "@/components/presenter/sections/allocation-section";

export function PresenterShell({ data }: { data: PresenterData }) {
  const sections = useMemo(() => buildPresenterSections(data), [data]);
  const { currentSection, status, isMuted, controls } = useVoicePresenter(sections);
  const prefersReducedMotion = useReducedMotion();

  if (!currentSection) {
    return (
      <main className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">No data to present yet.</p>
      </main>
    );
  }

  const transitionDuration = prefersReducedMotion ? 0 : 0.3;

  return (
    <main className="mx-auto flex h-full max-w-5xl flex-col px-6 py-10">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Isidore — Presenter</h1>
      <AnimatePresence mode="wait">
        <motion.div
          key={currentSection.id}
          initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: prefersReducedMotion ? 0 : -8 }}
          transition={{ duration: transitionDuration }}
          className="flex-1"
        >
          <h2 className="mb-4 text-lg font-medium">{currentSection.title}</h2>
          {currentSection.id === "projects" && (
            <ProjectsSection rows={data.projects} highlightIds={currentSection.highlightIds} />
          )}
          {currentSection.id === "completions" && (
            <CompletionsSection rows={data.completedPerWeek} highlightIds={currentSection.highlightIds} />
          )}
          {currentSection.id === "drift" && (
            <DriftSection rows={data.estimationDrift} highlightIds={currentSection.highlightIds} />
          )}
          {currentSection.id === "allocation" && (
            <AllocationSection rows={data.allocation} highlightIds={currentSection.highlightIds} />
          )}
        </motion.div>
      </AnimatePresence>

      <VoiceWidget status={status} isMuted={isMuted} controls={controls} />
    </main>
  );
}
