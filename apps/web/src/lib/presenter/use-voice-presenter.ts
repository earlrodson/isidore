"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createWebSpeechEngine, type SpeechEngine } from "@/lib/presenter/speech-engine";
import type { PresenterSection } from "@/lib/presenter/narration";

export type PresenterStatus = "idle" | "speaking" | "paused" | "unsupported";

const UNSUPPORTED_FALLBACK_MS = 6000;

export interface PresenterControls {
  pause(): void;
  resume(): void;
  skip(): void;
  mute(): void;
  unmute(): void;
}

export interface UseVoicePresenterResult {
  currentIndex: number;
  currentSection: PresenterSection | undefined;
  status: PresenterStatus;
  isMuted: boolean;
  controls: PresenterControls;
}

export function useVoicePresenter(sections: PresenterSection[]): UseVoicePresenterResult {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [status, setStatus] = useState<PresenterStatus>("idle");
  const [isMuted, setIsMuted] = useState(false);

  const engineRef = useRef<SpeechEngine | null>(null);
  const generationRef = useRef(0);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (!engineRef.current && typeof window !== "undefined") {
    engineRef.current = createWebSpeechEngine();
  }

  const supported = useMemo(() => engineRef.current?.isSupported() ?? false, []);

  function clearFallbackTimer() {
    if (fallbackTimerRef.current) {
      clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
  }

  function advance(generation: number) {
    if (generation !== generationRef.current) return;
    setCurrentIndex((index) => (sections.length === 0 ? 0 : (index + 1) % sections.length));
  }

  useEffect(() => {
    if (sections.length === 0) return;
    const engine = engineRef.current;
    const generation = ++generationRef.current;
    clearFallbackTimer();

    if (isMuted) {
      setStatus("idle");
      return;
    }

    if (!supported || !engine) {
      setStatus("unsupported");
      fallbackTimerRef.current = setTimeout(() => advance(generation), UNSUPPORTED_FALLBACK_MS);
      return;
    }

    setStatus("speaking");
    engine.speak(sections[currentIndex]!.narration, {
      onEnd: () => advance(generation),
      onError: () => advance(generation),
    });

    return () => {
      engine.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-runs deliberately only on index/mute/section-set changes
  }, [currentIndex, isMuted, sections, supported]);

  useEffect(() => {
    function handleVisibilityChange() {
      const engine = engineRef.current;
      if (!engine || !supported) return;
      if (document.hidden) {
        engine.pause();
      } else {
        engine.resume();
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [supported]);

  useEffect(() => {
    return () => {
      generationRef.current++;
      clearFallbackTimer();
      engineRef.current?.cancel();
    };
  }, []);

  const controls: PresenterControls = {
    pause() {
      generationRef.current++;
      clearFallbackTimer();
      engineRef.current?.pause();
      setStatus("paused");
    },
    resume() {
      engineRef.current?.resume();
      setStatus("speaking");
    },
    skip() {
      generationRef.current++;
      clearFallbackTimer();
      engineRef.current?.cancel();
      setCurrentIndex((index) => (sections.length === 0 ? 0 : (index + 1) % sections.length));
    },
    mute() {
      generationRef.current++;
      clearFallbackTimer();
      engineRef.current?.cancel();
      setIsMuted(true);
    },
    unmute() {
      setIsMuted(false);
    },
  };

  return {
    currentIndex,
    currentSection: sections[currentIndex],
    status,
    isMuted,
    controls,
  };
}
