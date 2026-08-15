import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
  ActivityIndicator,
  Image,
} from 'react-native';
import { Asset } from 'expo-asset';
import { colors } from '../lib/theme';
import { turnFramesFor, portraitFor } from '../lib/characters';

/**
 * WebGL 3D stage: your painted hero as multi-angle impostor.
 * Plane sits in a lit 3D scene; yaw spins; texture swaps to the matching camera angle.
 * ONE visible figure — no stacked 2D layers under the nameplate.
 */
export default function MultiViewHero({ gender = 'boy', tier = 0, size = 340, style }) {
  const hostRef = useRef(null);
  const cleanupRef = useRef(null);
  const [status, setStatus] = useState(Platform.OS === 'web' ? 'loading' : 'ready');
  const [viewLabel, setViewLabel] = useState('1/1');
  const frames = turnFramesFor(gender, tier);
  const fallback = portraitFor(gender, tier);

  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    let dead = false;
    setStatus('loading');

    (async () => {
      try {
        const THREE = await import('three');
        if (dead || !hostRef.current) return;

        const el = hostRef.current;
        while (el.firstChild) el.removeChild(el.firstChild);

        const width = size;
        const height = Math.round(size * 1.2);
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(32, width / height, 0.1, 40);
        camera.position.set(0, 1.05, 3.4);
        camera.lookAt(0, 0.95, 0);

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(width, height);
        renderer.setPixelRatio(
          Math.min(typeof window !== 'undefined' ? window.devicePixelRatio : 1, 2)
        );
        renderer.setClearColor(0x000000, 0);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        el.appendChild(renderer.domElement);
        const canvas = renderer.domElement;
        canvas.style.display = 'block';
        canvas.style.margin = '0 auto';
        canvas.style.touchAction = 'none';
        canvas.style.cursor = 'grab';
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;

        scene.add(new THREE.AmbientLight(0xfff0e0, 0.85));
        const key = new THREE.DirectionalLight(0xffe0b0, 1.25);
        key.position.set(2.5, 5, 3);
        scene.add(key);
        const rim = new THREE.DirectionalLight(0xa78bfa, 0.4);
        rim.position.set(-3, 2, -2);
        scene.add(rim);

        // Pedestal only — no second character
        const disc = new THREE.Mesh(
          new THREE.CylinderGeometry(0.75, 0.85, 0.08, 40),
          new THREE.MeshStandardMaterial({
            color: 0x140a24,
            metalness: 0.35,
            roughness: 0.5,
            emissive: 0x3b1d6e,
            emissiveIntensity: 0.25,
          })
        );
        scene.add(disc);
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(0.8, 0.035, 8, 48),
          new THREE.MeshStandardMaterial({
            color: 0xfbbf24,
            metalness: 0.8,
            roughness: 0.28,
            emissive: 0xf59e0b,
            emissiveIntensity: 0.12,
          })
        );
        ring.rotation.x = Math.PI / 2;
        ring.position.y = 0.05;
        scene.add(ring);

        // Load every turn angle as a texture
        const mods = frames.length ? frames : [fallback];
        const textures = [];
        for (const mod of mods) {
          const asset = Asset.fromModule(mod);
          await asset.downloadAsync();
          let url = asset.localUri || asset.uri;
          if (!url) throw new Error('Missing frame URI');
          if (typeof window !== 'undefined' && url.startsWith('/')) {
            url = window.location.origin + url;
          }
          const tex = await new Promise((resolve, reject) => {
            new THREE.TextureLoader().load(url, resolve, undefined, reject);
          });
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = 8;
          textures.push(tex);
        }
        if (dead) return;

        const n = textures.length;
        const mat = new THREE.MeshStandardMaterial({
          map: textures[0],
          transparent: true,
          roughness: 0.55,
          metalness: 0.02,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
        // Tall plane = full body
        const plane = new THREE.Mesh(new THREE.PlaneGeometry(1.55, 2.15), mat);
        plane.position.y = 1.15;

        const root = new THREE.Group();
        root.add(plane);
        scene.add(root);

        // Multi-angle: swap texture by yaw (real sides of the same hero).
        // Single-frame fallback: slowly spin the plane in 3D so it's not a dead poster.
        let yaw = 0;
        let auto = true;
        let dragging = false;
        let lastX = 0;
        let vel = 0;

        const frameFromYaw = (y) => {
          if (n <= 1) return 0;
          let a = ((y % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
          return Math.floor((a / (Math.PI * 2)) * n + 0.5) % n;
        };

        let lastIdx = -1;
        const applyFrame = () => {
          const idx = frameFromYaw(yaw);
          if (idx !== lastIdx) {
            lastIdx = idx;
            mat.map = textures[idx];
            mat.needsUpdate = true;
            if (!dead) setViewLabel(`${idx + 1}/${n}`);
          }
        };
        applyFrame();
        if (!dead) setViewLabel(n > 1 ? `1/${n}` : 'spin');

        const onDown = (e) => {
          dragging = true;
          auto = false;
          lastX = e.clientX;
          canvas.style.cursor = 'grabbing';
          e.preventDefault();
        };
        const onMove = (e) => {
          if (!dragging) return;
          const dx = e.clientX - lastX;
          lastX = e.clientX;
          vel = -dx * 0.014;
          yaw += vel;
          if (n > 1) applyFrame();
          else plane.rotation.y = yaw;
        };
        const onUp = () => {
          dragging = false;
          canvas.style.cursor = 'grab';
          setTimeout(() => {
            if (!dragging) auto = true;
          }, 800);
        };
        canvas.addEventListener('pointerdown', onDown);
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);

        let raf;
        const animate = () => {
          raf = requestAnimationFrame(animate);
          if (auto && !dragging) {
            yaw += n > 1 ? 0.022 : 0.012;
            if (n > 1) {
              // Impostor: plane faces camera, texture walks around the body
              plane.rotation.y = 0;
              applyFrame();
            } else {
              // Single art: real 3D spin of the plane on the pedestal
              plane.rotation.y = yaw;
            }
          } else if (!dragging && Math.abs(vel) > 0.0004) {
            yaw += vel;
            vel *= 0.93;
            if (n > 1) applyFrame();
            else plane.rotation.y = yaw;
          }
          root.position.y = Math.sin(performance.now() / 700) * 0.02;
          ring.rotation.z += 0.004;
          renderer.render(scene, camera);
        };
        animate();
        if (!dead) setStatus('ready');

        cleanupRef.current = () => {
          cancelAnimationFrame(raf);
          canvas.removeEventListener('pointerdown', onDown);
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
          textures.forEach((t) => t.dispose());
          mat.dispose();
          plane.geometry.dispose();
          renderer.dispose();
          if (el.contains(canvas)) el.removeChild(canvas);
        };
      } catch (e) {
        console.error('[MultiViewHero]', e);
        if (!dead) setStatus('error');
      }
    })();

    return () => {
      dead = true;
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [gender, tier, size]);

  const h = Math.round(size * 1.2);

  if (Platform.OS !== 'web') {
    return (
      <View style={[styles.wrap, { width: size, height: h + 36 }, style]}>
        <Image source={fallback} style={{ width: size, height: h }} resizeMode="contain" />
      </View>
    );
  }

  return (
    <View style={[styles.wrap, { width: size, height: h + 40 }, style]}>
      {/* Only WebGL host — no extra Image behind/under */}
      <View ref={hostRef} style={{ width: size, height: h }} collapsable={false} />
      {status === 'loading' ? (
        <View style={[styles.overlay, { height: h }]} pointerEvents="none">
          <ActivityIndicator color={colors.gold} size="large" />
          <Text style={styles.loadText}>Building 3D hero…</Text>
        </View>
      ) : null}
      {status === 'error' ? (
        <View style={[styles.overlay, { height: h }]} pointerEvents="none">
          <Text style={styles.err}>Could not load 3D stage</Text>
        </View>
      ) : null}
      <Text style={styles.hint}>
        {status === 'ready' ? `Drag to orbit · angle ${viewLabel}` : ' '}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'flex-start', backgroundColor: 'transparent' },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadText: { color: colors.gold, fontWeight: '800', marginTop: 8, fontSize: 13 },
  err: { color: '#f87171', fontWeight: '700' },
  hint: {
    marginTop: 6,
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    minHeight: 18,
  },
});
