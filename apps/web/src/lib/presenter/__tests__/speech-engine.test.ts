import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWebSpeechEngine } from "@/lib/presenter/speech-engine";

describe("createWebSpeechEngine", () => {
  let speechSynthesisMock: {
    cancel: ReturnType<typeof vi.fn>;
    speak: ReturnType<typeof vi.fn>;
    pause: ReturnType<typeof vi.fn>;
    resume: ReturnType<typeof vi.fn>;
    getVoices: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    speechSynthesisMock = {
      cancel: vi.fn(),
      speak: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      getVoices: vi.fn(() => []),
    };
    vi.stubGlobal("speechSynthesis", speechSynthesisMock);
    vi.stubGlobal(
      "SpeechSynthesisUtterance",
      vi.fn().mockImplementation((text: string) => ({ text })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports supported when speechSynthesis is present", () => {
    const engine = createWebSpeechEngine();
    expect(engine.isSupported()).toBe(true);
  });

  it("cancels any prior utterance before speaking a new one", () => {
    const engine = createWebSpeechEngine();
    engine.speak("hello");
    expect(speechSynthesisMock.cancel).toHaveBeenCalled();
    expect(speechSynthesisMock.speak).toHaveBeenCalled();
  });

  it("wires onend and onerror callbacks onto the utterance", () => {
    const engine = createWebSpeechEngine();
    const onEnd = vi.fn();
    const onError = vi.fn();
    engine.speak("hello", { onEnd, onError });

    const utterance = speechSynthesisMock.speak.mock.calls[0]![0];
    utterance.onend();
    expect(onEnd).toHaveBeenCalled();

    utterance.onerror(new Event("error"));
    expect(onError).toHaveBeenCalled();
  });

  it("reports unsupported when speechSynthesis is absent", () => {
    vi.unstubAllGlobals();
    const engine = createWebSpeechEngine();
    expect(engine.isSupported()).toBe(false);
    engine.speak("hello");
    expect(speechSynthesisMock.speak).not.toHaveBeenCalled();
  });
});
