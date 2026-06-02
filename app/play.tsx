import React, { useEffect, useRef, useCallback, memo, useMemo } from "react";
import { StyleSheet, TouchableOpacity, BackHandler, AppState, AppStateStatus, View, Platform, Linking } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Video } from "expo-av";
import { useKeepAwake } from "expo-keep-awake";
import { ThemedView } from "@/components/ThemedView";
import { PlayerControls } from "@/components/PlayerControls";
import { EpisodeSelectionModal } from "@/components/EpisodeSelectionModal";
import { SourceSelectionModal } from "@/components/SourceSelectionModal";
import { SpeedSelectionModal } from "@/components/SpeedSelectionModal";
import { SeekingBar } from "@/components/SeekingBar";
// import { NextEpisodeOverlay } from "@/components/NextEpisodeOverlay";
import VideoLoadingAnimation from "@/components/VideoLoadingAnimation";
import useDetailStore from "@/stores/detailStore";
import { useTVRemoteHandler } from "@/hooks/useTVRemoteHandler";
import Toast from "react-native-toast-message";
import usePlayerStore, { selectCurrentEpisode } from "@/stores/playerStore";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";
import { useVideoHandlers } from "@/hooks/useVideoHandlers";
import Logger from '@/utils/Logger';
import { useSettingsStore } from "@/stores/settingsStore";
import * as IntentLauncher from "expo-intent-launcher";

const logger = Logger.withTag('PlayScreen');

// 浼樺寲鐨勫姞杞藉姩鐢荤粍浠?
const LoadingContainer = memo(
  ({ style, currentEpisode }: { style: any; currentEpisode: { url: string; title: string } | undefined }) => {
    logger.info(
      `[PERF] Video component NOT rendered - waiting for valid URL. currentEpisode: ${!!currentEpisode}, url: ${
        currentEpisode?.url ? "exists" : "missing"
      }`
    );
    return (
      <View style={style}>
        <VideoLoadingAnimation showProgressBar />
      </View>
    );
  }
);

LoadingContainer.displayName = "LoadingContainer";

// 绉诲埌缁勪欢澶栭儴閬垮厤閲嶅鍒涘缓
const createResponsiveStyles = (deviceType: string) => {
  const isMobile = deviceType === "mobile";
  const isTablet = deviceType === "tablet";

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: "black",
      // 绉诲姩绔拰骞虫澘绔彲鑳介渶瑕佺姸鎬佹爮澶勭悊
      ...(isMobile || isTablet ? { paddingTop: 0 } : {}),
    },
    videoContainer: {
      ...StyleSheet.absoluteFillObject,
      // 涓鸿Е鎽歌澶囨坊鍔犳洿澶氱殑浜や簰鍖哄煙
      ...(isMobile || isTablet ? { zIndex: 1 } : {}),
    },
    videoPlayer: {
      ...StyleSheet.absoluteFillObject,
    },
    loadingContainer: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(0, 0, 0, 0.8)",
      justifyContent: "center",
      alignItems: "center",
      zIndex: 10,
    },
  });
};

