import React from "react";
import { View, Text, StyleSheet, Modal, FlatList } from "react-native";
import Toast from "react-native-toast-message";
import { StyledButton } from "./StyledButton";
import useDetailStore from "@/stores/detailStore";
import usePlayerStore from "@/stores/playerStore";
import Logger from "@/utils/Logger";

const logger = Logger.withTag("SourceSelectionModal");

export const SourceSelectionModal: React.FC = () => {
  const { showSourceModal, setShowSourceModal, loadVideo, currentEpisodeIndex, status } = usePlayerStore();
  const { searchResults, detail, setDetail } = useDetailStore();

  const availableSources = (searchResults || []).filter(
    (item) => item?.source && item.episodes && item.episodes.length > currentEpisodeIndex
  );

  const onSelectSource = (index: number) => {
    const target = availableSources[index];
    if (!target) return;

    logger.debug("onSelectSource", index, target.source, detail?.source);

    if (target.source !== detail?.source) {
      setDetail(target);

      const currentPosition = status?.isLoaded ? status.positionMillis : undefined;
      loadVideo({
        source: target.source,
        id: target.id.toString(),
        episodeIndex: currentEpisodeIndex,
        title: target.title,
        position: currentPosition,
      });

      Toast.show({
        type: "success",
        text1: `已切换播放源：${target.source_name}`,
        text2: "正在保留进度并重新加载",
      });
    }

    setShowSourceModal(false);
  };

  return (
    <Modal visible={showSourceModal} transparent animationType="slide" onRequestClose={() => setShowSourceModal(false)}>
      <View style={styles.modalContainer}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>选择播放源</Text>
          <FlatList
            data={availableSources}
            numColumns={3}
            contentContainerStyle={styles.sourceList}
            keyExtractor={(item, index) => `source-${item.source}-${index}`}
            ListEmptyComponent={<Text style={styles.emptyText}>当前剧集没有可切换的播放源</Text>}
            renderItem={({ item, index }) => (
              <StyledButton
                text={item.source_name}
                onPress={() => onSelectSource(index)}
                isSelected={detail?.source === item.source}
                hasTVPreferredFocus={detail?.source === item.source}
                style={styles.sourceItem}
                textStyle={styles.sourceItemText}
              />
            )}
          />
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "flex-end",
    backgroundColor: "transparent",
  },
  modalContent: {
    width: 600,
    height: "100%",
    backgroundColor: "rgba(0, 0, 0, 0.85)",
    padding: 20,
  },
  modalTitle: {
    color: "white",
    marginBottom: 12,
    textAlign: "center",
    fontSize: 18,
    fontWeight: "bold",
  },
  sourceList: {
    justifyContent: "flex-start",
  },
  sourceItem: {
    paddingVertical: 2,
    margin: 4,
    marginLeft: 10,
    marginRight: 8,
    width: "30%",
  },
  sourceItemText: {
    fontSize: 14,
  },
  emptyText: {
    color: "#bbb",
    fontSize: 14,
    textAlign: "center",
    marginTop: 24,
  },
});