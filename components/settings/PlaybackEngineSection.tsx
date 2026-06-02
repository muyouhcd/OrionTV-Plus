import React from "react";
import { View, StyleSheet } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { SettingsSection } from "./SettingsSection";
import { StyledButton } from "@/components/StyledButton";
import { PlayerBackend, useSettingsStore } from "@/stores/settingsStore";
import Toast from "react-native-toast-message";

interface PlaybackEngineSectionProps {
  onChanged: () => void;
}

export const PlaybackEngineSection: React.FC<PlaybackEngineSectionProps> = ({ onChanged }) => {
  const { playerBackend, setAndSavePlayerBackend } = useSettingsStore();

  const getBackendName = (backend: PlayerBackend) => {
    if (backend === "system") return "System Player";
    return backend === "soft" ? "软解" : "硬解";
  };

  const setBackend = async (backend: PlayerBackend) => {
    await setAndSavePlayerBackend(backend);
    onChanged();
    Toast.show({
      type: "success",
      text1: `已切换到 ${getBackendName(backend)}`,
      text2: "进入播放页可看到当前内核状态",
    });
  };

  return (
    <SettingsSection>
      <ThemedText style={styles.title}>播放器内核</ThemedText>
      <ThemedText style={styles.subtitle}>
        当前: {getBackendName(playerBackend)}
      </ThemedText>
      <View style={styles.row}>
        <StyledButton
          text="硬解 (ExoPlayer)"
          variant={playerBackend === "hard" ? "primary" : "default"}
          onPress={() => setBackend("hard")}
          style={styles.button}
        />
        <StyledButton
          text="软解 (MediaPlayer)"
          variant={playerBackend === "soft" ? "primary" : "default"}
          onPress={() => setBackend("soft")}
          style={styles.button}
        />
        <StyledButton
          text="系统播放器"
          variant={playerBackend === "system" ? "primary" : "default"}
          onPress={() => setBackend("system")}
          style={styles.button}
        />
      </View>
    </SettingsSection>
  );
};

const styles = StyleSheet.create({
  title: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 12,
    color: "#999",
    marginBottom: 12,
    lineHeight: 18,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  button: {
    minWidth: 160,
  },
});