export default function PlayScreen() {
  const videoRef = useRef<Video>(null);
  const systemPlayerOpenedUrlRef = useRef<string | null>(null);
  const router = useRouter();
  useKeepAwake();

  // 鍝嶅簲寮忓竷灞€閰嶇疆
  const { deviceType } = useResponsiveLayout();

  const {
    episodeIndex: episodeIndexStr,
    position: positionStr,
    source: sourceStr,
    id: videoId,
    title: videoTitle,
  } = useLocalSearchParams<{
    episodeIndex: string;
    position?: string;
    source?: string;
    id?: string;
    title?: string;
  }>();
  const episodeIndex = parseInt(episodeIndexStr || "0", 10);
  const position = positionStr ? parseInt(positionStr, 10) : undefined;

  const { detail } = useDetailStore();
  const source = sourceStr || detail?.source;
  const id = videoId || detail?.id.toString();
  const title = videoTitle || detail?.title;
  const {
    isLoading,
    showControls,
    // showNextEpisodeOverlay,
    initialPosition,
    introEndTime,
    playbackRate,
    setVideoRef,
    handlePlaybackStatusUpdate,
    setShowControls,
    // setShowNextEpisodeOverlay,
    reset,
    loadVideo,
  } = usePlayerStore();
  const playerBackend = useSettingsStore((state) => state.playerBackend);
  const currentEpisode = usePlayerStore(selectCurrentEpisode);
  const isSystemBackend = playerBackend === "system";
  const systemEpisodeUrl = useMemo(() => {
    if (!detail?.episodes || detail.episodes.length === 0) return "";
    return detail.episodes[episodeIndex] || detail.episodes[0] || "";
  }, [detail?.episodes, episodeIndex]);

  const openSystemPlayer = useCallback(async (url: string) => {
    try {
      if (Platform.OS === "android") {
        await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
          data: url,
          type: "video/*",
        });
      } else {
        await Linking.openURL(url);
      }
    } catch {
      try {
        await Linking.openURL(url);
      } catch {
        Toast.show({ type: "error", text1: "System player failed to open" });
      }
    }
  }, []);

  // 浣跨敤Video浜嬩欢澶勭悊hook
  const { videoProps } = useVideoHandlers({
    videoRef,
    currentEpisode,
    initialPosition,
    introEndTime,
    playbackRate,
    handlePlaybackStatusUpdate,
    deviceType,
    detail: detail || undefined,
  });

  // TV閬ユ帶鍣ㄥ鐞?- 鎬绘槸璋冪敤hook锛屼絾鏍规嵁璁惧绫诲瀷鍐冲畾鏄惁浣跨敤缁撴灉
  const tvRemoteHandler = useTVRemoteHandler();

  // 浼樺寲鐨勫姩鎬佹牱寮?- 浣跨敤useMemo閬垮厤閲嶅璁＄畻
  const dynamicStyles = useMemo(() => createResponsiveStyles(deviceType), [deviceType]);

  useEffect(() => {
    if (!isSystemBackend || !systemEpisodeUrl) return;
    if (systemPlayerOpenedUrlRef.current === systemEpisodeUrl) return;

    systemPlayerOpenedUrlRef.current = systemEpisodeUrl;
    reset();
    usePlayerStore.setState({ isLoading: false });
    openSystemPlayer(systemEpisodeUrl);
  }, [isSystemBackend, openSystemPlayer, reset, systemEpisodeUrl]);

  useEffect(() => {
    if (isSystemBackend) return;
    const perfStart = performance.now();
    logger.info(`[PERF] PlayScreen useEffect START - source: ${source}, id: ${id}, title: ${title}`);

    setVideoRef(videoRef);
    if (source && id && title) {
      logger.info(`[PERF] Calling loadVideo with episodeIndex: ${episodeIndex}, position: ${position}`);
      loadVideo({ source, id, episodeIndex, position, title });
    } else {
      logger.info(`[PERF] Missing required params - source: ${!!source}, id: ${!!id}, title: ${!!title}`);
    }

    const perfEnd = performance.now();
    logger.info(`[PERF] PlayScreen useEffect END - took ${(perfEnd - perfStart).toFixed(2)}ms`);

    return () => {
      logger.info(`[PERF] PlayScreen unmounting - calling reset()`);
      reset(); // Reset state when component unmounts
    };
  }, [episodeIndex, source, position, setVideoRef, reset, loadVideo, id, title, isSystemBackend]);

  // 浼樺寲鐨勫睆骞曠偣鍑诲鐞?
  const onScreenPress = useCallback(() => {
    if (deviceType === "tv") {
      tvRemoteHandler.onScreenPress();
    } else {
      setShowControls(!showControls);
    }
  }, [deviceType, tvRemoteHandler, setShowControls, showControls]);

  useEffect(() => {
    if (isSystemBackend) return;
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === "background" || nextAppState === "inactive") {
        usePlayerStore.getState()._savePlayRecord({}, { immediate: true });
        videoRef.current?.pauseAsync();
      }
    };

    const subscription = AppState.addEventListener("change", handleAppStateChange);

    return () => {
      subscription.remove();
    };
  }, [isSystemBackend]);

  useEffect(() => {
    if (isSystemBackend) return;
    const backAction = () => {
      if (showControls) {
        setShowControls(false);
        return true;
      }
      router.back();
      return true;
    };

    const backHandler = BackHandler.addEventListener("hardwareBackPress", backAction);

    return () => backHandler.remove();
  }, [showControls, setShowControls, router, isSystemBackend]);

  useEffect(() => {
    if (isSystemBackend) return;
    let timeoutId: NodeJS.Timeout | null = null;

    if (isLoading) {
      timeoutId = setTimeout(() => {
        if (usePlayerStore.getState().isLoading) {
          usePlayerStore.setState({ isLoading: false });
          Toast.show({ type: "error", text1: "鎾斁瓒呮椂锛岃閲嶈瘯" });
        }
      }, 60000); // 1 minute
    }

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [isLoading, isSystemBackend]);

  if (!detail) {
    return <VideoLoadingAnimation showProgressBar />;
  }

  return (
    <ThemedView focusable style={dynamicStyles.container}>
      <TouchableOpacity
        activeOpacity={1}
        style={dynamicStyles.videoContainer}
        onPress={onScreenPress}
        disabled={deviceType !== "tv" && showControls} // 绉诲姩绔拰骞虫澘绔湪鏄剧ず鎺у埗鏉℃椂绂佺敤瑙︽懜
      >
        {/* 鏉′欢娓叉煋Video缁勪欢锛氬彧鏈夊湪鏈夋湁鏁圲RL鏃舵墠娓叉煋 */}
        {!isSystemBackend && currentEpisode?.url ? (
          <Video key={`${currentEpisode.url}-${playerBackend}`} ref={videoRef} style={dynamicStyles.videoPlayer} {...videoProps} />
        ) : isSystemBackend && systemEpisodeUrl ? (
          <View style={dynamicStyles.loadingContainer}>
            <VideoLoadingAnimation showProgressBar={false} />
          </View>
        ) : (
          <LoadingContainer style={dynamicStyles.loadingContainer} currentEpisode={currentEpisode} />
        )}

        {!isSystemBackend && showControls && deviceType === "tv" && (
          <PlayerControls showControls={showControls} setShowControls={setShowControls} />
        )}

        {!isSystemBackend && <SeekingBar />}

        {/* 鍙湪Video缁勪欢瀛樺湪涓旀鍦ㄥ姞杞芥椂鏄剧ず鍔犺浇鍔ㄧ敾瑕嗙洊灞?*/}
        {!isSystemBackend && currentEpisode?.url && isLoading && (
          <View style={dynamicStyles.loadingContainer}>
            <VideoLoadingAnimation showProgressBar />
          </View>
        )}

        {/* <NextEpisodeOverlay visible={showNextEpisodeOverlay} onCancel={() => setShowNextEpisodeOverlay(false)} /> */}
      </TouchableOpacity>

      {!isSystemBackend && <EpisodeSelectionModal />}
      {!isSystemBackend && <SourceSelectionModal />}
      {!isSystemBackend && <SpeedSelectionModal />}
    </ThemedView>
  );
}



