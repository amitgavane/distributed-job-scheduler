import { ExternalLink } from 'lucide-react';
import { DEMO_GITHUB_URL } from '../lib/isDemo';

export function DemoBanner() {
  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 text-sm text-amber-950 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center">
      <span className="font-medium">Visual demo</span>
      <a
        href={DEMO_GITHUB_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-brand-700 hover:text-brand-800 font-medium underline underline-offset-2"
      >
        Full app on GitHub
        <ExternalLink size={14} />
      </a>
      <span className="text-amber-700 text-xs">· clone &amp; run: npm run start</span>
    </div>
  );
}
