import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  useWindowDimensions,
} from 'react-native';
import { useState } from 'react';
import { router } from 'expo-router';
import { useTheme, type AppColors } from '../../lib/theme';
import { Theme } from '../../constants/theme';

type ContentCategory = {
  key: string;
  title: string;
  icon: string;
  description: string;
  // Matches the `category` field used on the videos table / browse filters.
  // Left null where a card is more of a format than a filterable topic —
  // those just browse everything for now.
  browseCategory: string | null;
};

const CONTENT_CATEGORIES: ContentCategory[] = [
  {
    key: 'lectures',
    title: 'Lectures',
    icon: '🎙️',
    description:
      'Long-form talks and khutbahs from scholars and speakers, covering Islamic knowledge, current events, and community guidance.',
    browseCategory: 'Islamic Education',
  },
  {
    key: 'podcasts',
    title: 'Podcasts',
    icon: '🎧',
    description:
      'Conversational, episodic content on faith, life, and community — for listening on the go or watching in full.',
    browseCategory: null,
  },
  {
    key: 'quran',
    title: 'Quran',
    icon: '📖',
    description:
      'Recitations, tafsir, and structured Quran study sessions from qualified teachers and reciters.',
    browseCategory: 'Quran & Hadith',
  },
  {
    key: 'classes',
    title: 'Classes',
    icon: '📚',
    description:
      'Structured courses on Islamic knowledge, fiqh, Arabic language, and more — built to follow over multiple sessions.',
    browseCategory: null,
  },
  {
    key: 'lifestyle',
    title: 'Lifestyle',
    icon: '🌙',
    description:
      'Halal living, family life, food, and everyday experiences from a Muslim lens.',
    browseCategory: 'Halal Lifestyle',
  },
  {
    key: 'family',
    title: 'Family & Parenting',
    icon: '👨‍👩‍👧',
    description:
      'Guidance and real talk on raising a family, marriage, and parenting with faith at the center.',
    browseCategory: 'Family & Parenting',
  },
  {
    key: 'community',
    title: 'Community Events',
    icon: '🕌',
    description:
      'Coverage of conferences, fundraisers, and gatherings from masjids and organizations near you.',
    browseCategory: 'Community Events',
  },
  {
    key: 'finance',
    title: 'Finance',
    icon: '💰',
    description:
      'Halal investing, budgeting, and financial guidance grounded in Islamic principles.',
    browseCategory: 'Finance',
  },
];

export default function DiscoverScreen() {
  const { colors: C } = useTheme();
  const styles = makeStyles(C);
  const { width } = useWindowDimensions();
  const numColumns = width > 900 ? 4 : width > 600 ? 3 : 2;

  const [selected, setSelected] = useState<ContentCategory | null>(null);

  function handleBrowse() {
    if (!selected) return;
    setSelected(null);
    if (selected.browseCategory) {
      router.push(`/browse?category=${encodeURIComponent(selected.browseCategory)}` as any);
    } else {
      router.push('/browse' as any);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Discover</Text>
        <Text style={styles.subtitle}>Explore Siqa by content type</Text>
      </View>

      <FlatList
        key={numColumns}
        data={CONTENT_CATEGORIES}
        keyExtractor={(c) => c.key}
        numColumns={numColumns}
        columnWrapperStyle={{ gap: Theme.spacing.md }}
        contentContainerStyle={styles.grid}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => setSelected(item)}>
            <Text style={styles.cardIcon}>{item.icon}</Text>
            <Text style={styles.cardTitle}>{item.title}</Text>
          </TouchableOpacity>
        )}
      />

      <Modal
        visible={!!selected}
        transparent
        animationType="slide"
        onRequestClose={() => setSelected(null)}
      >
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setSelected(null)}>
          <TouchableOpacity activeOpacity={1} style={styles.sheet}>
            <View style={styles.sheetHandle} />
            {selected ? (
              <>
                <Text style={styles.sheetIcon}>{selected.icon}</Text>
                <Text style={styles.sheetTitle}>{selected.title}</Text>
                <Text style={styles.sheetDescription}>{selected.description}</Text>
                <TouchableOpacity style={styles.browseBtn} onPress={handleBrowse}>
                  <Text style={styles.browseBtnText}>Browse {selected.title}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.closeBtn} onPress={() => setSelected(null)}>
                  <Text style={styles.closeBtnText}>Close</Text>
                </TouchableOpacity>
              </>
            ) : null}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg },
    header: { paddingHorizontal: Theme.spacing.xl, paddingTop: 60, paddingBottom: Theme.spacing.lg },
    title: { fontSize: Theme.fontSize.xxxl, fontWeight: Theme.fontWeight.bold, color: C.text },
    subtitle: { fontSize: Theme.fontSize.base, color: C.text2, marginTop: 4 },

    grid: { paddingHorizontal: Theme.spacing.lg, paddingBottom: Theme.spacing.xxxl },
    card: {
      flex: 1,
      backgroundColor: C.surface,
      borderRadius: Theme.radius.lg,
      borderWidth: 0.5,
      borderColor: C.border2,
      paddingVertical: Theme.spacing.xxl,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: Theme.spacing.md,
      minHeight: 110,
    },
    cardIcon: { fontSize: 28, marginBottom: Theme.spacing.sm },
    cardTitle: {
      color: C.text,
      fontSize: Theme.fontSize.base,
      fontWeight: Theme.fontWeight.semibold,
      textAlign: 'center',
    },

    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: C.bg2,
      borderTopLeftRadius: Theme.radius.xxl,
      borderTopRightRadius: Theme.radius.xxl,
      padding: Theme.spacing.xxl,
      paddingBottom: Theme.spacing.xxxl,
      alignItems: 'center',
    },
    sheetHandle: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: C.border,
      marginBottom: Theme.spacing.lg,
    },
    sheetIcon: { fontSize: 36, marginBottom: Theme.spacing.sm },
    sheetTitle: {
      fontSize: Theme.fontSize.xxl,
      fontWeight: Theme.fontWeight.bold,
      color: C.text,
      marginBottom: Theme.spacing.sm,
    },
    sheetDescription: {
      fontSize: Theme.fontSize.base,
      color: C.text2,
      textAlign: 'center',
      lineHeight: 21,
      marginBottom: Theme.spacing.xl,
    },
    browseBtn: {
      backgroundColor: C.gold,
      paddingVertical: Theme.spacing.md,
      paddingHorizontal: Theme.spacing.xxl,
      borderRadius: Theme.radius.full,
      width: '100%',
      alignItems: 'center',
    },
    browseBtnText: { color: C.bg, fontSize: Theme.fontSize.base, fontWeight: Theme.fontWeight.semibold },
    closeBtn: { marginTop: Theme.spacing.md, paddingVertical: Theme.spacing.sm },
    closeBtnText: { color: C.text3, fontSize: Theme.fontSize.base },
  });
}
