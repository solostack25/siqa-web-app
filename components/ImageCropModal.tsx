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

  useEffect(() => {
    if (!visible || !imageUri || Platform.OS !== 'web') { setNaturalSize(null); return; }
    setScale(1);
    setOffset({ x: 0, y: 0 });
    const img = new (window as any).Image();
    img.onload = () => setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = imageUri;
  }, [visible, imageUri]);

  // baseSize is the "cover" fit — the smallest size that still fully
  // fills the viewport with no gaps, i.e. what scale=1 means.
  const baseSize = useMemo(() => {
    if (!naturalSize) return { w: VIEWPORT_WIDTH, h: viewportHeight };
    const imgAspect = naturalSize.w / naturalSize.h;
    const viewportAspect = VIEWPORT_WIDTH / viewportHeight;
    if (imgAspect > viewportAspect) {
      return { w: viewportHeight * imgAspect, h: viewportHeight };
    }
    return { w: VIEWPORT_WIDTH, h: VIEWPORT_WIDTH / imgAspect };
  }, [naturalSize, viewportHeight]);

  // Zooming out was previously capped at scale=1 (the cover fit), so
  // an image whose aspect ratio didn't match the target had no way to
  // be shown in full — it was always forced to crop. minScale lets the
  // image shrink down to "contain" (the whole thing visible, with
  // empty space on whichever axis doesn't fill the frame) instead.
  const minScale = useMemo(() => {
    if (!naturalSize) return 1;
    return Math.min(VIEWPORT_WIDTH / baseSize.w, viewportHeight / baseSize.h, 1);
  }, [naturalSize, baseSize, viewportHeight]);

  const displayW = baseSize.w * scale;
  const displayH = baseSize.h * scale;

  function clampOffset(x: number, y: number, w: number, h: number) {
    const maxX = Math.max(0, (w - VIEWPORT_WIDTH) / 2);
    const maxY = Math.max(0, (h - viewportHeight) / 2);
    return { x: Math.min(maxX, Math.max(-maxX, x)), y: Math.min(maxY, Math.max(-maxY, y)) };
  }

  // PanResponder.create() only runs once (useRef's initializer fires on
  // mount, not on re-render), so its callbacks close over whatever
  // offset/displayW/displayH were at that very first render — they
  // never see later updates. That's why dragging appeared to work once
  // and then get stuck: every gesture after the first was computing
  // against those frozen initial values instead of the real current
  // ones. Refs kept in sync via effects give the callbacks a way to
  // always read the live values without needing to recreate the
  // responder itself.
  const offsetRef = useRef(offset);
  useEffect(() => { offsetRef.current = offset; }, [offset]);
  const dimsRef = useRef({ w: displayW, h: displayH });
  useEffect(() => { dimsRef.current = { w: displayW, h: displayH }; }, [displayW, displayH]);
  const gestureStartOffset = useRef({ x: 0, y: 0 });

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        gestureStartOffset.current = offsetRef.current;
      },
      onPanResponderMove: (_e, gesture) => {
        const { w, h } = dimsRef.current;
        const next = clampOffset(
          gestureStartOffset.current.x + gesture.dx,
          gestureStartOffset.current.y + gesture.dy,
          w,
          h
        );
        offsetRef.current = next;
        setOffset(next);
      },
    })
  ).current;

  function zoom(delta: number) {
    setScale(prev => {
      const next = Math.min(3, Math.max(minScale, prev + delta));
      const nextDims = { w: baseSize.w * next, h: baseSize.h * next };
      setOffset(o => {
        const clamped = clampOffset(o.x, o.y, nextDims.w, nextDims.h);
        offsetRef.current = clamped;
        return clamped;
      });
      dimsRef.current = nextDims;
      return next;
    });
  }

  async function handleUsePhoto() {
    if (!imageUri || !naturalSize || Platform.OS !== 'web') return;
    setProcessing(true);
    try {
      // Map the visible viewport rectangle back to source-image pixel
      // coordinates. displayW/H may now be smaller than the viewport
      // (zoomed out past cover) — clamp the sample rect to the image's
      // own bounds so a "contain" crop doesn't try to read outside it;
      // whatever's left over renders as blank canvas, matching what's
      // visible in the preview.
      const ratio = naturalSize.w / displayW;
      let sx = (displayW / 2 - VIEWPORT_WIDTH / 2 - offset.x) * ratio;
      let sy = (displayH / 2 - viewportHeight / 2 - offset.y) * ratio;
      let sw = VIEWPORT_WIDTH * ratio;
      let sh = viewportHeight * ratio;

      const canvas = document.createElement('canvas');
      canvas.width = outputWidth;
      canvas.height = outputWidth / aspectRatio;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas unavailable');

      const img = new (window as any).Image();
      img.crossOrigin = 'anonymous';
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Could not load image'));
        img.src = imageUri;
      });

      // Destination rect starts as the full canvas, then shrinks to
      // match whatever portion of sx/sy/sw/sh actually falls inside
      // the source image once clamped.
      let dx = 0, dy = 0, dw = canvas.width, dh = canvas.height;
      if (sx < 0) { dx = -sx * (canvas.width / sw); sw += sx; sx = 0; dw = canvas.width - dx; }
      if (sy < 0) { dy = -sy * (canvas.height / sh); sh += sy; sy = 0; dh = canvas.height - dy; }
      if (sx + sw > naturalSize.w) { const over = sx + sw - naturalSize.w; dw -= over * (canvas.width / (VIEWPORT_WIDTH * ratio)); sw -= over; }
      if (sy + sh > naturalSize.h) { const over = sy + sh - naturalSize.h; dh -= over * (canvas.height / (viewportHeight * ratio)); sh -= over; }

      ctx.fillStyle = C.bg2;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (sw > 0 && sh > 0) {
        ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
      }

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
            <TouchableOpacity style={styles.zoomBtn} onPress={() => zoom(-0.2)} disabled={scale <= minScale + 0.001}>
              <Icon name="remove" size={16} color={scale <= minScale + 0.001 ? C.text3 : C.text} />
            </TouchableOpacity>
            <Text style={styles.zoomLabel}>Zoom</Text>
            <TouchableOpacity style={styles.zoomBtn} onPress={() => zoom(0.2)} disabled={scale >= 3}>
              <Icon name="add" size={16} color={scale >= 3 ? C.text3 : C.text} />
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
