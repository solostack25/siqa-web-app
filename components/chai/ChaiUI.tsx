// Shared Chai pieces: tags, squiggle underline, chunky buttons, poll and
// quiz cards. The look lives in lib/chai.ts.

import { useState, type ReactNode } from 'react';
import { View, Text, Pressable, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { router } from 'expo-router';
import { chai, chaiFont, chunky, coverHex, OPTION_COLORS, quizMeta, timeLeft, isOpen, type ChaiPost } from '../../lib/chai';
import { Icon } from '../Icon';

export function Tag({ children, bg = chai.saffron, style }: { children: string; bg?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ alignSelf: 'flex-start', height: 26, paddingHorizontal: 9, borderWidth: 2, borderColor: chai.ink, borderRadius: 8, backgroundColor: bg, justifyContent: 'center' }, style]}>
      <Text style={[chaiFont('mono'), { fontSize: 11, letterSpacing: 1, color: chai.ink }]}>{children}</Text>
    </View>
  );
}

export function Squiggle({ width = 96, color = chai.masala }: { width?: number; color?: string }) {
  const n = Math.floor(width / 12);
  let d = 'M2 6';
  for (let i = 0; i < n; i++) d += ` Q ${6 + i * 12} 0 ${10 + i * 12} 6 T ${18 + i * 12} 6`;
  return (
    <Svg width={width} height={10} viewBox={`0 0 ${width} 10`} accessibilityElementsHidden importantForAccessibility="no">
      <Path d={d} fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" />
    </Svg>
  );
}

export function ChunkyButton({ label, onPress, bg = chai.saffron, color = chai.ink, shadowColor = chai.ink, grow, disabled, height = 52, accessibilityLabel }: {
  label: string; onPress?: () => void; bg?: string; color?: string; shadowColor?: string; grow?: boolean; disabled?: boolean; height?: number; accessibilityLabel?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [{
        minHeight: height, paddingHorizontal: 18, borderWidth: chai.line, borderColor: chai.ink, borderRadius: 16,
        backgroundColor: disabled ? '#e8e2d6' : bg, alignItems: 'center', justifyContent: 'center',
        transform: [{ translateX: pressed ? 3 : 0 }, { translateY: pressed ? 3 : 0 }],
        boxShadow: pressed || disabled ? '0px 0px 0px transparent' : `4px 4px 0px ${shadowColor}`,
      } as any, grow && { flex: 1 }]}
    >
      <Text style={[chaiFont('display'), { fontSize: 18, color: disabled ? chai.ink2 : color }]}>{label}</Text>
    </Pressable>
  );
}

export function IconSquare({ icon, label, onPress }: { icon: Parameters<typeof Icon>[0]['name']; label: string; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed }) => [chunky(pressed ? 0 : 2, 14), { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', transform: [{ translateX: pressed ? 2 : 0 }, { translateY: pressed ? 2 : 0 }] }]}>
      <Icon name={icon} size={20} color={chai.ink} />
    </Pressable>
  );
}

/** A poll option row showing the result bar. */
export function ResultBar({ label, pct, color, mine, tall }: { label: string; pct: number; color: string; mine?: boolean; tall?: boolean }) {
  return (
    <View style={{ height: tall ? 46 : 40, borderWidth: chai.line, borderColor: chai.ink, borderRadius: tall ? 14 : 12, backgroundColor: chai.white, overflow: 'hidden', justifyContent: 'center' }}
      accessible accessibilityLabel={`${label}, ${pct} percent${mine ? ', your vote' : ''}`}>
      <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, backgroundColor: color, borderRightWidth: pct > 0 && pct < 100 ? chai.line : 0, borderRightColor: chai.ink }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
          <Text style={{ fontSize: tall ? 15 : 14, fontWeight: mine ? '700' : '600', color: chai.ink }} numberOfLines={1}>{label}</Text>
          {mine ? <Icon name="checkmark" size={16} color={chai.ink} /> : null}
        </View>
        <Text style={[chaiFont('displayBold'), { fontSize: tall ? 17 : 16, color: chai.ink }]}>{pct}%</Text>
      </View>
    </View>
  );
}

export function pct(votes: Record<string, number>, id: string) {
  const total = Object.values(votes).reduce((a, b) => a + b, 0);
  return total ? Math.round(((votes[id] ?? 0) / total) * 100) : 0;
}

