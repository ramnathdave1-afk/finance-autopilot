"use client";
import * as React from "react";
import { cn } from "./cn";
import { Button } from "./button";
import { Badge } from "./badge";

export interface VoicePlayerProps {
  src: string;
  durationSec?: number;
  transcript?: string;
  shareable?: boolean;
  onShare?: () => void;
  className?: string;
}

function fmt(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function VoicePlayer({ src, durationSec, transcript, shareable, onShare, className }: VoicePlayerProps) {
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = React.useState(false);
  const [pos, setPos] = React.useState(0);
  const [dur, setDur] = React.useState(durationSec ?? 0);
  const [showTranscript, setShowTranscript] = React.useState(false);

  function toggle() {
    const a = audioRef.current;
    if (!a) return;
    if (playing) a.pause();
    else void a.play();
  }

  return (
    <div className={cn("rounded-md border border-border bg-bg p-4", className)}>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onLoadedMetadata={(e) => setDur((e.target as HTMLAudioElement).duration)}
        onTimeUpdate={(e) => setPos((e.target as HTMLAudioElement).currentTime)}
      />
      <div className="flex items-center gap-3">
        <Button
          size="sm"
          variant="outline"
          onClick={toggle}
          aria-label={playing ? "Pause recording" : "Play recording"}
        >
          {playing ? "Pause" : "Play"}
        </Button>
        <div className="flex-1">
          <div className="h-1.5 rounded-full bg-border-strong overflow-hidden">
            <div
              className="h-full bg-accent transition-[width] duration-100 ease-soft"
              style={{ width: dur > 0 ? `${Math.min(100, (pos / dur) * 100)}%` : "0%" }}
            />
          </div>
          <div className="mt-1 flex justify-between text-small text-fg-muted">
            <span>{fmt(pos)}</span>
            <span>{dur > 0 ? fmt(dur) : "--:--"}</span>
          </div>
        </div>
        <Badge tone="accent">AI call</Badge>
      </div>
      {transcript && (
        <div className="mt-3">
          <button
            type="button"
            className="text-small text-fg-muted hover:text-fg"
            onClick={() => setShowTranscript((v) => !v)}
          >
            {showTranscript ? "Hide transcript" : "Show transcript"}
          </button>
          {showTranscript && (
            <p className="mt-2 text-small text-fg whitespace-pre-wrap">{transcript}</p>
          )}
        </div>
      )}
      {shareable && (
        <div className="mt-3 flex justify-end">
          <Button size="sm" variant="ghost" onClick={onShare}>Share (PII masked)</Button>
        </div>
      )}
    </div>
  );
}
