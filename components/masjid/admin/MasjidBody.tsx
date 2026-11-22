// One masjid console section, without any surrounding frame. Used by the dashboard's Masjid space.
import { Overview } from './Overview';
import { PrayerTimesSection } from './PrayerTimes';
import { ScheduleSection } from './Schedule';
import { AnnouncementsSection } from './Announcements';
import { SeedsSection } from './Seeds';
import { ScreensSection } from './Screens';
import { TeamSection } from './Team';
import { EventsSection } from '../../events/dash/EventsSection';
import type { SectionProps, SectionKey } from './kit';

export function MasjidBody({ section, ...p }: SectionProps & { section: SectionKey }) {
  switch (section) {
    case 'prayer': return <PrayerTimesSection {...p} />;
    case 'schedule': return <ScheduleSection {...p} />;
    case 'announcements': return <AnnouncementsSection {...p} />;
    case 'seeds': return <SeedsSection {...p} />;
    case 'events': return <EventsSection orgId={p.masjid.id} wide={p.wide} />;
    case 'screens': return <ScreensSection {...p} />;
    case 'team': return <TeamSection {...p} />;
    default: return <Overview {...p} />;
  }
}
