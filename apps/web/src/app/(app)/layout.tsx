import { AppShell } from '@/ui/components/shell';
import { ExtensionWalletProvider } from '@/ui/providers/ExtensionWalletProvider';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ExtensionWalletProvider>
      <AppShell>{children}</AppShell>
    </ExtensionWalletProvider>
  );
}
