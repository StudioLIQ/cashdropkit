import { redirect } from 'next/navigation';

export default function NewAirdropPage() {
  redirect('/airdrops?create=1');
}
