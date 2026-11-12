import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useAuth } from '@/hooks/useAuth';
import { TournamentPage } from '@/views/TournamentPage';

export const Route = createFileRoute('/_authenticated/tournament')({
  head: () => ({
    meta: [
      { title: 'Sit & Go Tournament · Master Poker' },
      { name: 'description', content: 'Master Poker daily tournament: PHP 100 entrance fee, PHP 1000 champion prize and PHP 500 / 200 / 50 runner-up prizes. Chat with other players.' },
      { property: 'og:title', content: 'Sit & Go Tournament · Master Poker' },
      { property: 'og:description', content: 'Daily PHP 100 tournament. PHP 1000 champion and PHP 500 / 200 / 50 runner-up prizes at Master Poker.' },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary_large_image' },
    ],
  }),
  component: TournamentRoute,
});

function TournamentRoute() {
  const { player } = useAuth();
  const navigate = useNavigate();
  if (!player) return null;
  return (
    <TournamentPage
      player={{
        id: player.id,
        name: player.display_name,
        avatarUrl: player.avatar_url,
        avatarEmoji: player.avatar_emoji,
      }}
      onLeave={() => void navigate({ to: '/lobby' })}
    />
  );
}
