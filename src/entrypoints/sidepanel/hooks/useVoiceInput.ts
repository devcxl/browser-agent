import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import type { ProviderConfig } from '@/shared/types';
import { SttClient } from '@/provider';

export type VoiceState = 'idle' | 'requesting' | 'recording' | 'transcribing' | 'error';

export interface UseVoiceInputOptions {
  providers: ProviderConfig[];
  onTranscribed: (text: string) => void;
}

export interface UseVoiceInputReturn {
  voiceState: VoiceState;
  errorMessage: string | null;
  voiceAvailable: boolean;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  cancelRecording: () => void;
  clearError: () => void;
}

function selectProvider(providers: ProviderConfig[]): ProviderConfig | null {
  return providers.find((p) => p.sttModel) ?? null;
}

const RECORDING_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4;codecs=mp4a.40.5',
  'audio/mp4',
  'audio/aac',
  'audio/ogg;codecs=opus',
  'audio/wav',
];

function selectBestMimeType(): string {
  for (const mime of RECORDING_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return '';
}

function releaseStream(
  streamRef: React.MutableRefObject<MediaStream | null>,
  recorderRef: React.MutableRefObject<MediaRecorder | null>,
  chunksRef: React.MutableRefObject<Blob[]>,
) {
  if (streamRef.current) {
    streamRef.current.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }
  recorderRef.current = null;
  chunksRef.current = [];
}

export function useVoiceInput({
  providers,
  onTranscribed,
}: UseVoiceInputOptions): UseVoiceInputReturn {
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const selectedProviderRef = useRef<ProviderConfig | null>(null);
  const onTranscribedRef = useRef(onTranscribed);
  const voiceStateRef = useRef<VoiceState>('idle');

  const setVoiceStateSync = useCallback((state: VoiceState) => {
    voiceStateRef.current = state;
    setVoiceState(state);
  }, []);

  const voiceAvailable = useMemo(() => {
    return (
      typeof navigator !== 'undefined' &&
      typeof navigator.mediaDevices !== 'undefined' &&
      typeof navigator.mediaDevices.getUserMedia === 'function' &&
      providers.some((p) => p.sttModel)
    );
  }, [providers]);

  const startRecording = useCallback(async () => {
    // 幂等保护：requesting/recording/transcribing 状态下禁止重复触发
    if (
      voiceStateRef.current === 'requesting' ||
      voiceStateRef.current === 'recording' ||
      voiceStateRef.current === 'transcribing'
    ) {
      return;
    }

    releaseStream(streamRef, recorderRef, chunksRef);
    setErrorMessage(null);

    const provider = selectProvider(providers);
    if (!provider) {
      setErrorMessage('未配置语音模型，请在设置中为 Provider 添加 sttModel');
      setVoiceStateSync('error');
      return;
    }
    selectedProviderRef.current = provider;

    setVoiceStateSync('requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = provider.audioFormat || selectBestMimeType();
      const recorder = new MediaRecorder(stream, { mimeType: mimeType || undefined });
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {};

      recorder.start();
      setVoiceStateSync('recording');
    } catch (err) {
      releaseStream(streamRef, recorderRef, chunksRef);
      const error = err as DOMException;
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        setErrorMessage('麦克风权限被拒绝，请在浏览器设置中允许访问麦克风');
      } else if (error.name === 'NotFoundError') {
        setErrorMessage('未检测到麦克风设备');
      } else {
        setErrorMessage(`无法启动录音: ${error.message}`);
      }
      setVoiceStateSync('error');
    }
  }, [providers, setVoiceStateSync]);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== 'recording') return;

    setVoiceStateSync('transcribing');

    recorder.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
      const provider = selectedProviderRef.current;

      if (!provider) {
        setErrorMessage('Provider 配置丢失');
        setVoiceStateSync('error');
        releaseStream(streamRef, recorderRef, chunksRef);
        return;
      }

      try {
        const client = new SttClient(provider);
        const text = await client.transcribe(blob);
        onTranscribedRef.current(text);
        setVoiceStateSync('idle');
      } catch (err) {
        setErrorMessage(`语音识别失败: ${(err as Error).message}`);
        setVoiceStateSync('error');
      } finally {
        releaseStream(streamRef, recorderRef, chunksRef);
      }
    };

    recorder.stop();
  }, [setVoiceStateSync]);

  const cancelRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== 'recording') return;

    recorder.onstop = () => {
      releaseStream(streamRef, recorderRef, chunksRef);
      setVoiceStateSync('idle');
    };

    recorder.stop();
  }, [setVoiceStateSync]);

  const clearError = useCallback(() => {
    setErrorMessage(null);
    setVoiceStateSync('idle');
  }, [setVoiceStateSync]);

  useEffect(() => {
    return () => {
      if (recorderRef.current && recorderRef.current.state === 'recording') {
        recorderRef.current.onstop = () => {};
        recorderRef.current.stop();
      }
      releaseStream(streamRef, recorderRef, chunksRef);
    };
  }, []);

  useEffect(() => {
    onTranscribedRef.current = onTranscribed;
  }, [onTranscribed]);

  return {
    voiceState,
    errorMessage,
    voiceAvailable,
    startRecording,
    stopRecording,
    cancelRecording,
    clearError,
  };
}
