/**
 * Admin live speech-to-text via Deepgram Nova-3 (German).
 * Used by Sachbuch Idee interview and Roman Ideen-Q&A.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

const TOKEN_URL = "/api/admin/deepgram-token";

type UseDeepgramLiveSttOptions = {
  /** When false, startListening is a no-op. */
  enabled?: boolean;
};

/**
 * Mic → PCM 16 kHz → Deepgram WebSocket; exposes live transcript + controls.
 */
export function useDeepgramLiveStt(options?: UseDeepgramLiveSttOptions) {
  const enabled = options?.enabled !== false;
  const [listening, setListening] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState("");
  const wsRef = useRef<WebSocket | null>(null);
  const mediaRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<ScriptProcessorNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const stopListening = useCallback(() => {
    try {
      wsRef.current?.close();
    } catch {
      /* ignore */
    }
    wsRef.current = null;
    try {
      recorderRef.current?.disconnect();
    } catch {
      /* ignore */
    }
    recorderRef.current = null;
    try {
      void audioCtxRef.current?.close();
    } catch {
      /* ignore */
    }
    audioCtxRef.current = null;
    mediaRef.current?.getTracks().forEach((t) => t.stop());
    mediaRef.current = null;
    setListening(false);
  }, []);

  useEffect(() => () => stopListening(), [stopListening]);

  const clearTranscript = useCallback(() => {
    setLiveTranscript("");
  }, []);

  const startListening = useCallback(async () => {
    if (!enabled || listening) return;
    try {
      const tokenRes = await fetch(TOKEN_URL, { method: "POST" });
      const tokenJson = (await tokenRes.json()) as {
        token?: string;
        error?: string;
      };
      if (!tokenRes.ok || !tokenJson.token) {
        toast.error(tokenJson.error ?? "Deepgram-Token fehlgeschlagen.");
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRef.current = stream;
      const url =
        "wss://api.deepgram.com/v1/listen?" +
        new URLSearchParams({
          model: "nova-3",
          language: "de",
          punctuate: "true",
          interim_results: "true",
          endpointing: "300",
          encoding: "linear16",
          sample_rate: "16000",
          channels: "1",
        }).toString();
      const ws = new WebSocket(url, ["token", tokenJson.token]);
      wsRef.current = ws;
      let finalBuffer = "";
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(String(event.data)) as {
            is_final?: boolean;
            channel?: { alternatives?: Array<{ transcript?: string }> };
          };
          const alt = data.channel?.alternatives?.[0]?.transcript ?? "";
          if (!alt) return;
          if (data.is_final) {
            finalBuffer = `${finalBuffer} ${alt}`.trim();
            setLiveTranscript(finalBuffer);
          } else {
            setLiveTranscript(`${finalBuffer} ${alt}`.trim());
          }
        } catch {
          /* ignore */
        }
      };
      ws.onerror = () => {
        toast.error("Deepgram-Verbindung fehlgeschlagen.");
        stopListening();
      };
      ws.onopen = () => {
        const audioCtx = new AudioContext({ sampleRate: 16000 });
        audioCtxRef.current = audioCtx;
        const source = audioCtx.createMediaStreamSource(stream);
        const processor = audioCtx.createScriptProcessor(4096, 1, 1);
        recorderRef.current = processor;
        processor.onaudioprocess = (e) => {
          if (ws.readyState !== WebSocket.OPEN) return;
          const input = e.inputBuffer.getChannelData(0);
          const pcm = new Int16Array(input.length);
          for (let i = 0; i < input.length; i++) {
            const s = Math.max(-1, Math.min(1, input[i]!));
            pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
          }
          ws.send(pcm.buffer);
        };
        source.connect(processor);
        processor.connect(audioCtx.destination);
        setListening(true);
      };
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Mikrofon nicht verfügbar.",
      );
      stopListening();
    }
  }, [enabled, listening, stopListening]);

  return {
    listening,
    liveTranscript,
    setLiveTranscript,
    startListening,
    stopListening,
    clearTranscript,
  };
}
