import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Image,
  PanResponder,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTheme, type AppColors } from '../lib/theme';
import { Theme } from '../constants/theme';
import { Icon } from './Icon';

// expo-image-picker's allowsEditing/aspect options only work on native —
// they trigger the OS's own crop UI there. On web they're silently a
// no-op, so the raw, unedited image was being uploaded as-is and just
// force-fit into whatever aspect ratio the banner/logo container used,
// with no way to choose what actually shows. This is the web-only
// stand-in: drag to reposition, +/- to zoom, then rasterize exactly the
// visible region onto an off-screen canvas at export time.
const VIEWPORT_WIDTH = 320;

type Props = {
  visible: boolean;
  imageUri: string | null;
  aspectRatio: number; // width / height, e.g. 1 for a logo, 3 for a banner
  outputWidth: number;
  onCancel: () => void;
  onCropped: (blob: Blob) => void;
};

export default function ImageCropModal({ visible, imageUri, aspectRatio, outputWidth, onCancel, onCropped }: Props) {
  const { colors: C } = useTheme();
  const styles = makeStyles(C);

  const viewportHeight = VIEWPORT_WIDTH / aspectRatio;
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [processing, setProcessing] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const offsetStart = useRef({ x: 0, y: 0 });

  // RN Web's <Image> onLoad event doesn't reliably populate
  // source.width/height the way native does, so this reads natural
  // size directly from a real browser Image object instead — the same
  // approach the canvas export step below already needs anyway.
  useEffect(() => {
    if (!visible || !imageUri || Platform.OS !== 'web') { setNaturalSize(null); return; }
    setScale(1);
    setOffset({ x: 0, y: 0 });
    const img = new (window as any).Image();
    img.onload = () => setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = imageUri;
  }, [visible, imageUri]);

  // Base size: the smallest scale that still fully covers the viewport
  // (same idea as CSS background-size: cover), before the user's own
  // zoom is applied on top.
  const baseSize = useMemo(() => {
    if (!naturalSize) return { w: VIEWPORT_WIDTH, h: viewportHeight };
    const imgAspect = naturalSize.w / naturalSize.h;
    const viewportAspect = VIEWPORT_WIDTH / viewportHeight;
    if (imgAspect > viewportAspect) {
      return { w: viewportHeight * imgAspect, h: viewportHeight };
    }
    return { w: VIEWPORT_WIDTH, h: VIEWPORT_WIDTH / imgAspect };
  }, [naturalSize, viewportHeight]);

  const displayW = baseSize.w * scale;
  const displayH = baseSize.h * scale;

  function clampOffset(x: number, y: number, w = displayW, h = displayH) {
    const maxX = Math.max(0, (w - VIEWPORT_WIDTH) / 2);
    const maxY = Math.max(0, (h - viewportHeight) / 2);
    return { x: Math.min(maxX, Math.max(-maxX, x)), y: Math.min(maxY, Math.max(-maxY, y)) };
  }

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        dragStart.current = { x: 0, y: 0 };
        offsetStart.current = offset;
      },
      onPanResponderMove: (_e, gesture) => {
        const next = clampOffset(offsetStart.current.x + gesture.dx, offsetStart.current.y + gesture.dy);
        setOffset(next);
      },
    })
  ).current;

  function zoom(delta: number) {
    setScale(prev => {
      const next = Math.min(3, Math.max(1, prev + delta));
      setOffset(o => clampOffset(o.x, o.y, baseSize.w * next, baseSize.h * next));
      return next;
    });
  }

  async function handleUsePhoto() {
    if (!imageUri || !naturalSize || Platform.OS !== 'web') return;
    setProcessing(true);
    try {
      // Map the visible viewport rectangle back to source-image pixel
      // coordinates: displayW/H is naturalSize scaled up to cover the
      // viewport at the current zoom, so this is just that same ratio
      // inverted, offset by however far the image has been dragged.
      const ratio = naturalSize.w / displayW;
      const sx = (displayW / 2 - VIEWPORT_WIDTH / 2 - offset.x) * ratio;
      const sy = (displayH / 2 - viewportHeight / 2 - offset.y) * ratio;
      const sw = VIEWPORT_WIDTH * ratio;
      const sh = viewportHeight * ratio;

      const img = new (window as any).Image();
      img.crossOrigin = 'anonymous';
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Could not load image'));
        img.src = imageUri;
      });

      const canvas = document.createElement('canvas');
      canvas.width = outputWidth;
      canvas.height = outputWidth / aspectRatio;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas unavailable');
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(
        blob => {
          setProcessing(false);
          if (blob) onCropped(blob);
        },
        'image/jpeg',
        0.9
      );
    } catch (e) {
      setProcessing(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Reposition Photo</Text>
          <Text style={styles.sub}>Drag to move, use +/- to zoom</Text>

          <View style={[styles.viewport, { width: VIEWPORT_WIDTH, height: viewportHeight }]} {...panResponder.panHandlers}>
            {imageUri && (
              <Image
                source={{ uri: imageUri }}
                style={{
                  position: 'absolute',
                  width: displayW,
                  height: displayH,
                  left: VIEWPORT_WIDTH / 2 - displayW / 2 + offset.x,
                  top: viewportHeight / 2 - displayH / 2 + offset.y,
                }}
                resizeMode="cover"
              />
            )}
          </View>

          <View style={styles.zoomRow}>
            <TouchableOpacity style={styles.zoomBtn} onPress={() => zoom(-0.2)}>
              <Icon name="remove" size={16} color={C.text} />
            </TouchableOpacity>
            <Text style={styles.zoomLabel}>Zoom</Text>
            <TouchableOpacity style={styles.zoomBtn} onPress={() => zoom(0.2)}>
              <Icon name="add" size={16} color={C.text} />
            </TouchableOpacity>
          </View>

          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onCancel} disabled={processing}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.confirmBtn} onPress={handleUsePhoto} disabled={processing || !naturalSize}>
              {processing ? <ActivityIndicator color={C.black} size="small" /> : <Text style={styles.confirmBtnText}>Use Photo</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', padding: 20 },
    card: {
      backgroundColor: C.surface, borderRadius: Theme.radius.xl, padding: Theme.spacing.lg,
      borderWidth: 0.5, borderColor: C.border2, maxWidth: 380, width: '100%',
    },
    title: { fontSize: 16, fontWeight: '800', color: C.text, textAlign: 'center', marginBottom: 2 },
    sub: { fontSize: 12, color: C.text3, textAlign: 'center', marginBottom: 14 },
    viewport: {
      alignSelf: 'center', backgroundColor: C.bg2, borderRadius: Theme.radius.md,
      overflow: 'hidden', borderWidth: 1, borderColor: C.gold,
    },
    zoomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, marginTop: 14 },
    zoomBtn: {
      width: 32, height: 32, borderRadius: 16, backgroundColor: C.surface2,
      alignItems: 'center', justifyContent: 'center', borderWidth: 0.5, borderColor: C.border2,
    },
    zoomLabel: { fontSize: 12, color: C.text3, fontWeight: '600', minWidth: 36, textAlign: 'center' },
    actions: { flexDirection: 'row', gap: 10, marginTop: 18 },
    cancelBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: Theme.radius.md, borderWidth: 0.5, borderColor: C.border },
    cancelBtnText: { color: C.text2, fontWeight: '700', fontSize: 13 },
    confirmBtn: { flex: 2, paddingVertical: 12, alignItems: 'center', borderRadius: Theme.radius.md, backgroundColor: C.gold },
    confirmBtnText: { color: C.black, fontWeight: '800', fontSize: 13 },
  });
}
