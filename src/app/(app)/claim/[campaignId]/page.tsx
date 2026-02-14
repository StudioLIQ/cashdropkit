import { ClaimPageClient } from '@/ui/components/claim/ClaimPageClient';

interface ClaimPageProps {
  params: Promise<{ campaignId: string }>;
}

export default async function ClaimPage({ params }: ClaimPageProps) {
  const { campaignId } = await params;

  return <ClaimPageClient campaignId={campaignId} />;
}
