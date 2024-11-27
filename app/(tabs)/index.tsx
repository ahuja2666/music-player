import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from "react-native";
import Slider from "@react-native-community/slider";
import * as MediaLibrary from "expo-media-library";
import { Audio } from "expo-av";
import * as Notifications from "expo-notifications";

const App = () => {
  const [musicFiles, setMusicFiles] = useState<MediaLibrary.Asset[]>([]);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTrack, setCurrentTrack] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(0);
  const [sliderValue, setSliderValue] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);

  useEffect(() => {
    const initialize = async () => {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status === "granted") {
        fetchMusicFiles();
      } else {
        Alert.alert(
          "Permission Denied",
          "We need access to your media files to proceed."
        );
      }

      // Request permissions for notifications
      await Notifications.requestPermissionsAsync();

      // Set up notification category and actions
      await Notifications.setNotificationCategoryAsync("music-controls", [
        {
          actionId: "play-pause",
          buttonTitle: "Play/Pause",
          isDestructive: false,
        },
      ]);
    };

    initialize();

    return () => {
      if (sound) {
        sound.unloadAsync();
      }
    };
  }, []);

  const fetchMusicFiles = async () => {
    try {
      const media = await MediaLibrary.getAssetsAsync({
        mediaType: MediaLibrary.MediaType.audio,
      });
      setMusicFiles(media.assets);
    } catch (err) {
      console.error("Error fetching music files:", err);
    }
  };

  const playAudio = async (uri: string, filename: string) => {
    if (sound) {
      await sound.unloadAsync();
    }
    const { sound: newSound } = await Audio.Sound.createAsync({ uri });
    setSound(newSound);
    setCurrentTrack(filename);
    setIsPlaying(true);

    newSound.setOnPlaybackStatusUpdate(updatePlaybackStatus);

    await newSound.playAsync();

    // Send notification with play/pause controls
    sendNotification("Play", filename);
  };

  const updatePlaybackStatus = (status: Audio.AVPlaybackStatus) => {
    if (status.isLoaded) {
      setCurrentTime(status.positionMillis || 0);
      setTotalDuration(status.durationMillis || 0);
      setSliderValue(status.positionMillis / (status.durationMillis || 1));
      setIsPlaying(status.isPlaying);
    }
  };

  const sendNotification = async (action: string, trackName: string) => {
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: action === "Play" ? `Now Playing: ${trackName}` : "Music Paused",
        body: action === "Play" ? "Tap to pause" : "Tap to resume",
        sound: true,
        categoryId: "music-controls", // Define categoryId for interactive actions
      },
      trigger: null, // Trigger immediately
    });

    if (action === "Play") {
      setupNotificationListener(notificationId);
    }
  };

  const setupNotificationListener = (notificationId: string) => {
    Notifications.setNotificationHandler({
      handleNotification: async (notification) => {
        const action = notification.request.content.body;

        // Handle play/pause interaction from notification
        if (action === "Tap to pause") {
          await togglePlayPause();
        } else if (action === "Tap to resume") {
          await togglePlayPause();
        }

        // Return null as no NotificationBehavior is needed
        return;
      },
    });
  };

  const togglePlayPause = async () => {
    if (sound) {
      if (isPlaying) {
        await sound.pauseAsync();
        sendNotification("Pause", currentTrack || "");
      } else {
        await sound.playAsync();
        sendNotification("Play", currentTrack || "");
      }
      setIsPlaying(!isPlaying);
    }
  };

  const stopPlayback = async () => {
    if (sound) {
      await sound.stopAsync();
      setIsPlaying(false);
      setCurrentTrack(null);
      setCurrentTime(0);
      setTotalDuration(0);
      setSliderValue(0);
      sendNotification("Stop", currentTrack || "");
    }
  };

  const formatTime = (milliseconds: number) => {
    const minutes = Math.floor(milliseconds / 60000);
    const seconds = Math.floor((milliseconds % 60000) / 1000);
    return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
  };

  const onSliderValueChange = async (value: number) => {
    setSliderValue(value);
    setIsSeeking(true);
  };

  const onSlidingComplete = async (value: number) => {
    if (sound) {
      const newPosition = Math.floor(value * totalDuration);
      await sound.setPositionAsync(newPosition);
      setCurrentTime(newPosition);
    }
    setIsSeeking(false);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Music Player</Text>

      {/* Display Currently Playing Track */}
      {currentTrack && (
        <View style={styles.currentTrack}>
          <Text style={styles.currentTrackText}>{currentTrack}</Text>
          <Text style={styles.timeText}>
            {formatTime(currentTime)} / {formatTime(totalDuration)}
          </Text>

          {/* Progress Bar */}
          <Slider
            style={styles.slider}
            minimumValue={0}
            maximumValue={1}
            value={sliderValue}
            minimumTrackTintColor="#1DB954"
            maximumTrackTintColor="#ccc"
            thumbTintColor="#1DB954"
            onValueChange={onSliderValueChange}
            onSlidingComplete={onSlidingComplete}
          />

          <View style={styles.controls}>
            <TouchableOpacity
              onPress={togglePlayPause}
              style={styles.controlButton}
            >
              <Text style={styles.controlText}>
                {isPlaying ? "Pause" : "Play"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={stopPlayback}
              style={styles.controlButton}
            >
              <Text style={styles.controlText}>Stop</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Music Files List */}
      <FlatList
        data={musicFiles}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.item}
            onPress={() => playAudio(item.uri, item.filename)}
          >
            <Text style={styles.text}>{item.filename}</Text>
            <Text style={styles.playText}>Play</Text>
          </TouchableOpacity>
        )}
      />

      {/* Message if No Music */}
      {musicFiles.length === 0 && (
        <Text style={styles.noMusicText}>No music files found.</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 20,
  },
  currentTrack: {
    marginBottom: 20,
    padding: 15,
    backgroundColor: "#fff",
    borderRadius: 5,
    elevation: 2,
  },
  currentTrackText: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 10,
  },
  timeText: {
    fontSize: 16,
    color: "#555",
    marginBottom: 10,
  },
  slider: {
    width: "100%",
    height: 40,
  },
  controls: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  controlButton: {
    padding: 10,
    backgroundColor: "#007BFF",
    borderRadius: 5,
  },
  controlText: {
    color: "#fff",
    fontWeight: "bold",
  },
  item: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 15,
    backgroundColor: "#fff",
    borderRadius: 5,
    marginBottom: 10,
    elevation: 2,
  },
  text: {
    fontSize: 18,
    flex: 1,
  },
  playText: {
    fontSize: 18,
    color: "#007BFF",
    fontWeight: "bold",
  },
  noMusicText: {
    fontSize: 16,
    color: "#888",
    textAlign: "center",
    marginTop: 50,
  },
});

export default App;
