import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
  ActivityIndicator,
  Image,
} from 'react-native';
import { colors } from '../lib/theme';
import { portraitFor } from '../lib/characters';

/**
 * Free real-looking 3D person via Ready Player Me GLB URL.
 * Loads remote https://models.readyplayer.me/….glb — not DIY blobs or pack swaps.
 *
 * Fallback: painted portrait if no avatarUrl (or load error).
 */
export default function Character3D({
  avatarUrl = null,
  gender = 'boy',
  tier = 0,
  size = 340,
  style,
}) {
  const hostRef = useRef(null);
  const cleanupRef = useRef(null);
  const [status, setStatus] = useState(
    Platform.OS === 'web' && avatarUrl ? 'loading' : 'ready'
  );
  const portrait = portraitFor(gender, tier);

  useEffect(() => {
    if (Platform.OS !== 'web' || !avatarUrl) {
      setStatus('ready');
      return undefined;
    }
    let dead = false;
    setStatus('loading');

    (async () => {
      try {
        const THREE = await import('three');
        const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
        if (dead || !hostRef.current) return;

        const el = hostRef.current;
        while (el.firstChild) el.removeChild(el.firstChild);

        const width = size;
        const height = Math.round(size * 1.28);
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(28, width / height, 0.05, 80);

        const renderer = new THREE.WebGLRenderer({
          antialias: true,
          alpha: true,
          powerPreference: 'high-performance',
        });
        renderer.setSize(width, height);
        renderer.setPixelRatio(
          Math.min(typeof window !== 'undefined' ? window.devicePixelRatio : 1, 2)
        );
        renderer.setClearColor(0x000000, 0);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        if (renderer.toneMapping !== undefined) {
          renderer.toneMapping = THREE.ACESFilmicToneMapping;
          renderer.toneMappingExposure = 1.15;
        }
        el.appendChild(renderer.domElement);
        const canvas = renderer.domElement;
        canvas.style.cssText = `display:block;margin:0 auto;touch-action:none;cursor:grab;width:${width}px;height:${height}px`;

        scene.add(new THREE.AmbientLight(0xfff4e8, 0.55));
        const key = new THREE.DirectionalLight(0xffe8c8, 1.5);
        key.position.set(2.5, 5.5, 3.5);
        scene.add(key);
        const fill = new THREE.DirectionalLight(0xb8d0ff, 0.45);
        fill.position.set(-3, 2, 1.5);
        scene.add(fill);
        const rim = new THREE.DirectionalLight(0xffb060, 0.55);
        rim.position.set(-1.2, 3, -3.5);
        scene.add(rim);

        const disc = new THREE.Mesh(
          new THREE.CylinderGeometry(0.65, 0.75, 0.07, 40),
          new THREE.MeshStandardMaterial({
            color: 0x1a0f2e,
            metalness: 0.4,
            roughness: 0.45,
            emissive: 0x3b1d6e,
            emissiveIntensity: 0.28,
          })
        );
        scene.add(disc);
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(0.7, 0.035, 8, 48),
          new THREE.MeshStandardMaterial({
            color: 0xfbbf24,
            metalness: 0.85,
            roughness: 0.25,
            emissive: 0xf59e0b,
            emissiveIntensity: 0.12,
          })
        );
        ring.rotation.x = Math.PI / 2;
        ring.position.y = 0.045;
        scene.add(ring);

        const root = new THREE.Group();
        scene.add(root);

        // Ready Player Me CDN — often needs morphTargets / textureAtlas query
        let url = avatarUrl;
        if (!url.includes('?')) {
          url = `${url}?morphTargets=ARKit&textureAtlas=1024`;
        }

        const gltf = await new Promise((resolve, reject) => {
          new GLTFLoader().load(url, resolve, undefined, reject);
        });
        if (dead) return;

        const model = gltf.scene;
        model.traverse((o) => {
          if (!o.isMesh) return;
          o.castShadow = true;
          if (o.material?.map) {
            o.material.map.colorSpace = THREE.SRGBColorSpace;
            o.material.needsUpdate = true;
          }
        });

        model.updateMatrixWorld(true);
        const box0 = new THREE.Box3().setFromObject(model);
        const size0 = new THREE.Vector3();
        box0.getSize(size0);
        const scale = 1.85 / Math.max(size0.y, 0.01);
        model.scale.setScalar(scale);
        model.updateMatrixWorld(true);
        const box1 = new THREE.Box3().setFromObject(model);
        const c1 = new THREE.Vector3();
        box1.getCenter(c1);
        model.position.set(-c1.x, -box1.min.y + 0.04, -c1.z);
        root.add(model);

        // Idle if present
        let mixer = null;
        if (gltf.animations?.length) {
          mixer = new THREE.AnimationMixer(model);
          const idle =
            gltf.animations.find((c) => /idle/i.test(c.name)) || gltf.animations[0];
          mixer.clipAction(idle).play();
        }

        root.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(root);
        const sz = new THREE.Vector3();
        box.getSize(sz);
        const center = new THREE.Vector3();
        box.getCenter(center);
        const fitH = Math.max(sz.y * 1.15, 0.5);
        const vFov = (camera.fov * Math.PI) / 180;
        const dist = ((fitH / 2) / Math.tan(vFov / 2)) * 1.08;
        camera.position.set(0, center.y, dist);
        camera.lookAt(0, center.y, 0);
        camera.updateProjectionMatrix();

        let auto = true;
        let dragging = false;
        let lastX = 0;
        let vel = 0;
        const clock = new THREE.Clock();

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
          vel = dx * 0.014;
          root.rotation.y += vel;
        };
        const onUp = () => {
          dragging = false;
          canvas.style.cursor = 'grab';
          setTimeout(() => {
            if (!dragging) auto = true;
          }, 1200);
        };
        canvas.addEventListener('pointerdown', onDown);
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);

        let raf;
        const animate = () => {
          raf = requestAnimationFrame(animate);
          const dt = clock.getDelta();
          if (mixer) mixer.update(dt);
          if (auto && !dragging) root.rotation.y += 0.008;
          else if (!dragging && Math.abs(vel) > 0.0003) {
            root.rotation.y += vel;
            vel *= 0.93;
          }
          root.position.y = Math.sin(performance.now() / 800) * 0.012;
          ring.rotation.z += 0.003;
          renderer.render(scene, camera);
        };
        animate();
        if (!dead) setStatus('ready');

        cleanupRef.current = () => {
          cancelAnimationFrame(raf);
          canvas.removeEventListener('pointerdown', onDown);
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
          mixer?.stopAllAction();
          model.traverse((o) => {
            o.geometry?.dispose?.();
            if (o.material) {
              const mats = Array.isArray(o.material) ? o.material : [o.material];
              mats.forEach((m) => m?.dispose?.());
            }
          });
          renderer.dispose();
          if (el.contains(canvas)) el.removeChild(canvas);
        };
      } catch (e) {
        console.error('[Character3D RPM]', e);
        if (!dead) setStatus('error');
      }
    })();

    return () => {
      dead = true;
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [avatarUrl, size]);

  const h = Math.round(size * 1.28);

  // No RPM avatar → sharp painted hero (no muddy mesh)
  if (!avatarUrl || Platform.OS !== 'web' || status === 'error') {
    return (
      <View style={[styles.wrap, { width: size, height: h + 36 }, style]}>
        <Image
          source={portrait}
          style={{ width: size, height: h }}
          resizeMode="contain"
        />
        <Text style={styles.hint}>
          {status === 'error'
            ? 'Avatar failed · painted hero'
            : Platform.OS !== 'web'
              ? 'Open web for free 3D avatar'
              : 'Your hero'}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.wrap, { width: size, height: h + 36 }, style]}>
      <View ref={hostRef} style={{ width: size, height: h }} collapsable={false} />
      {status === 'loading' ? (
        <View style={[styles.overlay, { height: h }]} pointerEvents="none">
          <ActivityIndicator color={colors.gold} size="large" />
          <Text style={styles.load}>Loading free 3D avatar…</Text>
        </View>
      ) : null}
      <Text style={styles.hint}>
        {status === 'ready' ? 'Drag to spin · Ready Player Me' : ' '}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', backgroundColor: 'transparent' },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  load: { color: colors.gold, fontWeight: '800', marginTop: 8 },
  hint: { marginTop: 6, color: colors.muted, fontSize: 12, fontWeight: '700', minHeight: 18 },
});
