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
  const isAutoSwitchingRef = useRef(false);
  const onLoad = useCallback(async () => {
    console.info('[PERF] Video onLoad - video ready to play');

    try {
      // Reduce callback frequency to lower JS thread pressure on TV devices.
      await videoRef.current?.setProgressUpdateIntervalAsync(1000);

      const jumpPosition = initialPosition || introEndTime || 0;
      if (jumpPosition > 0) {
        console.info(`[PERF] Setting initial position to ${jumpPosition}ms`);
        await videoRef.current?.setPositionAsync(jumpPosition);
      }

      // shouldPlay is already true; avoid extra playAsync race on some devices.
      usePlayerStore.setState({ isLoading: false });
      console.info('[PERF] Video loading complete - isLoading set to false');
    } catch (error) {
      console.warn('[VIDEO_INIT] Failed to initialize playback settings:', error);
      usePlayerStore.setState({ isLoading: false });
    }
  }, [videoRef, initialPosition, introEndTime]);

  const onLoadStart = useCallback(() => {
    if (!currentEpisode?.url) return;

    console.info(`[PERF] Video onLoadStart - starting to load video: ${currentEpisode.url.substring(0, 100)}...`);
    usePlayerStore.setState({ isLoading: true });
    wasBufferingRef.current = false;
    bufferingStartAtRef.current = null;
    isResyncingRef.current = false;
    bufferingEventsRef.current = [];
    isAutoSwitchingRef.current = false;
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
          // Keep only recent 90 seconds events for stutter detection.
          bufferingEventsRef.current = bufferingEventsRef.current.filter((t) => now - t <= 90_000);

          // For some Android TV devices, a long buffering recovery may leave A/V drift.
          // Seeking to current position forces native pipeline re-sync.
          if (bufferingDuration >= 1500 && !isResyncingRef.current && status.positionMillis > 0) {
            isResyncingRef.current = true;
            try {
              await videoRef.current?.setPositionAsync(status.positionMillis);
              console.info(`[AUDIO_SYNC] Resynced after buffering (${bufferingDuration}ms) at ${status.positionMillis}ms`);
            } catch (error) {
              console.warn('[AUDIO_SYNC] Failed to resync after buffering:', error);
            } finally {
              isResyncingRef.current = false;
            }
          }

          // Proactively switch to another source when playback is clearly unstable.
          // Goal: smoother playback over sharpness when current source keeps stalling.
          const tooManyStutters = bufferingEventsRef.current.length >= 3;
          const veryLongBuffer = bufferingDuration >= 6000;
          if ((tooManyStutters || veryLongBuffer) && !isAutoSwitchingRef.current && currentEpisode?.url) {
            isAutoSwitchingRef.current = true;
            Toast.show({
              type: 'info',
              text1: '检测到播放不稳定，正在自动切换更流畅线路',
            });
            usePlayerStore.getState().handleVideoError('network', currentEpisode.url);
          }
        }
      }

      handlePlaybackStatusUpdate(status);
    },
    [handlePlaybackStatusUpdate, videoRef]
  );

  const onError = useCallback(
    (error: any) => {
      if (!currentEpisode?.url) return;

      console.error('[ERROR] Video playback error:', error);

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
        console.error(`[SSL_ERROR] SSL certificate validation failed for URL: ${currentEpisode.url}`);
        Toast.show({
          type: 'error',
          text1: 'SSL证书错误，正在尝试其他播放源...',
          text2: '请稍候',
        });
        usePlayerStore.getState().handleVideoError('ssl', currentEpisode.url);
      } else if (isNetworkError) {
        console.error(`[NETWORK_ERROR] Network connection failed for URL: ${currentEpisode.url}`);
        Toast.show({
          type: 'error',
          text1: '网络连接失败，正在尝试其他播放源...',
          text2: '请稍候',
        });
        usePlayerStore.getState().handleVideoError('network', currentEpisode.url);
      } else {
        console.error(`[VIDEO_ERROR] Other video error for URL: ${currentEpisode.url}`);
        Toast.show({
          type: 'error',
          text1: '视频播放失败，正在尝试其他播放源...',
          text2: '请稍候',
        });
        usePlayerStore.getState().handleVideoError('other', currentEpisode.url);
      }
    },
    [currentEpisode?.url]
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
