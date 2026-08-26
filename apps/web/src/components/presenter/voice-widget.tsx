"use client";

import { Mic, MicOff, Pause, Play, SkipForward, VolumeX } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { PresenterControls, PresenterStatus } from "@/lib/presenter/use-voice-presenter";
import { cn } from "@/lib/cn";

export function VoiceWidget({
  status,
  isMuted,
  controls,
}: {
  status: PresenterStatus;
  isMuted: boolean;
  controls: PresenterControls;
}) {
  return (
    <Card className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-3 py-2 shadow-lg">
      <div
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-full",
          status === "speaking" && "animate-pulse bg-primary text-primary-foreground",
          status === "paused" && "bg-secondary text-secondary-foreground",
          status === "unsupported" && "bg-muted text-muted-foreground",
          status === "idle" && "bg-muted text-muted-foreground",
        )}
        title={
          status === "unsupported"
            ? "Voice narration not supported in this browser"
            : `Presenter: ${status}`
        }
      >
        {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
      </div>

      {status === "paused" ? (
        <Button size="sm" variant="ghost" onClick={controls.resume} aria-label="Resume narration">
          <Play className="h-4 w-4" />
        </Button>
      ) : (
        <Button
          size="sm"
          variant="ghost"
          onClick={controls.pause}
          aria-label="Pause narration"
          disabled={status === "unsupported"}
        >
          <Pause className="h-4 w-4" />
        </Button>
      )}

      <Button size="sm" variant="ghost" onClick={controls.skip} aria-label="Skip to next section">
        <SkipForward className="h-4 w-4" />
      </Button>

      <Button
        size="sm"
        variant="ghost"
        onClick={isMuted ? controls.unmute : controls.mute}
        aria-label={isMuted ? "Unmute narration" : "Mute narration"}
      >
        <VolumeX className={cn("h-4 w-4", isMuted && "text-destructive")} />
      </Button>
    </Card>
  );
}
