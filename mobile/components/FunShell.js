import { useEffect, useRef } from 'react';
import {
  View,
  ImageBackground,
  StyleSheet,
  Animated,
  Dimensions,
  StatusBar,
} from 'react-native';
import { colors } from '../lib/theme';

const { width, height } = Dimensions.get('window');

/**
 * Game lobby shell: layered world bg + floating sparkles + vignette.
 * This is what stops the app feeling like a SaaS dashboard.
 */
export default function FunShell({ children, dim = false }) {
  const sparks = useRef(
    [...Array(14)].map(() => ({
      x: Math.random() * width,
      y: Math.random() * height,
      s: 3 + Math.random() * 5,
      a: new Animated.Value(Math.random()),
      dy: new Animated.Value(0),
    }))
  ).current;

  useEffect(() => {
    sparks.forEach((sp, i) => {
      const loop = () => {
        sp.a.setValue(0.15);
        sp.dy.setValue(0);
        Animated.parallel([
          Animated.sequence([
            Animated.timing(sp.a, {
              toValue: 0.9,
              duration: 900 + i * 40,
              useNativeDriver: true,
            }),
            Animated.timing(sp.a, {
              toValue: 0.1,
              duration: 1100 + i * 30,
              useNativeDriver: true,
            }),
          ]),
          Animated.timing(sp.dy, {
            toValue: -40 - Math.random() * 50,
            duration: 2200 + i * 50,
            useNativeDriver: true,
          }),
        ]).start(() => loop());
      };
      const t = setTimeout(loop, i * 120);
      return () => clearTimeout(t);
    });
  }, []);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <ImageBackground
        source={require('../assets/bg/lobby.jpg')}
        style={styles.bg}
        resizeMode="cover"
      >
        {/* Warm grade + depth */}
        <View style={styles.gradeTop} />
        <View style={styles.gradeBot} />
        {dim ? <View style={styles.dim} /> : null}

        {sparks.map((sp, i) => (
          <Animated.View
            key={i}
            pointerEvents="none"
            style={[
              styles.spark,
              {
                left: sp.x,
                top: sp.y,
                width: sp.s,
                height: sp.s,
                borderRadius: sp.s,
                opacity: sp.a,
                transform: [{ translateY: sp.dy }],
              },
            ]}
          />
        ))}

        <View style={styles.content}>{children}</View>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  bg: { flex: 1, width: '100%', height: '100%' },
  gradeTop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(76, 29, 149, 0.25)',
  },
  gradeBot: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '45%',
    backgroundColor: 'rgba(15, 6, 25, 0.55)',
  },
  dim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10, 5, 20, 0.45)',
  },
  spark: {
    position: 'absolute',
    backgroundColor: '#fde68a',
    shadowColor: '#fbbf24',
    shadowOpacity: 0.9,
    shadowRadius: 6,
  },
  content: { flex: 1 },
});
