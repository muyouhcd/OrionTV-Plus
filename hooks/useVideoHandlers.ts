import { useCallback, RefObject, useMemo, useRef } from 'react';
import { Video, ResizeMode } from 'expo-av';
import Toast from 'react-native-toast-message';
import usePlayerStore from '@/stores/playerStore';
import { useSettingsStore } from '@/stores/settingsStore';

interface UseVideoHandlersProps {
  videoRef: RefObject<Video>;
  currentEpisode: { url: string; title: string } | undefined;
  initialPosition: number;
  introEndTime?: number;
  playbackRate: number;
  handlePlaybackStatusUpdate: (status: any) => void;
  deviceType: string;
  detail?: { poster?: string };
}

export const useVideoHandlers = ({
  videoRef,
  currentEpisode,
  initialPosition,
  introEndTime,
  playbackRate,
  handlePlaybackStatusUpdate,
  deviceType,
  detail,
}: UseVideoHandlersProps) => {
  const playerBackend = useSettingsStore((state) => state.playerBackend);

  const wasBufferingRef = useRef(false);
  const bufferingStartAtRef = useRef<number | null>(null);
  const isResyncingRef = useRef(false);
  const bufferingEventsRef = useRef<number[]>([]);
  const severeStallEventsRef = useRef<number[]>([]);
  const backendFailoverDoneRef = useRef(false);

  const onLoad = useCallback(async () => {
    try {
      // Lower callback frequency to reduce JS load on TV chipsets.
      await videoRef.current?.setProgressUpdateIntervalAsync(deviceType === 'tv' ? 2000 : 1000);

      const jumpPosition = initialPosition || introEndTime || 0;
      if (jumpPosition > 0) {
        await videoRef.current?.setPositionAsync(jumpPosition);
      }

      usePlayerStore.setState({ isLoading: false });
    } catch {
      usePlayerStore.setState({ isLoading: false });
    }
  }, [videoRef, initialPosition, introEndTime, deviceType]);

  const onLoadStart = useCallback(() => {
    if (!currentEpisode?.url) return;

    usePlayerStore.setState({ isLoading: true });
    wasBufferingRef.current = false;
    bufferingStartAtRef.current = null;
    isResyncingRef.current = false;
    bufferingEventsRef.current = [];
    severeStallEventsRef.current = [];
    backendFailoverDoneRef.current = false;
  }, [currentEpisode?.url]);

  const wrappedPlaybackStatusUpdate = useCallback(
    async (status: any) => {
      if (status?.isLoaded) {
        if (status.isBuffering && !wasBufferingRef.current) {
          wasBufferingRef.current = true;
          bufferingStartAtRef.current = Date.now();
        }

        if (!status.isBuffering && wasBufferingRef.current) {
          wasBufferingRef.current = false;
          const bufferingDuration = bufferingStartAtRef.current ? Date.now() - bufferingStartAtRef.current : 0;
          bufferingStartAtRef.current = null;

          const now = Date.now();
          bufferingEventsRef.current.push(now);
          bufferingEventsRef.current = bufferingEventsRef.current.filter((t) => now - t <= 90_000);

          // Keep A/V sync stable after noticeable buffering.
          if (bufferingDuration >= 1500 && !isResyncingRef.current && status.positionMillis > 0) {
            isResyncingRef.current = true;
            try {
              await videoRef.current?.setPositionAsync(status.positionMillis);
            } catch {
              // best effort
            } finally {
              isResyncingRef.current = false;
            }
          }

          // Lightweight recovery first, avoid immediate source switch.
          if (bufferingDuration >= 4500) {
            try {
              await videoRef.current?.pauseAsync();
              await videoRef.current?.playAsync();
            } catch {
              // best effort
            }
          }

          if (bufferingDuration >= 5000) {
            severeStallEventsRef.current.push(now);
            severeStallEventsRef.current = severeStallEventsRef.current.filter((t) => now - t <= 180_000);
          }

          // If stalls repeat, fail over backend once per stream before switching source.
          if (
            deviceType === 'tv' &&
            severeStallEventsRef.current.length >= 2 &&
            !backendFailoverDoneRef.current
          ) {
            backendFailoverDoneRef.current = true;
            const settings = useSettingsStore.getState();
            const nextBackend = settings.playerBackend === 'mediaplayer' ? 'auto' : 'mediaplayer';
            settings.setPlayerBackend(nextBackend);
            Toast.show({
              type: 'info',
              text1: `Playback unstable, switched backend to ${nextBackend === 'mediaplayer' ? 'MediaPlayer' : 'ExoPlayer'}`,
            });
            return;
          }

          // Do not auto-switch source on buffering heuristics.
          // Keep playback on current source and rely on local recovery only.
        }
      }

      handlePlaybackStatusUpdate(status);
    },
    [handlePlaybackStatusUpdate, videoRef, deviceType, currentEpisode?.url]
  );

  const onError = useCallback(
    (error: any) => {
      if (!currentEpisode?.url) return;

      const errorString = (error as any)?.error?.toString() || error?.toString() || '';
      const isSSLError =
        errorString.includes('SSLHandshakeException') ||
        errorString.includes('CertPathValidatorException') ||
        errorString.includes('Trust anchor for certification path not found');
      const isNetworkError =
        errorString.includes('HttpDataSourceException') ||
        errorString.includes('IOException') ||
        errorString.includes('SocketTimeoutException');

      if (isSSLError) {
        Toast.show({ type: 'error', text1: 'SSL error, attempting local recovery' });
        void videoRef.current?.replayAsync();
      } else if (isNetworkError) {
        Toast.show({ type: 'error', text1: 'Playback interrupted, retrying current source' });
        void videoRef.current?.replayAsync();
      } else {
        Toast.show({ type: 'error', text1: 'Playback failed, attempting local recovery' });
        void videoRef.current?.replayAsync();
      }
    },
    [currentEpisode?.url, videoRef]
  );

  const videoProps = useMemo(
    () => ({
      source: { uri: currentEpisode?.url || '' },
      posterSource: { uri: detail?.poster ?? '' },
      resizeMode: ResizeMode.CONTAIN,
      rate: playbackRate,
      onPlaybackStatusUpdate: wrappedPlaybackStatusUpdate,
      onLoad,
      onLoadStart,
      onError,
      useNativeControls: deviceType !== 'tv',
      shouldPlay: true,
      ...(deviceType === 'tv' && playerBackend === 'mediaplayer'
        ? { androidImplementation: 'MediaPlayer' as const }
        : {}),
    }),
    [
      currentEpisode?.url,
      detail?.poster,
      playbackRate,
      wrappedPlaybackStatusUpdate,
      onLoad,
      onLoadStart,
      onError,
      deviceType,
      playerBackend,
    ]
  );

  return {
    onLoad,
    onLoadStart,
    onError,
    videoProps,
  };
};
