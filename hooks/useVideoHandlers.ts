import { useCallback, RefObject, useMemo } from 'react';
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
  }, [currentEpisode?.url]);

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
      onPlaybackStatusUpdate: handlePlaybackStatusUpdate,
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
      handlePlaybackStatusUpdate,
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
