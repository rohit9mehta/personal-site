import type { Search } from '../../../lib/apartments/model.ts';
import { searchUrl } from '../../../lib/apartments/streeteasy.ts';
import { latestAlert, RELAY_GUIDE_URL, WORKFLOW_URL, type ScanResult } from '../data.ts';
import { ago, plural } from '../format.ts';

/** How listings get here, and whether that's working. */
export function SetupGuide({ scan, searches, id }: { scan: ScanResult | null; searches: Search[]; id?: string }) {
  const emails = scan?.data.emails ?? [];
  const latest = latestAlert(scan);

  return (
    <div className="guide" id={id}>
      <p className="guide__status">
        {!scan?.exists ? (
          'The scan hasn’t run yet.'
        ) : (
          <>
            {latest ? (
              <>
                <strong>Connected.</strong> {plural(emails.length, 'alert email')} read so far; the latest arrived{' '}
                {ago(latest)}.
              </>
            ) : (
              <strong>No StreetEasy alerts have reached this page yet.</strong>
            )}{' '}
            Last scan {ago(scan.data.updatedAt)}.{' '}
            <a href={WORKFLOW_URL} target="_blank" rel="noreferrer">
              Scan history ↗
            </a>
          </>
        )}
      </p>
      <p className="guide__note">
        Listings come from your StreetEasy saved-search alert emails, forwarded from Gmail. That’s set up once for the
        whole site, not in each browser: every browser you open this page in shows the same listings.
      </p>
      <ol className="guide__steps">
        <li className={latest ? 'is-done' : ''}>
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
        <li className={latest ? 'is-done' : ''}>
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
