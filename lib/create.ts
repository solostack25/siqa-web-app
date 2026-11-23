import { router } from 'expo-router';
import type { SiqaIconName } from '../components/Icon';
import { openStudio } from './studioLink';

// Everything a speaker can make, in one list. Studio, the dashboard and the app all use this,
// so "Go live", "Host a podcast" etc. always mean the same thing and open the same tool.

export type CreateKey = 'live' | 'podcast' | 'khutbah' | 'halaqa' | 'rec-gem' | 'rec-video' | 'up-gem' | 'up-video';
export type CreateItem = { key: CreateKey; label: string; sub: string; icon: SiqaIconName; speakersOnly?: boolean };

export const CREATE_GROUPS: { title: string; items: CreateItem[] }[] = [
  {
    title: 'Go live',
    items: [
      { key: 'live', label: 'Go live', sub: 'Khutbah, halaqa, class or talk. Pick where it is and you’re live. At a masjid, its TVs switch to you.', icon: 'radio-outline', speakersOnly: true },
      { key: 'podcast', label: 'Host a podcast', sub: 'Up to 4 speakers. Send guests a link. The audience is optional.', icon: 'mic-outline', speakersOnly: true },
    ],
  },
  {
    title: 'Record',
    items: [
      { key: 'rec-gem', label: 'Record a Gem', sub: 'Short and vertical, for the Gems feed.', icon: 'diamond-outline', speakersOnly: true },
      { key: 'rec-video', label: 'Record a long video', sub: 'Horizontal, for lectures and talks on your channel.', icon: 'film-outline', speakersOnly: true },
    ],
  },
  {
    title: 'Upload',
    items: [
      { key: 'up-gem', label: 'Upload a Gem', sub: 'A short vertical clip you already have.', icon: 'cloud-upload-outline' },
      { key: 'up-video', label: 'Upload a long video', sub: 'A lecture, khutbah or talk you already have.', icon: 'cloud-upload-outline' },
    ],
  },
];

/** Opens the tool for one Create option. `halaqa` needs a choice first, so the caller handles it. */
export function startCreate(key: Exclude<CreateKey, 'halaqa'>) {
  switch (key) {
    case 'live': return openStudio('/live');
    case 'podcast': return openStudio('/live?kind=podcast');
    case 'khutbah': return openStudio('/live?kind=khutbah');
    case 'rec-gem': return openStudio('/record?type=gem');
    case 'rec-video': return openStudio('/record?type=video');
    case 'up-gem': return router.push('/gem-upload?format=short' as any);
    case 'up-video': return router.push('/gem-upload?format=long' as any);
  }
}

export function startHalaqa(how: 'camera' | 'phone') {
  if (how === 'camera') router.push('/go-live?kind=halaqa' as any);
  else openStudio('/live?kind=halaqa');
}

export type StreamKind = 'khutbah' | 'halaqa';
export const STREAM_WORDS: Record<StreamKind, { noun: string; title: string; placeholder: string; ready: string }> = {
  khutbah: { noun: 'khutbah', title: 'Livestream a khutbah', placeholder: 'Jumuah Khutbah · Gratitude in hardship', ready: 'Ready for Jumuah' },
  halaqa: { noun: 'halaqa', title: 'Livestream a halaqa', placeholder: 'Weekly halaqa · Surah Al-Kahf', ready: 'Ready when you are' },
};