/** Poll card for the feed and Home: vote in place, then it shows the bars. */
export function PollCard({ post, myVote, votes, onVote, featured, compact, width }: {
  post: ChaiPost; myVote?: string; votes?: Record<string, number>; onVote?: (optionId: string) => void;
  featured?: boolean; compact?: boolean; width?: number | string;
}) {
  const options = post.content.options ?? [];
  const voted = !!myVote || !isOpen(post);
  const shown = compact && !voted ? options.slice(0, 2) : options;
  const left = timeLeft(post);
  const open = () => router.push({ pathname: '/chai/[id]', params: { id: post.id } } as any);
  return (
    <Pressable onPress={open} accessibilityRole="link" accessibilityLabel={`Poll: ${post.title}`}
      style={[chunky(compact ? 4 : 5, compact ? 20 : 22, compact ? chai.cream : chai.white), { padding: compact ? 14 : 18, gap: compact ? 8 : 12 }, width != null && { width: width as any }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Tag bg={featured ? chai.rose : voted ? chai.cardamom : chai.saffron}>{featured ? "★ TODAY'S POLL" : voted ? (myVote ? 'POLL · YOU VOTED' : 'POLL · CLOSED') : 'POLL'}</Tag>
        {left && !compact ? <Text style={[chaiFont('mono'), { fontSize: 11, color: chai.ink }]}>{left.toUpperCase()}</Text> : null}
      </View>
      <Text style={[chaiFont('displayBold'), { fontSize: compact ? 17 : featured ? 26 : 20, lineHeight: compact ? 21 : featured ? 29 : 24, color: chai.ink }]}>{post.title}</Text>
      <View style={{ gap: compact ? 7 : 9 }}>
        {shown.map((o, i) => voted ? (
          <ResultBar key={o.id} label={o.label} pct={pct(votes ?? {}, o.id)} color={OPTION_COLORS[i % OPTION_COLORS.length]} mine={myVote === o.id} />
        ) : (
          <Pressable key={o.id} onPress={() => onVote ? onVote(o.id) : open()} accessibilityRole="button" accessibilityLabel={`Vote ${o.label}`}
            style={({ pressed }) => [chunky(pressed ? 0 : 3, compact ? 12 : 14), { minHeight: compact ? 38 : 50, paddingHorizontal: 14, justifyContent: 'center', transform: [{ translateX: pressed ? 3 : 0 }, { translateY: pressed ? 3 : 0 }] }]}>
            <Text style={{ fontSize: compact ? 13 : 16, fontWeight: '600', color: chai.ink }}>{o.label}</Text>
          </Pressable>
        ))}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: compact ? 12 : 13, fontWeight: '700', color: chai.ink }}>
          {compact && !voted && options.length > 2 ? `+${options.length - 2} more · ` : ''}{post.people ? `${post.people.toLocaleString()} ${post.people === 1 ? 'vote' : 'votes'}` : voted ? '' : 'Be the first to vote'}
        </Text>
        <Text style={{ fontSize: compact ? 12 : 13, fontWeight: '700', color: chai.ink }}>{post.comment_count ?? 0} {post.comment_count === 1 ? 'comment' : 'comments'}</Text>
      </View>
    </Pressable>
  );
}

export function QuizCard({ post, compact, width, played }: { post: ChaiPost; compact?: boolean; width?: number | string; played?: string | null }) {
  const open = () => router.push({ pathname: '/chai/[id]', params: { id: post.id } } as any);
  const tile = coverHex(post.cover_color);
  if (compact) {
    return (
      <Pressable onPress={open} accessibilityRole="link" accessibilityLabel={`Quiz: ${post.title}`} style={[chunky(4, 20), { overflow: 'hidden' }, width != null && { width: width as any }]}>
        <View style={{ height: 92, backgroundColor: tile, borderBottomWidth: chai.line, borderBottomColor: chai.ink, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={[chaiFont('displayBold'), { fontSize: 44, color: chai.ink }]}>?</Text>
        </View>
        <View style={{ padding: 12, gap: 4 }}>
          <Text style={[chaiFont('mono'), { fontSize: 10, letterSpacing: 1, color: chai.ink }]}>{quizMeta(post)}</Text>
          <Text style={[chaiFont('displayBold'), { fontSize: 17, lineHeight: 21, color: chai.ink }]} numberOfLines={3}>{post.title}</Text>
        </View>
      </Pressable>
    );
  }
  return (
    <Pressable onPress={open} accessibilityRole="link" accessibilityLabel={`Quiz: ${post.title}`} style={[chunky(5, 22), { padding: 16, flexDirection: 'row', gap: 14, alignItems: 'center' }, width != null && { width: width as any }]}>
      <View style={{ width: 76, height: 76, borderWidth: chai.line, borderColor: chai.ink, borderRadius: 18, backgroundColor: tile, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-4deg' }] }}>
        <Text style={[chaiFont('displayBold'), { fontSize: 40, color: chai.ink }]}>?</Text>
      </View>
      <View style={{ flex: 1, gap: 5 }}>
        <Tag bg={played ? chai.cardamom : chai.saffron}>{played ? `YOU GOT: ${played.toUpperCase()}` : quizMeta(post)}</Tag>
        <Text style={[chaiFont('displayBold'), { fontSize: 21, lineHeight: 24, color: chai.ink }]}>{post.title}</Text>
        <Text style={{ fontSize: 13, fontWeight: '600', color: chai.ink }}>
          {post.people ? `${post.people.toLocaleString()} played · ` : ''}{post.comment_count ?? 0} {post.comment_count === 1 ? 'comment' : 'comments'}
        </Text>
      </View>
    </Pressable>
  );
}

export function ChaiCard({ post, ...rest }: { post: ChaiPost; myVote?: string; votes?: Record<string, number>; onVote?: (o: string) => void; featured?: boolean; compact?: boolean; width?: number | string; played?: string | null }) {
  return post.kind === 'poll' ? <PollCard post={post} {...rest} /> : <QuizCard post={post} compact={rest.compact} width={rest.width} played={rest.played} />;
}

export function DotsBackground({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ backgroundColor: chai.cream, backgroundImage: `radial-gradient(${chai.ink}22 1.2px, transparent 1.4px)`, backgroundSize: '18px 18px' } as any, style]}>
      {children}
    </View>
  );
}

export function useBusy() {
  const [busy, setBusy] = useState<string | null>(null);
  return { busy, setBusy };
}
