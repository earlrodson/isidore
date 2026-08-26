export interface SpeakOptions {
  onEnd?: () => void;
  onError?: (error: unknown) => void;
  voice?: SpeechSynthesisVoice;
}

export interface SpeechEngine {
  speak(text: string, opts?: SpeakOptions): void;
  cancel(): void;
  pause(): void;
  resume(): void;
  isSupported(): boolean;
}

function getSynthesis(): SpeechSynthesis | undefined {
  return typeof globalThis !== "undefined" ? globalThis.speechSynthesis : undefined;
}

export function createWebSpeechEngine(): SpeechEngine {
  const isSupported = () => getSynthesis() !== undefined;

  return {
    isSupported,
    speak(text, opts) {
      const synthesis = getSynthesis();
      if (!synthesis) return;
      synthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      const voice = opts?.voice ?? synthesis.getVoices().find((v) => v.default);
      if (voice) utterance.voice = voice;
      if (opts?.onEnd) utterance.onend = opts.onEnd;
      utterance.onerror = (event) => {
        opts?.onError?.(event);
      };
      synthesis.speak(utterance);
    },
    cancel() {
      getSynthesis()?.cancel();
    },
    pause() {
      getSynthesis()?.pause();
    },
    resume() {
      getSynthesis()?.resume();
    },
  };
}
