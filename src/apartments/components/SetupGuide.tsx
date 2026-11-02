import type { Search } from '../../../lib/apartments/model.ts';
import { searchUrl } from '../../../lib/apartments/streeteasy.ts';
import { RELAY_GUIDE_URL, WORKFLOW_URL, type ScanResult } from '../data.ts';
import { ago, plural } from '../format.ts';

/** How listings get here, and whether that's working. */
export function SetupGuide({ scan, searches }: { scan: ScanResult | null; searches: Search[] }) {
  const emails = scan?.data.emails ?? [];
  const last = emails.at(-1);
  const relayWorking = emails.length > 0;

  return (
    <div className="guide">
      <p className="guide__status">
        {scan?.exists ? (
          <>
            Last scan {ago(scan.data.updatedAt)}.{' '}
            {last
              ? `${plural(emails.length, 'alert email')} read so far; the latest arrived ${ago(last.date)}.`
              : 'No alert emails have come through yet.'}{' '}
            <a href={WORKFLOW_URL} target="_blank" rel="noreferrer">
              Scan history ↗
            </a>
          </>
        ) : (
          'The scan hasn’t run yet.'
        )}
      </p>
      <ol className="guide__steps">
        <li>
          <strong>Save each filter as a StreetEasy search with email alerts.</strong> Open it, check it looks right, tap
          Save, and pick instant email updates:
          <span className="guide__links">
            {searches.map((s) => (
              <a
                key={s.id}
                href={searchUrl({ areas: s.areas, beds: s.beds, maxPrice: s.maxPrice + s.stretch, noFee: s.noFeeOnly })}
                target="_blank"
                rel="noreferrer"
              >
                {s.name} ↗
              </a>
            ))}
          </span>
        </li>
        <li className={relayWorking ? 'is-done' : ''}>
          <strong>Connect Gmail (once, about five minutes).</strong> A small Google Apps Script in your account forwards
          those alert emails here every ten minutes.{' '}
          <a href={RELAY_GUIDE_URL} target="_blank" rel="noreferrer">
            Step-by-step ↗
          </a>
        </li>
        <li>
          <strong>That’s it.</strong> Each new listing is located, checked against city pest records and your commutes,
          and shows up here a few minutes after StreetEasy emails you. Seen one in the app first? Use{' '}
          <em>Check a listing</em> to vet it on the spot.
        </li>
      </ol>
    </div>
  );
}
