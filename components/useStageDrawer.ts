import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, type LayoutChangeEvent } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';

/**
 * "Stage + sheet" screens (New Gem, New product): a preview area on top and
 * a white details sheet below it that really behaves like a drawer. Drag or
 * tap its handle to slide it up over the preview, down to show it again.
 *
 * Wire-up:
 *   const d = useStageDrawer();
 *   <View onLayout={d.onHeaderLayout}>top bar</View>           (inside the stage)
 *   <View onLayout={d.onStageLayout}>top bar + preview</View>  (the whole stage)
 *   <Animated.View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: d.top, opacity: d.ready ? 1 : 0 }}>
 *     <GestureDetector gesture={d.gesture}><View collapsable={false}>handle</View></GestureDetector>
 *     ...
 */
export function useStageDrawer({ overlap = 26, minPeek = 120 }: { overlap?: number; minPeek?: number } = {}) {
  const [open, setOpen] = useState(false);
  const [stageBottom, setStageBottom] = useState(0);
  const [headerBottom, setHeaderBottom] = useState(0);
  const top = useRef(new Animated.Value(0)).current;
  const topNow = useRef(0);
  const dragStart = useRef(0);
  const placed = useRef(false);

  const collapsedTop = Math.max(stageBottom - overlap, headerBottom + minPeek);
  const expandedTop = headerBottom + 4;

  useEffect(() => {
    const id = top.addListener(({ value }) => { topNow.current = value; });
    return () => top.removeListener(id);
  }, [top]);

  function animate(toOpen: boolean) {
    Animated.spring(top, { toValue: toOpen ? expandedTop : collapsedTop, useNativeDriver: false, bounciness: 0, speed: 18 }).start();
  }

  useEffect(() => {
    if (!stageBottom || !headerBottom) return;
    if (!placed.current) {
      top.setValue(open ? expandedTop : collapsedTop);
      placed.current = true;
      return;
    }
    animate(open);
  }, [open, collapsedTop, expandedTop]);

  const gesture = useMemo(() => {
    const clamp = (y: number) => Math.min(Math.max(y, expandedTop), collapsedTop);
    const pan = Gesture.Pan()
      .runOnJS(true)
      .activeOffsetY([-6, 6])
      .onStart(() => { dragStart.current = topNow.current; })
      .onUpdate((e) => { top.setValue(clamp(dragStart.current + e.translationY)); })
      .onEnd((e) => {
        const now = clamp(dragStart.current + e.translationY);
        const next = e.velocityY < -400 ? true : e.velocityY > 400 ? false : now < (expandedTop + collapsedTop) / 2;
        setOpen(next);
        animate(next);
      });
    const tap = Gesture.Tap().runOnJS(true).onEnd(() => setOpen((o) => !o));
    return Gesture.Exclusive(pan, tap);
  }, [expandedTop, collapsedTop]);

  return {
    open,
    setOpen,
    top,
    gesture,
    ready: stageBottom > 0,
    onStageLayout: (e: LayoutChangeEvent) => setStageBottom(e.nativeEvent.layout.y + e.nativeEvent.layout.height),
    onHeaderLayout: (e: LayoutChangeEvent) => setHeaderBottom(e.nativeEvent.layout.y + e.nativeEvent.layout.height),
  };
}
