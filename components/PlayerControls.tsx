import React from "react";
import { View, Text, StyleSheet, Platform, Linking } from "react-native";
import {
  Pause,
  Play,
  SkipForward,
  List,
  Tv,
  ArrowDownToDot,
  ArrowUpFromDot,
  Gauge,
  ExternalLink,
  Cpu,
} from "lucide-react-native";
import { ThemedText } from "@/components/ThemedText";
import { MediaButton } from "@/components/MediaButton";
import * as IntentLauncher from "expo-intent-launcher";
import Toast from "react-native-toast-message";

import usePlayerStore from "@/stores/playerStore";
import useDetailStore from "@/stores/detailStore";
import { useSources } from "@/stores/sourceStore";
import { PlayerBackend, useSettingsStore } from "@/stores/settingsStore";

interface PlayerControlsProps {
  showControls: boolean;
  setShowControls: (show: boolean) => void;
}

const getBackendName = (backend: PlayerBackend) => {
  if (backend === "system") return "System";
  return backend === "soft" ? "软解" : "硬解";
};

export const PlayerControls: React.FC<PlayerControlsProps> = ({ showControls }) => {
  const {
    currentEpisodeIndex,
    episodes,
    status,
    isSeeking,
    seekPosition,
    progressPosition,
    playbackRate,
    togglePlayPause,
    playEpisode,
    setShowEpisodeModal,
    setShowSourceModal,
    setShowSpeedModal,
    setIntroEndTime,
    setOutroStartTime,
    introEndTime,
    outroStartTime,
  } = usePlayerStore();

  const { detail, searchResults } = useDetailStore();
  const resources = useSources();
  const { playerBackend, setAndSavePlayerBackend } = useSettingsStore();

  const videoTitle = detail?.title || "";
  const currentEpisode = episodes[currentEpisodeIndex];
  const currentEpisodeTitle = currentEpisode?.title;
  const currentSource = resources.find((r) => r.source === detail?.source);
  const currentSourceName = currentSource?.source_name;
  const hasNextEpisode = currentEpisodeIndex < (episodes.length || 0) - 1;

  const availableSourceCount = (searchResults || []).filter(
    (item) => item?.source && item.episodes && item.episodes.length > currentEpisodeIndex
  ).length;

  const formatTime = (milliseconds: number) => {
    if (!milliseconds) return "00:00";
    const totalSeconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  };

  const onPlayNextEpisode = () => {
    if (hasNextEpisode) {
      playEpisode(currentEpisodeIndex + 1);
    }
  };

  const onOpenExternalPlayer = async () => {
    if (!currentEpisode?.url) return;

    try {
      if (Platform.OS === "android") {
        await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
          data: currentEpisode.url,
          type: "video/*",
        });
      } else {
        await Linking.openURL(currentEpisode.url);
      }
    } catch {
      try {
        await Linking.openURL(currentEpisode.url);
      } catch {
        Toast.show({ type: "error", text1: "System player failed" });
      }
    }
  };

  const onSwitchPlaybackBackend = async () => {
    const nextBackend: PlayerBackend =
      playerBackend === "hard" ? "soft" : playerBackend === "soft" ? "system" : "hard";
    try {
      await setAndSavePlayerBackend(nextBackend);
      Toast.show({
        type: "success",
        text1: `Backend switched: ${getBackendName(nextBackend)}`,
        text2: nextBackend === "system" ? "TV system player will be used" : "Current video will reload",
      });
    } catch {
      Toast.show({ type: "error", text1: "Backend switch failed" });
    }
  };

  const onOpenSourceSwitcher = () => {
    if (availableSourceCount <= 1) {
      Toast.show({ type: "info", text1: "No alternative source" });
      return;
    }
    setShowSourceModal(true);
  };

  return (
    <View style={styles.controlsOverlay}>
      <View style={styles.topControls}>
        <Text style={styles.controlTitle}>
          {videoTitle} {currentEpisodeTitle ? `- ${currentEpisodeTitle}` : ""} {currentSourceName ? `(${currentSourceName})` : ""}{" "}
          [{getBackendName(playerBackend)}]
        </Text>
      </View>

      <View style={styles.bottomControlsContainer}>
        <View style={styles.progressBarContainer}>
          <View style={styles.progressBarBackground} />
          <View
            style={[
              styles.progressBarFilled,
              {
                width: `${(isSeeking ? seekPosition : progressPosition) * 100}%`,
              },
            ]}
          />
        </View>

        <ThemedText style={{ color: "white", marginTop: 5 }}>
          {status?.isLoaded
            ? `${formatTime(status.positionMillis)} / ${formatTime(status.durationMillis || 0)}`
            : "00:00 / 00:00"}
        </ThemedText>

        <View style={styles.bottomControls}>
          <MediaButton onPress={setIntroEndTime} timeLabel={introEndTime ? formatTime(introEndTime) : undefined}>
            <ArrowDownToDot color="white" size={24} />
          </MediaButton>

          <MediaButton onPress={togglePlayPause} hasTVPreferredFocus={showControls}>
            {status?.isLoaded && status.isPlaying ? <Pause color="white" size={24} /> : <Play color="white" size={24} />}
          </MediaButton>

          <MediaButton onPress={onPlayNextEpisode} disabled={!hasNextEpisode}>
            <SkipForward color={hasNextEpisode ? "white" : "#666"} size={24} />
          </MediaButton>

          <MediaButton onPress={setOutroStartTime} timeLabel={outroStartTime ? formatTime(outroStartTime) : undefined}>
            <ArrowUpFromDot color="white" size={24} />
          </MediaButton>

          <MediaButton onPress={() => setShowEpisodeModal(true)}>
            <List color="white" size={24} />
          </MediaButton>

          <MediaButton onPress={() => setShowSpeedModal(true)} timeLabel={playbackRate !== 1.0 ? `${playbackRate}x` : undefined}>
            <Gauge color="white" size={24} />
          </MediaButton>

          <MediaButton onPress={onOpenSourceSwitcher} timeLabel={`SRC${availableSourceCount}`}>
            <Tv color="white" size={24} />
          </MediaButton>

          <MediaButton
            onPress={onSwitchPlaybackBackend}
            timeLabel={playerBackend === "system" ? "SYS" : playerBackend === "soft" ? "软" : "硬"}
          >
            <Cpu color="white" size={24} />
          </MediaButton>

          <MediaButton onPress={onOpenExternalPlayer}>
            <ExternalLink color="white" size={24} />
          </MediaButton>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  controlsOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    justifyContent: "space-between",
    padding: 20,
  },
  topControls: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  controlTitle: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
    flex: 1,
    textAlign: "center",
    marginHorizontal: 10,
  },
  bottomControlsContainer: {
    width: "100%",
    alignItems: "center",
  },
  bottomControls: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
    marginTop: 15,
  },
  progressBarContainer: {
    width: "100%",
    height: 8,
    position: "relative",
    marginTop: 10,
  },
  progressBarBackground: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 8,
    backgroundColor: "rgba(255, 255, 255, 0.3)",
    borderRadius: 4,
  },
  progressBarFilled: {
    position: "absolute",
    left: 0,
    height: 8,
    backgroundColor: "#fff",
    borderRadius: 4,
  },
});
