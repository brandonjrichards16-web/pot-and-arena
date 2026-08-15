import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet } from 'react-native';
import { colors } from '../lib/theme';
import MatchWatcher from '../components/MatchWatcher';

export default function RootLayout() {
  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <MatchWatcher />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#140820' },
          headerTintColor: colors.gold,
          headerTitleStyle: { fontWeight: '900' },
          contentStyle: { backgroundColor: colors.bg },
          headerShadowVisible: false,
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="character" options={{ headerShown: false }} />
        <Stack.Screen name="play-session" options={{ headerShown: false }} />
        <Stack.Screen name="create-pit" options={{ headerShown: false }} />
        {/* In-screen BackToLobby chrome — hide stack header to avoid black circle scrap */}
        <Stack.Screen name="upgrade" options={{ headerShown: false }} />
        <Stack.Screen name="play-random" options={{ headerShown: false }} />
        <Stack.Screen name="play-pvp" options={{ headerShown: false }} />
        <Stack.Screen name="betting" options={{ headerShown: false }} />
        <Stack.Screen name="room/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="leaderboards" options={{ headerShown: false }} />
        <Stack.Screen name="fighter" options={{ headerShown: false }} />
        <Stack.Screen name="heroes" options={{ headerShown: false }} />
        <Stack.Screen name="invite" options={{ headerShown: false }} />
        <Stack.Screen name="clans" options={{ headerShown: false }} />
        <Stack.Screen name="results/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="campaign" options={{ headerShown: false }} />
        <Stack.Screen name="store" options={{ headerShown: false }} />
      </Stack>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
});
